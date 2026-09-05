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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SoundManager } from "@/lib/sounds";

function capitalize(str: string) {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function getProductTitle(brand?: string | null, name?: string | null) {
  const b = (brand || "").trim();
  const n = (name || "").trim();
  if (b && n) return capitalize(`${b} ${n}`);
  if (n) return capitalize(n);
  if (b) return capitalize(b);
  return "Unknown Product";
}

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "Inventory Management — Bharat Auto Parts" },
      {
        name: "description",
        content:
          "Manage your spare parts stock, prices, brands, and low-stock alerts in one place.",
      },
      { property: "og:title", content: "Inventory Management — Bharat Auto Parts" },
      {
        property: "og:description",
        content:
          "Track spare parts stock, update prices, organise brands, and get low-stock alerts for your auto parts shop.",
      },
      { property: "og:url", content: "/products" },
    ],
    links: [{ rel: "canonical", href: "/products" }],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const { profile, role } = useAuth();
  const canEdit = role === "owner" || role === "manager";
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
    const q = search.toLowerCase().trim();
    if (!q) return true;

    const searchTerms = q.split(/\s+/);
    const productString =
      `${p.brand ?? ""} ${p.name} ${p.part_number ?? ""} ${p.category ?? ""}`.toLowerCase();

    return searchTerms.every((term) => productString.includes(term));
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
          canEdit ? (
            <Button size="icon-sm" variant="amber" onClick={openNew} aria-label="Add product">
              <Plus size={18} />
            </Button>
          ) : null
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
          <EmptyState onAdd={openNew} hasSearch={!!search} canEdit={canEdit} />
        )}
        {filtered.map((p) => {
          const low = p.stock_quantity <= (p.low_stock_threshold ?? 5);
          return (
            <button
              key={p.id}
              onClick={() => canEdit && openEdit(p)}
              className="w-full text-left rounded-2xl bg-card shadow-card p-4 flex justify-between items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">
                  {getProductTitle(p.brand, p.name)}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {[p.part_number, p.category].filter(Boolean).join(" · ")}
                </div>
                <div className="mt-1 text-xs">
                  <span className="font-bold text-foreground">
                    {formatINR(Number(p.selling_price))}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · cost {formatINR(Number(p.purchase_price))}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`text-base font-bold ${low ? "text-destructive" : "text-foreground"}`}
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

function EmptyState({
  onAdd,
  hasSearch,
  canEdit,
}: {
  onAdd: () => void;
  hasSearch: boolean;
  canEdit: boolean;
}) {
  return (
    <div className="text-center py-16">
      <div className="text-sm text-muted-foreground mb-4">
        {hasSearch ? "No products match your search" : "No products yet"}
      </div>
      {!hasSearch && canEdit && (
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
  const { profile, role } = useAuth();
  const canEdit = role === "owner" || role === "manager";
  const canDelete = role === "owner";
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{
    _id?: string;
    name: string;
    part_number: string;
    brand: string;
    category: string;
    purchase_price: string;
    selling_price: string;
    stock_quantity: string;
    low_stock_threshold: string;
    notes: string;
  }>(() => ({
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

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
        SoundManager.play("success");
        toast.success("Product updated");
      } else {
        const { error } = await sb.from("products").insert(payload);
        if (error) throw error;
        SoundManager.play("success");
        toast.success("Product added");
      }
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      console.error(e);
      SoundManager.play("error");
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (!initial) return;
    setIsDeleting(true);
    try {
      const { error } = await sb.from("products").update({ is_active: false }).eq("id", initial.id);
      if (error) throw error;
      SoundManager.play("completion");
      toast.success("Product removed from inventory");
      setDeleteConfirmOpen(false);
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      SoundManager.play("error");
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
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

            <Field label="Brand">
              <Input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="e.g. Bosch"
              />
            </Field>

            <Field label="Category">
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger aria-label="Select category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
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
              {initial && canDelete && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={busy || isDeleting}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                >
                  Remove
                </Button>
              )}
              {canEdit && (
                <Button
                  onClick={save}
                  disabled={busy || isDeleting}
                  className="flex-1"
                  variant="hero"
                >
                  {busy ? "Saving…" : initial ? "Save changes" : "Add product"}
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="rounded-3xl max-w-sm w-[90vw]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Remove Product?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium">
              Are you sure you want to remove{" "}
              <span className="font-bold text-foreground">"{initial?.name}"</span> from inventory?
              Past invoices and transaction history referencing this product will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel disabled={isDeleting} className="rounded-xl h-12">
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={deactivate}
              disabled={isDeleting}
              className="rounded-xl h-12 text-base font-bold shadow-sm"
            >
              {isDeleting ? "Removing..." : "Remove Product"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
