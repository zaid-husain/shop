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
      toast.error(e.message ?? String(e));
      return null;
    } finally {
      setSaving(false);
    }
  }

  function generatePdf(invoiceNumber: string): jsPDF {
    const doc = new jsPDF({ unit: "mm", format: "a5" });
    const shopName = "Bharat Auto Parts";
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(shopName, 10, 14);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Invoice: ${invoiceNumber}`, 10, 22);
    doc.text(`Date: ${new Date().toLocaleString("en-IN")}`, 10, 27);
    const custName = customer?.name ?? walkInName ?? "Walk-in";
    doc.text(`Customer: ${custName}`, 10, 32);
    if (customer?.mobile || walkInMobile) {
      doc.text(`Mobile: ${customer?.mobile ?? walkInMobile}`, 10, 37);
    }
    let y = 46;
    doc.setFont("helvetica", "bold");
    doc.text("Item", 10, y);
    doc.text("Qty", 90, y, { align: "right" });
    doc.text("Price", 115, y, { align: "right" });
    doc.text("Total", 140, y, { align: "right" });
    doc.line(10, y + 1.5, 140, y + 1.5);
    y += 6;
    doc.setFont("helvetica", "normal");
    for (const i of items) {
      doc.text(i.product_name.slice(0, 40), 10, y);
      doc.text(String(i.quantity), 90, y, { align: "right" });
      doc.text(formatINR(i.unit_price), 115, y, { align: "right" });
      doc.text(formatINR(i.unit_price * i.quantity), 140, y, { align: "right" });
      y += 5;
    }
    doc.line(10, y, 140, y);
    y += 6;
    doc.text(`Subtotal: ${formatINR(subtotal)}`, 140, y, { align: "right" });
    y += 5;
    if (discountNum > 0) {
      doc.text(`Discount: -${formatINR(discountNum)}`, 140, y, { align: "right" });
      y += 5;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Total: ${formatINR(total)}`, 140, y, { align: "right" });
    y += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Paid: ${formatINR(paidNum)}`, 140, y, { align: "right" });
    y += 5;
    if (due > 0) doc.text(`Due: ${formatINR(due)}`, 140, y, { align: "right" });
    doc.setFontSize(9);
    doc.text("Thank you for your business!", 10, 195);
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
              <Button variant="ghost" size="icon-sm" onClick={() => setCustomer(null)}>
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
                <Button size="icon-sm" variant="outline" onClick={() => updateQty(idx, -1)}>
                  <Minus size={14} />
                </Button>
                <span className="w-6 text-center font-bold">{i.quantity}</span>
                <Button size="icon-sm" variant="outline" onClick={() => updateQty(idx, 1)}>
                  <Plus size={14} />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
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
