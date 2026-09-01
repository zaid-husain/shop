import { useState, useEffect, useMemo, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  IndianRupee,
  AlertTriangle,
  BookOpen,
  ArrowUpRight,
  ArrowDownRight,
  Truck,
  Bell,
  Search,
  CloudSun,
  FileText,
  Activity,
  CreditCard,
  X,
  Loader2,
  ChevronRight,
  User,
  Phone,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Calendar,
  History,
  Clock,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { sb, type Customer, type Product, type LedgerTransaction, type Invoice } from "@/lib/db";
import { formatINR, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PinVerificationModal } from "@/components/PinVerificationModal";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

type LowStockItem = Pick<Product, "id" | "name" | "stock_quantity" | "low_stock_threshold">;
type EnrichedTransaction = LedgerTransaction & { customer?: Customer };

function formatTxTime(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

function getLocalDayKey(isoOrDate: string | Date): string {
  try {
    const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
    if (isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return "";
  }
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard — Bharat Auto Parts" }],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { profile, signOut, role } = useAuth();
  const shopId = profile?.shop_id;
  const canViewReportsAndExpenses = role === "owner" || role === "manager";
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", shopId],
    enabled: !!shopId,
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString();

      const [
        todayInv,
        monthInv,
        lowStock,
        recent,
        custCount,
        prodCount,
        customers,
        ledger,
        monthPayments,
      ] = await Promise.all([
        sb
          .from("invoices")
          .select("total,profit,due,paid")
          .gte("created_at", startOfDay.toISOString()),
        sb.from("invoices").select("total,profit,created_at").gte("created_at", startOfMonth),
        sb
          .from("products")
          .select("id,name,stock_quantity,low_stock_threshold")
          .eq("is_active", true)
          .order("stock_quantity", { ascending: true })
          .limit(20),
        sb
          .from("ledger_transactions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
        sb.from("customers").select("id", { count: "exact", head: true }).is("deleted_at", null),
        sb.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
        sb.from("customers").select("id,name,mobile").is("deleted_at", null),
        sb.from("ledger_transactions").select("customer_id,balance_impact,payment_due_date"),
        sb
          .from("ledger_transactions")
          .select("amount")
          .lt("balance_impact", 0)
          .gte("created_at", startOfMonth),
      ]);

      const sum = (rows: { [key: string]: unknown }[] | null, k: string) =>
        (rows ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0);

      const balances = new Map<string, number>();
      const latestDueDates = new Map<string, string>();
      for (const e of (ledger.data ?? []) as Pick<
        LedgerTransaction,
        "customer_id" | "balance_impact" | "payment_due_date"
      >[]) {
        const cid = e.customer_id;
        balances.set(cid, (balances.get(cid) ?? 0) + Number(e.balance_impact));

        if (e.payment_due_date) {
          const currentLatest = latestDueDates.get(cid);
          if (!currentLatest || new Date(e.payment_due_date) < new Date(currentLatest)) {
            latestDueDates.set(cid, e.payment_due_date);
          }
        }
      }
      const custMap = new Map<string, Customer>();
      for (const c of (customers.data ?? []) as Customer[]) custMap.set(c.id, c);

      let totalOutstanding = 0;
      let pendingPayments = 0;
      for (const [cid, v] of balances.entries()) {
        if (v > 0 && custMap.has(cid)) {
          totalOutstanding += v;
          pendingPayments++;
        }
      }

      const paymentFollowUps = Array.from(balances.entries())
        .filter(([, v]) => v > 0)
        .map(([cid, v]) => {
          const dueDate = latestDueDates.get(cid);
          if (!dueDate) return null;
          return { customer: custMap.get(cid), balance: v, paymentDueDate: dueDate };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null && r.customer !== undefined)
        .sort((a, b) => new Date(a.paymentDueDate).getTime() - new Date(b.paymentDueDate).getTime())
        .slice(0, 10);

      const salesChartData = (() => {
        const daily = new Map<string, number>();
        for (const inv of monthInv.data ?? []) {
          const d = (inv.created_at as string).split("T")[0];
          daily.set(d, (daily.get(d) ?? 0) + Number(inv.total));
        }
        const sortedDates = Array.from(daily.keys()).sort();
        return sortedDates.slice(-7).map((d) => {
          const dateObj = new Date(d);
          return {
            name: dateObj.toLocaleDateString("en-US", { weekday: "short" }),
            revenue: daily.get(d) ?? 0,
          };
        });
      })();

      return {
        todaySales: sum(todayInv.data, "total"),
        monthSales: sum(monthInv.data, "total"),
        monthCollection: sum(monthPayments.data, "amount"),
        totalOutstanding,
        pendingPayments,
        lowStock: (lowStock.data ?? []).filter(
          (p: LowStockItem) => Number(p.stock_quantity) <= Number(p.low_stock_threshold ?? 5),
        ),
        recent: (recent.data ?? [])
          .map((e: LedgerTransaction) => ({
            ...e,
            customer: custMap.get(e.customer_id),
          }))
          .filter((e: Record<string, unknown>) => e.customer),
        paymentFollowUps,
        custCount: custCount.count ?? 0,
        prodCount: prodCount.count ?? 0,
        salesChartData,
      };
    },
  });

  const [now, setNow] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [showAllToday, setShowAllToday] = useState(false);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>("all");

  const [pinDialogOpen, setPinDialogOpen] = useState(false);

  const { todayTransactions, pastDateGroups, allDatesList } = useMemo(() => {
    if (!data?.recent) return { todayTransactions: [], pastDateGroups: [], allDatesList: [] };

    const todayKey = getLocalDayKey(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = getLocalDayKey(yesterday);

    const todayList: EnrichedTransaction[] = [];
    const pastMap = new Map<string, EnrichedTransaction[]>();

    for (const tx of data.recent as EnrichedTransaction[]) {
      const dateKey = getLocalDayKey(tx.created_at || tx.entry_date) || todayKey;
      if (dateKey === todayKey) {
        todayList.push(tx);
      } else {
        const existing = pastMap.get(dateKey) || [];
        existing.push(tx);
        pastMap.set(dateKey, existing);
      }
    }

    const sortedPastKeys = Array.from(pastMap.keys()).sort((a, b) => b.localeCompare(a));
    const pastGroups = sortedPastKeys.map((dateKey) => {
      const txs = pastMap.get(dateKey)!;
      const dateObj = new Date(`${dateKey}T00:00:00`);
      const isYesterday = dateKey === yesterdayKey;
      const label = isYesterday
        ? `Yesterday · ${formatDate(dateObj.toISOString())}`
        : formatDate(dateObj.toISOString());

      const totalCredit = txs
        .filter((t) => Number(t.balance_impact) > 0)
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const totalPayment = txs
        .filter((t) => Number(t.balance_impact) < 0)
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);

      return {
        dateKey,
        label,
        dateObj,
        transactions: txs,
        totalCredit,
        totalPayment,
      };
    });

    const datesList: { key: string; label: string; count: number }[] = [
      { key: "all", label: "All Activity", count: (data.recent as EnrichedTransaction[]).length },
    ];
    if (todayList.length > 0) {
      datesList.push({
        key: todayKey,
        label: `Today (${todayList.length})`,
        count: todayList.length,
      });
    }
    for (const g of pastGroups) {
      datesList.push({
        key: g.dateKey,
        label: `${g.label} (${g.transactions.length})`,
        count: g.transactions.length,
      });
    }

    return {
      todayTransactions: todayList,
      pastDateGroups: pastGroups,
      allDatesList: datesList,
    };
  }, [data?.recent]);

  const toggleDateGroup = (dateKey: string) => {
    setExpandedDates((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Live Multi-Entity Global Search
  const cleanQuery = searchQuery.trim();
  const { data: searchResults, isFetching: isSearching } = useQuery({
    queryKey: ["globalSearch", shopId, cleanQuery],
    enabled: !!shopId && cleanQuery.length >= 1,
    queryFn: async () => {
      const q = cleanQuery;
      const [custRes, prodRes, invRes] = await Promise.all([
        sb
          .from("customers")
          .select("id, name, mobile, vehicle_number, balance_cache")
          .is("deleted_at", null)
          .or(`name.ilike.%${q}%,mobile.ilike.%${q}%,vehicle_number.ilike.%${q}%`)
          .order("name")
          .limit(5),
        sb
          .from("products")
          .select(
            "id, name, brand, part_number, category, selling_price, stock_quantity, low_stock_threshold",
          )
          .eq("is_active", true)
          .or(`name.ilike.%${q}%,brand.ilike.%${q}%,part_number.ilike.%${q}%,category.ilike.%${q}%`)
          .order("name")
          .limit(5),
        sb
          .from("invoices")
          .select(
            "id, invoice_number, customer_id, customer_name, total, paid, due, payment_status, created_at",
          )
          .or(`invoice_number.ilike.%${q}%,customer_name.ilike.%${q}%`)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      return {
        customers: (custRes.data ?? []) as Customer[],
        products: (prodRes.data ?? []) as Product[],
        invoices: (invRes.data ?? []) as Invoice[],
      };
    },
    staleTime: 10000,
  });

  const totalResultsCount =
    (searchResults?.customers.length ?? 0) +
    (searchResults?.products.length ?? 0) +
    (searchResults?.invoices.length ?? 0);

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";
  const avatarFallback = profile?.full_name?.charAt(0).toUpperCase() ?? "S";

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-[100px] font-sans">
      {/* 1. Header Section */}
      <div className="bg-gradient-to-br from-[#0B3D91] to-[#1258CD] rounded-b-3xl px-5 pt-12 pb-20 shadow-lg relative overflow-hidden text-white">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-50%] right-[-10%] w-64 h-64 rounded-full bg-white/5 blur-3xl"></div>
          <div className="absolute bottom-[-20%] left-[-20%] w-40 h-40 rounded-full bg-white/10 blur-2xl"></div>
        </div>

        <div className="relative z-10 flex justify-between items-start">
          <Link
            to="/settings"
            className="flex gap-3 items-center hover:opacity-90 active:scale-95 transition-all group"
            aria-label="Profile and Settings"
          >
            <Avatar className="h-12 w-12 border-2 border-white/20 shadow-md group-hover:border-white/40 transition-colors">
              <AvatarFallback className="bg-white/10 text-white font-bold">
                {avatarFallback}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="text-white/80 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <CloudSun size={12} /> {greeting}
              </div>
              <h1 className="text-xl font-bold tracking-tight mt-0.5 flex items-center gap-1">
                {profile?.full_name?.split(" ")[0] ?? "Owner"}
                <ChevronRight
                  size={16}
                  className="text-white/60 group-hover:translate-x-0.5 transition-transform"
                />
              </h1>
            </div>
          </Link>
          <div className="flex items-center gap-2.5">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="grid place-items-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors relative"
                  aria-label="Notifications"
                >
                  <Bell size={18} />
                  {data &&
                    ((data.lowStock?.length ?? 0) > 0 ||
                      (data.paymentFollowUps?.length ?? 0) > 0) && (
                      <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-[#EF4444] rounded-full border-2 border-[#0B3D91]"></span>
                    )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[calc(100vw-32px)] max-w-sm sm:w-96 rounded-3xl p-0 overflow-hidden shadow-2xl border-border/60 mr-2 mt-2"
                align="end"
              >
                <div className="bg-muted/60 p-4 border-b border-border/50 flex items-center justify-between">
                  <div className="font-bold text-sm text-foreground flex items-center gap-2">
                    <Bell size={15} className="text-primary" /> Notifications
                  </div>
                  {data &&
                    ((data.lowStock?.length ?? 0) > 0 ||
                      (data.paymentFollowUps?.length ?? 0) > 0) && (
                      <span className="bg-[#EF4444]/10 text-[#EF4444] text-[11px] font-extrabold px-2.5 py-0.5 rounded-full">
                        {(data.lowStock?.length ?? 0) + (data.paymentFollowUps?.length ?? 0)} Alerts
                      </span>
                    )}
                </div>
                <div className="max-h-[360px] overflow-y-auto divide-y divide-border/40">
                  {!data ||
                  ((data.lowStock?.length ?? 0) === 0 &&
                    (data.paymentFollowUps?.length ?? 0) === 0) ? (
                    <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                      <CheckCircle2 size={28} className="text-emerald-500/60" />
                      <div>
                        <div className="font-semibold text-foreground">All caught up!</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          No pending stock or payment alerts.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Low Stock Alerts */}
                      {(data.lowStock ?? []).map((p: LowStockItem) => (
                        <Link
                          key={`stock-${p.id}`}
                          to="/products"
                          className="flex items-start gap-3 p-3.5 hover:bg-muted/30 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                            <AlertTriangle size={15} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-foreground truncate">
                              Low Stock: {p.name}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              Only{" "}
                              <span className="font-bold text-amber-600">{p.stock_quantity}</span>{" "}
                              left in stock (alert threshold: {p.low_stock_threshold ?? 5})
                            </div>
                          </div>
                        </Link>
                      ))}

                      {/* Top Pending Dues */}
                      {(data.paymentFollowUps ?? []).map(
                        (r: { customer?: Customer; balance: number; paymentDueDate: string }) => (
                          <Link
                            key={`due-${r.customer?.id}`}
                            to="/khata/$id"
                            params={{ id: r.customer?.id ?? "" }}
                            className="flex items-start gap-3 p-3.5 hover:bg-muted/30 transition-colors"
                          >
                            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                              <BookOpen size={15} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-foreground truncate flex items-center justify-between gap-1">
                                <span>Follow-up: {r.customer?.name}</span>
                                <span className="text-rose-600 font-extrabold text-xs">
                                  {formatINR(r.balance)}
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                Due on {formatDate(r.paymentDueDate)}
                              </div>
                            </div>
                          </Link>
                        ),
                      )}
                    </>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="relative z-10 mt-6 text-white/90 text-sm font-medium">
          {now.toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </div>
      </div>

      {/* 2. Global Search Floating Bar & Results Dropdown */}
      <div ref={searchContainerRef} className="px-5 -mt-7 relative z-40">
        <div className="bg-white/95 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-2xl flex items-center px-4 py-3 transition-all focus-within:ring-2 focus-within:ring-primary/30">
          <Search size={18} className="text-primary mr-3 shrink-0" />
          <input
            type="text"
            placeholder="Search customers, products, bills..."
            className="bg-transparent border-none outline-none text-sm w-full font-medium placeholder:text-muted-foreground/70 text-foreground"
            value={searchQuery}
            onFocus={() => setIsSearchOpen(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
            }}
          />
          {isSearching && <Loader2 size={16} className="text-primary animate-spin shrink-0 ml-2" />}
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setIsSearchOpen(false);
              }}
              className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 ml-1.5 transition-colors"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Live Search Results Dropdown */}
        <AnimatePresence>
          {isSearchOpen && cleanQuery.length >= 1 && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute left-5 right-5 top-full mt-2 rounded-2xl bg-card border border-border shadow-2xl overflow-hidden max-h-[72vh] overflow-y-auto z-50"
            >
              {isSearching && !searchResults ? (
                <div className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin text-primary" />
                  Searching shop records…
                </div>
              ) : totalResultsCount === 0 ? (
                <div className="p-6 text-center space-y-1">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground mx-auto mb-2">
                    <Search size={18} />
                  </div>
                  <div className="text-sm font-bold text-foreground">No matches found</div>
                  <div className="text-xs text-muted-foreground">
                    No customer, product, or bill matches "{cleanQuery}"
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {/* Customers Section */}
                  {searchResults && searchResults.customers.length > 0 && (
                    <div className="p-3">
                      <div className="flex items-center justify-between px-2 pb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <User size={13} className="text-blue-600" /> Customers (
                          {searchResults.customers.length})
                        </span>
                        <Link
                          to="/customers"
                          onClick={() => setIsSearchOpen(false)}
                          className="text-[11px] font-semibold text-primary hover:underline"
                        >
                          View All
                        </Link>
                      </div>
                      <div className="space-y-1">
                        {searchResults.customers.map((c) => {
                          const due = Number(c.balance_cache ?? 0);
                          return (
                            <Link
                              key={c.id}
                              to="/customers/$id"
                              params={{ id: c.id }}
                              onClick={() => setIsSearchOpen(false)}
                              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-muted/60 transition-colors group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <Avatar className="h-9 w-9 border border-border/40">
                                  <AvatarFallback className="bg-blue-50 text-blue-700 text-xs font-bold">
                                    {c.name.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-foreground truncate">
                                    {c.name}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {c.mobile ?? c.vehicle_number ?? "No phone"}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right shrink-0 flex items-center gap-2">
                                <span
                                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                    due > 0
                                      ? "bg-rose-50 text-rose-600 border border-rose-200/50"
                                      : due < 0
                                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200/50"
                                        : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {due > 0
                                    ? `${formatINR(due)} Due`
                                    : due < 0
                                      ? `${formatINR(Math.abs(due))} Adv`
                                      : "Cleared"}
                                </span>
                                <ChevronRight
                                  size={16}
                                  className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all"
                                />
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Products Section */}
                  {searchResults && searchResults.products.length > 0 && (
                    <div className="p-3">
                      <div className="flex items-center justify-between px-2 pb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Package size={13} className="text-amber-600" /> Products (
                          {searchResults.products.length})
                        </span>
                        <Link
                          to="/products"
                          onClick={() => setIsSearchOpen(false)}
                          className="text-[11px] font-semibold text-primary hover:underline"
                        >
                          View Inventory
                        </Link>
                      </div>
                      <div className="space-y-1">
                        {searchResults.products.map((p) => {
                          const stock = Number(p.stock_quantity ?? 0);
                          const threshold = Number(p.low_stock_threshold ?? 5);
                          const isLow = stock > 0 && stock <= threshold;
                          const isOut = stock <= 0;

                          return (
                            <Link
                              key={p.id}
                              to="/products"
                              onClick={() => setIsSearchOpen(false)}
                              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-muted/60 transition-colors group"
                            >
                              <div className="min-w-0 pr-3">
                                <div className="text-sm font-semibold text-foreground truncate">
                                  {p.brand ? `${p.brand} ` : ""}
                                  {p.name}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {p.part_number ? `Part #${p.part_number} · ` : ""}
                                  {p.category}
                                </div>
                              </div>
                              <div className="text-right shrink-0 flex items-center gap-2.5">
                                <div>
                                  <div className="text-sm font-bold text-foreground">
                                    {formatINR(p.selling_price)}
                                  </div>
                                  <div
                                    className={`text-[10px] font-bold uppercase ${
                                      isOut
                                        ? "text-rose-600"
                                        : isLow
                                          ? "text-amber-600"
                                          : "text-emerald-600"
                                    }`}
                                  >
                                    {isOut ? "Out of Stock" : `${stock} in stock`}
                                  </div>
                                </div>
                                <ChevronRight
                                  size={16}
                                  className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all"
                                />
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Invoices Section */}
                  {searchResults && searchResults.invoices.length > 0 && (
                    <div className="p-3">
                      <div className="flex items-center justify-between px-2 pb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <FileText size={13} className="text-emerald-600" /> Bills / Invoices (
                          {searchResults.invoices.length})
                        </span>
                        <Link
                          to="/billing"
                          onClick={() => setIsSearchOpen(false)}
                          className="text-[11px] font-semibold text-primary hover:underline"
                        >
                          New Bill
                        </Link>
                      </div>
                      <div className="space-y-1">
                        {searchResults.invoices.map((inv) => (
                          <div
                            key={inv.id}
                            onClick={() => {
                              setIsSearchOpen(false);
                              if (inv.customer_id) {
                                navigate({
                                  to: "/khata/$id",
                                  params: { id: inv.customer_id },
                                });
                              } else {
                                navigate({ to: "/management" });
                              }
                            }}
                            className="flex items-center justify-between p-2.5 rounded-xl hover:bg-muted/60 transition-colors cursor-pointer group"
                          >
                            <div className="min-w-0 pr-3">
                              <div className="text-sm font-semibold text-foreground truncate">
                                {inv.invoice_number}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {inv.customer_name || "Walk-in Customer"} ·{" "}
                                {formatDate(inv.created_at)}
                              </div>
                            </div>
                            <div className="text-right shrink-0 flex items-center gap-2">
                              <div>
                                <div className="text-sm font-bold text-foreground">
                                  {formatINR(Number(inv.total ?? 0))}
                                </div>
                                <div
                                  className={`text-[10px] font-bold uppercase ${
                                    inv.payment_status === "paid"
                                      ? "text-emerald-600"
                                      : "text-amber-600"
                                  }`}
                                >
                                  {inv.payment_status}
                                </div>
                              </div>
                              <ChevronRight
                                size={16}
                                className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {isLoading ? (
        <div className="px-5 mt-8 space-y-6">
          <Skeleton className="h-28 rounded-2xl" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        </div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="px-5 mt-6 space-y-8"
        >
          {/* 3. Management Button */}
          <motion.div variants={itemVariants}>
            <Link
              to="/management"
              className="group relative flex items-center justify-between bg-white rounded-3xl p-5 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.08)] border border-primary/10 overflow-hidden active:scale-[0.98] transition-all"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/10 to-transparent rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>

              <div className="flex items-center gap-4 relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Activity size={24} />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-foreground tracking-tight">
                    Management
                  </h2>
                  <p className="text-sm text-muted-foreground font-medium mt-0.5">
                    Business Overview, Sales, Profit & Stock
                  </p>
                </div>
              </div>

              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 text-muted-foreground group-hover:bg-primary group-hover:text-white transition-colors relative z-10">
                <ChevronRight size={20} />
              </div>
            </Link>
          </motion.div>

          {/* 5. Quick Actions Row */}
          <motion.div variants={itemVariants}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-extrabold text-foreground tracking-wide uppercase">
                Quick Actions
              </h2>
            </div>
            <div className="grid grid-cols-4 gap-y-6 gap-x-2">
              <ActionItem
                to="/billing"
                icon={<ShoppingCart size={22} />}
                label="New Bill"
                color="bg-[#0B3D91] text-white"
              />
              <ActionItem
                to="/khata"
                icon={<BookOpen size={22} />}
                label="Khata"
                color="bg-emerald-50 text-emerald-700"
              />
              <ActionItem
                to="/customers"
                icon={<Users size={22} />}
                label="Customers"
                color="bg-orange-50 text-orange-700"
              />
              <ActionItem
                to="/products"
                icon={<Package size={22} />}
                label="Inventory"
                color="bg-teal-50 text-teal-700"
              />
              {canViewReportsAndExpenses && (
                <ActionItem
                  to="/purchases"
                  icon={<Truck size={22} />}
                  label="Stock In"
                  color="bg-blue-50 text-blue-700"
                />
              )}
              <ActionItem
                to="/assistant"
                icon={<Sparkles size={22} />}
                label="AI"
                color="bg-purple-50 text-purple-700"
              />
            </div>
          </motion.div>

          {/* 8. Payment Follow-ups */}
          {data && data.paymentFollowUps.length > 0 && (
            <motion.div variants={itemVariants}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-extrabold text-foreground tracking-wide uppercase">
                  Payment Follow-ups
                </h2>
                <Link to="/khata" className="text-xs font-bold text-primary">
                  View All
                </Link>
              </div>
              <div className="bg-white rounded-3xl p-2 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] border border-border/50">
                {data.paymentFollowUps.map((r, i) => {
                  const dueDate = new Date(r.paymentDueDate);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const dueDateZero = new Date(dueDate);
                  dueDateZero.setHours(0, 0, 0, 0);

                  const diffTime = dueDateZero.getTime() - today.getTime();
                  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                  let statusText = "Upcoming";
                  let statusColor = "bg-slate-100 text-slate-700";

                  if (diffDays < 0) {
                    statusText = "Overdue";
                    statusColor = "bg-red-100 text-red-700";
                  } else if (diffDays === 0) {
                    statusText = "Due Today";
                    statusColor = "bg-orange-100 text-orange-700";
                  } else if (diffDays <= 3) {
                    statusText = "Due Soon";
                    statusColor = "bg-amber-100 text-amber-700";
                  } else {
                    statusText = "Upcoming";
                    statusColor = "bg-blue-100 text-blue-700";
                  }

                  return (
                    <div
                      key={r.customer!.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 py-3 hover:bg-muted/30 rounded-2xl transition-colors ${
                        i !== 0 ? "border-t border-border/40" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-10 w-10 border border-border/50 shadow-sm">
                          <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-700 font-bold">
                            {r.customer!.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Link
                              to="/khata/$id"
                              params={{ id: r.customer!.id }}
                              className="text-sm font-bold text-foreground hover:text-primary truncate transition-colors"
                            >
                              {r.customer!.name}
                            </Link>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${statusColor} whitespace-nowrap`}
                            >
                              {statusText}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground font-medium mt-0.5">
                            {r.customer!.mobile ?? "No number"} • Due:{" "}
                            {formatDate(r.paymentDueDate)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 sm:shrink-0 justify-between sm:justify-end">
                        <div className="text-sm font-extrabold text-[#EF4444]">
                          {formatINR(r.balance)}
                        </div>
                        {r.customer!.mobile ? (
                          <a
                            href={`tel:${r.customer!.mobile}`}
                            className="inline-flex items-center justify-center gap-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                          >
                            <Phone size={12} className="fill-emerald-700" />
                            Call
                          </a>
                        ) : (
                          <div className="w-[68px]"></div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* 9. Recent Transactions Timeline with Date-Wise Grouping & Collapsible History */}
          {data && data.recent.length > 0 && (
            <motion.div variants={itemVariants} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-extrabold text-foreground tracking-wide uppercase">
                    Recent Activity
                  </h2>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {data.recent.length}
                  </span>
                </div>

                {allDatesList.length > 2 && (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={selectedDateFilter}
                      onChange={(e) => setSelectedDateFilter(e.target.value)}
                      className="text-xs font-semibold bg-white border border-border/80 rounded-xl px-2.5 py-1.5 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                    >
                      {allDatesList.map((d) => (
                        <option key={d.key} value={d.key}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] border border-border/50 space-y-4">
                {/* 1. Today's Activity Section */}
                {(selectedDateFilter === "all" ||
                  selectedDateFilter === getLocalDayKey(new Date())) && (
                  <div>
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/40">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-xs font-bold text-foreground">Today's Activity</span>
                        <span className="text-[11px] text-muted-foreground font-medium">
                          ({formatDate(new Date().toISOString())})
                        </span>
                      </div>
                      {todayTransactions.length > 0 && (
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          {todayTransactions.length}{" "}
                          {todayTransactions.length === 1 ? "entry" : "entries"}
                        </span>
                      )}
                    </div>

                    {todayTransactions.length > 0 ? (
                      <div className="space-y-1">
                        {(showAllToday ? todayTransactions : todayTransactions.slice(0, 4)).map(
                          (item) => (
                            <TransactionRow key={item.id} item={item} />
                          ),
                        )}

                        {todayTransactions.length > 4 && (
                          <button
                            type="button"
                            onClick={() => setShowAllToday(!showAllToday)}
                            className="w-full mt-2 py-2 text-xs font-bold text-primary hover:bg-primary/5 rounded-xl transition-colors flex items-center justify-center gap-1.5 border border-dashed border-primary/20"
                          >
                            {showAllToday ? (
                              <>
                                <span>Show Less</span>
                                <ChevronUp size={14} />
                              </>
                            ) : (
                              <>
                                <span>
                                  View all {todayTransactions.length} entries today (+
                                  {todayTransactions.length - 4} more)
                                </span>
                                <ChevronDown size={14} />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="py-4 text-center text-xs text-muted-foreground bg-muted/20 rounded-2xl border border-dashed border-border/60 flex items-center justify-center gap-2">
                        <Clock size={14} className="text-muted-foreground/70" />
                        <span>No transactions recorded yet today</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Specific Past Date Selected via Dropdown */}
                {selectedDateFilter !== "all" &&
                  selectedDateFilter !== getLocalDayKey(new Date()) && (
                    <div>
                      {(() => {
                        const group = pastDateGroups.find((g) => g.dateKey === selectedDateFilter);
                        if (!group) return null;
                        return (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between pb-2 border-b border-border/40">
                              <div className="flex items-center gap-2">
                                <Calendar size={14} className="text-primary" />
                                <span className="text-xs font-bold text-foreground">
                                  {group.label}
                                </span>
                              </div>
                              <span className="text-[11px] font-semibold text-muted-foreground">
                                {group.transactions.length} entries
                              </span>
                            </div>
                            <div className="space-y-1">
                              {group.transactions.map((item) => (
                                <TransactionRow key={item.id} item={item} />
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                {/* 3. Past Dates Collapsible Accordions (when 'all' is selected) */}
                {selectedDateFilter === "all" && pastDateGroups.length > 0 && (
                  <div className="pt-2 border-t border-border/40 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-muted-foreground px-1">
                      <span className="flex items-center gap-1.5">
                        <History size={13} className="text-muted-foreground" />
                        Previous Days History
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground/80">
                        Tap date to expand
                      </span>
                    </div>

                    <div className="space-y-2">
                      {pastDateGroups.map((group) => {
                        const isExpanded = expandedDates[group.dateKey] ?? false;
                        return (
                          <div
                            key={group.dateKey}
                            className={`border rounded-2xl overflow-hidden transition-all ${
                              isExpanded
                                ? "border-primary/30 bg-primary/[0.02] shadow-sm"
                                : "border-border/60 bg-muted/20 hover:bg-muted/30"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleDateGroup(group.dateKey)}
                              className="w-full flex items-center justify-between p-3 transition-colors text-left"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className={`w-7 h-7 rounded-xl grid place-items-center shrink-0 transition-colors ${
                                    isExpanded
                                      ? "bg-primary text-white shadow-sm"
                                      : "bg-muted text-foreground"
                                  }`}
                                >
                                  <Calendar size={13} className="stroke-[2.5]" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-foreground truncate">
                                    {group.label}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-medium">
                                    {group.transactions.length}{" "}
                                    {group.transactions.length === 1
                                      ? "transaction"
                                      : "transactions"}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <div className="text-right hidden sm:flex items-center gap-1.5 text-[11px] font-bold">
                                  {group.totalCredit > 0 && (
                                    <span className="text-[#EF4444]">
                                      +{formatINR(group.totalCredit)}
                                    </span>
                                  )}
                                  {group.totalPayment > 0 && (
                                    <span className="text-[#16A34A]">
                                      −{formatINR(group.totalPayment)}
                                    </span>
                                  )}
                                </div>
                                <motion.div
                                  animate={{ rotate: isExpanded ? 180 : 0 }}
                                  transition={{ duration: 0.2 }}
                                  className={`w-6 h-6 rounded-full grid place-items-center transition-colors ${
                                    isExpanded
                                      ? "bg-primary/10 text-primary"
                                      : "bg-muted/80 text-muted-foreground"
                                  }`}
                                >
                                  <ChevronDown size={14} />
                                </motion.div>
                              </div>
                            </button>

                            <AnimatePresence initial={false}>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.22, ease: "easeInOut" }}
                                  className="overflow-hidden border-t border-border/40 bg-white px-3 py-2"
                                >
                                  <div className="space-y-1">
                                    {group.transactions.map((item) => (
                                      <TransactionRow key={item.id} item={item} />
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
      <PinVerificationModal
        open={pinDialogOpen}
        onOpenChange={setPinDialogOpen}
        onSuccess={() => navigate({ to: "/team" })}
      />
    </div>
  );
}

function SecondaryKpi({
  title,
  value,
  icon,
  color,
  bg,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-3.5 shadow-sm min-w-[130px] shrink-0 border border-border/40 snap-center">
      <div className={`w-7 h-7 rounded-full grid place-items-center mb-2 ${bg} ${color}`}>
        {icon}
      </div>
      <div className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider mb-1">
        {title}
      </div>
      <div className="text-base font-extrabold text-foreground">{value}</div>
    </div>
  );
}

function ActionItem({
  to,
  icon,
  label,
  color,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  color: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-2 active:scale-95 transition-transform group"
    >
      <div
        className={`w-14 h-14 rounded-[20px] grid place-items-center shadow-sm ${color} group-hover:shadow-md transition-shadow`}
      >
        {icon}
      </div>
      <span className="text-[11px] font-bold text-muted-foreground text-center leading-tight">
        {label}
      </span>
    </Link>
  );
}

function TransactionRow({ item }: { item: EnrichedTransaction }) {
  const isCredit = Number(item.balance_impact) > 0;
  const timeStr = formatTxTime(item.created_at || item.entry_date);

  return (
    <Link
      to="/khata/$id"
      params={{ id: item.customer_id }}
      className="flex items-center gap-3.5 group p-2 hover:bg-muted/40 rounded-2xl transition-all"
    >
      <div
        className={`grid place-items-center w-8 h-8 rounded-full shrink-0 shadow-sm ring-4 ring-white ${
          isCredit ? "bg-[#EF4444] text-white" : "bg-[#16A34A] text-white"
        }`}
      >
        {isCredit ? (
          <ArrowUpRight size={14} strokeWidth={3} />
        ) : (
          <ArrowDownRight size={14} strokeWidth={3} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2">
          <div className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
            {item.customer?.name ?? "Unknown"}
          </div>
          <div
            className={`text-sm font-extrabold shrink-0 ${
              isCredit ? "text-[#EF4444]" : "text-[#16A34A]"
            }`}
          >
            {isCredit ? "+" : "−"}
            {formatINR(Number(item.amount))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
            <span>{isCredit ? "Credit Given" : "Payment Received"}</span>
            {timeStr && <span className="opacity-75">· {timeStr}</span>}
          </div>
          {item.note && (
            <span className="text-[10px] text-muted-foreground/80 truncate max-w-[120px] italic">
              {item.note}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
