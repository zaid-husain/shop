import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Minus,
  Trash2,
  Search,
  X,
  Share2,
  Save,
  User,
  UserPlus,
  Phone,
  Car,
  Receipt,
  PackageOpen,
  Tag,
  CreditCard,
  Banknote,
  QrCode,
  BookOpen,
  Calculator,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { sb, type Customer, type Product } from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import { formatINR, nextInvoiceNumber, buildWhatsAppUrl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SaleService } from "@/lib/domain/SaleService";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Billing & Invoices — Bharat Auto Parts" },
      {
        name: "description",
        content:
          "Create invoices, add parts, apply discounts, and share bills with customers over WhatsApp.",
      },
    ],
  }),
  component: BillingPage,
});

type CartItem = {
  product_id: string | null;
  product_name: string;
  part_number: string | null;
  unit_price: number;
  unit_cost: number;
  quantity: number;
  stock?: number;
};

const PAYMENT_METHODS = [
  {
    id: "cash",
    label: "Cash",
    icon: Banknote,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-200",
  },
  {
    id: "upi",
    label: "UPI",
    icon: QrCode,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-200",
  },
  {
    id: "card",
    label: "Card",
    icon: CreditCard,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    border: "border-purple-200",
  },
  {
    id: "khata",
    label: "Khata",
    icon: BookOpen,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-200",
  },
];

function BillingPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [items, setItems] = useState<CartItem[]>([]);

  // Modals
  const [pickerOpen, setPickerOpen] = useState(false);
  const [custPickerOpen, setCustPickerOpen] = useState(false);
  const [customItemOpen, setCustomItemOpen] = useState(false);

  // State
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [walkInName, setWalkInName] = useState("");
  const [walkInMobile, setWalkInMobile] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paid, setPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [saving, setSaving] = useState(false);

  const { status: onlineStatus } = useOnlineStatus();

  // Computed
  const subtotal = useMemo(() => items.reduce((a, i) => a + i.unit_price * i.quantity, 0), [items]);
  const discountNum = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal - discountNum);

  // If user hasn't typed in paid amount, default to full amount paid (unless khata)
  // For khata, default paid to 0.

  const defaultPaidNum = paymentMethod === "khata" ? 0 : total;
  const paidNum = paid === "" ? defaultPaidNum : Math.max(0, Number(paid) || 0);
  const due = Math.max(0, total - paidNum);

  const currentDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  // Actions
  function addProduct(p: Product) {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing) {
        return prev.map((i) => (i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          product_id: p.id,
          product_name: p.name,
          part_number: p.part_number,
          unit_price: Number(p.selling_price),
          unit_cost: Number(p.purchase_price),
          quantity: 1,
          stock: p.stock_quantity,
        },
      ];
    });
    setPickerOpen(false);
  }

  function addCustomItemData(name: string, price: number, qty: number) {
    setItems((prev) => [
      ...prev,
      {
        product_id: null,
        product_name: name.trim(),
        part_number: null,
        unit_price: price,
        unit_cost: 0,
        quantity: qty,
      },
    ]);
    setCustomItemOpen(false);
  }

  function updateQty(idx: number, delta: number) {
    setItems((prev) =>
      prev.map((i, k) => (k === idx ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i)),
    );
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, k) => k !== idx));
  }

  async function saveInvoice(): Promise<{ id: string; invoice_number: string } | null> {
    if (items.length === 0) {
      toast.error("Add at least one item");
      return null;
    }

    if (onlineStatus === "OFFLINE") {
      toast.error("You are offline. Cannot create sale.");
      return null;
    }

    setSaving(true);
    try {
      const invNo = nextInvoiceNumber();
      const invoiceData = {
        customer_id: customer?.id ?? null,
        discount: discountNum,
        paid: paidNum,
        payment_method: paymentMethod, // Will be mapped to 'cash' by backend if not updated, but we pass it anyway
        notes: walkInName ? `Walk-in: ${walkInName} - ${walkInMobile}` : null,
      };

      const formattedItems = items.map((i) => ({
        product_id: i.product_id || null, // For custom items
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        unit_cost: i.unit_cost,
        discount_amount: 0,
      }));

      const result = await SaleService.createSale(profile!.shop_id, invoiceData, formattedItems);

      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(`Bill saved successfully`);

      const { data: inv } = await sb
        .from("invoices")
        .select("invoice_number")
        .eq("id", result.invoice_id)
        .single();
      return { id: result.invoice_id, invoice_number: inv?.invoice_number || invNo };
    } catch (e: unknown) {
      console.error(e);
      toast.error((e as Error).message || "Something went wrong. Please try again.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  function generatePdf(invoiceNumber: string): jsPDF {
    // A5 portrait: 148 x 210 mm
    const doc = new jsPDF({ unit: "mm", format: "a5" });
    const W = 148;
    const M = 10;
    const RIGHT = W - M;
    const INK: [number, number, number] = [0, 0, 0];
    const LINE: [number, number, number] = [0, 0, 0];

    // ===== HEADER SECTION =====
    let y = M + 5;
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("CASH / CREDIT MEMO", W / 2, y, { align: "center" });
    y += 7;
    doc.setFontSize(18);
    doc.text("BHARAT AUTO PARTS", W / 2, y, { align: "center" });
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Deals in: All Types of Automobile Spare Parts", W / 2, y, { align: "center" });
    y += 5;
    doc.setFontSize(8);
    doc.text("Near Bus Stand, Balapur, Akola", W / 2, y, { align: "center" });
    y += 4;
    doc.text("Mob: +91 9096731931, 8668528219", W / 2, y, { align: "center" });
    y += 6;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(M, y, RIGHT, y);
    y += 2;

    // ===== CUSTOMER & BILL INFO =====
    const boxStartY = y;
    const boxH = 22;
    doc.rect(M, y, RIGHT - M, boxH);
    y += 6;

    const custName = customer?.name ?? (walkInName.trim() || "Walk-in Customer");
    const mobile = customer?.mobile ?? walkInMobile;
    const vehicle = (customer as Record<string, unknown>)?.vehicle_number;
    const vmodel = (customer as Record<string, unknown>)?.vehicle_model;
    const vehicleDetails = [vmodel, vehicle].filter(Boolean).join(" ");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Customer :`, M + 2, y);
    doc.setFont("helvetica", "normal");
    doc.text(custName, M + 22, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text(`Mobile :`, M + 2, y);
    doc.setFont("helvetica", "normal");
    doc.text(mobile || "-", M + 22, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text(`Vehicle :`, M + 2, y);
    doc.setFont("helvetica", "normal");
    doc.text(vehicleDetails || "-", M + 22, y);

    y = boxStartY + 6;
    const midX = W / 2 + 15;
    doc.setFont("helvetica", "bold");
    doc.setFont("helvetica", "normal");
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text(`Date :`, midX, y);
    doc.setFont("helvetica", "normal");
    doc.text(currentDate, midX + 22, y);

    y = boxStartY + boxH + 4;

    // ===== ITEMS TABLE =====
    const cSn = M,
      wSn = 12;
    const cItem = cSn + wSn,
      wQty = 15,
      wRate = 22,
      wAmt = 25;
    const wItem = RIGHT - M - wSn - wQty - wRate - wAmt;
    const cQty = cItem + wItem,
      cRate = cQty + wQty,
      cAmt = cRate + wRate;

    const thY = y,
      thH = 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.rect(M, thY, RIGHT - M, thH);
    doc.line(cItem, thY, cItem, thY + thH);
    doc.line(cQty, thY, cQty, thY + thH);
    doc.line(cRate, thY, cRate, thY + thH);
    doc.line(cAmt, thY, cAmt, thY + thH);

    doc.text("S.N.", cSn + wSn / 2, thY + 5, { align: "center" });
    doc.text("PARTICULARS", cItem + 2, thY + 5);
    doc.text("QTY", cQty + wQty / 2, thY + 5, { align: "center" });
    doc.text("RATE", cRate + wRate / 2, thY + 5, { align: "center" });
    doc.text("AMOUNT", cAmt + wAmt / 2, thY + 5, { align: "center" });

    y += thH;
    const trY = y;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    items.forEach((i, idx) => {
      const nameLines = doc.splitTextToSize(i.product_name, wItem - 4) as string[];
      const rowH = Math.max(6, nameLines.length * 4 + 2);
      doc.text(String(idx + 1), cSn + wSn / 2, y + 4.5, { align: "center" });
      doc.text(nameLines, cItem + 2, y + 4.5);
      doc.text(String(i.quantity), cQty + wQty / 2, y + 4.5, { align: "center" });
      doc.text(Number(i.unit_price).toFixed(2), cRate + wRate - 2, y + 4.5, { align: "right" });
      doc.text(Number(i.unit_price * i.quantity).toFixed(2), cAmt + wAmt - 2, y + 4.5, {
        align: "right",
      });
      y += rowH;
    });

    const minTableH = 60;
    const actualTableH = y - trY;
    if (actualTableH < minTableH) y = trY + minTableH;

    doc.rect(M, trY, RIGHT - M, y - trY);
    doc.line(cItem, trY, cItem, y);
    doc.line(cQty, trY, cQty, y);
    doc.line(cRate, trY, cRate, y);
    doc.line(cAmt, trY, cAmt, y);

    // ===== SUMMARY =====
    let summaryY = y;
    const summaryH = 7;
    const drawSummaryRow = (label: string, val: number, isBold: boolean = false) => {
      doc.rect(cRate, summaryY, wRate, summaryH);
      doc.rect(cAmt, summaryY, wAmt, summaryH);
      doc.setFont("helvetica", isBold ? "bold" : "normal");
      doc.text(label, cRate + wRate - 2, summaryY + 5, { align: "right" });
      doc.text(val.toFixed(2), cAmt + wAmt - 2, summaryY + 5, { align: "right" });
      summaryY += summaryH;
    };

    drawSummaryRow("Sub Total", subtotal);
    if (discountNum > 0) drawSummaryRow("Discount", discountNum);
    drawSummaryRow("Grand Total", total, true);
    if (paidNum < total || due > 0) {
      drawSummaryRow("Paid", paidNum);
      drawSummaryRow("Due", due, true);
    }

    doc.rect(M, y, cRate - M, summaryY - y);
    y = summaryY + 8;

    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(11, 31, 58);
    doc.text("Thank You. Drive Safe, Visit Again!", M, y + 12);

    const sigW = 55,
      sigH = 20;
    const sigX = RIGHT - sigW,
      sigY = y;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.rect(sigX, sigY, sigW, sigH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "normal");
    doc.text("Auth. Signatory", sigX + sigW / 2, sigY + sigH - 3, { align: "center" });

    return doc;
  }

  async function saveAndDownload() {
    const inv = await saveInvoice();
    if (!inv) return;
    const doc = generatePdf(inv.invoice_number);
    doc.save(`${inv.invoice_number}.pdf`);
    resetForm();
  }

  async function saveAndShare() {
    const inv = await saveInvoice();
    if (!inv) return;
    const mobile = customer?.mobile ?? walkInMobile;
    const msg =
      `*Bharat Auto Parts*\n` +
      `Invoice: ${inv.invoice_number}\n` +
      items
        .map((i) => `• ${i.product_name} × ${i.quantity} = ${formatINR(i.unit_price * i.quantity)}`)
        .join("\n") +
      `\n\nSubtotal: ${formatINR(subtotal)}` +
      (discountNum > 0 ? `\nDiscount: -${formatINR(discountNum)}` : "") +
      `\n*Total: ${formatINR(total)}*` +
      `\nPaid: ${formatINR(paidNum)}` +
      (due > 0 ? `\nDue: ${formatINR(due)}` : "") +
      `\n\nThank you!`;
    const url = buildWhatsAppUrl(mobile, msg);
    if (url) window.open(url, "_blank");
    else {
      const doc = generatePdf(inv.invoice_number);
      doc.save(`${inv.invoice_number}.pdf`);
    }
    resetForm();
  }

  function resetForm() {
    setItems([]);
    setCustomer(null);
    setWalkInName("");
    setWalkInMobile("");
    setDiscount("0");
    setPaid("");
    setPaymentMethod("cash");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-48 font-sans">
      {/* 1. Header Redesign */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#0B3D91] to-[#1a55b3] text-white pt-10 pb-6 px-4 shadow-md rounded-b-3xl">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">New Bill</h1>
            <div className="flex items-center gap-1.5 text-[#93c5fd] mt-1 text-sm font-medium">
              <Calendar size={14} /> {currentDate}
            </div>
          </div>
          <div className="bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-2">
            <Receipt size={16} className="text-white/80" />
            <span className="text-sm font-semibold tracking-wide">Auto-gen</span>
          </div>
        </div>
      </div>

      {/* 2. Customer Section */}
      <div className="px-4 -mt-4 relative z-20">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-1">
          {customer ? (
            <div className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-[#0B3D91] to-[#1a55b3] text-white flex items-center justify-center font-bold text-lg shadow-sm">
                  {(customer.name || "UN").substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-[15px]">{customer.name}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 font-medium">
                    {customer.mobile && (
                      <span className="flex items-center gap-1">
                        <Phone size={12} /> {customer.mobile}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50"
                onClick={() => setCustomer(null)}
              >
                <X size={16} />
              </Button>
            </div>
          ) : (
            <div className="p-3">
              <Button
                onClick={() => setCustPickerOpen(true)}
                className="w-full bg-[#0B3D91]/5 hover:bg-[#0B3D91]/10 text-[#0B3D91] border-none h-12 rounded-2xl font-semibold flex gap-2"
                variant="outline"
              >
                <UserPlus size={18} /> Select Customer
              </Button>
              <div className="flex items-center gap-4 py-3">
                <div className="flex-1 h-px bg-slate-100"></div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  OR WALK-IN
                </span>
                <div className="flex-1 h-px bg-slate-100"></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <User size={16} className="absolute left-3 top-3 text-slate-400" />
                  <Input
                    placeholder="Customer Name"
                    value={walkInName}
                    onChange={(e) => setWalkInName(e.target.value)}
                    className="h-11 pl-9 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-[#0B3D91]"
                  />
                </div>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-3 text-slate-400" />
                  <Input
                    placeholder="Mobile Number"
                    inputMode="numeric"
                    value={walkInMobile}
                    onChange={(e) =>
                      setWalkInMobile(e.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    className="h-11 pl-9 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-[#0B3D91]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Product Section & Empty State */}
      <div className="px-4 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800 text-lg">Items ({items.length})</h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-[#0B3D91] font-semibold p-0 h-auto hover:bg-transparent"
            onClick={() => setCustomItemOpen(true)}
          >
            <Plus size={16} className="mr-1" /> Custom Item
          </Button>
        </div>

        {items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl border border-slate-100 border-dashed p-8 text-center flex flex-col items-center justify-center shadow-sm"
          >
            <div className="h-16 w-16 bg-[#0B3D91]/5 rounded-full flex items-center justify-center mb-4">
              <PackageOpen size={32} className="text-[#0B3D91]/60" />
            </div>
            <h3 className="font-bold text-slate-700 mb-1">No items added</h3>
            <p className="text-sm text-slate-500 mb-6 font-medium">
              Start by adding products to create a bill
            </p>
            <Button
              onClick={() => setPickerOpen(true)}
              className="bg-[#0B3D91] hover:bg-[#1a55b3] text-white rounded-xl h-11 px-6 shadow-md shadow-[#0B3D91]/20 font-semibold"
            >
              <Search size={18} className="mr-2" /> Browse Products
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {items.map((i, idx) => (
                <motion.div
                  key={`${i.product_id ?? "custom"}-${idx}`}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -20, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3.5 relative overflow-hidden group"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 pr-4">
                      <h4 className="font-bold text-slate-800 text-[15px] leading-tight mb-1">
                        {i.product_name}
                      </h4>
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <span className="text-[#0B3D91]">{formatINR(i.unit_price)}</span>
                        <span className="text-slate-300">/</span>
                        <span>Qty: {i.quantity}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-800 text-base">
                        {formatINR(i.unit_price * i.quantity)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-50 pt-3">
                    <div className="bg-slate-50 rounded-xl p-1 flex items-center border border-slate-100">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-lg hover:bg-white hover:shadow-sm text-slate-600"
                        onClick={() => updateQty(idx, -1)}
                        disabled={i.quantity <= 1}
                      >
                        <Minus size={16} />
                      </Button>
                      <span className="w-10 text-center font-bold text-sm text-slate-800">
                        {i.quantity}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-lg hover:bg-white hover:shadow-sm text-slate-600"
                        onClick={() => updateQty(idx, 1)}
                      >
                        <Plus size={16} />
                      </Button>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10 rounded-xl text-red-500 hover:bg-red-50"
                      onClick={() => removeItem(idx)}
                    >
                      <Trash2 size={18} />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            <motion.div layout>
              <Button
                onClick={() => setPickerOpen(true)}
                variant="outline"
                className="w-full h-12 rounded-2xl border-dashed border-2 border-slate-200 text-slate-500 hover:border-[#0B3D91]/50 hover:text-[#0B3D91] hover:bg-[#0B3D91]/5 font-semibold text-[15px]"
              >
                <Plus size={18} className="mr-2" /> Add Another Product
              </Button>
            </motion.div>
          </div>
        )}
      </div>

      {/* 4. Bill Summary & Payment (Sticky Bottom) */}
      <AnimatePresence>
        {items.length > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-[65px] md:bottom-0 left-0 right-0 z-40 bg-white rounded-t-3xl shadow-[0_-8px_30px_-15px_rgba(0,0,0,0.1)] border-t border-slate-100 overflow-hidden"
          >
            <div className="max-h-[70vh] overflow-y-auto no-scrollbar pb-6">
              <div className="p-4 space-y-4">
                {/* Summary Box */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="space-y-2 mb-3">
                    <div className="flex justify-between text-sm font-medium text-slate-500">
                      <span>Subtotal ({items.length} items)</span>
                      <span>{formatINR(subtotal)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm font-medium text-slate-500">
                      <span>Discount (₹)</span>
                      <Input
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ""))}
                        inputMode="decimal"
                        className="h-7 w-24 text-right text-sm font-bold bg-white border-slate-200 focus-visible:ring-[#0B3D91]"
                      />
                    </div>
                  </div>
                  <div className="h-px bg-slate-200/60 my-3"></div>
                  <div className="flex justify-between items-end">
                    <span className="text-slate-800 font-bold">Grand Total</span>
                    <span className="text-2xl font-black text-[#0B3D91]">{formatINR(total)}</span>
                  </div>
                </div>

                {/* Payment Methods */}
                <div>
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1 mb-2 block">
                    Payment Method
                  </Label>
                  <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar">
                    {PAYMENT_METHODS.map((pm) => {
                      const Icon = pm.icon;
                      const isSelected = paymentMethod === pm.id;
                      return (
                        <button
                          key={pm.id}
                          onClick={() => setPaymentMethod(pm.id)}
                          className={cn(
                            "flex-none flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all duration-200",
                            isSelected
                              ? `bg-white border-[#0B3D91] shadow-sm ring-1 ring-[#0B3D91]`
                              : "bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100",
                          )}
                        >
                          <div
                            className={cn(
                              "p-1.5 rounded-lg",
                              isSelected ? pm.bg : "bg-slate-200/50",
                            )}
                          >
                            <Icon size={16} className={isSelected ? pm.color : "text-slate-500"} />
                          </div>
                          <span
                            className={cn("font-bold text-sm", isSelected ? "text-[#0B3D91]" : "")}
                          >
                            {pm.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Advanced Payment (Paid/Due) */}
                <div className="flex gap-3">
                  <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3 relative shadow-sm">
                    <Label className="text-[10px] uppercase font-bold text-slate-400 absolute top-2 left-3">
                      Amount Paid
                    </Label>
                    <div className="flex items-center mt-3 gap-1">
                      <span className="text-slate-400 font-semibold text-lg">₹</span>
                      <input
                        value={paid}
                        onChange={(e) => setPaid(e.target.value.replace(/[^\d.]/g, ""))}
                        placeholder={String(defaultPaidNum)}
                        inputMode="decimal"
                        className="w-full bg-transparent outline-none text-xl font-bold text-slate-800 placeholder:text-slate-300"
                      />
                    </div>
                  </div>
                  {due > 0 && (
                    <div className="flex-1 bg-red-50 border border-red-100 rounded-xl p-3 flex flex-col justify-end">
                      <span className="text-[10px] uppercase font-bold text-red-400">
                        Balance Due
                      </span>
                      <span className="text-xl font-bold text-red-600 mt-1">{formatINR(due)}</span>
                    </div>
                  )}
                </div>

                {onlineStatus === "OFFLINE" && (
                  <div className="flex items-center gap-2 text-red-500 bg-red-50 p-2.5 rounded-xl text-xs font-bold border border-red-100">
                    <AlertCircle size={14} /> You are offline. Cannot save bill.
                  </div>
                )}

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <Button
                    onClick={saveAndDownload}
                    disabled={saving || onlineStatus === "OFFLINE"}
                    variant="outline"
                    className="h-14 rounded-2xl border-slate-200 text-slate-700 font-bold text-base hover:bg-slate-50 hover:text-slate-900"
                  >
                    Save & PDF
                  </Button>
                  <Button
                    onClick={saveAndShare}
                    disabled={saving || onlineStatus === "OFFLINE"}
                    className="h-14 rounded-2xl bg-gradient-to-r from-[#16A34A] to-[#15803d] text-white font-bold text-base shadow-[0_4px_14px_0_rgba(22,163,74,0.39)] hover:shadow-[0_6px_20px_rgba(22,163,74,0.23)] hover:bg-[rgba(22,163,74,0.9)] border-none"
                  >
                    <Share2 size={18} className="mr-2" /> Share WhatsApp
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product Picker Modal */}
      <ProductPicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={addProduct} />

      {/* Customer Picker Modal */}
      <CustomerPicker
        open={custPickerOpen}
        onOpenChange={setCustPickerOpen}
        onPick={(c) => {
          setCustomer(c);
          setCustPickerOpen(false);
        }}
      />

      {/* Custom Item Bottom Sheet */}
      <CustomItemSheet
        open={customItemOpen}
        onOpenChange={setCustomItemOpen}
        onAdd={addCustomItemData}
      />
    </div>
  );
}

