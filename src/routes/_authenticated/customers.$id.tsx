import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Phone,
  MessageCircle,
  Car,
  MapPin,
  Calendar,
  FileText,
  BookOpen,
  Pencil,
  Trash2,
  Receipt,
  IndianRupee,
  ShoppingBag,
  ExternalLink,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Plus,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { sb, type Customer, type Invoice, type LedgerTransaction } from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import { formatINR, formatDate, formatDateTime, buildWhatsAppUrl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CustomerSheet } from "@/components/CustomerSheet";
import { CustomerService } from "@/lib/domain/CustomerService";
import { SoundManager } from "@/lib/sounds";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/customers/$id")({
  head: () => ({
    meta: [
      { title: "Customer Profile — Bharat Auto Parts" },
      {
        name: "description",
        content:
          "Customer profile details, contact information, vehicle details, purchase history, and invoices.",
      },
    ],
  }),
  component: CustomerProfilePage,
});

function CustomerProfilePage() {
  const { id } = Route.useParams();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [customerSheetOpen, setCustomerSheetOpen] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedVehicle, setCopiedVehicle] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Fetch Customer Record
  const { data: customer, isLoading: isCustomerLoading } = useQuery({
    queryKey: ["customer", id, profile?.shop_id],
    enabled: !!id && !!profile?.shop_id,
    queryFn: async () => {
      if (!profile?.shop_id) throw new Error("Shop ID missing");
      return CustomerService.getCustomerById(id, profile.shop_id);
    },
  });

  // Fetch Customer Invoices
  const { data: invoices, isLoading: isInvoicesLoading } = useQuery({
    queryKey: ["customer-invoices", id, profile?.shop_id],
    enabled: !!id && !!profile?.shop_id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("invoices")
        .select("*")
        .eq("customer_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });

  // Fetch Recent Khata Transactions Preview
  const { data: recentLedger, isLoading: isLedgerLoading } = useQuery({
    queryKey: ["customer-ledger-preview", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("ledger_transactions")
        .select("*")
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as LedgerTransaction[];
    },
  });

  // Invoice Items for Selected Invoice Modal
  const { data: selectedInvoiceItems } = useQuery({
    queryKey: ["invoice-items", selectedInvoice?.id],
    enabled: !!selectedInvoice?.id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", selectedInvoice!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Performance calculations
  const invoiceStats = useMemo(() => {
    if (!invoices || invoices.length === 0) {
      return { totalPurchases: 0, totalBills: 0, avgBill: 0, lastBillDate: null };
    }
    const totalPurchases = invoices.reduce((s, i) => s + Number(i.total || 0), 0);
    const totalBills = invoices.length;
    const avgBill = totalBills > 0 ? totalPurchases / totalBills : 0;
    const lastBillDate = invoices[0]?.created_at || null;

    return {
      totalPurchases,
      totalBills,
      avgBill,
      lastBillDate,
    };
  }, [invoices]);

  const copyToClipboard = (text: string, type: "phone" | "vehicle") => {
    navigator.clipboard.writeText(text);
    SoundManager.play("notification");
    if (type === "phone") {
      setCopiedPhone(true);
      toast.success("Phone number copied");
      setTimeout(() => setCopiedPhone(false), 2000);
    } else {
      setCopiedVehicle(true);
      toast.success("Vehicle number copied");
      setTimeout(() => setCopiedVehicle(false), 2000);
    }
  };

  const due = Number(customer?.balance_cache ?? 0);
  const waUrl = customer?.mobile
    ? buildWhatsAppUrl(
        customer.mobile,
        `Namaste ${customer.name}, greetings from Bharat Auto Parts!`,
      )
    : null;

  if (isCustomerLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-5 space-y-4">
        <div className="h-10 bg-muted rounded-xl w-1/3 animate-pulse" />
        <div className="h-44 bg-muted rounded-3xl animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 bg-muted rounded-2xl animate-pulse" />
          <div className="h-24 bg-muted rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 grid place-items-center mb-4">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-lg font-bold text-foreground">Customer Not Found</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          This customer profile might have been deleted or does not exist.
        </p>
        <Button
          onClick={() => navigate({ to: "/customers" })}
          className="mt-5 rounded-xl font-bold"
        >
          <ArrowLeft size={16} className="mr-1.5" /> Back to Directory
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 font-sans">
      {/* 1. Top Header & Hero Card */}
      <div className="bg-gradient-to-br from-[#0B3D91] to-[#1258CD] rounded-b-3xl px-5 pt-8 pb-12 shadow-lg relative text-white">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between pb-5">
          <Link
            to="/customers"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors active:scale-95"
          >
            <ArrowLeft size={16} />
            <span>Customers</span>
          </Link>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCustomerSheetOpen(true)}
              size="sm"
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl h-9 px-3 text-xs font-bold active:scale-95 transition-all"
            >
              <Pencil size={13} className="mr-1" /> Edit Profile
            </Button>
          </div>
        </div>

        {/* Profile Card Summary */}
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16 rounded-2xl border-2 border-white/30 shadow-md shrink-0 bg-white/10">
            <AvatarFallback className="bg-white/20 text-white font-extrabold text-2xl">
              {customer.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black tracking-tight text-white truncate">
              {customer.name}
            </h1>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-white/80 font-medium">
              {customer.mobile ? (
                <button
                  onClick={() => copyToClipboard(customer.mobile!, "phone")}
                  className="flex items-center gap-1 hover:text-white transition-colors group"
                >
                  <Phone size={12} className="text-white/70" />
                  <span className="font-semibold">{customer.mobile}</span>
                  {copiedPhone ? (
                    <Check size={12} className="text-emerald-300 ml-0.5" />
                  ) : (
                    <Copy
                      size={11}
                      className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
                    />
                  )}
                </button>
              ) : (
                <span className="italic text-white/60">No mobile number</span>
              )}

              <span className="flex items-center gap-1 text-white/70">
                <Calendar size={12} />
                <span>Since {formatDate(customer.created_at)}</span>
              </span>
            </div>

            {/* Vehicle Number Badge */}
            {customer.vehicle_number && (
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(customer.vehicle_number!, "vehicle")}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-400/20 text-amber-200 border border-amber-300/30 text-xs font-mono font-bold hover:bg-amber-400/30 transition-colors"
                >
                  <Car size={13} className="text-amber-300" />
                  <span>{customer.vehicle_number}</span>
                  {copiedVehicle ? (
                    <Check size={11} className="text-emerald-300 ml-1" />
                  ) : (
                    <Copy size={11} className="opacity-70 ml-1" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Floating Quick Actions Row */}
      <div className="px-5 -mt-6 relative z-30">
        <div className="bg-white rounded-2xl p-2.5 border border-border/70 shadow-[0_8px_30px_rgb(0,0,0,0.08)] grid grid-cols-4 gap-1.5 text-center">
          {customer.mobile ? (
            <a
              href={`tel:${customer.mobile}`}
              className="flex flex-col items-center justify-center p-2 rounded-xl hover:bg-muted/60 text-foreground transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 grid place-items-center group-hover:scale-105 transition-transform">
                <Phone size={18} />
              </div>
              <span className="text-[11px] font-bold mt-1">Call</span>
            </a>
          ) : (
            <div className="flex flex-col items-center justify-center p-2 opacity-40">
              <div className="w-10 h-10 rounded-xl bg-muted text-muted-foreground grid place-items-center">
                <Phone size={18} />
              </div>
              <span className="text-[11px] font-bold mt-1">Call</span>
            </div>
          )}

          {waUrl ? (
            <a
              href={waUrl}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center justify-center p-2 rounded-xl hover:bg-muted/60 text-foreground transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center group-hover:scale-105 transition-transform">
                <MessageCircle size={18} />
              </div>
              <span className="text-[11px] font-bold mt-1">WhatsApp</span>
            </a>
          ) : (
            <div className="flex flex-col items-center justify-center p-2 opacity-40">
              <div className="w-10 h-10 rounded-xl bg-muted text-muted-foreground grid place-items-center">
                <MessageCircle size={18} />
              </div>
              <span className="text-[11px] font-bold mt-1">WhatsApp</span>
            </div>
          )}

          <Link
            to="/billing"
            search={{ customerId: customer.id }}
            className="flex flex-col items-center justify-center p-2 rounded-xl hover:bg-muted/60 text-foreground transition-colors group"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 grid place-items-center group-hover:scale-105 transition-transform">
              <FileText size={18} />
            </div>
            <span className="text-[11px] font-bold mt-1">New Bill</span>
          </Link>

          <Link
            to="/khata/$id"
            params={{ id: customer.id }}
            className="flex flex-col items-center justify-center p-2 rounded-xl hover:bg-muted/60 text-foreground transition-colors group"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 grid place-items-center group-hover:scale-105 transition-transform">
              <BookOpen size={18} />
            </div>
            <span className="text-[11px] font-bold mt-1">Khata</span>
          </Link>
        </div>
      </div>

      {/* 3. Address & Notes Information Card */}
      {(customer.address || customer.notes) && (
        <div className="px-5 mt-4">
          <div className="bg-white rounded-2xl p-4 border border-border/60 shadow-sm space-y-2.5">
            {customer.address && (
              <div className="flex items-start gap-2.5 text-xs text-foreground">
                <MapPin size={15} className="text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-muted-foreground uppercase text-[10px] block">
                    Address / Garage
                  </span>
                  <span className="font-medium">{customer.address}</span>
                </div>
              </div>
            )}

            {customer.notes && (
              <div className="flex items-start gap-2.5 text-xs text-foreground pt-2 border-t border-border/40">
                <Clock size={15} className="text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-muted-foreground uppercase text-[10px] block">
                    Notes & Remarks
                  </span>
                  <span className="font-medium text-muted-foreground">{customer.notes}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Lifetime Financial & Purchase Overview */}
      <div className="px-5 mt-4 space-y-3">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground px-1">
          Purchase & Account Summary
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-border/60 shadow-sm">
            <div className="text-[11px] font-bold text-muted-foreground uppercase">
              Lifetime Sales
            </div>
            <div className="text-lg font-extrabold text-foreground mt-1">
              {formatINR(invoiceStats.totalPurchases)}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">
              {invoiceStats.totalBills} total{" "}
              {invoiceStats.totalBills === 1 ? "invoice" : "invoices"}
            </div>
          </div>

          <Link
            to="/khata/$id"
            params={{ id: customer.id }}
            className={`rounded-2xl p-4 border shadow-sm transition-transform active:scale-[0.98] ${
              due > 0
                ? "bg-rose-50/70 border-rose-200 text-rose-900"
                : due < 0
                  ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                  : "bg-white border-border/60 text-foreground"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase opacity-80">Khata Balance</span>
              <ChevronRight size={14} className="opacity-70" />
            </div>
            <div
              className={`text-lg font-extrabold mt-1 ${
                due > 0 ? "text-rose-600" : due < 0 ? "text-emerald-600" : "text-foreground"
              }`}
            >
              {due > 0
                ? `${formatINR(due)} Due`
                : due < 0
                  ? `${formatINR(Math.abs(due))} Adv`
                  : "₹0 Cleared"}
            </div>
            <div className="text-[10px] font-medium opacity-80 mt-0.5 flex items-center gap-1">
              <BookOpen size={10} /> View Ledger Timeline
            </div>
          </Link>
        </div>
      </div>

      {/* 5. Invoices & Billing History Section */}
      <div className="px-5 mt-6 space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
              Billing History
            </h2>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {invoices?.length ?? 0}
            </span>
          </div>

          <Link
            to="/billing"
            search={{ customerId: customer.id }}
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
          >
            <Plus size={13} />
            <span>Create Bill</span>
          </Link>
        </div>

        {isInvoicesLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 bg-white rounded-2xl animate-pulse border border-border/50"
              />
            ))}
          </div>
        ) : !invoices || invoices.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-muted grid place-items-center text-muted-foreground mx-auto">
              <Receipt size={22} />
            </div>
            <div className="text-sm font-bold text-foreground">No invoices generated yet</div>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Create the first invoice for {customer.name} to track auto parts sales and payments.
            </p>
            <Button asChild size="sm" className="rounded-xl mt-2 font-bold bg-primary text-white">
              <Link to="/billing" search={{ customerId: customer.id }}>
                <Plus size={14} className="mr-1" /> New Bill for {customer.name.split(" ")[0]}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {invoices.map((inv) => {
              const isPaid = inv.payment_status === "paid";
              const isPartial = inv.payment_status === "partial";
              const isUnpaid = inv.payment_status === "unpaid";

              return (
                <div
                  key={inv.id}
                  onClick={() => setSelectedInvoice(inv)}
                  className="bg-white hover:bg-slate-50 rounded-2xl p-3.5 border border-border/60 shadow-sm transition-all cursor-pointer flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${
                        isPaid
                          ? "bg-emerald-50 text-emerald-600"
                          : isPartial
                            ? "bg-amber-50 text-amber-600"
                            : "bg-rose-50 text-rose-600"
                      }`}
                    >
                      <Receipt size={18} />
                    </div>

                    <div className="min-w-0">
                      <div className="text-sm font-bold text-foreground truncate flex items-center gap-2">
                        <span>{inv.invoice_number}</span>
                      </div>
                      <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 mt-0.5">
                        <Clock size={11} />
                        <span>{formatDate(inv.created_at)}</span>
                        <span>·</span>
                        <span className="capitalize">{inv.payment_method || "cash"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 flex items-center gap-2.5">
                    <div>
                      <div className="text-sm font-extrabold text-foreground">
                        {formatINR(Number(inv.total))}
                      </div>
                      <div className="mt-0.5">
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                            isPaid
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-200/50"
                              : isPartial
                                ? "bg-amber-50 text-amber-600 border border-amber-200/50"
                                : "bg-rose-50 text-rose-600 border border-rose-200/50"
                          }`}
                        >
                          {inv.payment_status}
                        </span>
                      </div>
                    </div>

                    <ChevronRight
                      size={16}
                      className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-transform"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. Recent Khata Entries Preview Card */}
      {recentLedger && recentLedger.length > 0 && (
        <div className="px-5 mt-6 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
              Recent Ledger Activity
            </h2>
            <Link
              to="/khata/$id"
              params={{ id: customer.id }}
              className="text-xs font-bold text-amber-700 hover:underline flex items-center gap-1"
            >
              <span>Full Khata Timeline</span>
              <ChevronRight size={13} />
            </Link>
          </div>

          <div className="bg-white rounded-2xl p-3.5 border border-border/60 shadow-sm divide-y divide-border/40">
            {recentLedger.map((tx) => {
              const isCredit = Number(tx.balance_impact) > 0;
              return (
                <div
                  key={tx.id}
                  className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-full grid place-items-center text-xs font-bold ${
                        isCredit ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {isCredit ? "+" : "−"}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">
                        {isCredit ? "Credit Given" : "Payment Received"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatDate(tx.created_at)} {tx.note ? `· ${tx.note}` : ""}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`text-xs font-extrabold ${
                      isCredit ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    {isCredit ? "+" : "−"}
                    {formatINR(Number(tx.amount))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invoice Details Dialog */}
      <Dialog
        open={!!selectedInvoice}
        onOpenChange={(open) => {
          if (!open) setSelectedInvoice(null);
        }}
      >
        <DialogContent className="max-w-md rounded-3xl p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center justify-between">
              <span>Invoice {selectedInvoice?.invoice_number}</span>
              <span
                className={`text-xs font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                  selectedInvoice?.payment_status === "paid"
                    ? "bg-emerald-100 text-emerald-700"
                    : selectedInvoice?.payment_status === "partial"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-rose-100 text-rose-700"
                }`}
              >
                {selectedInvoice?.payment_status}
              </span>
            </DialogTitle>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4 text-xs mt-2">
              <div className="flex justify-between items-center py-2 border-b border-border/50 text-muted-foreground">
                <span>Date & Time</span>
                <span className="font-semibold text-foreground">
                  {formatDateTime(selectedInvoice.created_at)}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 text-muted-foreground">
                <span>Payment Method</span>
                <span className="font-semibold text-foreground capitalize">
                  {selectedInvoice.payment_method || "cash"}
                </span>
              </div>

              {/* Items List */}
              <div className="space-y-2 pt-2">
                <div className="font-bold text-foreground uppercase tracking-wider text-[10px]">
                  Billed Items
                </div>
                {selectedInvoiceItems && selectedInvoiceItems.length > 0 ? (
                  <div className="bg-muted/40 rounded-xl p-3 space-y-2">
                    {selectedInvoiceItems.map((item: Record<string, unknown>) => (
                      <div
                        key={String(item.id)}
                        className="flex justify-between items-center text-xs"
                      >
                        <div>
                          <div className="font-semibold text-foreground">
                            {String(item.product_name)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Qty: {String(item.quantity)} × {formatINR(Number(item.unit_price))}
                          </div>
                        </div>
                        <div className="font-bold text-foreground">
                          {formatINR(Number(item.total_price))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted-foreground text-xs italic py-2">
                    Line items unavailable
                  </div>
                )}
              </div>

              {/* Financial Totals */}
              <div className="space-y-1.5 pt-3 border-t border-border/60">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>
                    {formatINR(Number(selectedInvoice.subtotal || selectedInvoice.total))}
                  </span>
                </div>
                {Number(selectedInvoice.discount || 0) > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span>Discount</span>
                    <span>−{formatINR(Number(selectedInvoice.discount))}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black text-foreground pt-1 border-t border-border/40">
                  <span>Total Amount</span>
                  <span className="text-primary">{formatINR(Number(selectedInvoice.total))}</span>
                </div>
                <div className="flex justify-between text-muted-foreground pt-1">
                  <span>Paid Amount</span>
                  <span className="text-emerald-600 font-bold">
                    {formatINR(Number(selectedInvoice.paid || 0))}
                  </span>
                </div>
                {Number(selectedInvoice.due || 0) > 0 && (
                  <div className="flex justify-between text-rose-600 font-bold">
                    <span>Remaining Due</span>
                    <span>{formatINR(Number(selectedInvoice.due))}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Customer Sheet for Editing */}
      <CustomerSheet
        open={customerSheetOpen}
        onOpenChange={setCustomerSheetOpen}
        initial={customer}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["customer", id] });
          qc.invalidateQueries({ queryKey: ["customers"] });
          qc.invalidateQueries({ queryKey: ["khata"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />
    </div>
  );
}
