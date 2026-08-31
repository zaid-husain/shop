import { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
  ChevronRight,
  Truck,
  Bell,
  Search,
  CloudSun,
  FileText,
  MessageCircle,
  Activity,
  LogOut,
  CreditCard,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { sb, type Customer, type Product, type LedgerTransaction } from "@/lib/db";
import { formatINR, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from "recharts";

type LowStockItem = Pick<Product, "id" | "name" | "stock_quantity" | "low_stock_threshold">;

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
          .limit(6),
        sb.from("customers").select("id", { count: "exact", head: true }).is("deleted_at", null),
        sb.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
        sb.from("customers").select("id,name,mobile").is("deleted_at", null),
        sb.from("ledger_transactions").select("customer_id,balance_impact"),
        sb
          .from("ledger_transactions")
          .select("amount")
          .lt("balance_impact", 0)
          .gte("created_at", startOfMonth),
      ]);

      const sum = (rows: { [key: string]: unknown }[] | null, k: string) =>
        (rows ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0);

      const balances = new Map<string, number>();
      for (const e of (ledger.data ?? []) as Pick<
        LedgerTransaction,
        "customer_id" | "balance_impact"
      >[]) {
        balances.set(e.customer_id, (balances.get(e.customer_id) ?? 0) + Number(e.balance_impact));
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

      const topDue = Array.from(balances.entries())
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cid, v]) => ({ customer: custMap.get(cid), balance: v }))
        .filter((r) => r.customer);

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
        topDue,
        custCount: custCount.count ?? 0,
        prodCount: prodCount.count ?? 0,
        salesChartData,
      };
    },
  });

  const [now, setNow] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const filteredData = useMemo(() => {
    if (!data) return null;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return data;
    return {
      ...data,
      lowStock: data.lowStock.filter((p: LowStockItem) => p.name.toLowerCase().includes(q)),
      topDue: data.topDue.filter(
        (r) =>
          (r.customer?.name || "").toLowerCase().includes(q) ||
          (r.customer?.mobile || "").includes(q),
      ),
      recent: data.recent.filter((e) => (e.customer?.name || "").toLowerCase().includes(q)),
    };
  }, [data, searchQuery]);

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
          <div className="flex gap-3 items-center">
            <Avatar className="h-12 w-12 border-2 border-white/20 shadow-md">
              <AvatarFallback className="bg-white/10 text-white font-bold">
                {avatarFallback}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="text-white/80 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <CloudSun size={12} /> {greeting}
              </div>
              <h1 className="text-xl font-bold tracking-tight mt-0.5">
                {profile?.full_name?.split(" ")[0] ?? "Owner"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="grid place-items-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors relative">
              <Bell size={18} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-[#EF4444] rounded-full border border-[#0B3D91]"></span>
            </button>
            <button
              onClick={signOut}
              className="grid place-items-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <LogOut size={18} />
            </button>
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

      {/* 2. Global Search Floating */}
      <div className="px-5 -mt-7 relative z-20">
        <div className="bg-white/80 backdrop-blur-xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-2xl flex items-center px-4 py-3">
          <Search size={18} className="text-muted-foreground mr-3 shrink-0" />
          <input
            type="text"
            placeholder="Search customers, products, bills..."
            className="bg-transparent border-none outline-none text-sm w-full font-medium placeholder:text-muted-foreground/70 text-foreground"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
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
          {/* 3. Primary KPI Cards */}
          <div className="grid grid-cols-2 gap-4">
            <motion.div variants={itemVariants}>
              <Link
                to="/khata"
                className="block bg-white rounded-3xl p-5 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] border border-[#EF4444]/10 relative overflow-hidden active:scale-[0.98] transition-transform"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#EF4444]/10 to-transparent rounded-full -mr-10 -mt-10"></div>
                <div className="flex items-center gap-2 text-[#EF4444] font-semibold text-xs uppercase tracking-wide">
                  <TrendingUp size={14} /> Outstanding
                </div>
                <div className="mt-3 text-2xl font-extrabold text-[#EF4444] tracking-tight">
                  {formatINR(data?.totalOutstanding ?? 0)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground font-medium">
                  Across {data?.pendingPayments ?? 0} customers
                </div>
              </Link>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Link
                to="/reports"
                className="block bg-white rounded-3xl p-5 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] border border-[#16A34A]/10 relative overflow-hidden active:scale-[0.98] transition-transform"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#16A34A]/10 to-transparent rounded-full -mr-10 -mt-10"></div>
                <div className="flex items-center gap-2 text-[#16A34A] font-semibold text-xs uppercase tracking-wide">
                  <Activity size={14} /> Today's Sales
                </div>
                <div className="mt-3 text-2xl font-extrabold text-[#16A34A] tracking-tight">
                  {formatINR(data?.todaySales ?? 0)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground font-medium">
                  {data?.monthSales
                    ? `${formatINR(data.monthSales)} this month`
                    : "No sales this month"}
                </div>
              </Link>
            </motion.div>
          </div>

          {/* 4. Secondary Scrollable KPIs */}
          <motion.div
            variants={itemVariants}
            className="flex gap-3 overflow-x-auto pb-4 snap-x hide-scrollbar -mx-5 px-5"
          >
            <SecondaryKpi
              title="Total Collection"
              value={formatINR(data?.monthCollection ?? 0)}
              icon={<CreditCard size={14} />}
              color="text-indigo-600"
              bg="bg-indigo-50"
            />
            <SecondaryKpi
              title="Total Customers"
              value={String(data?.custCount ?? 0)}
              icon={<Users size={14} />}
              color="text-blue-600"
              bg="bg-blue-50"
            />
            <SecondaryKpi
              title="Total Products"
              value={String(data?.prodCount ?? 0)}
              icon={<Package size={14} />}
              color="text-orange-600"
              bg="bg-orange-50"
            />
            <SecondaryKpi
              title="Monthly Sales"
              value={formatINR(data?.monthSales ?? 0)}
              icon={<IndianRupee size={14} />}
              color="text-teal-600"
              bg="bg-teal-50"
            />
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
              {canViewReportsAndExpenses && (
                <ActionItem
                  to="/purchases"
                  icon={<Truck size={22} />}
                  label="Stock In"
                  color="bg-blue-50 text-blue-700"
                />
              )}
              <ActionItem
                to="/khata"
                icon={<BookOpen size={22} />}
                label="Khata"
                color="bg-emerald-50 text-emerald-700"
              />
              <ActionItem
                to="/assistant"
                icon={<CloudSun size={22} />}
                label="AI Chat"
                color="bg-purple-50 text-purple-700"
              />
              <ActionItem
                to="/"
                icon={<Users size={22} />}
                label="Customers"
                color="bg-orange-50 text-orange-700"
              />
              {canViewReportsAndExpenses && (
                <ActionItem
                  to="/reports"
                  icon={<FileText size={22} />}
                  label="Reports"
                  color="bg-pink-50 text-pink-700"
                />
              )}
              <ActionItem
                to="/products"
                icon={<Package size={22} />}
                label="Inventory"
                color="bg-teal-50 text-teal-700"
              />
              <ActionItem
                to="/khata"
                icon={<CreditCard size={22} />}
                label="Payments"
                color="bg-rose-50 text-rose-700"
              />
            </div>
          </motion.div>

          {/* 6. Chart Section */}
          {data && data.salesChartData.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="bg-white rounded-3xl p-5 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] border border-border/50"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-extrabold text-foreground tracking-wide uppercase">
                  Revenue Trend
                </h2>
                <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-1 rounded-md">
                  Last 7 Active Days
                </span>
              </div>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.salesChartData}
                    margin={{ top: 5, right: 0, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16A34A" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: "none",
                        boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
                      }}
                      formatter={(val: number) => [`₹${val}`, "Revenue"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#16A34A"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorRev)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

          {/* 7. Low Stock Alerts */}
          {filteredData && filteredData.lowStock.length > 0 && (
            <motion.div variants={itemVariants}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-extrabold text-foreground tracking-wide uppercase flex items-center gap-2">
                  <AlertTriangle size={16} className="text-[#F59E0B]" /> Low Stock Items
                </h2>
                <Link to="/products" className="text-xs font-bold text-primary">
                  View All
                </Link>
              </div>
              <div className="bg-white rounded-3xl p-2 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] border border-[#F59E0B]/20">
                {filteredData.lowStock.slice(0, 4).map((p: LowStockItem, i: number) => {
                  const isCritical = Number(p.stock_quantity) === 0;
                  return (
                    <div
                      key={p.id}
                      className={`flex justify-between items-center px-4 py-3.5 ${i !== 0 ? "border-t border-border/40" : ""}`}
                    >
                      <div className="font-semibold text-sm truncate pr-4 text-foreground">
                        {p.name}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div
                          className={`text-xs font-bold px-2.5 py-1 rounded-full ${isCritical ? "bg-[#EF4444]/10 text-[#EF4444]" : "bg-[#F59E0B]/10 text-[#F59E0B]"}`}
                        >
                          {p.stock_quantity} left
                        </div>
                        <Link
                          to="/purchases"
                          className="grid place-items-center w-7 h-7 rounded-full bg-muted text-muted-foreground hover:bg-primary hover:text-white transition-colors"
                        >
                          <ArrowUpRight size={14} />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* 8. Top Customers (Due) */}
          {filteredData && filteredData.topDue.length > 0 && (
            <motion.div variants={itemVariants}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-extrabold text-foreground tracking-wide uppercase">
                  Top Pending Dues
                </h2>
                <Link to="/khata" className="text-xs font-bold text-primary">
                  View All
                </Link>
              </div>
              <div className="bg-white rounded-3xl p-2 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] border border-border/50">
                {filteredData.topDue.map((r, i) => (
                  <Link
                    key={r.customer!.id}
                    to="/khata/$id"
                    params={{ id: r.customer!.id }}
                    className={`flex justify-between items-center px-3 py-3 hover:bg-muted/30 rounded-2xl transition-colors ${i !== 0 ? "border-t border-border/40" : ""}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-10 w-10 border border-border/50 shadow-sm">
                        <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-700 font-bold">
                          {r.customer!.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-foreground truncate">
                          {r.customer!.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-medium">
                          {r.customer!.mobile ?? "No number"}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-4">
                      <div className="text-sm font-extrabold text-[#EF4444]">
                        {formatINR(r.balance)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>
          )}

          {/* 9. Recent Transactions Timeline */}
          {filteredData && filteredData.recent.length > 0 && (
            <motion.div variants={itemVariants}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-extrabold text-foreground tracking-wide uppercase">
                  Recent Activity
                </h2>
              </div>
              <div className="bg-white rounded-3xl p-5 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] border border-border/50 relative">
                <div className="absolute left-[33px] top-8 bottom-8 w-px bg-border/80 z-0"></div>
                <div className="space-y-6 relative z-10">
                  {filteredData.recent.map((e) => {
                    const isCredit = Number(e.balance_impact) > 0;
                    return (
                      <Link
                        key={e.id}
                        to="/khata/$id"
                        params={{ id: e.customer_id }}
                        className="flex gap-4 group"
                      >
                        <div
                          className={`grid place-items-center w-8 h-8 rounded-full shrink-0 shadow-sm ring-4 ring-white ${isCredit ? "bg-[#EF4444] text-white" : "bg-[#16A34A] text-white"}`}
                        >
                          {isCredit ? (
                            <ArrowUpRight size={14} strokeWidth={3} />
                          ) : (
                            <ArrowDownRight size={14} strokeWidth={3} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <div className="flex justify-between items-start">
                            <div className="text-sm font-bold text-foreground truncate">
                              {e.customer?.name ?? "Unknown"}
                            </div>
                            <div
                              className={`text-sm font-extrabold ${isCredit ? "text-[#EF4444]" : "text-[#16A34A]"}`}
                            >
                              {isCredit ? "+" : "−"}
                              {formatINR(Number(e.amount))}
                            </div>
                          </div>
                          <div className="text-[12px] text-muted-foreground font-medium mt-0.5">
                            {isCredit ? "Credit Given" : "Payment Received"} ·{" "}
                            {formatDate(e.created_at)}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
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
