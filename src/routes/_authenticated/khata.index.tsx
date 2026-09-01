import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  IndianRupee,
  Bell,
  Share2,
  SlidersHorizontal,
  UserPlus,
  ChevronRight,
  Check,
  Phone,
  MessageCircle,
  FileText,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Clock,
  Camera,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { sb, type Customer, type LedgerEntry, type LedgerTransaction } from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import { formatINR, buildWhatsAppUrl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Logo } from "@/components/Logo";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CustomerSheet } from "@/components/CustomerSheet";
import { CustomerService } from "@/lib/domain/CustomerService";
import { LedgerService } from "@/lib/domain/LedgerService";
import { useOnlineStatus } from "@/hooks/use-online-status";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SoundManager } from "@/lib/sounds";

export const Route = createFileRoute("/_authenticated/khata/")({
  head: () => ({
    meta: [
      { title: "Khata — Bharat Auto Parts" },
      {
        name: "description",
        content:
          "Digital ledger of credit and payments for every customer. Send reminders and track dues.",
      },
    ],
  }),
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
  const [customerSheetOpen, setCustomerSheetOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOption, setSortOption] = useState<
    "recent" | "oldest" | "due_desc" | "advance_desc" | "name_asc" | "name_desc"
  >("recent");

  const { data, isLoading } = useQuery({
    queryKey: ["khata", profile?.shop_id],
    enabled: !!profile?.shop_id,
    queryFn: async () => {
      if (!profile?.shop_id) throw new Error("Shop ID not found");
      const [customers, ledgerRes] = await Promise.all([
        CustomerService.getCustomers(profile.shop_id),
        sb.from("ledger_transactions").select("*").order("created_at", { ascending: false }),
      ]);
      if (ledgerRes.error) throw ledgerRes.error;
      const entries = ledgerRes.data as LedgerTransaction[];

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
        if (e.balance_impact > 0) row.credit_total += Number(e.amount);
        else row.payment_total += Number(e.amount);
        if (!row.last_entry_at || e.created_at > row.last_entry_at) {
          row.last_entry_at = e.created_at;
          row.last_entry_type = e.balance_impact > 0 ? "credit" : "payment";
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
        if (sortOption === "recent") {
          const bt = b.last_entry_at ?? "";
          const at = a.last_entry_at ?? "";
          return bt.localeCompare(at);
        }
        if (sortOption === "oldest") {
          const bt = b.last_entry_at ?? "";
          const at = a.last_entry_at ?? "";
          return at.localeCompare(bt);
        }
        if (sortOption === "due_desc") {
          return b.balance - a.balance;
        }
        if (sortOption === "advance_desc") {
          return a.balance - b.balance;
        }
        if (sortOption === "name_asc") {
          return a.name.localeCompare(b.name);
        }
        if (sortOption === "name_desc") {
          return b.name.localeCompare(a.name);
        }
        return 0;
      });
  }, [data, search, tab, sortOption]);

  function openEntry(customer: Customer, type: "credit" | "payment") {
    setEntryCustomer(customer);
    setEntryType(type);
    setEntryOpen(true);
  }

  const net = data?.net ?? 0;
  const netLabel = net > 0 ? "You Get" : net < 0 ? "You Give" : "All Clear";
  const netColor =
    net > 0 ? "text-destructive" : net < 0 ? "text-emerald-600" : "text-muted-foreground";

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

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-32 font-sans selection:bg-[#0B3D91]/20">
      {/* 1. Header Section */}
      <div className="bg-gradient-to-br from-[#0B3D91] to-[#1258CD] rounded-b-3xl px-5 pt-12 pb-24 shadow-lg relative overflow-hidden text-white z-10">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-50%] right-[-10%] w-64 h-64 rounded-full bg-white/5 blur-3xl"></div>
          <div className="absolute bottom-[-20%] left-[-20%] w-40 h-40 rounded-full bg-white/10 blur-2xl"></div>
        </div>

        <div className="relative z-10 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Khata Book</h1>
            <div className="text-[13px] text-white/80 font-medium mt-1">
              {profile?.shop_id ? "Bharat Auto Parts" : ""}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSearch((v) => !v)}
              className={cn(
                "grid place-items-center w-10 h-10 rounded-full transition-colors backdrop-blur-md border",
                showSearch
                  ? "bg-white text-[#0B3D91] border-transparent"
                  : "bg-white/10 hover:bg-white/20 border-white/10 text-white",
              )}
              aria-label="Search"
            >
              <Search size={18} />
            </button>
          </div>
        </div>

        {/* Search */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: "auto", opacity: 1, marginTop: 24 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              className="relative z-10 overflow-hidden"
            >
              <div className="relative flex items-center bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-4 py-1">
                <Search size={18} className="text-white/70" />
                <input
                  autoFocus
                  placeholder="Search customers by name, mobile, or vehicle..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent border-none outline-none text-sm w-full font-medium placeholder:text-white/60 text-white py-3 ml-3"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 2. Floating Summary Card */}
      <div className="px-5 -mt-16 relative z-20">
        <div className="bg-white rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-border/50 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-extrabold text-muted-foreground uppercase tracking-wider">
              Net Balance
            </h2>
            <div className="flex items-center gap-1.5 bg-muted px-2.5 py-1 rounded-full text-xs font-bold text-foreground">
              <Users size={12} className="text-primary" />
              {data?.rows.length ?? 0}
            </div>
          </div>
          <div className="flex items-end justify-between mt-2">
            <div>
              <div
                className={cn(
                  "text-3xl font-black tracking-tighter",
                  net > 0 ? "text-[#EF4444]" : net < 0 ? "text-[#16A34A]" : "text-foreground",
                )}
              >
                {formatINR(Math.abs(net))}
              </div>
              <div className="text-xs font-bold text-muted-foreground mt-0.5 flex items-center gap-1">
                {net > 0 ? (
                  <>
                    <ArrowUpRight size={14} className="text-[#EF4444]" /> You will Get
                  </>
                ) : net < 0 ? (
                  <>
                    <ArrowDownRight size={14} className="text-[#16A34A]" /> You will Give
                  </>
                ) : (
                  "All Settled"
                )}
              </div>
            </div>
            <button
              onClick={() => setFilterOpen(true)}
              className="grid place-items-center w-11 h-11 rounded-2xl bg-muted hover:bg-muted/80 transition-colors text-muted-foreground active:scale-95"
              aria-label="Filter"
            >
              <SlidersHorizontal size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Segmented Tabs */}
      <div className="px-5 mt-6 mb-4">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 snap-x hide-scrollbar">
          {TABS.map((t) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative px-5 py-2.5 rounded-full text-[13px] font-bold whitespace-nowrap transition-all duration-300 snap-center shadow-sm border",
                  isActive
                    ? "text-[#1258CD] bg-[#1258CD]/5 border-[#1258CD]/20"
                    : "text-muted-foreground bg-white border-transparent hover:bg-muted/50",
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeKhataTab"
                    className="absolute inset-0 bg-white rounded-full shadow-sm border border-[#1258CD]/20"
                    initial={false}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Customer List */}
      <div className="px-5">
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-3xl p-4 h-24 animate-pulse"></div>
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-20 px-6">
            <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
              <Users size={40} className="text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">No customers found</h3>
            <p className="text-sm text-muted-foreground mb-8">
              {tab === "all" && !search
                ? "Start adding customers to track their khata balance and payments."
                : "Try adjusting your search or filters."}
            </p>
            {tab === "all" && !search && (
              <Button
                onClick={() => {
                  setEditingCustomer(null);
                  setCustomerSheetOpen(true);
                }}
                className="bg-[#1258CD] hover:bg-[#0B3D91] text-white rounded-full px-8 py-6 shadow-xl shadow-[#1258CD]/20 font-bold"
              >
                <Plus size={20} className="mr-2" /> Add First Customer
              </Button>
            )}
          </div>
        )}

        {filtered.length > 0 && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-3"
          >
            {filtered.map((r) => (
              <motion.div variants={itemVariants} key={r.id}>
                <Link
                  to="/khata/$id"
                  params={{ id: r.id }}
                  className="block bg-white rounded-[24px] p-4 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] border border-border/50 active:scale-[0.98] transition-transform relative overflow-hidden group"
                >
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div
                      className={cn(
                        "grid place-items-center w-14 h-14 rounded-[20px] font-extrabold text-lg shrink-0 shadow-sm",
                        avatarColor(r.id),
                      )}
                    >
                      {initials(r.name)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-bold text-base truncate text-foreground">{r.name}</div>
                        {r.balance > 0 && (
                          <span className="shrink-0 bg-[#EF4444]/10 text-[#EF4444] text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                            Due
                          </span>
                        )}
                        {r.balance < 0 && (
                          <span className="shrink-0 bg-[#16A34A]/10 text-[#16A34A] text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                            Advance
                          </span>
                        )}
                      </div>

                      <div className="text-[12px] text-muted-foreground truncate font-medium flex items-center gap-1.5">
                        {r.mobile && (
                          <>
                            <span>{r.mobile}</span>
                            <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                          </>
                        )}
                        {r.vehicle_number ? (
                          <span className="uppercase">{r.vehicle_number}</span>
                        ) : (
                          <span>No Vehicle</span>
                        )}
                      </div>

                      <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-2 font-semibold">
                        {r.last_entry_at ? (
                          <>
                            <Clock size={12} className="text-muted-foreground/70" />
                            {r.last_entry_type === "payment" ? (
                              <span className="text-[#16A34A]">
                                {formatINR(r.last_entry_amount ?? 0)} Paid
                              </span>
                            ) : (
                              <span className="text-[#EF4444]">
                                {formatINR(r.last_entry_amount ?? 0)} Credit
                              </span>
                            )}
                            <span className="opacity-60 ml-1">{relTime(r.last_entry_at)}</span>
                          </>
                        ) : (
                          <span className="opacity-60">No transactions yet</span>
                        )}
                      </div>
                    </div>

                    {/* Balance */}
                    <div className="text-right shrink-0">
                      {r.balance > 0 ? (
                        <div className="text-lg font-black text-[#EF4444] tracking-tight">
                          {formatINR(r.balance)}
                        </div>
                      ) : r.balance < 0 ? (
                        <div className="text-lg font-black text-[#16A34A] tracking-tight">
                          {formatINR(-r.balance)}
                        </div>
                      ) : (
                        <div className="text-sm font-bold text-muted-foreground">Settled</div>
                      )}

                      {/* Quick Actions (Call/WhatsApp) - visible if mobile exists */}
                      <div className="flex items-center justify-end gap-2 mt-2">
                        {r.mobile && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const url = buildWhatsAppUrl(
                                r.mobile,
                                `Hi ${r.name}, your current khata balance with Bharat Auto Parts is ${formatINR(Math.abs(r.balance))} ${r.balance > 0 ? "Due" : "Advance"}.`,
                              );
                              if (url) window.open(url, "_blank");
                            }}
                            className="grid place-items-center w-7 h-7 rounded-full bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors"
                          >
                            <MessageCircle size={12} strokeWidth={3} />
                          </button>
                        )}
                        <div className="grid place-items-center w-7 h-7 rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                          <ChevronRight size={14} strokeWidth={3} />
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* 5. Floating Add Customer Button */}
      <AnimatePresence>
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setEditingCustomer(null);
            setCustomerSheetOpen(true);
          }}
          className="fixed bottom-24 right-5 z-40 flex items-center justify-center w-14 h-14 bg-gradient-to-br from-[#1258CD] to-[#0B3D91] text-white rounded-full shadow-[0_8px_30px_rgba(11,61,145,0.4)] backdrop-blur-md border border-white/20"
        >
          <UserPlus size={24} />
        </motion.button>
      </AnimatePresence>

      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="bottom" className="rounded-t-[32px] pb-safe px-6">
          <SheetHeader className="mb-6 mt-2">
            <SheetTitle className="text-left font-extrabold text-xl">Sort Khata By</SheetTitle>
          </SheetHeader>
          <div className="space-y-2 mb-4">
            {[
              { id: "recent", label: "Recent Activity First" },
              { id: "oldest", label: "Oldest Activity First" },
              { id: "due_desc", label: "Highest Due Amount" },
              { id: "advance_desc", label: "Highest Advance Amount" },
              { id: "name_asc", label: "Customer Name (A to Z)" },
              { id: "name_desc", label: "Customer Name (Z to A)" },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  setSortOption(opt.id as typeof sortOption);
                  setFilterOpen(false);
                }}
                className={cn(
                  "w-full text-left px-5 py-4 rounded-[20px] font-bold text-sm transition-all duration-200 flex justify-between items-center",
                  sortOption === opt.id
                    ? "bg-[#1258CD]/10 text-[#1258CD] border border-[#1258CD]/20 shadow-sm"
                    : "hover:bg-muted text-foreground border border-transparent",
                )}
              >
                {opt.label}
                {sortOption === opt.id && <Check size={18} className="text-[#1258CD]" />}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

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

      <CustomerSheet
        open={customerSheetOpen}
        onOpenChange={setCustomerSheetOpen}
        initial={editingCustomer}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["khata"] });
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
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [paymentDueDate, setPaymentDueDate] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const { status: onlineStatus } = useOnlineStatus();

  async function save() {
    const amt = parseFloat(amount);
    if (!customer) return toast.error("Select a customer");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a valid amount");

    if (onlineStatus === "OFFLINE") {
      return toast.error("You are offline. Cannot record khata entries.");
    }

    setBusy(true);
    try {
      // Amount is positive if customer owes more (credit), negative if customer pays (payment)
      const balanceImpact = type === "credit" ? amt : -amt;
      let finalNote = note.trim();
      if (type === "payment" && method) {
        finalNote = finalNote ? `${finalNote} (via ${method})` : `Payment via ${method}`;
      }

      let receiptUrl: string | null = null;
      if (receiptFile) {
        const ext = receiptFile.name.split(".").pop();
        const filename = `${crypto.randomUUID()}.${ext}`;
        const filePath = `${profile!.shop_id}/${filename}`;

        const { error: uploadError } = await sb.storage
          .from("khata_receipts")
          .upload(filePath, receiptFile);

        if (uploadError) {
          console.error(uploadError);
          throw new Error("Failed to upload receipt image");
        }

        const { data: publicUrlData } = sb.storage.from("khata_receipts").getPublicUrl(filePath);
        receiptUrl = publicUrlData.publicUrl;
      }

      await LedgerService.createManualEntry(
        profile!.shop_id,
        customer.id,
        balanceImpact,
        finalNote,
        receiptUrl,
        type === "credit" && paymentDueDate ? new Date(paymentDueDate).toISOString() : null,
      );

      SoundManager.play(type === "credit" ? "sale" : "payment");
      toast.success(type === "credit" ? "Credit entry added" : "Payment recorded");
      setAmount("");
      setNote("");
      setReceiptFile(null);
      setPaymentDueDate("");
      onSaved();
      onOpenChange(false);
    } catch (e: unknown) {
      console.error(e);
      SoundManager.play("error");
      toast.error((e as Error).message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const isCredit = type === "credit";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle
            className={isCredit ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}
          >
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
          {isCredit && (
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Due Date (Optional)</Label>
              <Input
                type="date"
                value={paymentDueDate}
                onChange={(e) => setPaymentDueDate(e.target.value)}
              />
            </div>
          )}
          {!isCredit && (
            <div className="space-y-1.5">
              <Label className="text-xs">Payment method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
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
            disabled={busy || onlineStatus === "OFFLINE"}
            variant={isCredit ? "destructive" : "hero"}
            size="lg"
            className="w-full font-bold"
          >
            {busy ? "Saving…" : "Save Entry"}
          </Button>
          {onlineStatus === "OFFLINE" && (
            <p className="text-red-500 text-sm mt-2 text-center font-semibold">
              You are offline. Reconnect to save.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
