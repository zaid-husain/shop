import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowUp, ArrowDown, MessageCircle, Phone, FileText,
  Search, Trash2, Calendar, Check, MoreHorizontal, Download, Share2,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { sb, type Customer, type LedgerEntry, type Invoice } from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import { formatINR, formatDate, buildWhatsAppUrl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EntrySheet } from "./khata";
import { downloadStatement, statementPdfBlob } from "@/lib/statement";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/customers/$id")({
  head: () => ({ meta: [
    { title: "Customer — Bharat Auto Parts" },
    { name: "description", content: "Customer profile with running Khata balance, transaction history, and reminder actions." },
  ] }),
  component: CustomerProfilePage,
});

function timeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch { return ""; }
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return "Today";
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  const sameYest =
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate();
  if (sameYest) return "Yesterday";
  return formatDate(iso);
}

function CustomerProfilePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryType, setEntryType] = useState<"credit" | "payment">("credit");
  const [moreOpen, setMoreOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["customer-ledger", id, profile?.shop_id],
    enabled: !!profile?.shop_id,
    queryFn: async () => {
      const [custRes, ledgerRes, invRes] = await Promise.all([
        sb.from("customers").select("*").eq("id", id).maybeSingle(),
        sb.from("ledger_entries").select("*").eq("customer_id", id)
          .order("entry_date", { ascending: true })
          .order("created_at", { ascending: true }),
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

      // Running balance per entry (chronological asc)
      let running = 0;
      const withRunning = entries.map((e) => {
        running += e.entry_type === "credit" ? Number(e.amount) : -Number(e.amount);
        return { entry: e, running };
      });

      return { customer, entries: withRunning, invoices, credit_total, payment_total, balance };
    },
  });

  type EntryRow = { entry: LedgerEntry; running: number };
  const grouped = useMemo(() => {
    const groups: { day: string; label: string; items: EntryRow[] }[] = [];
    if (!data) return groups;
    for (const row of data.entries as EntryRow[]) {
      const key = dayKey(row.entry.entry_date);
      const last = groups[groups.length - 1];
      if (last && last.day === key) last.items.push(row);
      else groups.push({ day: key, label: dayLabel(row.entry.entry_date), items: [row] });
    }
    return groups;
  }, [data]);

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
    const { error } = await sb.from("ledger_entries").delete().eq("id", entryId);
    if (error) { console.error(error); return toast.error("Something went wrong. Please try again."); }
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

  function callCustomer() {
    if (!c.mobile) return toast.error("No mobile number");
    window.location.href = `tel:${c.mobile}`;
  }

  function handleDownloadStatement() {
    if (!data) return;
    downloadStatement({ customer: c, entries: data.entries.map((r) => r.entry) });
    toast.success("Statement downloaded");
  }

  async function handleShareStatement() {
    if (!data) return;
    try {
      const blob = statementPdfBlob({ customer: c, entries: data.entries.map((r) => r.entry) });
      const file = new File([blob], `Statement_${c.name.replace(/\s+/g, "_")}.pdf`, { type: "application/pdf" });
      const nav: any = navigator;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({
          files: [file],
          title: `Statement — ${c.name}`,
          text: `Bharat Auto Parts statement for ${c.name}. Outstanding: ${formatINR(Math.max(balance, 0))}`,
        });
      } else {
        handleDownloadStatement();
        toast.message("Sharing not supported — PDF downloaded instead");
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") { console.error(e); toast.error("Something went wrong. Please try again."); }
    }
  }

  const initial = c.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-white flex flex-col pb-[200px]">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-border px-3 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/khata" })}
          className="grid place-items-center w-9 h-9 rounded-full hover:bg-muted"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="grid place-items-center w-10 h-10 rounded-full bg-amber-400 text-white font-bold shrink-0">
          {initial}
        </div>
        <button
          onClick={() => navigate({ to: "/customers" })}
          className="flex-1 min-w-0 text-left"
        >
          <div className="text-base font-bold truncate">{c.name}</div>
          <div className="text-xs text-emerald-600 font-semibold">View Profile</div>
        </button>
        <button
          onClick={handleDownloadStatement}
          className="grid place-items-center w-9 h-9 rounded-full hover:bg-muted"
          aria-label="Statement"
        >
          <FileText size={18} />
        </button>
        <button
          onClick={() => navigate({ to: "/customers" })}
          className="grid place-items-center w-9 h-9 rounded-full hover:bg-muted"
          aria-label="Search"
        >
          <Search size={18} />
        </button>
      </header>

      {/* Due date + call/remind */}
      <div className="px-4 py-3 flex items-center justify-between gap-3 bg-white border-b border-border">
        <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/80 px-3 py-1.5 rounded-full border border-emerald-500/60">
          <Calendar size={13} /> Due Date
        </button>
        <div className="flex items-center gap-3">
          <button onClick={callCustomer} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-semibold px-3.5 py-2 rounded-full">
            <Phone size={13} /> Call
          </button>
          <button onClick={sendReminder} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-semibold px-3.5 py-2 rounded-full">
            <MessageCircle size={13} /> Remind
          </button>
        </div>
      </div>

      {/* Transactions feed */}
      <div className="flex-1 px-3 pt-4 space-y-3">
        {grouped.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-16">
            No entries yet. Tap <span className="font-semibold text-foreground">Given</span> or{" "}
            <span className="font-semibold text-foreground">Received</span> below to start.
          </div>
        )}
        {grouped.map((g) => (
          <div key={g.day} className="space-y-2">
            <div className="flex justify-center">
              <span className="text-[11px] font-semibold text-foreground/70 bg-muted px-3 py-1 rounded-full">
                {g.label}
              </span>
            </div>
            {g.items.map((row) => {
              const e = row.entry;
              const isCredit = e.entry_type === "credit";
              return (
                <div key={e.id} className={cn("flex flex-col", isCredit ? "items-end" : "items-start")}>
                  <button
                    onClick={() => {
                      if (confirm("Delete this entry?")) deleteEntry(e.id);
                    }}
                    className={cn(
                      "max-w-[78%] min-w-[150px] rounded-2xl border border-border bg-white shadow-sm px-3.5 py-2.5 text-left",
                      "active:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {isCredit ? (
                        <ArrowUp size={16} className="text-foreground shrink-0" strokeWidth={2.5} />
                      ) : (
                        <ArrowDown size={16} className="text-foreground shrink-0" strokeWidth={2.5} />
                      )}
                      <div className="text-base font-bold tracking-tight">
                        {formatINR(Number(e.amount))}
                      </div>
                      <div className="ml-auto pl-4 text-[10px] text-muted-foreground flex items-center gap-1">
                        {timeLabel(e.created_at)}
                        <Check size={11} className="text-muted-foreground" />
                      </div>
                    </div>
                    {e.note && (
                      <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{e.note}</div>
                    )}
                  </button>
                  <div className="text-[11px] font-medium mt-1 px-2 text-muted-foreground">
                    {row.running === 0
                      ? "Settled"
                      : `${formatINR(Math.abs(row.running))} ${row.running > 0 ? "Due" : "Advance"}`}
                  </div>
                </div>
              );
            })}

          </div>
        ))}
      </div>

      {/* Bottom action stack */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-border">
        {/* Payment quick actions */}
        <div className="bg-[#eef2ef] px-3 py-3 grid grid-cols-2 gap-3">
          <button
            onClick={() => { setEntryType("payment"); setEntryOpen(true); }}
            className="h-12 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center gap-2 text-sm font-bold shadow-sm active:bg-emerald-700"
          >
            <ArrowDown size={16} /> Payment Received
          </button>
          <button
            onClick={() => { setEntryType("credit"); setEntryOpen(true); }}
            className="h-12 rounded-full bg-destructive text-white inline-flex items-center justify-center gap-2 text-sm font-bold shadow-sm active:opacity-90"
          >
            <ArrowUp size={16} /> Payment Add (Udhaar)
          </button>
        </div>


        {/* Balance due */}
        <div className="px-4 py-2 flex items-center justify-between border-t border-border">
          <div className="text-xs font-semibold text-foreground/80">Balance Due</div>
          <button className="inline-flex items-center gap-1 text-sm font-bold text-destructive">
            {balance > 0 ? formatINR(balance) : balance < 0 ? `+${formatINR(-balance)}` : formatINR(0)}
            <ChevronRight size={14} />
          </button>
        </div>

      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>More options</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-1 gap-2">
            <Button variant="outline" className="justify-start h-12" onClick={() => { handleDownloadStatement(); setMoreOpen(false); }}>
              <Download size={15} /> Download Statement
            </Button>
            <Button variant="outline" className="justify-start h-12" onClick={() => { handleShareStatement(); setMoreOpen(false); }}>
              <Share2 size={15} /> Share PDF
            </Button>
            <Button variant="outline" className="justify-start h-12" onClick={() => { navigate({ to: "/customers" }); }}>
              <FileText size={15} /> Edit profile
            </Button>
            {data.invoices.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Recent Bills</div>
                <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
                  {data.invoices.slice(0, 6).map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{inv.invoice_number}</div>
                        <div className="text-[11px] text-muted-foreground">{formatDate(inv.created_at)}</div>
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
          </div>
        </SheetContent>
      </Sheet>

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
