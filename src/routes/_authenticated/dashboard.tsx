import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ShoppingCart, Package, Users, TrendingUp, IndianRupee, AlertTriangle, Sparkles, BookOpen, ArrowUpRight, ArrowDownRight, ChevronRight, Truck } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/lib/auth-context";
import { sb, type LedgerEntry, type Customer } from "@/lib/db";
import { formatINR, formatDate, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Bharat Auto Parts" },
      { name: "description", content: "Today's sales, outstanding Khata, low stock alerts, and recent activity for your auto parts shop." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { profile } = useAuth();
  const shopId = profile?.shop_id;

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", shopId],
    enabled: !!shopId,
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      const [todayInv, monthInv, lowStock, recent, custCount, prodCount, customers, ledger, monthPayments] = await Promise.all([
        sb.from("invoices").select("total,profit,due,paid").gte("created_at", startOfDay.toISOString()),
        sb.from("invoices").select("total,profit").gte("created_at", startOfMonth),
        sb.from("products")
          .select("id,name,stock_quantity,low_stock_threshold")
          .eq("is_active", true)
          .order("stock_quantity", { ascending: true })
          .limit(20),
        sb.from("ledger_entries")
          .select("id,customer_id,entry_type,amount,entry_date,note,created_at")
          .order("created_at", { ascending: false })
          .limit(6),
        sb.from("customers").select("id", { count: "exact", head: true }),
        sb.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
        sb.from("customers").select("id,name,mobile"),
        sb.from("ledger_entries").select("customer_id,entry_type,amount"),
        sb.from("ledger_entries")
          .select("amount")
          .eq("entry_type", "payment")
          .gte("entry_date", startOfMonth.slice(0, 10)),
      ]);

      const sum = (rows: any[] | null, k: string) =>
        (rows ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0);

      // Compute customer balances
      const balances = new Map<string, number>();
      for (const e of (ledger.data ?? []) as Pick<LedgerEntry, "customer_id" | "entry_type" | "amount">[]) {
        const sign = e.entry_type === "credit" ? 1 : -1;
        balances.set(e.customer_id, (balances.get(e.customer_id) ?? 0) + sign * Number(e.amount));
      }
      let totalOutstanding = 0;
      for (const v of balances.values()) if (v > 0) totalOutstanding += v;

      const custMap = new Map<string, Customer>();
      for (const c of ((customers.data ?? []) as Customer[])) custMap.set(c.id, c);

      const topDue = Array.from(balances.entries())
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cid, v]) => ({ customer: custMap.get(cid), balance: v }))
        .filter((r) => r.customer);

      return {
        todaySales: sum(todayInv.data, "total"),
        todayProfit: sum(todayInv.data, "profit"),
        todayCount: todayInv.data?.length ?? 0,
        monthSales: sum(monthInv.data, "total"),
        monthCollection: sum(monthPayments.data, "amount"),
        totalOutstanding,
        lowStock: (lowStock.data ?? []).filter(
          (p: any) => Number(p.stock_quantity) <= Number(p.low_stock_threshold ?? 5),
        ),
        recent: (recent.data ?? []).map((e: any) => ({
          ...e,
          customer: custMap.get(e.customer_id),
        })),
        topDue,
        custCount: custCount.count ?? 0,
        prodCount: prodCount.count ?? 0,
      };
    },
  });

  return (
    <div>
      <ScreenHeader
        title="Dashboard"
        subtitle={profile?.full_name ? `Hi, ${profile.full_name.split(" ")[0]} · ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}` : new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        showLogout
      />

      {/* Khata hero cards */}
      <div className="-mt-3 px-4 grid grid-cols-2 gap-3">
        <Link
          to="/khata"
          className="rounded-2xl p-4 shadow-card bg-destructive/10 border border-destructive/20 block"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
            <TrendingUp size={14} /> Outstanding
          </div>
          <div className="mt-1.5 text-xl font-bold text-destructive tracking-tight">
            {formatINR(data?.totalOutstanding ?? 0)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">From customers</div>
        </Link>
        <Link
          to="/khata"
          className="rounded-2xl p-4 shadow-card bg-emerald-500/10 border border-emerald-500/20 block"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <IndianRupee size={14} /> Collected this month
          </div>
          <div className="mt-1.5 text-xl font-bold text-emerald-700 dark:text-emerald-400 tracking-tight">
            {formatINR(data?.monthCollection ?? 0)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Payments received</div>
        </Link>
      </div>

      {/* KPI strip */}
      <div className="px-4 mt-3 grid grid-cols-2 gap-3">
        <KpiCard
          icon={<IndianRupee size={18} />}
          label="Today's sales"
          value={formatINR(data?.todaySales ?? 0)}
          accent
        />
        <KpiCard
          icon={<TrendingUp size={18} />}
          label="Today's profit"
          value={formatINR(data?.todayProfit ?? 0)}
        />
        <KpiCard
          icon={<ShoppingCart size={18} />}
          label="Bills today"
          value={String(data?.todayCount ?? 0)}
        />
        <KpiCard
          icon={<Users size={18} />}
          label="Customers"
          value={String(data?.custCount ?? 0)}
        />
      </div>

      {/* Quick actions */}
      <div className="px-4 mt-5 grid grid-cols-2 gap-3">
        <QuickAction to="/billing" label="New bill" icon={<ShoppingCart size={20} />} primary />
        <QuickAction to="/purchases" label="Stock in" icon={<Truck size={20} />} />
        <QuickAction to="/khata" label="Khata book" icon={<BookOpen size={20} />} />
        <QuickAction to="/products" label="Stock" icon={<Package size={20} />} />
      </div>

      {/* Top dues */}
      {data && data.topDue.length > 0 && (
        <section className="px-4 mt-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Top pending customers
            </h2>
            <Link to="/khata" className="text-xs font-semibold text-primary inline-flex items-center">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="rounded-2xl bg-card shadow-card divide-y divide-border overflow-hidden">
            {data.topDue.map((r) => (
              <Link
                key={r.customer!.id}
                to="/customers/$id"
                params={{ id: r.customer!.id }}
                className="flex justify-between items-center px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{r.customer!.name}</div>
                  <div className="text-[11px] text-muted-foreground">{r.customer!.mobile ?? "—"}</div>
                </div>
                <div className="text-sm font-bold text-destructive">{formatINR(r.balance)}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Low stock */}
      {data && data.lowStock.length > 0 && (
        <section className="px-4 mt-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-warning" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Low stock</h2>
          </div>
          <div className="rounded-2xl bg-card shadow-card divide-y divide-border">
            {data.lowStock.slice(0, 5).map((p: any) => (
              <div key={p.id} className="flex justify-between items-center px-4 py-3">
                <span className="font-medium text-sm">{p.name}</span>
                <span className="text-sm font-bold text-destructive">
                  {p.stock_quantity} left
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent ledger transactions */}
      <section className="px-4 mt-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-2">
          Recent transactions
        </h2>
        <div className="rounded-2xl bg-card shadow-card divide-y divide-border overflow-hidden">
          {isLoading && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</div>
          )}
          {!isLoading && data?.recent.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No transactions yet. Go to Khata →
            </div>
          )}
          {data?.recent.map((e: any) => {
            const isCredit = e.entry_type === "credit";
            return (
              <Link
                key={e.id}
                to="/customers/$id"
                params={{ id: e.customer_id }}
                className="flex justify-between items-center px-4 py-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`grid place-items-center w-8 h-8 rounded-lg shrink-0 ${
                    isCredit ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  }`}>
                    {isCredit ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {e.customer?.name ?? "Unknown"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {isCredit ? "Credit" : "Payment"} · {formatDate(e.entry_date)}
                    </div>
                  </div>
                </div>
                <div className={`text-sm font-bold ${
                  isCredit ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"
                }`}>
                  {isCredit ? "+" : "−"}{formatINR(Number(e.amount))}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="h-6" />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-4 shadow-card ${
        accent ? "gradient-amber text-accent-foreground" : "bg-card text-foreground"
      }`}
    >
      <div className="flex items-center gap-1.5 opacity-80 text-xs font-medium">
        {icon} {label}
      </div>
      <div className="mt-1.5 text-xl font-bold tracking-tight">{value}</div>
    </motion.div>
  );
}

function QuickAction({
  to,
  label,
  icon,
  primary,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-card font-semibold text-sm ${
        primary ? "gradient-brand text-primary-foreground" : "bg-card text-foreground"
      }`}
    >
      <span
        className={`grid place-items-center w-10 h-10 rounded-xl ${
          primary ? "bg-white/15" : "bg-secondary"
        }`}
      >
        {icon}
      </span>
      {label}
    </Link>
  );
}
