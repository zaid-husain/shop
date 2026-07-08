import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus, Trash2, Search, X, Share2, Save, User } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { ScreenHeader } from "@/components/ScreenHeader";
import { sb, type Customer, type Product } from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import { formatINR, nextInvoiceNumber, buildWhatsAppUrl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Billing & Invoices — Bharat Auto Parts" },
      { name: "description", content: "Create invoices, add parts, apply discounts, and share bills with customers over WhatsApp." },
      { property: "og:title", content: "Billing & Invoices — Bharat Auto Parts" },
      { property: "og:description", content: "Build invoices fast, add spare parts, apply discounts, and share bills with customers on WhatsApp." },
      { property: "og:url", content: "/billing" },
    ],
    links: [{ rel: "canonical", href: "/billing" }],
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

function BillingPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [items, setItems] = useState<CartItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [custPickerOpen, setCustPickerOpen] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [walkInName, setWalkInName] = useState("");
  const [walkInMobile, setWalkInMobile] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paid, setPaid] = useState("");
  const [saving, setSaving] = useState(false);

  const subtotal = useMemo(
    () => items.reduce((a, i) => a + i.unit_price * i.quantity, 0),
    [items],
  );
  const discountNum = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal - discountNum);
  const paidNum = paid === "" ? total : Math.max(0, Number(paid) || 0);
  const due = Math.max(0, total - paidNum);

  function addProduct(p: Product) {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
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

  function addCustomItem() {
    const name = prompt("Item name?");
    if (!name?.trim()) return;
    const price = Number(prompt("Price ₹?") ?? "0");
    if (!price) return;
    setItems((prev) => [
      ...prev,
      {
        product_id: null,
        product_name: name.trim(),
        part_number: null,
        unit_price: price,
        unit_cost: 0,
        quantity: 1,
      },
    ]);
  }

  function updateQty(idx: number, delta: number) {
    setItems((prev) =>
      prev
        .map((i, k) => (k === idx ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0),
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
    setSaving(true);
    try {
      const invNo = nextInvoiceNumber();
      const cost_total = items.reduce((a, i) => a + i.unit_cost * i.quantity, 0);
      const profit = total - cost_total - 0; // discount already reflected in total
      const payment_status = due <= 0.01 ? "paid" : paidNum === 0 ? "unpaid" : "partial";

      const { data: inv, error } = await sb
        .from("invoices")
        .insert({
          shop_id: profile!.shop_id,
          invoice_number: invNo,
          customer_id: customer?.id ?? null,
          customer_name: customer?.name ?? walkInName.trim() ?? null,
          customer_mobile:
            customer?.mobile ?? (walkInMobile.replace(/\D/g, "").slice(0, 10) || null),
          subtotal,
          discount: discountNum,
          total,
          paid: paidNum,
          due,
          payment_status,
          cost_total,
          profit,
          created_by: profile!.id,
        })
        .select("id, invoice_number")
        .single();
      if (error) throw error;

      const lines = items.map((i) => ({
        invoice_id: (inv as any).id,
        shop_id: profile!.shop_id,
        product_id: i.product_id,
        product_name: i.product_name,
        part_number: i.part_number,
        quantity: i.quantity,
        unit_price: i.unit_price,
        unit_cost: i.unit_cost,
        line_total: i.unit_price * i.quantity,
      }));
      const { error: liErr } = await sb.from("invoice_items").insert(lines);
      if (liErr) throw liErr;

      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(`Bill ${invNo} saved`);
      return inv as any;
    } catch (e: any) {
      console.error(e);
      toast.error("Something went wrong. Please try again.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  function generatePdf(invoiceNumber: string): jsPDF {
    // A5 portrait: 148 x 210 mm
    const doc = new jsPDF({ unit: "mm", format: "a5" });
    const W = 148;
    const M = 10; // margin
    const RIGHT = W - M;

    // Brand palette
    const NAVY: [number, number, number] = [11, 31, 58];
    const AMBER: [number, number, number] = [217, 152, 38];
    const INK: [number, number, number] = [30, 30, 30];
    const MUTED: [number, number, number] = [110, 110, 110];
    const LINE: [number, number, number] = [220, 220, 220];
    const BG: [number, number, number] = [248, 246, 240];

    // ===== Header band =====
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 30, "F");
    doc.setFillColor(...AMBER);
    doc.rect(0, 30, W, 1.4, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("BHARAT AUTO PARTS", W / 2, 13, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Complete Auto Parts Solution", W / 2, 18.5, { align: "center" });
    doc.setFontSize(7.5);
    doc.text("Near Bus Stand, Balapur, Akola", W / 2, 22.5, { align: "center" });
    doc.text("+91 9096731931  •  8668528219", W / 2, 26.2, { align: "center" });

    // ===== Invoice meta strip =====
    let y = 38;
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("INVOICE", M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(`#${invoiceNumber}`, M, y + 4.2);

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
    const timeStr = now.toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(dateStr, RIGHT, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(timeStr, RIGHT, y + 4.2, { align: "right" });

    y += 9;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(M, y, RIGHT, y);

    // ===== Bill To =====
    y += 5.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...AMBER);
    doc.text("BILL TO", M, y);
    y += 4.5;
    doc.setTextColor(...INK);
    doc.setFontSize(10);
    const custName = customer?.name ?? (walkInName.trim() || "Walk-in Customer");
    doc.text(custName, M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    const mobile = customer?.mobile ?? walkInMobile;
    if (mobile) {
      y += 4;
      doc.text(`Mobile: ${mobile}`, M, y);
    }
    const vehicle = (customer as any)?.vehicle_number;
    const vmodel = (customer as any)?.vehicle_model;
    if (vehicle || vmodel) {
      y += 4;
      const v = [vmodel, vehicle ? `(${vehicle})` : ""].filter(Boolean).join(" ");
      doc.text(`Vehicle: ${v}`, M, y);
    }

    // ===== Items table =====
    y += 7;
    // Column x positions
    const cSn = M + 1;
    const cItem = M + 9;
    const cQty = RIGHT - 48;
    const cRate = RIGHT - 28;
    const cAmt = RIGHT - 1;

    // Table head
    doc.setFillColor(...NAVY);
    doc.rect(M, y, RIGHT - M, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.text("#", cSn, y + 4.7);
    doc.text("ITEM", cItem, y + 4.7);
    doc.text("QTY", cQty, y + 4.7, { align: "right" });
    doc.text("RATE", cRate, y + 4.7, { align: "right" });
    doc.text("AMOUNT", cAmt, y + 4.7, { align: "right" });
    y += 7;

    // Rows
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    items.forEach((i, idx) => {
      const hasSku = !!i.part_number;
      const rowH = hasSku ? 9 : 6.5;
      if (idx % 2 === 1) {
        doc.setFillColor(...BG);
        doc.rect(M, y, RIGHT - M, rowH, "F");
      }
      doc.setTextColor(...MUTED);
      doc.setFontSize(8);
      doc.text(String(idx + 1), cSn, y + 4.2);
      doc.setTextColor(...INK);
      doc.setFontSize(9);
      const nameLines = doc.splitTextToSize(i.product_name, cQty - cItem - 4) as string[];
      doc.text(nameLines[0] ?? "", cItem, y + 4.2);
      if (hasSku) {
        doc.setFontSize(7);
        doc.setTextColor(...MUTED);
        doc.text(`SKU: ${i.part_number}`, cItem, y + 7.8);
        doc.setTextColor(...INK);
        doc.setFontSize(9);
      }
      doc.text(String(i.quantity), cQty, y + 4.2, { align: "right" });
      doc.text(formatINR(i.unit_price), cRate, y + 4.2, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(formatINR(i.unit_price * i.quantity), cAmt, y + 4.2, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += rowH;
    });

    // ===== Totals =====
    y += 3;
    doc.setDrawColor(...LINE);
    doc.line(RIGHT - 60, y, RIGHT, y);
    y += 5;

    const drawRow = (label: string, value: string, opts?: { bold?: boolean; color?: [number, number, number] }) => {
      doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
      doc.setFontSize(opts?.bold ? 10 : 9);
      doc.setTextColor(...(opts?.color ?? INK));
      doc.text(label, RIGHT - 60, y);
      doc.text(value, cAmt, y, { align: "right" });
      y += opts?.bold ? 6 : 5;
    };

    drawRow("Subtotal", formatINR(subtotal));
    if (discountNum > 0) drawRow("Discount", `- ${formatINR(discountNum)}`);

    // Grand total band
    doc.setFillColor(...NAVY);
    doc.rect(RIGHT - 60, y - 3.5, 60, 8.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    doc.text("GRAND TOTAL", RIGHT - 58, y + 2);
    doc.text(formatINR(total), cAmt - 1, y + 2, { align: "right" });
    y += 9;

    doc.setTextColor(...INK);
    drawRow("Paid", formatINR(paidNum));
    if (due > 0) drawRow("Balance Due", formatINR(due), { bold: true, color: AMBER });

    // ===== Payment status pill =====
    const status = due <= 0.01 ? "PAID" : paidNum === 0 ? "UNPAID" : "PARTIAL";
    const pillColor: [number, number, number] =
      status === "PAID" ? [16, 120, 75] : status === "UNPAID" ? [180, 50, 50] : AMBER;
    y += 2;
    doc.setFillColor(...pillColor);
    doc.roundedRect(M, y, 28, 6.5, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(status, M + 14, y + 4.4, { align: "center" });

    // ===== Footer =====
    doc.setDrawColor(...LINE);
    doc.line(M, 196, RIGHT, 196);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text("Thank you for your business!", W / 2, 201, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text("Goods once sold will not be taken back. Please retain this bill for warranty.", W / 2, 205, { align: "center" });

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
      items.map((i) => `• ${i.product_name} × ${i.quantity} = ${formatINR(i.unit_price * i.quantity)}`).join("\n") +
      `\n\nSubtotal: ${formatINR(subtotal)}` +
      (discountNum > 0 ? `\nDiscount: -${formatINR(discountNum)}` : "") +
      `\n*Total: ${formatINR(total)}*` +
      `\nPaid: ${formatINR(paidNum)}` +
      (due > 0 ? `\nDue: ${formatINR(due)}` : "") +
      `\n\nThank you!`;
    const url = buildWhatsAppUrl(mobile, msg);
    if (url) window.open(url, "_blank");
    else {
      // fallback to download
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
  }

  return (
    <div>
      <ScreenHeader
        title="New Bill"
        subtitle={items.length === 0 ? "Add items to start" : `${items.length} item${items.length > 1 ? "s" : ""}`}
      />

      {/* Customer */}
      <div className="px-4 -mt-3">
        <div className="rounded-2xl bg-card shadow-card p-3">
          {customer ? (
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-semibold">{customer.name}</div>
                {customer.mobile && (
                  <div className="text-xs text-muted-foreground">{customer.mobile}</div>
                )}
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Remove customer" onClick={() => setCustomer(null)}>
                <X size={16} />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 items-stretch">
              <Button
                variant="outline"
                onClick={() => setCustPickerOpen(true)}
                className="flex-1"
              >
                <User size={16} /> Pick customer
              </Button>
            </div>
          )}
          {!customer && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Input
                placeholder="Walk-in name"
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                className="h-10"
              />
              <Input
                placeholder="Mobile"
                inputMode="numeric"
                value={walkInMobile}
                onChange={(e) =>
                  setWalkInMobile(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                className="h-10"
              />
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="px-4 mt-4 space-y-2">
        <AnimatePresence>
          {items.map((i, idx) => (
            <motion.div
              key={`${i.product_id ?? "custom"}-${idx}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="rounded-2xl bg-card shadow-card p-3 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{i.product_name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatINR(i.unit_price)} × {i.quantity} = {formatINR(i.unit_price * i.quantity)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="icon-sm" variant="outline" aria-label="Decrease quantity" onClick={() => updateQty(idx, -1)}>
                  <Minus size={14} />
                </Button>
                <span className="w-6 text-center font-bold">{i.quantity}</span>
                <Button size="icon-sm" variant="outline" aria-label="Increase quantity" onClick={() => updateQty(idx, 1)}>
                  <Plus size={14} />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove item"
                  className="text-destructive"
                  onClick={() => removeItem(idx)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setPickerOpen(true)} variant="hero">
            <Search size={16} /> Add product
          </Button>
          <Button onClick={addCustomItem} variant="outline">
            <Plus size={16} /> Custom item
          </Button>
        </div>
      </div>

      {/* Totals */}
      {items.length > 0 && (
        <div className="px-4 mt-4">
          <div className="rounded-2xl bg-card shadow-card p-4 space-y-3">
            <Row label="Subtotal" value={formatINR(subtotal)} />
            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs text-muted-foreground">Discount ₹</Label>
              <Input
                value={discount}
                onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                className="h-9 w-28 text-right"
              />
            </div>
            <Row label="Total" value={formatINR(total)} bold />
            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs text-muted-foreground">Paid ₹</Label>
              <Input
                value={paid}
                onChange={(e) => setPaid(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder={String(total)}
                inputMode="decimal"
                className="h-9 w-28 text-right"
              />
            </div>
            {due > 0 && (
              <Row label="Due" value={formatINR(due)} bold danger />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button onClick={saveAndDownload} disabled={saving} variant="outline" size="lg">
              <Save size={16} /> Save + PDF
            </Button>
            <Button onClick={saveAndShare} disabled={saving} variant="hero" size="lg">
              <Share2 size={16} /> Save + WhatsApp
            </Button>
          </div>
        </div>
      )}

      <ProductPicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={addProduct} />
      <CustomerPicker
        open={custPickerOpen}
        onOpenChange={setCustPickerOpen}
        onPick={(c) => { setCustomer(c); setCustPickerOpen(false); }}
      />
    </div>
  );
}

function Row({ label, value, bold, danger }: { label: string; value: string; bold?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${bold ? "font-bold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`${bold ? "text-lg font-bold" : "text-sm font-semibold"} ${danger ? "text-destructive" : ""}`}>
        {value}
      </span>
    </div>
  );
}

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
    return !s || p.name.toLowerCase().includes(s) || (p.part_number ?? "").toLowerCase().includes(s);
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader><SheetTitle>Select product</SheetTitle></SheetHeader>
        <Input
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          className="mt-3"
        />
        <div className="mt-3 space-y-1">
          {filtered.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No products found
            </div>
          )}
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-secondary flex justify-between"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  {p.part_number ?? p.category} · stock {p.stock_quantity}
                </div>
              </div>
              <div className="text-sm font-bold">{formatINR(Number(p.selling_price))}</div>
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
      const { data } = await sb.from("customers").select("*").order("name").limit(200);
      return (data ?? []) as Customer[];
    },
  });
  const filtered = (data ?? []).filter((c) => {
    const s = q.toLowerCase();
    return !s || c.name.toLowerCase().includes(s) || (c.mobile ?? "").includes(s);
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader><SheetTitle>Select customer</SheetTitle></SheetHeader>
        <Input
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          className="mt-3"
        />
        <div className="mt-3 space-y-1">
          {filtered.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No customers yet
            </div>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => onPick(c)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-secondary"
            >
              <div className="font-medium text-sm">{c.name}</div>
              <div className="text-xs text-muted-foreground">{c.mobile ?? "—"}</div>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
