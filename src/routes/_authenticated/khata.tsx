import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search, IndianRupee, Bell, Share2, SlidersHorizontal,
  UserPlus, ChevronRight, Check,
} from "lucide-react";
import { toast } from "sonner";
import { sb, type Customer, type LedgerEntry } from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Logo } from "@/components/Logo";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/khata")({
  head: () => ({ meta: [
    { title: "Khata — Bharat Auto Parts" },
    { name: "description", content: "Digital ledger of credit and payments for every customer. Send reminders and track dues." },
  ] }),
  component: KhataPage,
});

type CustomerBalance = Customer & {
  credit_total: number;
  payment_total: number;
  balance: number;
  last_entry_at: string | null;
  last_entry_type: "credit" | "payment" | null;
  last_entry_amount: number | null;
};

type Tab = "all" | "due_today" | "pending" | "advance";

function relTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return "Today";
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function KhataPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryCustomer, setEntryCustomer] = useState<Customer | null>(null);
  const [entryType, setEntryType] = useState<"credit" | "payment">("credit");

  const { data, isLoading } = useQuery({
    queryKey: ["khata", profile?.shop_id],
    enabled: !!profile?.shop_id,
    queryFn: async () => {
      const [custRes, ledgerRes] = await Promise.all([
        sb.from("customers").select("*").order("name"),
        sb.from("ledger_entries").select("*").order("created_at", { ascending: false }),
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
          last_entry_type: null,
          last_entry_amount: null,
        });
      }
      for (const e of entries) {
        const row = map.get(e.customer_id);
        if (!row) continue;
        if (e.entry_type === "credit") row.credit_total += Number(e.amount);
        else row.payment_total += Number(e.amount);
        if (!row.last_entry_at || e.created_at > row.last_entry_at) {
          row.last_entry_at = e.created_at;
          row.last_entry_type = e.entry_type as "credit" | "payment";
          row.last_entry_amount = Number(e.amount);
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
        }),
        { outstanding: 0, advance: 0 },
      );
      const net = totals.outstanding - totals.advance;
      return { rows, totals, net };
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    return (data?.rows ?? [])
      .filter((r) => {
        if (tab === "pending" && r.balance <= 0) return false;
        if (tab === "advance" && r.balance >= 0) return false;
        if (tab === "due_today") {
          if (!r.last_entry_at) return false;
          if (!r.last_entry_at.startsWith(today)) return false;
        }
        if (!q) return true;
        return (
          r.name.toLowerCase().includes(q) ||
          (r.mobile ?? "").includes(q) ||
          (r.vehicle_number ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const bt = b.last_entry_at ?? "";
        const at = a.last_entry_at ?? "";
        return bt.localeCompare(at);
      });
  }, [data, search, tab]);

  function openEntry(customer: Customer, type: "credit" | "payment") {
    setEntryCustomer(customer);
    setEntryType(type);
    setEntryOpen(true);
  }

  const net = data?.net ?? 0;
  const netLabel = net > 0 ? "You Get" : net < 0 ? "You Give" : "All Clear";
  const netColor = net > 0 ? "text-destructive" : net < 0 ? "text-emerald-600" : "text-muted-foreground";

  const TABS: { id: Tab; label: string }[] = [
    { id: "all", label: "Customer" },
    { id: "due_today", label: "Due Today" },
    { id: "pending", label: "Pending Dues" },
    { id: "advance", label: "Advance" },
  ];

  function initials(name: string) {
    return name.trim().charAt(0).toUpperCase() || "?";
  }

  const avatarColors = [
    "bg-amber-400 text-white",
    "bg-sky-400 text-white",
    "bg-rose-400 text-white",
    "bg-emerald-400 text-white",
    "bg-violet-400 text-white",
    "bg-orange-400 text-white",
  ];
  function avatarColor(id: string) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return avatarColors[h % avatarColors.length];
  }

  return (
    <div className="min-h-screen bg-[#eef2ef] pb-32">
      {/* Top bar */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo size={36} />
          <div className="leading-tight">
            <div className="text-sm font-bold">Khata Book</div>
            <div className="text-[10px] text-muted-foreground">{profile?.shop_id ? "Bharat Auto Parts" : ""}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="grid place-items-center w-9 h-9 rounded-full bg-white shadow-card" aria-label="Share">
            <Share2 size={15} />
          </button>
          <Link to="/reports" className="grid place-items-center w-9 h-9 rounded-full bg-white shadow-card" aria-label="Reports">
            <Bell size={15} />
          </Link>
          <button
            onClick={() => setShowSearch((v) => !v)}
            className="grid place-items-center w-9 h-9 rounded-full bg-white shadow-card"
            aria-label="Search"
          >
            <Search size={15} />
          </button>
        </div>
      </div>

      {/* Search */}
      {showSearch && (
        <div className="px-4 pb-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search name, mobile, vehicle"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 rounded-xl bg-white shadow-card border-0"
            />
          </div>
        </div>
      )}

      {/* Content card */}
      <div className="bg-white rounded-t-3xl pt-4 min-h-[calc(100vh-120px)]">
        {/* Tabs */}
        <div className="px-4 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 w-max">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors",
                  tab === t.id
                    ? "bg-emerald-50 border-emerald-500 text-emerald-700"
                    : "bg-white border-border text-foreground/70",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Net Balance */}
        <div className="px-4 mt-4">
          <div className="rounded-2xl bg-[#eef2ef] px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold">Net Balance</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {data?.rows.length ?? 0} Accounts
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className={cn("text-lg font-extrabold tracking-tight", netColor)}>
                  {formatINR(Math.abs(net))}
                </div>
                <div className="text-[10px] text-muted-foreground -mt-0.5">{netLabel}</div>
              </div>
              <div className="h-8 w-px bg-border" />
              <button className="grid place-items-center w-8 h-8" aria-label="Filter">
                <SlidersHorizontal size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="mt-2 divide-y divide-border/70">
          {isLoading && (
            <div className="text-center text-sm text-muted-foreground py-10">Loading…</div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-16 px-6">
              {tab === "all" && !search
                ? "No customers yet. Tap Add Customer below."
                : "No matching customers."}
            </div>
          )}
          {filtered.map((r) => (
            <Link
              key={r.id}
              to="/customers/$id"
              params={{ id: r.id }}
              className="flex items-center gap-3 px-4 py-3 active:bg-muted/40"
            >
              <div className={cn(
                "grid place-items-center w-11 h-11 rounded-full font-bold shrink-0",
                avatarColor(r.id),
              )}>
                {initials(r.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{r.name}</div>
                <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                  {r.last_entry_at ? (
                    <>
                      <Check size={11} className="text-muted-foreground" />
                      {r.last_entry_type === "payment"
                        ? `${formatINR(r.last_entry_amount ?? 0)} Payment Added`
                        : `${formatINR(r.last_entry_amount ?? 0)} Credit Added`} {relTime(r.last_entry_at)}
                    </>
                  ) : (
                    <>No entries yet</>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                {r.balance > 0 ? (
                  <>
                    <div className="text-sm font-bold text-destructive">{formatINR(r.balance)}</div>
                    <div className="text-[10px] text-muted-foreground -mt-0.5">Due</div>
                  </>
                ) : r.balance < 0 ? (
                  <>
                    <div className="text-sm font-bold text-emerald-600">{formatINR(-r.balance)}</div>
                    <div className="text-[10px] text-muted-foreground -mt-0.5">Advance</div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">Clear</div>
                )}
              </div>
              <ChevronRight size={14} className="text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      </div>

      {/* Floating Add Customer */}
      <button
        onClick={() => navigate({ to: "/customers" })}
        className="fixed bottom-24 right-4 z-30 inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 font-semibold text-sm px-4 py-3 rounded-2xl shadow-lg active:scale-95 transition-transform"
      >
        <UserPlus size={16} /> Add Customer
      </button>

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
            {isCredit ? "Given (Udhaar Diya)" : "Received (Payment)"}
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
            <IndianRupee size={16} /> {busy ? "Saving…" : isCredit ? "Save Given" : "Save Received"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
