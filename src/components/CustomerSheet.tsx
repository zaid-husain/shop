import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IndianRupee, CalendarDays, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { sb, type Customer, type Invoice } from "@/lib/db";
import { formatINR, formatDate, buildWhatsAppUrl, buildDueReminderMessage } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CustomerService } from "@/lib/domain/CustomerService";
import { SoundManager } from "@/lib/sounds";

interface CustomerSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Customer | null;
  onSaved: () => void;
}

export function CustomerSheet({ open, onOpenChange, initial, onSaved }: CustomerSheetProps) {
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Partial<Customer> & { _id?: string }>({
    name: "",
    mobile: "",
    vehicle_number: "",
    address: "",
    notes: "",
  });

  const { data: dueInvoices } = useQuery({
    queryKey: ["customer-invoices-due", initial?.id],
    enabled: !!initial?.id && open,
    queryFn: async () => {
      const { data, error } = await sb
        .from("invoices")
        .select("id,invoice_number,total,due,created_at")
        .eq("customer_id", initial!.id)
        .in("payment_status", ["unpaid", "partial"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Pick<Invoice, "id" | "invoice_number" | "total" | "due" | "created_at">[];
    },
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
    if (!(form.name || "").trim()) return toast.error("Customer name is required");
    if (!profile?.shop_id) return toast.error("Shop ID is missing");
    setBusy(true);
    try {
      const payload = {
        name: (form.name || "").trim(),
        mobile: (form.mobile || "").replace(/\D/g, "").slice(0, 10) || null,
        vehicle_number: (form.vehicle_number || "").trim().toUpperCase() || null,
        address: (form.address || "").trim() || null,
        notes: (form.notes || "").trim() || null,
      };
      if (initial) {
        await CustomerService.updateCustomer(initial.id, profile.shop_id, payload);
        SoundManager.play("success");
        toast.success("Customer updated");
      } else {
        await CustomerService.createCustomer(profile.shop_id, payload);
        SoundManager.play("success");
        toast.success("Customer added");
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

  async function remove() {
    if (!initial || !profile?.shop_id) return;
    if (!confirm(`Delete customer "${initial.name}"?`)) return;
    setBusy(true);
    try {
      await CustomerService.softDeleteCustomer(initial.id, profile.shop_id);
      SoundManager.play("success");
      toast.success("Deleted");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      SoundManager.play("error");
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function sendReminder() {
    if (!initial?.mobile || !dueInvoices || dueInvoices.length === 0) return;
    const msg = buildDueReminderMessage(initial.name, dueInvoices);
    const url = buildWhatsAppUrl(initial.mobile, msg);
    if (url) window.open(url, "_blank");
    else toast.error("Invalid mobile number");
  }

  const totalDue = (dueInvoices ?? []).reduce((s, i) => s + Number(i.due ?? 0), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{initial ? "Edit customer" : "New customer"}</SheetTitle>
        </SheetHeader>

        {/* Due invoices section */}
        {initial && totalDue > 0 && (
          <div className="mt-4 rounded-2xl bg-destructive/5 border border-destructive/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-destructive flex items-center gap-1.5">
                <IndianRupee size={14} /> Outstanding Dues
              </div>
              <span className="text-sm font-bold text-destructive">{formatINR(totalDue)}</span>
            </div>
            <div className="space-y-2">
              {dueInvoices?.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <CalendarDays size={12} />
                    <span>{inv.invoice_number}</span>
                    <span>·</span>
                    <span>{formatDate(inv.created_at)}</span>
                  </div>
                  <div className="font-semibold text-destructive">{formatINR(Number(inv.due))}</div>
                </div>
              ))}
            </div>
            <Button
              variant="hero"
              size="sm"
              className="w-full"
              onClick={sendReminder}
              disabled={!initial.mobile}
            >
              <MessageCircle size={16} /> Send WhatsApp Reminder
            </Button>
          </div>
        )}

        <div className="space-y-3 mt-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Name *</Label>
            <Input
              value={form.name || ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mobile</Label>
            <Input
              inputMode="numeric"
              value={form.mobile || ""}
              onChange={(e) =>
                setForm({ ...form, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })
              }
              placeholder="10-digit number"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Vehicle number</Label>
            <Input
              value={form.vehicle_number || ""}
              onChange={(e) => setForm({ ...form, vehicle_number: e.target.value.toUpperCase() })}
              placeholder="MH 12 AB 1234"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Address</Label>
            <Textarea
              value={form.address || ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={form.notes || ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </div>
          <div className="flex gap-2 pt-2">
            {initial && (
              <Button variant="outline" onClick={remove} disabled={busy}>
                Delete
              </Button>
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
