import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Download, TrendingUp, TrendingDown, IndianRupee, Users, ChevronRight, MessageCircle, Truck,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from "recharts";
import { sb, type Customer, type LedgerEntry } from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import { formatINR, formatDate, buildWhatsAppUrl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [
    { title: "Reports — Bharat Auto Parts" },
    { name: "description", content: "Outstanding dues, collections, and top-customer reports for your auto parts shop." },
  ] }),
  component: ReportsPage,
});

type Row = Customer & {
  credit: number;
  payment: number;
  balance: number;
  last_at: string | null;
};

function ReportsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [range, setRange] = useState<"30" | "90" | "365">("90");

  const { data, isLoading } = useQuery({
    queryKey: ["reports", profile?.shop_id, range],
    enabled: !!profile?.shop_id,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - parseInt(range));
      const [custRes, ledgerRes] = await Promise.all([
        sb.from("customers").select("*"),
        sb.from("ledger_entries").select("*"),
      ]);
      if (custRes.error) throw custRes.error;
      if (ledgerRes.error) throw ledgerRes.error;
      const customers = (custRes.data ?? []) as Customer[];
      const entries = (ledgerRes.data ?? []) as LedgerEntry[];

      const map = new Map<string, Row>();
      for (const c of customers)
        map.set(c.id, { ...c, credit: 0, payment: 0, balance: 0, last_at: null });
      for (const e of entries) {
        const r = map.get(e.customer_id);
        if (!r) continue;
        if (e.entry_type === "credit") r.credit += Number(e.amount);
        else r.payment += Number(e.amount);
        if (!r.last_at || e.created_at > r.last_at) r.last_at = e.created_at;
      }
      for (const r of map.values()) r.balance = r.credit - r.payment;

      const rows = Array.from(map.values());
      const outstanding = rows
        .filter((r) => r.balance > 0)
        .sort((a, b) => b.balance - a.balance);
      const advance = rows
        .filter((r) => r.balance < 0)
        .sort((a, b) => a.balance - b.balance);

      // monthly collection chart
      const months: { key: string; label: string; credit: number; payment: number }[] = [];
      const now = new Date();
      const monthsBack = range === "30" ? 2 : range === "90" ? 4 : 12;
      for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        months.push({
          key,
          label: d.toLocaleString("en-IN", { month: "short" }),
          credit: 0,
          payment: 0,
        });
      }
      for (const e of entries) {
        const key = e.entry_date.slice(0, 7);
        const m = months.find((x) => x.key === key);
        if (!m) continue;
        if (e.entry_type === "credit") m.credit += Number(e.amount);
        else m.payment += Number(e.amount);
      }

      const totals = rows.reduce(
        (a, r) => ({
          totalOutstanding: a.totalOutstanding + Math.max(r.balance, 0),
          totalAdvance: a.totalAdvance + Math.max(-r.balance, 0),
          customersInDebt: a.customersInDebt + (r.balance > 0 ? 1 : 0),
        }),
        { totalOutstanding: 0, totalAdvance: 0, customersInDebt: 0 },
      );
      const monthCredit = months.reduce((s, m) => s + m.credit, 0);
      const monthPayment = months.reduce((s, m) => s + m.payment, 0);

      return { rows, outstanding, advance, months, totals, monthCredit, monthPayment };
    },
  });

  const csvOutstanding = useMemo(() => {
    if (!data) return "";
    const header = ["Name", "Mobile", "Vehicle", "Credit", "Received", "Balance", "Last Activity"];
    const lines = [header.join(",")];
    for (const r of data.outstanding) {
      lines.push([
        csv(r.name),
        csv(r.mobile ?? ""),
        csv(r.vehicle_number ?? ""),
        r.credit.toFixed(2),
        r.payment.toFixed(2),
        r.balance.toFixed(2),
        r.last_at ? formatDate(r.last_at) : "—",
      ].join(","));
    }
    return lines.join("\n");
  }, [data]);

  function downloadCsv() {
    const blob = new Blob([csvOutstanding], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Outstanding_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as any)}
            className="bg-white/15 text-xs font-semibold px-3 py-1.5 rounded-full border-0 outline-none"
          >
            <option className="text-foreground" value="30">Last 30 days</option>
            <option className="text-foreground" value="90">Last 90 days</option>
            <option className="text-foreground" value="365">Last 12 months</option>
          </select>
        </div>
        <div className="mt-3">
          <div className="text-xs uppercase font-semibold opacity-80">Reports</div>
          <div className="text-2xl font-bold tracking-tight">Business Insights</div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-white/10 backdrop-blur rounded-2xl p-3">
            <div className="text-[10px] uppercase opacity-80 font-semibold inline-flex items-center gap-1">
              <TrendingUp size={11} /> Outstanding
            </div>
            <div className="mt-1 text-lg font-extrabold tracking-tight">
              {formatINR(data?.totals.totalOutstanding ?? 0)}
            </div>
            <div className="text-[10px] opacity-80">
              {data?.totals.customersInDebt ?? 0} customers
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-2xl p-3">
            <div className="text-[10px] uppercase opacity-80 font-semibold inline-flex items-center gap-1">
              <TrendingDown size={11} /> Advance
            </div>
            <div className="mt-1 text-lg font-extrabold tracking-tight">
              {formatINR(data?.totals.totalAdvance ?? 0)}
            </div>
            <div className="text-[10px] opacity-80">paid in advance</div>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4">
        <Tabs defaultValue="outstanding">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
            <TabsTrigger value="collections">Collections</TabsTrigger>
            <TabsTrigger value="top">Top Customers</TabsTrigger>
          </TabsList>

          <TabsContent value="outstanding" className="mt-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {data?.outstanding.length ?? 0} customers owe you
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={downloadCsv}
                disabled={!data || data.outstanding.length === 0}
              >
                <Download size={14} /> CSV
              </Button>
            </div>
            {isLoading && <div className="text-center text-sm text-muted-foreground py-6">Loading…</div>}
            {data?.outstanding.length === 0 && (
              <div className="rounded-2xl bg-card shadow-card p-10 text-center text-sm text-muted-foreground">
                🎉 No outstanding balances. All clear!
              </div>
            )}
            <div className="space-y-2">
              {data?.outstanding.map((r) => (
                <Link
                  key={r.id}
                  to="/customers/$id"
                  params={{ id: r.id }}
                  className="flex items-center gap-3 rounded-2xl bg-card shadow-card px-4 py-3"
                >
                  <div className="grid place-items-center w-9 h-9 rounded-full bg-destructive/10 text-destructive shrink-0">
                    <IndianRupee size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {r.mobile || r.vehicle_number || "—"} · Last:{" "}
                      {r.last_at ? formatDate(r.last_at) : "—"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-destructive">{formatINR(r.balance)}</div>
                  </div>
                  {r.mobile && (
                    <button
                      onClick={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        const msg = `*Bharat Auto Parts*\n\nNamaste ${r.name},\nAapka pending balance hai: *${formatINR(r.balance)}*\n\nKripya jald payment kar dein. Dhanyavaad!`;
                        const url = buildWhatsAppUrl(r.mobile, msg);
                        if (url) window.open(url, "_blank");
                      }}
                      className="grid place-items-center w-9 h-9 rounded-full bg-emerald-500/10 text-emerald-700"
                      aria-label="WhatsApp reminder"
                    >
                      <MessageCircle size={15} />
                    </button>
                  )}
                  <ChevronRight size={14} className="text-muted-foreground" />
                </Link>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="collections" className="mt-3 space-y-3">
            <div className="rounded-2xl bg-card shadow-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs uppercase font-semibold text-muted-foreground">
                    Monthly Credit vs Collection
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Credit: {formatINR(data?.monthCredit ?? 0)} · Collected: {formatINR(data?.monthPayment ?? 0)}
                  </div>
                </div>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.months ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      stroke="hsl(var(--muted-foreground))"
                      tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      formatter={(v: any) => formatINR(Number(v))}
                    />
                    <Bar dataKey="credit" fill="hsl(var(--destructive))" radius={[6, 6, 0, 0]} name="Credit" />
                    <Bar dataKey="payment" fill="#10b981" radius={[6, 6, 0, 0]} name="Collected" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl bg-card shadow-card divide-y divide-border overflow-hidden">
              {data?.months.slice().reverse().map((m) => (
                <div key={m.key} className="flex items-center justify-between px-4 py-3">
                  <div className="text-sm font-semibold">{m.label}</div>
                  <div className="text-right text-xs">
                    <span className="text-destructive font-semibold">+{formatINR(m.credit)}</span>
                    <span className="text-muted-foreground mx-2">/</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">−{formatINR(m.payment)}</span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="top" className="mt-3 space-y-2">
            <div className="text-xs text-muted-foreground mb-1">
              Top {Math.min(10, data?.rows.length ?? 0)} by total business
            </div>
            {data?.rows
              .slice()
              .sort((a, b) => (b.credit + b.payment) - (a.credit + a.payment))
              .slice(0, 10)
              .map((r, i) => (
                <Link
                  key={r.id}
                  to="/customers/$id"
                  params={{ id: r.id }}
                  className="flex items-center gap-3 rounded-2xl bg-card shadow-card px-4 py-3"
                >
                  <div className="grid place-items-center w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Business: {formatINR(r.credit + r.payment)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {r.balance > 0 ? (
                      <span className="text-xs font-bold text-destructive">Due {formatINR(r.balance)}</span>
                    ) : r.balance < 0 ? (
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Adv {formatINR(-r.balance)}</span>
                    ) : (
                      <Users size={14} className="text-muted-foreground" />
                    )}
                  </div>
                </Link>
              ))}
          </TabsContent>
        </Tabs>
      </div>

      <div className="h-10" />
    </div>
  );
}

function csv(s: string) {
  if (s.includes(",") || s.includes('"') || s.includes("\n"))
    return `"${s.replace(/"/g, '""')}"`;
  return s;
}
