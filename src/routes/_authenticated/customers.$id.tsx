import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Phone, Car, MapPin, MessageCircle, ArrowUpRight, ArrowDownRight,
  CalendarDays, FileText, Trash2, StickyNote, Download, Share2,
} from "lucide-react";
import { toast } from "sonner";
import { sb, type Customer, type LedgerEntry, type Invoice } from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import { formatINR, formatDate, formatDateTime, buildWhatsAppUrl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EntrySheet } from "./khata";

export const Route = createFileRoute("/_authenticated/customers/$id")({
  component: CustomerProfilePage,
});

function CustomerProfilePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryType, setEntryType] = useState<"credit" | "payment">("credit");

  const { data, isLoading } = useQuery({
    queryKey: ["customer-ledger", id, profile?.shop_id],
    enabled: !!profile?.shop_id,
    queryFn: async () => {
      const [custRes, ledgerRes, invRes] = await Promise.all([
        sb.from("customers").select("*").eq("id", id).maybeSingle(),
        sb.from("ledger_entries").select("*").eq("customer_id", id)
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false }),
        sb.from("invoices").select("*").eq("customer_id", id)
          .order("created_at", { ascending: false }).limit(50),
      ]);
      if (custRes.error) throw custRes.error;
      if (ledgerRes.error) throw ledgerRes.error;
      if (invRes.error) throw invRes.error;

      const customer = custRes.data as Customer | null;
      const entries = (ledgerRes.data ?? []) as LedgerEntry[];
      const invoices = (invRes.data ?? []) as Invoice[];

      const credit_total = entries.filter(e => e.entry_type === "credit")
        .reduce((s, e) => s + Number(e.amount), 0);
      const payment_total = entries.filter(e => e.entry_type === "payment")
        .reduce((s, e) => s + Number(e.amount), 0);
      const balance = credit_total - payment_total;

      return { customer, entries, invoices, credit_total, payment_total, balance };
    },
  });

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!data?.customer) {
    return (
      <div className="p-8 text-center">
        <div className="text-sm text-muted-foreground mb-3">Customer not found</div>
        <Button onClick={() => navigate({ to: "/khata" })} variant="outline">Go to Khata</Button>
      </div>
    );
  }
  const c = data.customer;
  const balance = data.balance;

  async function deleteEntry(entryId: string) {
    if (!confirm("Delete this entry?")) return;
    const { error } = await sb.from("ledger_entries").delete().eq("id", entryId);
    if (error) return toast.error(error.message);
    toast.success("Entry deleted");
    qc.invalidateQueries({ queryKey: ["customer-ledger"] });
    qc.invalidateQueries({ queryKey: ["khata"] });
  }

  function sendReminder() {
    if (!c.mobile || balance <= 0) return;
    const msg =
      `*Bharat Auto Parts*\n\n` +
      `Namaste ${c.name},\n` +
      `Aapka pending balance hai: *${formatINR(balance)}*\n\n` +
      `Kripya jald se jald payment kar dein.\nDhanyavaad!`;
    const url = buildWhatsAppUrl(c.mobile, msg);
    if (url) window.open(url, "_blank");
    else toast.error("Invalid mobile number");
  }

  return (
    <div>
      <div className="gradient-brand text-primary-foreground px-4 pt-4 pb-6 rounded-b-3xl shadow-card">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate({ to: "/khata" })}
            className="grid place-items-center w-9 h-9 rounded-full bg-white/15"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <button
            onClick={() => navigate({ to: "/customers" })}
            className="text-xs font-semibold bg-white/15 px-3 py-1.5 rounded-full"
          >
            Edit details
          </button>
        </div>
        <div className="mt-3">
          <div className="text-xl font-bold tracking-tight">{c.name}</div>
          <div className="mt-1 flex flex-wrap gap-3 text-xs opacity-90">
            {c.mobile && <span className="inline-flex items-center gap-1"><Phone size={12} /> {c.mobile}</span>}
            {c.vehicle_number && <span className="inline-flex items-center gap-1"><Car size={12} /> {c.vehicle_number}</span>}
            {c.address && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {c.address}</span>}
          </div>
        </div>

        <div className="mt-5 bg-white/10 backdrop-blur rounded-2xl p-4">
          <div className="text-xs uppercase opacity-80 font-semibold">
            {balance > 0 ? "You will get" : balance < 0 ? "You will give" : "Balance"}
          </div>
          <div className="mt-1 text-3xl font-extrabold tracking-tight">
            {formatINR(Math.abs(balance))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="opacity-70">Total Credit</div>
              <div className="font-bold text-base">{formatINR(data.credit_total)}</div>
            </div>
            <div>
              <div className="opacity-70">Total Received</div>
              <div className="font-bold text-base">{formatINR(data.payment_total)}</div>
            </div>
          </div>
        </div>

        {balance > 0 && c.mobile && (
          <Button
            onClick={sendReminder}
            className="w-full mt-3 bg-white text-foreground hover:bg-white/90"
          >
            <MessageCircle size={16} /> Send WhatsApp Reminder
          </Button>
        )}
      </div>

      <div className="px-4 mt-4 grid grid-cols-2 gap-3">
        <Button
          variant="destructive"
          className="h-12"
          onClick={() => { setEntryType("credit"); setEntryOpen(true); }}
        >
          <ArrowUpRight size={16} /> Credit
        </Button>
        <Button
          variant="hero"
          className="h-12"
          onClick={() => { setEntryType("payment"); setEntryOpen(true); }}
        >
          <ArrowDownRight size={16} /> Payment
        </Button>
      </div>

      <div className="px-4 mt-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-2">
          Transactions
        </h2>
        {data.entries.length === 0 && (
          <div className="rounded-2xl bg-card shadow-card p-8 text-center text-sm text-muted-foreground">
            No entries yet. Add a credit or payment above.
          </div>
        )}
        <div className="space-y-2">
          {data.entries.map((e) => {
            const isCredit = e.entry_type === "credit";
            return (
              <div key={e.id} className="rounded-2xl bg-card shadow-card p-4 flex items-start gap-3">
                <div className={`grid place-items-center w-10 h-10 rounded-xl shrink-0 ${
                  isCredit ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                }`}>
                  {isCredit ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">
                      {isCredit ? "Credit Given" : "Payment Received"}
                    </div>
                    <div className={`text-base font-bold ${isCredit ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
                      {isCredit ? "+" : "−"}{formatINR(Number(e.amount))}
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <CalendarDays size={11} />
                    <span>{formatDate(e.entry_date)}</span>
                    {e.payment_method && (
                      <span className="uppercase font-semibold">· {e.payment_method}</span>
                    )}
                  </div>
                  {e.note && (
                    <div className="mt-1.5 text-xs text-muted-foreground inline-flex items-start gap-1">
                      <StickyNote size={11} className="mt-0.5 shrink-0" /> {e.note}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => deleteEntry(e.id)}
                  className="text-muted-foreground hover:text-destructive p-1"
                  aria-label="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {data.invoices.length > 0 && (
        <div className="px-4 mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-2">
            Recent Bills
          </h2>
          <div className="rounded-2xl bg-card shadow-card divide-y divide-border overflow-hidden">
            {data.invoices.slice(0, 8).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex items-center gap-2">
                  <FileText size={14} className="text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{inv.invoice_number}</div>
                    <div className="text-[11px] text-muted-foreground">{formatDateTime(inv.created_at)}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold">{formatINR(Number(inv.total))}</div>
                  {Number(inv.due) > 0 && (
                    <div className="text-[10px] font-semibold text-destructive">Due {formatINR(Number(inv.due))}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="h-10" />

      <EntrySheet
        open={entryOpen}
        onOpenChange={setEntryOpen}
        customer={c}
        type={entryType}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["customer-ledger"] });
          qc.invalidateQueries({ queryKey: ["khata"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />
    </div>
  );
}
