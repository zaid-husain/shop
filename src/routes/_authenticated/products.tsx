import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { sb, PRODUCT_CATEGORIES, type Product } from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import { formatINR } from "@/lib/format";
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

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [
    { title: "Inventory — Bharat Auto Parts" },
    { name: "description", content: "Manage your spare parts stock, prices, brands, and low-stock alerts in one place." },
  ] }),
  component: ProductsPage,
});

function ProductsPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);

  const { data: products, isLoading } = useQuery({
    queryKey: ["products", profile?.shop_id],
    enabled: !!profile?.shop_id,
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

  const filtered = (products ?? []).filter((p) => {
    const q = search.toLowerCase();
    return (
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.part_number ?? "").toLowerCase().includes(q) ||
      (p.brand ?? "").toLowerCase().includes(q)
    );
  });

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(p: Product) {
    setEditing(p);
    setOpen(true);
  }

  return (
    <div>
      <ScreenHeader
        title="Inventory"
        subtitle={`${products?.length ?? 0} products`}
        right={
          <Button
            size="icon-sm"
            variant="amber"
            onClick={openNew}
            aria-label="Add product"
          >
            <Plus size={18} />
          </Button>
        }
      />

      <div className="px-4 -mt-3 relative">
        <Search size={16} className="absolute left-7 top-3 text-muted-foreground" />
        <Input
          placeholder="Search by name, part #, brand"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-11 rounded-xl shadow-card bg-card"
        />
      </div>

      <div className="px-4 mt-4 space-y-2">
        {isLoading && (
          <div className="text-center text-sm text-muted-foreground py-8">Loading…</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <EmptyState onAdd={openNew} hasSearch={!!search} />
        )}
        {filtered.map((p) => {
          const low = p.stock_quantity <= (p.low_stock_threshold ?? 5);
          return (
            <button
              key={p.id}
              onClick={() => openEdit(p)}
              className="w-full text-left rounded-2xl bg-card shadow-card p-4 flex justify-between items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {[p.brand, p.part_number, p.category].filter(Boolean).join(" · ")}
                </div>
                <div className="mt-1 text-xs">
                  <span className="font-bold text-foreground">{formatINR(Number(p.selling_price))}</span>
                  <span className="text-muted-foreground"> · cost {formatINR(Number(p.purchase_price))}</span>
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`text-base font-bold ${
                    low ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {p.stock_quantity}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  in stock
                </div>
                {low && (
                  <div className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-destructive">
                    <AlertTriangle size={10} /> Low
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <ProductSheet
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["products"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />
    </div>
  );
}

function EmptyState({ onAdd, hasSearch }: { onAdd: () => void; hasSearch: boolean }) {
  return (
    <div className="text-center py-16">
      <div className="text-sm text-muted-foreground mb-4">
        {hasSearch ? "No products match your search" : "No products yet"}
      </div>
      {!hasSearch && (
        <Button onClick={onAdd} variant="hero">
          <Plus size={16} /> Add your first product
        </Button>
      )}
    </div>
  );
}

function ProductSheet({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Product | null;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>(() => ({
    name: "",
    part_number: "",
    brand: "",
    category: "Engine Parts",
    purchase_price: "",
    selling_price: "",
    stock_quantity: "",
    low_stock_threshold: "5",
    notes: "",
  }));

  // Reset form when sheet opens
  useState(() => null);
  if (open && initial && form._id !== initial.id) {
    setForm({
      _id: initial.id,
      name: initial.name,
      part_number: initial.part_number ?? "",
      brand: initial.brand ?? "",
      category: initial.category,
      purchase_price: String(initial.purchase_price),
      selling_price: String(initial.selling_price),
      stock_quantity: String(initial.stock_quantity),
      low_stock_threshold: String(initial.low_stock_threshold),
      notes: initial.notes ?? "",
    });
  } else if (open && !initial && form._id) {
    setForm({
      name: "",
      part_number: "",
      brand: "",
      category: "Engine Parts",
      purchase_price: "",
      selling_price: "",
      stock_quantity: "",
      low_stock_threshold: "5",
      notes: "",
    });
  }

  async function save() {
    if (!form.name.trim()) return toast.error("Product name is required");
    const buy = Number(form.purchase_price || 0);
    const sell = Number(form.selling_price || 0);
    if (sell <= 0) return toast.error("Selling price must be greater than 0");

    setBusy(true);
    try {
      const payload = {
        shop_id: profile!.shop_id,
        name: form.name.trim(),
        part_number: form.part_number.trim() || null,
        brand: form.brand.trim() || null,
        category: form.category,
        purchase_price: buy,
        selling_price: sell,
        stock_quantity: Number(form.stock_quantity || 0),
        low_stock_threshold: Number(form.low_stock_threshold || 5),
        notes: form.notes.trim() || null,
      };
      if (initial) {
        const { error } = await sb.from("products").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Product updated");
      } else {
        const { error } = await sb.from("products").insert(payload);
        if (error) throw error;
        toast.success("Product added");
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error("Something went wrong. Please try again.");
    } finally {

      setBusy(false);
    }
  }

  async function deactivate() {
    if (!initial) return;
    if (!confirm(`Remove "${initial.name}" from inventory?`)) return;
    setBusy(true);
    const { error } = await sb.from("products").update({ is_active: false }).eq("id", initial.id);
    setBusy(false);
    if (error) { console.error(error); return toast.error("Something went wrong. Please try again."); }
    toast.success("Product removed");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{initial ? "Edit product" : "New product"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-3 mt-4">
          <Field label="Product name *">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Brake pad set"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Part #">
              <Input
                value={form.part_number}
                onChange={(e) => setForm({ ...form, part_number: e.target.value })}
                placeholder="OEM #"
              />
            </Field>
            <Field label="Brand">
              <Input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="e.g. Bosch"
              />
            </Field>
          </div>

          <Field label="Category">
            <Select
              value={form.category}
              onValueChange={(v) => setForm({ ...form, category: v })}
            >
              <SelectTrigger aria-label="Select category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRODUCT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Purchase ₹">
              <Input
                inputMode="decimal"
                value={form.purchase_price}
                onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
              />
            </Field>
            <Field label="Selling ₹ *">
              <Input
                inputMode="decimal"
                value={form.selling_price}
                onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Stock qty">
              <Input
                inputMode="numeric"
                value={form.stock_quantity}
                onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
              />
            </Field>
            <Field label="Low stock alert">
              <Input
                inputMode="numeric"
                value={form.low_stock_threshold}
                onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Notes">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </Field>

          <div className="flex gap-2 pt-2">
            {initial && (
              <Button variant="outline" onClick={deactivate} disabled={busy}>
                Remove
              </Button>
            )}
            <Button onClick={save} disabled={busy} className="flex-1" variant="hero">
              {busy ? "Saving…" : initial ? "Save changes" : "Add product"}
            </Button>
          </div>
        </div>
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
