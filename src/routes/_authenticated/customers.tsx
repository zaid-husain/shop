import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Phone, Car } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { sb, type Customer } from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
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

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [open, setOpen] = useState(false);

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", profile?.shop_id],
    enabled: !!profile?.shop_id,
    queryFn: async () => {
      const { data, error } = await sb.from("customers").select("*").order("name");
      if (error) throw error;
      return data as Customer[];
    },
  });

  const filtered = (customers ?? []).filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.mobile ?? "").includes(q) ||
      (c.vehicle_number ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <ScreenHeader
        title="Customers"
        subtitle={`${customers?.length ?? 0} total`}
        right={
          <Button
            size="icon-sm"
            variant="amber"
            onClick={() => { setEditing(null); setOpen(true); }}
            aria-label="Add customer"
          >
            <Plus size={18} />
          </Button>
        }
      />

      <div className="px-4 -mt-3 relative">
        <Search size={16} className="absolute left-7 top-3 text-muted-foreground" />
        <Input
          placeholder="Search name, mobile, vehicle"
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
          <div className="text-center text-sm text-muted-foreground py-16">
            {search ? "No customers match" : "No customers yet"}
          </div>
        )}
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => { setEditing(c); setOpen(true); }}
            className="w-full text-left rounded-2xl bg-card shadow-card p-4"
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm">{c.name}</div>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              {c.mobile && (
                <span className="inline-flex items-center gap-1">
                  <Phone size={12} /> {c.mobile}
                </span>
              )}
              {c.vehicle_number && (
                <span className="inline-flex items-center gap-1">
                  <Car size={12} /> {c.vehicle_number}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      <CustomerSheet
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["customers"] })}
      />
    </div>
  );
}

function CustomerSheet({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Customer | null;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    name: "",
    mobile: "",
    vehicle_number: "",
    address: "",
    notes: "",
  });

  if (open && initial && form._id !== initial.id) {
    setForm({
      _id: initial.id,
      name: initial.name,
      mobile: initial.mobile ?? "",
      vehicle_number: initial.vehicle_number ?? "",
      address: initial.address ?? "",
      notes: initial.notes ?? "",
    });
  } else if (open && !initial && form._id) {
    setForm({ name: "", mobile: "", vehicle_number: "", address: "", notes: "" });
  }

  async function save() {
    if (!form.name.trim()) return toast.error("Customer name is required");
    setBusy(true);
    try {
      const payload = {
        shop_id: profile!.shop_id,
        name: form.name.trim(),
        mobile: form.mobile.replace(/\D/g, "").slice(0, 10) || null,
        vehicle_number: form.vehicle_number.trim().toUpperCase() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (initial) {
        const { error } = await sb.from("customers").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Customer updated");
      } else {
        const { error } = await sb.from("customers").insert(payload);
        if (error) throw error;
        toast.success("Customer added");
      }
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (!confirm(`Delete customer "${initial.name}"?`)) return;
    setBusy(true);
    const { error } = await sb.from("customers").delete().eq("id", initial.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{initial ? "Edit customer" : "New customer"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 mt-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mobile</Label>
            <Input
              inputMode="numeric"
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              placeholder="10-digit number"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Vehicle number</Label>
            <Input
              value={form.vehicle_number}
              onChange={(e) => setForm({ ...form, vehicle_number: e.target.value.toUpperCase() })}
              placeholder="MH 12 AB 1234"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Address</Label>
            <Textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>
          <div className="flex gap-2 pt-2">
            {initial && (
              <Button variant="outline" onClick={remove} disabled={busy}>Delete</Button>
            )}
            <Button onClick={save} disabled={busy} className="flex-1" variant="hero">
              {busy ? "Saving…" : initial ? "Save" : "Add customer"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
