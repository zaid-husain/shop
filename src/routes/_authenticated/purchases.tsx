import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, Package, Truck, IndianRupee, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { sb, PAYMENT_METHODS, type Product, type Purchase, type PurchaseItem, type Supplier } from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import { formatINR, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({
    meta: [
      { title: "Purchases — Bharat Auto Parts" },
      { name: "description", content: "Record supplier purchases and stock-in entries. Stock and cost update automatically." },
    ],
  }),
  component: PurchasesPage,
});

type Line = {
  key: string;
  product_id: string | null;
  product_name: string;
  quantity: string;
  unit_cost: string;
};

function newLine(): Line {
  return { key: crypto.randomUUID(), product_id: null, product_name: "", quantity: "1", unit_cost: "" };
}

function PurchasesPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [detail, setDetail] = useState<Purchase | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["purchases", profile?.shop_id],
    enabled: !!profile?.shop_id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("purchases")
        .select("*")
        .order("bill_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Purchase[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((p) => {
      if (!q) return true;
      return (
        (p.supplier_name ?? "").toLowerCase().includes(q) ||
        (p.bill_number ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, search]);

  const monthTotal = useMemo(() => {
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    return (data ?? [])
      .filter((p) => p.bill_date >= start)
      .reduce((a, p) => a + Number(p.total), 0);
  }, [data]);

  const monthDue = useMemo(() => (data ?? []).reduce((a, p) => a + Number(p.due), 0), [data]);

  return (
    <div>
      <ScreenHeader
        title="Purchases"
        subtitle={`${data?.length ?? 0} bills`}
        right={
          <Button size="icon-sm" variant="amber" onClick={() => setNewOpen(true)} aria-label="New purchase">
            <Plus size={18} />
          </Button>
        }
      />

      <div className="px-4 -mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4 shadow-card bg-card">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Package size={14} /> This month
          </div>
          <div className="mt-1.5 text-xl font-bold tracking-tight">{formatINR(monthTotal)}</div>
        </div>
        <div className="rounded-2xl p-4 shadow-card bg-destructive/10 border border-destructive/20">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
            <IndianRupee size={14} /> Supplier dues
          </div>
          <div className="mt-1.5 text-xl font-bold text-destructive tracking-tight">{formatINR(monthDue)}</div>
        </div>
      </div>

      <div className="px-4 mt-4 relative">
        <Search size={16} className="absolute left-7 top-3 text-muted-foreground" />
        <Input
          placeholder="Search supplier or bill #"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-11 rounded-xl shadow-card bg-card"
        />
      </div>

      <div className="px-4 mt-3 space-y-2">
        {isLoading && (
          <div className="text-center text-sm text-muted-foreground py-8">Loading…</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16">
            <div className="text-sm text-muted-foreground mb-4">
              {search ? "No purchases match" : "No purchases yet"}
            </div>
            {!search && (
              <Button variant="hero" onClick={() => setNewOpen(true)}>
                <Plus size={16} /> Record first purchase
              </Button>
            )}
          </div>
        )}
        {filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => setDetail(p)}
            className="w-full text-left rounded-2xl bg-card shadow-card p-4 flex items-center justify-between"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Truck size={14} className="text-muted-foreground shrink-0" />
                <div className="font-semibold text-sm truncate">{p.supplier_name ?? "Unknown supplier"}</div>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {formatDate(p.bill_date)}
                {p.bill_number ? ` · #${p.bill_number}` : ""}
              </div>
            </div>
            <div className="text-right shrink-0 flex items-center gap-1">
              <div>
                <div className="text-sm font-bold">{formatINR(Number(p.total))}</div>
                {Number(p.due) > 0 && (
                  <div className="text-[10px] font-semibold text-destructive uppercase">
                    Due {formatINR(Number(p.due))}
                  </div>
                )}
              </div>
              <ChevronRight size={16} className="text-muted-foreground" />
            </div>
          </button>
        ))}
      </div>

      <NewPurchaseSheet
        open={newOpen}
        onOpenChange={setNewOpen}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["purchases"] });
          qc.invalidateQueries({ queryKey: ["products"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />
      <PurchaseDetailSheet purchase={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function NewPurchaseSheet({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { profile, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierMobile, setSupplierMobile] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [discount, setDiscount] = useState("0");
  const [paid, setPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [productPickerFor, setProductPickerFor] = useState<string | null>(null);

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", profile?.shop_id],
    enabled: !!profile?.shop_id && open,
    queryFn: async () => {
      const { data, error } = await sb.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data as Supplier[];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products", profile?.shop_id],
    enabled: !!profile?.shop_id && open,
    queryFn: async () => {
      const { data, error } = await sb
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const subtotal = lines.reduce(
    (a, l) => a + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0),
    0,
  );
  const total = Math.max(subtotal - (Number(discount) || 0), 0);
  const paidNum = paid === "" ? total : Number(paid) || 0;
  const due = Math.max(total - paidNum, 0);

  function reset() {
    setSupplierName("");
    setSupplierId(null);
    setSupplierMobile("");
    setBillNumber("");
    setBillDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("cash");
    setDiscount("0");
    setPaid("");
    setNotes("");
    setLines([newLine()]);
  }

  function pickSupplier(s: Supplier) {
    setSupplierId(s.id);
    setSupplierName(s.name);
    setSupplierMobile(s.mobile ?? "");
  }

  function pickProduct(lineKey: string, p: Product) {
    setLines((ls) =>
      ls.map((l) =>
        l.key === lineKey
          ? {
              ...l,
              product_id: p.id,
              product_name: p.name,
              unit_cost: l.unit_cost || String(p.purchase_price ?? ""),
            }
          : l,
      ),
    );
    setProductPickerFor(null);
  }

  async function save() {
    if (!supplierName.trim()) return toast.error("Enter supplier name");
    const validLines = lines.filter((l) => l.product_name.trim() && Number(l.quantity) > 0);
    if (validLines.length === 0) return toast.error("Add at least one item");

    setBusy(true);
    try {
      let resolvedSupplierId = supplierId;
      // Auto-create supplier if a new free-text name and not matching existing id
      if (!resolvedSupplierId && supplierName.trim()) {
        const { data: sup, error } = await sb
          .from("suppliers")
          .insert({
            shop_id: profile!.shop_id,
            name: supplierName.trim(),
            mobile: supplierMobile.trim() || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        resolvedSupplierId = (sup as { id: string }).id;
      }

      const { data: purchase, error: pErr } = await sb
        .from("purchases")
        .insert({
          shop_id: profile!.shop_id,
          supplier_id: resolvedSupplierId,
          supplier_name: supplierName.trim(),
          bill_number: billNumber.trim() || null,
          bill_date: billDate,
          subtotal,
          discount: Number(discount) || 0,
          total,
          paid: paidNum,
          due,
          payment_method: paymentMethod,
          notes: notes.trim() || null,
          created_by: session!.user.id,
        })
        .select("id")
        .single();
      if (pErr) throw pErr;

      const purchaseId = (purchase as { id: string }).id;
      const itemRows = validLines.map((l) => {
        const qty = Number(l.quantity) || 0;
        const cost = Number(l.unit_cost) || 0;
        return {
          purchase_id: purchaseId,
          shop_id: profile!.shop_id,
          product_id: l.product_id,
          product_name: l.product_name.trim(),
          quantity: qty,
          unit_cost: cost,
          line_total: qty * cost,
        };
      });
      const { error: iErr } = await sb.from("purchase_items").insert(itemRows);
      if (iErr) throw iErr;

      toast.success("Purchase recorded · stock updated");
      reset();
      onSaved();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[94vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New purchase</SheetTitle>
        </SheetHeader>

        <div className="space-y-3 mt-4">
          <Field label="Supplier *">
            <Input
              value={supplierName}
              onChange={(e) => {
                setSupplierName(e.target.value);
                setSupplierId(null);
              }}
              placeholder="Supplier name"
            />
            {!supplierId && supplierName && (suppliers ?? []).filter((s) =>
              s.name.toLowerCase().includes(supplierName.toLowerCase()),
            ).length > 0 && (
              <div className="mt-1 rounded-xl border bg-card max-h-40 overflow-y-auto">
                {(suppliers ?? [])
                  .filter((s) => s.name.toLowerCase().includes(supplierName.toLowerCase()))
                  .slice(0, 5)
                  .map((s) => (
                    <button
                      key={s.id}
                      onClick={() => pickSupplier(s)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-secondary border-b last:border-b-0"
                    >
                      <div className="font-medium">{s.name}</div>
                      {s.mobile && <div className="text-xs text-muted-foreground">{s.mobile}</div>}
                    </button>
                  ))}
              </div>
            )}
          </Field>

          {!supplierId && (
            <Field label="Supplier mobile (optional)">
              <Input
                inputMode="tel"
                value={supplierMobile}
                onChange={(e) => setSupplierMobile(e.target.value)}
                placeholder="10-digit number"
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Bill #">
              <Input
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="Bill date">
              <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
            </Field>
          </div>

          <div className="rounded-2xl border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLines((ls) => [...ls, newLine()])}
              >
                <Plus size={14} /> Add item
              </Button>
            </div>
            {lines.map((l, idx) => (
              <div key={l.key} className="space-y-2 pb-3 border-b last:border-b-0 last:pb-0">
                <div className="flex gap-2 items-start">
                  <div className="flex-1 min-w-0">
                    <Input
                      value={l.product_name}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLines((ls) =>
                          ls.map((x) =>
                            x.key === l.key ? { ...x, product_name: v, product_id: null } : x,
                          ),
                        );
                        setProductPickerFor(l.key);
                      }}
                      onFocus={() => setProductPickerFor(l.key)}
                      placeholder={`Item ${idx + 1} name`}
                    />
                    {productPickerFor === l.key && l.product_name && (products ?? []).filter((p) =>
                      p.name.toLowerCase().includes(l.product_name.toLowerCase()),
                    ).length > 0 && (
                      <div className="mt-1 rounded-xl border bg-card max-h-40 overflow-y-auto">
                        {(products ?? [])
                          .filter((p) => p.name.toLowerCase().includes(l.product_name.toLowerCase()))
                          .slice(0, 5)
                          .map((p) => (
                            <button
                              key={p.id}
                              onClick={() => pickProduct(l.key, p)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-secondary border-b last:border-b-0"
                            >
                              <div className="font-medium">{p.name}</div>
                              <div className="text-xs text-muted-foreground">
                                Stock {p.stock_quantity} · cost {formatINR(Number(p.purchase_price))}
                              </div>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  {lines.length > 1 && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      aria-label="Remove item"
                    >
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Qty</Label>
                    <Input
                      inputMode="decimal"
                      value={l.quantity}
                      onChange={(e) =>
                        setLines((ls) =>
                          ls.map((x) => (x.key === l.key ? { ...x, quantity: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Unit ₹</Label>
                    <Input
                      inputMode="decimal"
                      value={l.unit_cost}
                      onChange={(e) =>
                        setLines((ls) =>
                          ls.map((x) => (x.key === l.key ? { ...x, unit_cost: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Line ₹</Label>
                    <div className="h-9 px-3 rounded-md border bg-muted/40 flex items-center text-sm font-semibold">
                      {formatINR((Number(l.quantity) || 0) * (Number(l.unit_cost) || 0))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount ₹">
              <Input
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </Field>
            <Field label="Paid ₹">
              <Input
                inputMode="decimal"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                placeholder={String(total)}
              />
            </Field>
          </div>

          <Field label="Payment method">
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger aria-label="Payment method"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>

          <div className="rounded-2xl bg-muted/50 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatINR(subtotal)}</span></div>
            <div className="flex justify-between"><span>Discount</span><span>−{formatINR(Number(discount) || 0)}</span></div>
            <div className="flex justify-between font-bold text-base"><span>Total</span><span>{formatINR(total)}</span></div>
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Paid</span><span>{formatINR(paidNum)}</span></div>
            {due > 0 && (
              <div className="flex justify-between text-destructive font-semibold"><span>Due</span><span>{formatINR(due)}</span></div>
            )}
          </div>

          <Button onClick={save} disabled={busy} className="w-full h-12" variant="hero">
            {busy ? "Saving…" : "Save purchase"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PurchaseDetailSheet({
  purchase,
  onClose,
}: {
  purchase: Purchase | null;
  onClose: () => void;
}) {
  const open = !!purchase;
  const { data: items } = useQuery({
    queryKey: ["purchase-items", purchase?.id],
    enabled: !!purchase,
    queryFn: async () => {
      const { data, error } = await sb
        .from("purchase_items")
        .select("*")
        .eq("purchase_id", purchase!.id);
      if (error) throw error;
      return data as PurchaseItem[];
    },
  });

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{purchase?.supplier_name ?? "Purchase"}</SheetTitle>
        </SheetHeader>
        {purchase && (
          <div className="space-y-4 mt-3">
            <div className="text-xs text-muted-foreground">
              {formatDate(purchase.bill_date)}
              {purchase.bill_number ? ` · Bill #${purchase.bill_number}` : ""}
              {purchase.payment_method ? ` · ${purchase.payment_method}` : ""}
            </div>

            <div className="rounded-2xl border divide-y">
              {(items ?? []).map((it) => (
                <div key={it.id} className="px-3 py-2.5 flex justify-between items-center">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{it.product_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {Number(it.quantity)} × {formatINR(Number(it.unit_cost))}
                    </div>
                  </div>
                  <div className="text-sm font-bold">{formatINR(Number(it.line_total))}</div>
                </div>
              ))}
              {items && items.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">No items</div>
              )}
            </div>

            <div className="rounded-2xl bg-muted/50 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatINR(Number(purchase.subtotal))}</span></div>
              {Number(purchase.discount) > 0 && (
                <div className="flex justify-between"><span>Discount</span><span>−{formatINR(Number(purchase.discount))}</span></div>
              )}
              <div className="flex justify-between font-bold text-base"><span>Total</span><span>{formatINR(Number(purchase.total))}</span></div>
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Paid</span><span>{formatINR(Number(purchase.paid))}</span></div>
              {Number(purchase.due) > 0 && (
                <div className="flex justify-between text-destructive font-semibold"><span>Due</span><span>{formatINR(Number(purchase.due))}</span></div>
              )}
            </div>

            {purchase.notes && (
              <div className="text-sm text-muted-foreground">{purchase.notes}</div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