// ---------------------------------------------
// Modals & Pickers
// ---------------------------------------------

function ProductPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (p: Product) => void;
}) {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["product-picker"],
    enabled: open,
    queryFn: async () => {
      const { data } = await sb
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("name")
        .limit(200);
      return (data ?? []) as Product[];
    },
  });

  const filtered = (data ?? []).filter((p) => {
    const s = q.toLowerCase();
    return (
      !s ||
      (p.name || "").toLowerCase().includes(s) ||
      (p.part_number ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-[32px] h-[90vh] p-0 flex flex-col bg-[#F8FAFC]"
      >
        <div className="p-4 bg-white rounded-t-[32px] border-b border-slate-100 shadow-sm z-10">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-3">Add Product</h2>
          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-3.5 text-slate-400" />
            <Input
              placeholder="Search by name or part no..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-12 pl-10 bg-slate-50 border-slate-200 rounded-xl text-[15px] focus-visible:ring-[#0B3D91]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-12 flex flex-col items-center">
              <PackageOpen size={48} className="text-slate-300 mb-3" />
              <p className="text-slate-500 font-semibold text-lg">No products found</p>
              <p className="text-slate-400 text-sm">Try a different search term</p>
            </div>
          )}
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              className="w-full text-left p-3.5 rounded-2xl bg-white border border-slate-100 shadow-sm hover:border-[#0B3D91]/30 hover:shadow-md transition-all flex justify-between items-center group active:scale-[0.98]"
            >
              <div className="min-w-0 flex-1 pr-4">
                <div className="font-bold text-[15px] text-slate-800 truncate mb-1">{p.name}</div>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
                    <Tag size={10} /> {p.category || "General"}
                  </span>
                  <span>
                    Stock:{" "}
                    <span className={p.stock_quantity > 0 ? "text-emerald-600" : "text-red-500"}>
                      {p.stock_quantity}
                    </span>
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-base font-black text-[#0B3D91]">
                  {formatINR(Number(p.selling_price))}
                </div>
                {p.purchase_price && (
                  <div className="text-[10px] text-slate-400 line-through mt-0.5">
                    {formatINR(Number(p.purchase_price) * 1.2)}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CustomerPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (c: Customer) => void;
}) {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["customer-picker"],
    enabled: open,
    queryFn: async () => {
      const { data } = await sb
        .from("customers")
        .select("*")
        .is("deleted_at", null)
        .order("name")
        .limit(200);
      return (data ?? []) as Customer[];
    },
  });

  const filtered = (data ?? []).filter((c) => {
    const s = q.toLowerCase();
    return !s || (c.name || "").toLowerCase().includes(s) || (c.mobile || "").includes(s);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-[32px] h-[85vh] p-0 flex flex-col bg-[#F8FAFC]"
      >
        <div className="p-4 bg-white rounded-t-[32px] border-b border-slate-100 shadow-sm z-10">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-3">Select Customer</h2>
          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-3.5 text-slate-400" />
            <Input
              placeholder="Search name or mobile..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-12 pl-10 bg-slate-50 border-slate-200 rounded-xl text-[15px] focus-visible:ring-[#0B3D91]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-12 flex flex-col items-center">
              <User size={48} className="text-slate-300 mb-3" />
              <p className="text-slate-500 font-semibold text-lg">No customers found</p>
            </div>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => onPick(c)}
              className="w-full text-left p-3.5 rounded-2xl bg-white border border-slate-100 shadow-sm hover:border-[#0B3D91]/30 transition-all flex items-center gap-3 active:scale-[0.98]"
            >
              <div className="h-11 w-11 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm">
                {(c.name || "UN").substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-[15px] text-slate-800">{c.name}</div>
                <div className="text-xs font-medium text-slate-500 mt-0.5">
                  {c.mobile ?? "No mobile number"}
                </div>
              </div>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CustomItemSheet({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (name: string, price: number, qty: number) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");

  useEffect(() => {
    if (open) {
      setName("");
      setPrice("");
      setQty("1");
    }
  }, [open]);

  const handleAdd = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!price || isNaN(Number(price))) {
      toast.error("Valid price is required");
      return;
    }
    onAdd(name, Number(price), Math.max(1, Number(qty) || 1));
  };

  const total = Number(price || 0) * Number(qty || 1);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[32px] p-0 bg-white">
        <div className="p-4 border-b border-slate-100">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 text-center">Add Custom Item</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label className="text-xs font-bold text-slate-500 uppercase ml-1">Item Name</Label>
            <Input
              autoFocus
              placeholder="e.g. Labor Charge, Extra Fitting"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 rounded-xl mt-1 bg-slate-50 border-slate-200 focus-visible:ring-[#0B3D91]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-bold text-slate-500 uppercase ml-1">Rate (₹)</Label>
              <Input
                placeholder="0.00"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
                className="h-12 rounded-xl mt-1 bg-slate-50 border-slate-200 focus-visible:ring-[#0B3D91] font-bold text-lg"
              />
            </div>
            <div>
              <Label className="text-xs font-bold text-slate-500 uppercase ml-1">Quantity</Label>
              <div className="flex mt-1 items-center bg-slate-50 border border-slate-200 rounded-xl h-12 px-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-slate-600"
                  onClick={() => setQty(String(Math.max(1, Number(qty) - 1)))}
                >
                  <Minus size={18} />
                </Button>
                <Input
                  value={qty}
                  onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  className="h-10 border-none bg-transparent text-center font-bold text-lg focus-visible:ring-0 p-0"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-slate-600"
                  onClick={() => setQty(String(Number(qty) + 1))}
                >
                  <Plus size={18} />
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-[#0B3D91]/5 rounded-xl p-4 mt-2 flex justify-between items-center border border-[#0B3D91]/10">
            <span className="font-bold text-[#0B3D91]">Subtotal</span>
            <span className="font-black text-xl text-[#0B3D91]">{formatINR(total)}</span>
          </div>

          <Button
            onClick={handleAdd}
            className="w-full h-14 rounded-2xl bg-[#0B3D91] hover:bg-[#1a55b3] text-white font-bold text-lg mt-2 shadow-[0_4px_14px_0_rgba(11,61,145,0.39)]"
          >
            Add to Bill
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
