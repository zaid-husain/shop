import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, IndianRupee, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, ChevronRight, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { sb, type Customer, type LedgerEntry } from "@/lib/db";
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

export const Route = createFileRoute("/_authenticated/khata")({
  component: KhataPage,
});

type CustomerBalance = Customer & {
  credit_total: number;
  payment_total: number;
  balance: number;
  last_entry_at: string | null;
};

function KhataPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"balance" | "recent">("balance");
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryCustomer, setEntryCustomer] = useState<Customer | null>(null);
  const [entryType, setEntryType] = useState<"credit" | "payment">("credit");

  const { data, isLoading } = useQuery({
    queryKey: ["khata", profile?.shop_id],
    enabled: !!profile?.shop_id,
    queryFn: async () => {
      const [custRes, ledgerRes] = await Promise.all([
        sb.from("customers").select("*").order("name"),
        sb.from("ledger_entries").select("*"),
      ]);
      if (custRes.error) throw custRes.error;
      if (ledgerRes.error) throw ledgerRes.error;
      const customers = custRes.data as Customer[];
      const entries = ledgerRes.data as LedgerEntry[];

      const map = new Map<string, CustomerBalance>();
      for (const c of customers) {
        map.set(c.id, {
          ...c,
          credit_total: 0,
          payment_total: 0,
          balance: 0,
          last_entry_at: null,
        });
      }
      for (const e of entries) {
        const row = map.get(e.customer_id);
        if (!row) continue;
        if (e.entry_type === "credit") row.credit_total += Number(e.amount);
        else row.payment_total += Number(e.amount);
        if (!row.last_entry_at || e.created_at > row.last_entry_at) {
          row.last_entry_at = e.created_at;
        }
      }
      for (const r of map.values()) {
        r.balance = r.credit_total - r.payment_total;
      }

      const rows = Array.from(map.values());
      const totals = rows.reduce(
        (a, r) => ({
          outstanding: a.outstanding + Math.max(r.balance, 0),
          advance: a.advance + Math.max(-r.balance, 0),
          credit: a.credit + r.credit_total,
          payment: a.payment + r.payment_total,
        }),
        { outstanding: 0, advance: 0, credit: 0, payment: 0 },
      );
      return { rows, totals };
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (data?.rows ?? []).filter((r) => {
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.mobile ?? "").includes(q) ||
        (r.vehicle_number ?? "").toLowerCase().includes(q)
      );
    });
    return rows.sort((a, b) => {
      if (sort === "balance") return b.balance - a.balance;
      const at = a.last_entry_at ?? "";
      const bt = b.last_entry_at ?? "";
      return bt.localeCompare(at);
    });
  }, [data, search, sort]);

  function openEntry(customer: Customer, type: "credit" | "payment") {
    setEntryCustomer(customer);
    setEntryType(type);
    setEntryOpen(true);
  }

  return (
    <div>
      <ScreenHeader
        title="Khata Book"
        subtitle={`${data?.rows.length ?? 0} customers`}
        right={
          <Link
            to="/reports"
            className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-xs font-semibold px-3 py-1.5 rounded-full"
          >
            <BarChart3 size={13} /> Reports
          </Link>
        }
      />

      <div className="px-4 -mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4 shadow-card bg-destructive/10 border border-destructive/20">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
            <TrendingUp size={14} /> You will get
          </div>
          <div className="mt-1.5 text-xl font-bold text-destructive tracking-tight">
            {formatINR(data?.totals.outstanding ?? 0)}
          </div>
        </div>
        <div className="rounded-2xl p-4 shadow-card bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <TrendingDown size={14} /> You will give
          </div>
          <div className="mt-1.5 text-xl font-bold text-emerald-700 dark:text-emerald-400 tracking-tight">
            {formatINR(data?.totals.advance ?? 0)}
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-3 text-muted-foreground" />
          <Input
            placeholder="Search name, mobile, vehicle"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11 rounded-xl shadow-card bg-card"
          />
        </div>
        <Select value={sort} onValueChange={(v: any) => setSort(v)}>
          <SelectTrigger className="w-[120px] h-11 rounded-xl bg-card shadow-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="balance">Balance</SelectItem>
            <SelectItem value="recent">Recent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="px-4 mt-3 space-y-2">
        {isLoading && (
          <div className="text-center text-sm text-muted-foreground py-8">Loading…</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-16">
            {search ? "No customers match" : "No customers yet. Add one from Clients →"}
          </div>
        )}
        {filtered.map((r) => (
          <div key={r.id} className="rounded-2xl bg-card shadow-card overflow-hidden">
            <Link
              to="/customers/$id"
              params={{ id: r.id }}
              className="flex items-center justify-between px-4 pt-3 pb-2"
            >
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.mobile || r.vehicle_number || "—"}
                </div>
              </div>
              <div className="text-right shrink-0 flex items-center gap-1">
                <div>
                  {r.balance > 0 ? (
                    <>
                      <div className="text-[10px] font-semibold text-destructive uppercase">Due</div>
                      <div className="text-sm font-bold text-destructive">{formatINR(r.balance)}</div>
                    </>
                  ) : r.balance < 0 ? (
                    <>
                      <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase">Advance</div>
                      <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatINR(-r.balance)}</div>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">Clear</div>
                  )}
                </div>
                <ChevronRight size={16} className="text-muted-foreground" />
              </div>
            </Link>
            <div className="grid grid-cols-2 border-t border-border divide-x divide-border">
              <button
                onClick={() => openEntry(r, "credit")}
                className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-destructive hover:bg-destructive/5"
              >
                <ArrowUpRight size={14} /> Credit (Udhaar)
              </button>
              <button
                onClick={() => openEntry(r, "payment")}
                className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/5"
              >
                <ArrowDownRight size={14} /> Payment
              </button>
            </div>
          </div>
        ))}
      </div>

      <EntrySheet
        open={entryOpen}
        onOpenChange={setEntryOpen}
        customer={entryCustomer}
        type={entryType}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["khata"] });
          qc.invalidateQueries({ queryKey: ["customer-ledger"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />
    </div>
  );
}

export function EntrySheet({
  open,
  onOpenChange,
  customer,
  type,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: Customer | null;
  type: "credit" | "payment";
  onSaved: () => void;
}) {
  const { profile, session } = useAuth();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<string>("cash");
  const [busy, setBusy] = useState(false);

  async function save() {
    const amt = parseFloat(amount);
    if (!customer) return toast.error("Select a customer");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a valid amount");
    setBusy(true);
    try {
      const { error } = await sb.from("ledger_entries").insert({
        shop_id: profile!.shop_id,
        customer_id: customer.id,
        entry_type: type,
        amount: amt,
        entry_date: date,
        note: note.trim() || null,
        payment_method: type === "payment" ? method : null,
        created_by: session!.user.id,
      });
      if (error) throw error;
      toast.success(type === "credit" ? "Credit entry added" : "Payment recorded");
      setAmount("");
      setNote("");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const isCredit = type === "credit";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className={isCredit ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}>
            {isCredit ? "Credit (Udhaar Diya)" : "Payment Received"}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">Customer</div>
            <div className="font-semibold">{customer?.name ?? "—"}</div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Amount (₹) *</Label>
            <Input
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0"
              className="h-14 text-2xl font-bold"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {!isCredit && (
            <div className="space-y-1.5">
              <Label className="text-xs">Payment method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={isCredit ? "e.g. Brake pads + filter" : "e.g. Cleared old bill"}
            />
          </div>
          <Button
            onClick={save}
            disabled={busy}
            className="w-full h-12"
            variant={isCredit ? "destructive" : "hero"}
          >
            <IndianRupee size={16} /> {busy ? "Saving…" : isCredit ? "Save Credit" : "Save Payment"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
