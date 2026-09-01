import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  ClipboardList,
  CheckCircle2,
  Edit2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { sb, type Product, type ShortMaal } from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SoundManager } from "@/lib/sounds";

export const Route = createFileRoute("/_authenticated/short-maal")({
  head: () => ({
    meta: [
      { title: "Short Maal — Bharat Auto Parts" },
      {
        name: "description",
        content: "Manual procurement and reminder list for shortage products.",
      },
    ],
  }),
  component: ShortMaalPage,
});

type ExtendedShortMaal = ShortMaal & {
  product_name: string;
  stock_quantity: number;
};

const priorityWeight: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function ShortMaalPage() {
  const { profile, role } = useAuth();
  const canEdit = role === "owner" || role === "manager";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "purchased" | "high">("pending");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ExtendedShortMaal | null>(null);

  const { data: shortMaals, isLoading } = useQuery({
    queryKey: ["short_maals", profile?.shop_id],
    enabled: !!profile?.shop_id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("short_maals")
        .select("*, products(name, stock_quantity)")
        .order("priority", { ascending: false }) // simple order, but urgent/high/medium/low text won't sort perfectly by ascii
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Transform the response to merge product data
      return (
        data as unknown as (ShortMaal & {
          products: { name: string; stock_quantity: number } | null;
        })[]
      ).map((d) => ({
        ...d,
        product_name: d.products?.name ?? "Unknown",
        stock_quantity: d.products?.stock_quantity ?? 0,
      })) as ExtendedShortMaal[];
    },
  });

  const filtered = useMemo(() => {
    let list = (shortMaals ?? []).filter((item) => item.status !== "cancelled");

    if (filter === "pending") list = list.filter((i) => i.status === "pending");
    else if (filter === "purchased") list = list.filter((i) => i.status === "purchased");
    else if (filter === "high")
      list = list.filter((i) => i.priority === "high" || i.priority === "urgent");

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((i) => i.product_name.toLowerCase().includes(q));
    }

    return list.sort((a, b) => {
      const pDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
      if (pDiff !== 0) return pDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [shortMaals, search, filter]);

  function openNew() {
    setEditing(null);
    setSheetOpen(true);
  }
  function openEdit(item: ExtendedShortMaal) {
    setEditing(item);
    setSheetOpen(true);
  }

  async function markPurchased(id: string) {
    if (!canEdit) return;
    try {
      const { error } = await sb
        .from("short_maals")
        .update({ status: "purchased", completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      SoundManager.play("completion");
      toast.success("Marked as purchased");
      qc.invalidateQueries({ queryKey: ["short_maals"] });
    } catch (e) {
      console.error(e);
      SoundManager.play("error");
      toast.error("Failed to update status");
    }
  }

  async function cancelItem(id: string) {
    if (!canEdit) return;
    if (!confirm("Are you sure you want to cancel this item?")) return;
    try {
      const { error } = await sb
        .from("short_maals")
        .update({ status: "cancelled", completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      SoundManager.play("success");
      toast.success("Item removed from Short Maal");
      qc.invalidateQueries({ queryKey: ["short_maals"] });
    } catch (e) {
      console.error(e);
      SoundManager.play("error");
      toast.error("Failed to cancel item");
    }
  }

  return (
    <div>
      <ScreenHeader
        title="Short Maal"
        subtitle="Purchase Reminders"
        right={
          canEdit ? (
            <Button size="icon-sm" variant="amber" onClick={openNew} aria-label="Add short maal">
              <Plus size={18} />
            </Button>
          ) : null
        }
      />

      <div className="px-4 -mt-3 relative">
        <Search size={16} className="absolute left-7 top-3 text-muted-foreground" />
        <Input
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-11 rounded-xl shadow-card bg-card"
        />
      </div>

      <div className="px-4 mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        <FilterButton active={filter === "pending"} onClick={() => setFilter("pending")}>
          Pending
        </FilterButton>
        <FilterButton active={filter === "high"} onClick={() => setFilter("high")}>
          Urgent & High
        </FilterButton>
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
          All Active
        </FilterButton>
        <FilterButton active={filter === "purchased"} onClick={() => setFilter("purchased")}>
          Purchased
        </FilterButton>
      </div>

      <div className="px-4 mt-4 space-y-3 pb-6">
        {isLoading && (
          <div className="text-center text-sm text-muted-foreground py-8">Loading…</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16">
            <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
            <div className="text-sm text-muted-foreground mb-4">
              {search ? "No items match your search" : "Abhi koi short maal nahi hai."}
            </div>
            {!search && canEdit && filter === "pending" && (
              <Button onClick={openNew} variant="hero">
                <Plus size={16} /> Add Short Maal
              </Button>
            )}
          </div>
        )}

        {filtered.map((item) => (
          <div
            key={item.id}
            className={`w-full rounded-2xl p-4 shadow-card flex flex-col gap-3 ${
              item.status === "purchased" ? "bg-muted/30 opacity-75" : "bg-card"
            }`}
          >
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-base truncate flex items-center gap-2">
                  {item.product_name}
                  {item.status === "purchased" && (
                    <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-sm">
                      Purchased
                    </span>
                  )}
                </div>
                <div className="flex gap-3 text-xs mt-1">
                  <span className="text-muted-foreground">
                    Current Stock:{" "}
                    <span className="font-bold text-foreground">{item.stock_quantity}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Need: <span className="font-bold text-foreground">{item.quantity_needed}</span>
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <PriorityBadge priority={item.priority} />
              </div>
            </div>

            {item.note && (
              <div className="text-sm text-muted-foreground bg-muted/40 p-2 rounded-lg italic">
                {item.note}
              </div>
            )}

            {canEdit && item.status === "pending" && (
              <div className="flex gap-2 pt-1 mt-1 border-t border-border/50">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                  onClick={() => markPurchased(item.id)}
                >
                  <CheckCircle2 size={14} className="mr-1" /> Mark Purchased
                </Button>
                <Button
                  size="icon-sm"
                  variant="outline"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => openEdit(item)}
                >
                  <Edit2 size={14} />
                </Button>
                <Button
                  size="icon-sm"
                  variant="outline"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  onClick={() => cancelItem(item.id)}
                >
                  <XCircle size={14} />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <AddShortMaalSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        initial={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["short_maals"] })}
      />
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-muted/50 text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  let colors = "bg-secondary text-secondary-foreground";
  if (priority === "urgent") colors = "bg-destructive/15 text-destructive font-bold";
  else if (priority === "high")
    colors = "bg-amber-500/15 text-amber-600 dark:text-amber-500 font-bold";
  else if (priority === "low") colors = "bg-muted text-muted-foreground";

  return (
    <div className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md ${colors}`}>
      {priority}
    </div>
  );
}

function AddShortMaalSheet({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: ExtendedShortMaal | null;
  onSaved: () => void;
}) {
  const { profile, session } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const [productName, setProductName] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [priority, setPriority] = useState<string>("medium");
  const [note, setNote] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

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

  // Load initial state
  useState(() => null);
  if (
    open &&
    initial &&
    initial.id !== (window as unknown as Record<string, unknown>).__lastInitSMId
  ) {
    (window as unknown as Record<string, unknown>).__lastInitSMId = initial.id;
    setProductName(initial.product_name);
    setProductId(initial.product_id);
    setQuantity(String(initial.quantity_needed));
    setPriority(initial.priority);
    setNote(initial.note || "");
  } else if (
    open &&
    !initial &&
    (window as unknown as Record<string, unknown>).__lastInitSMId !== null
  ) {
    (window as unknown as Record<string, unknown>).__lastInitSMId = null;
    setProductName("");
    setProductId(null);
    setQuantity("1");
    setPriority("medium");
    setNote("");
  }

  function pickProduct(p: Product) {
    setProductId(p.id);
    setProductName(p.name);
    setPickerOpen(false);
  }

  async function save() {
    if (!productId) return toast.error("Please select a valid product");
    const qtyNum = Number(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) return toast.error("Quantity must be greater than 0");

    setBusy(true);
    try {
      if (!initial) {
        // Check for duplicates
        const { data: existing } = await sb
          .from("short_maals")
          .select("id")
          .eq("shop_id", profile!.shop_id)
          .eq("product_id", productId)
          .eq("status", "pending")
          .maybeSingle();

        if (existing) {
          toast.error("This product is already in the pending Short Maal list.");
          setBusy(false);
          return;
        }
      }

      const payload = {
        shop_id: profile!.shop_id,
        product_id: productId,
        quantity_needed: qtyNum,
        priority,
        note: note.trim() || null,
        created_by: session!.user.id,
      };

      if (initial) {
        const { error } = await sb.from("short_maals").update(payload).eq("id", initial.id);
        if (error) throw error;
        SoundManager.play("success");
        toast.success("Short Maal updated");
      } else {
        const { error } = await sb.from("short_maals").insert(payload);
        if (error) throw error;
        SoundManager.play("success");
        toast.success("Added to Short Maal");
      }

      onSaved();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      SoundManager.play("error");
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{initial ? "Edit Short Maal" : "Add Short Maal"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <Field label="Product *">
            <div className="relative">
              <Input
                value={productName}
                onChange={(e) => {
                  setProductName(e.target.value);
                  setProductId(null);
                  setPickerOpen(true);
                }}
                onFocus={() => setPickerOpen(true)}
                placeholder="Search product..."
                disabled={!!initial} // Prevent changing product identity on edit
              />
              {pickerOpen && !initial && productName && (
                <div className="absolute z-10 mt-1 w-full rounded-xl border bg-card shadow-lg max-h-48 overflow-y-auto">
                  {(products ?? [])
                    .filter(
                      (p) =>
                        p.name.toLowerCase().includes(productName.toLowerCase()) ||
                        (p.part_number &&
                          p.part_number.toLowerCase().includes(productName.toLowerCase())),
                    )
                    .slice(0, 5)
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => pickProduct(p)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-secondary border-b last:border-b-0"
                      >
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground flex justify-between mt-0.5">
                          <span>{p.part_number || p.category}</span>
                          <span className="font-semibold text-foreground">
                            Stock: {p.stock_quantity}
                          </span>
                        </div>
                      </button>
                    ))}
                  {(products ?? []).filter((p) =>
                    p.name.toLowerCase().includes(productName.toLowerCase()),
                  ).length === 0 && (
                    <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                      Product not found
                    </div>
                  )}
                </div>
              )}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity Needed *">
              <Input
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>

            <Field label="Priority">
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger aria-label="Priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Note (Optional)">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="E.g. Next purchase me zaroor lana"
              rows={2}
            />
          </Field>

          <Button
            onClick={save}
            disabled={busy || !productId}
            className="w-full h-12 mt-2"
            variant="hero"
          >
            {busy ? "Saving…" : initial ? "Save changes" : "Add to Short Maal"}
          </Button>
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
