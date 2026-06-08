import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ShoppingCart, Package, Users, TrendingUp, IndianRupee, AlertTriangle, Sparkles } from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/lib/auth-context";
import { sb } from "@/lib/db";
import { formatINR, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
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

      const [todayInv, monthInv, lowStock, recent, custCount, prodCount] = await Promise.all([
        sb.from("invoices").select("total,profit,due,paid").gte("created_at", startOfDay.toISOString()),
        sb.from("invoices").select("total,profit").gte(
          "created_at",
          new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
        ),
        sb.from("products")
          .select("id,name,stock_quantity,low_stock_threshold")
          .eq("is_active", true)
          .order("stock_quantity", { ascending: true })
          .limit(20),
        sb.from("invoices")
          .select("id,invoice_number,customer_name,total,due,created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        sb.from("customers").select("id", { count: "exact", head: true }),
        sb.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
      ]);

      const sum = (rows: any[] | null, k: string) =>
        (rows ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0);

      return {
        todaySales: sum(todayInv.data, "total"),
        todayProfit: sum(todayInv.data, "profit"),
        todayCount: todayInv.data?.length ?? 0,
        monthSales: sum(monthInv.data, "total"),
        monthProfit: sum(monthInv.data, "profit"),
        totalDue: sum(todayInv.data, "due"),
        lowStock: (lowStock.data ?? []).filter(
          (p: any) => Number(p.stock_quantity) <= Number(p.low_stock_threshold ?? 5),
        ),
        recent: recent.data ?? [],
        custCount: custCount.count ?? 0,
        prodCount: prodCount.count ?? 0,
      };
    },
  });

  return (
    <div>
      <ScreenHeader
        title={profile?.full_name ? `Hi, ${profile.full_name.split(" ")[0]}` : "Bharat Auto Parts"}
        subtitle={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        showLogout
      />

      {/* KPI cards */}
      <div className="-mt-3 px-4 grid grid-cols-2 gap-3">
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
          icon={<IndianRupee size={18} />}
          label="This month"
          value={formatINR(data?.monthSales ?? 0)}
        />
      </div>

      {/* Quick actions */}
      <div className="px-4 mt-5 grid grid-cols-2 gap-3">
        <QuickAction to="/billing" label="New bill" icon={<ShoppingCart size={20} />} primary />
        <QuickAction to="/products" label="Add product" icon={<Package size={20} />} />
        <QuickAction to="/customers" label="Add customer" icon={<Users size={20} />} />
        <QuickAction to="/assistant" label="Ask AI" icon={<Sparkles size={20} />} />
      </div>

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

      {/* Recent bills */}
      <section className="px-4 mt-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-2">
          Recent bills
        </h2>
        <div className="rounded-2xl bg-card shadow-card divide-y divide-border overflow-hidden">
          {isLoading && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</div>
          )}
          {!isLoading && data?.recent.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No bills yet. Create your first bill →
            </div>
          )}
          {data?.recent.map((inv: any) => (
            <div key={inv.id} className="flex justify-between items-center px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">
                  {inv.customer_name || "Walk-in customer"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {inv.invoice_number} · {formatDateTime(inv.created_at)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">{formatINR(Number(inv.total))}</div>
                {Number(inv.due) > 0 && (
                  <div className="text-[11px] font-semibold text-destructive">
                    Due {formatINR(Number(inv.due))}
                  </div>
                )}
              </div>
            </div>
          ))}
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
