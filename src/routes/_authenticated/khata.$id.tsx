import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  MessageCircle,
  Phone,
  FileText,
  Search,
  Trash2,
  Calendar,
  Check,
  MoreHorizontal,
  Download,
  Share2,
  ChevronRight,
  User,
  Car,
  MapPin,
  Clock,
  Pencil,
  ChevronDown,
  ExternalLink,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  sb,
  type Customer,
  type LedgerEntry,
  type Invoice,
  type LedgerTransaction,
} from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import { formatINR, formatDate, buildWhatsAppUrl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EntrySheet } from "./khata.index";
import { CustomerSheet } from "@/components/CustomerSheet";
import { downloadStatement, statementPdfBlob } from "@/lib/statement";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { CustomerService } from "@/lib/domain/CustomerService";
import { LedgerService } from "@/lib/domain/LedgerService";
import { SoundManager } from "@/lib/sounds";
import { useOnlineStatus } from "@/hooks/use-online-status";

export const Route = createFileRoute("/_authenticated/khata/$id")({
  head: () => ({
    meta: [
      { title: "Customer Profile — Khata" },
      {
        name: "description",
        content:
          "Premium customer profile with running Khata balance, transaction history, and reminder actions.",
      },
    ],
  }),
  component: CustomerProfilePage,
});

function timeLabel(iso: string) {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
    const time = d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date}, ${time}`;
  } catch {
    return "";
  }
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
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
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
  const { profile, role } = useAuth();
  const canEdit = role === "owner" || role === "manager";
  const qc = useQueryClient();
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryType, setEntryType] = useState<"credit" | "payment">("credit");
  const [moreOpen, setMoreOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<
    (LedgerEntry & { transaction_type?: string; reference_id?: string | null }) | null
  >(null);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [editEntryOpen, setEditEntryOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["customer-ledger", id, profile?.shop_id],
    enabled: !!profile?.shop_id,
    queryFn: async () => {
      const [customer, ledgerRes, invRes] = await Promise.all([
        CustomerService.getCustomerById(id, profile!.shop_id),
        sb
          .from("ledger_transactions")
          .select("*")
          .eq("customer_id", id)
          .order("created_at", { ascending: true }),
        sb
          .from("invoices")
          .select("*")
          .eq("customer_id", id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (ledgerRes.error) throw ledgerRes.error;
      if (invRes.error) throw invRes.error;

      const rawTransactions = (ledgerRes.data ?? []) as LedgerTransaction[];
      const invoices = (invRes.data ?? []) as Invoice[];

      const entries = rawTransactions.map((tx) => ({
        id: tx.id,
        shop_id: tx.shop_id,
        customer_id: tx.customer_id,
        entry_type: tx.balance_impact > 0 ? "credit" : "payment",
        amount: tx.amount,
        entry_date: tx.created_at,
        note: tx.note,
        payment_method: tx.payment_method || null,
        receipt_url: tx.receipt_url,
        transaction_type: tx.transaction_type,
        reference_id: tx.reference_id,
        created_by: tx.created_by || null,
        created_at: tx.created_at,
        updated_at: tx.updated_at || tx.created_at,
      })) as (LedgerEntry & { transaction_type?: string; reference_id?: string | null })[];

      const credit_total = entries
        .filter((e) => e.entry_type === "credit")
        .reduce((s, e) => s + Number(e.amount), 0);
      const payment_total = entries
        .filter((e) => e.entry_type === "payment")
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
    // Reverse so latest is on top
    return groups.reverse().map((g) => ({ ...g, items: g.items.reverse() }));
  }, [data]);

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!data?.customer) {
    return (
      <div className="p-8 text-center">
        <div className="text-sm text-muted-foreground mb-3">Customer not found</div>
        <Button onClick={() => navigate({ to: "/khata" })} variant="outline">
          Go to Khata
        </Button>
      </div>
    );
  }
  const c = data.customer;
  const balance = data.balance;

  function sendReminder() {
    if (!c.mobile || balance <= 0) return;
    const dueDate = "Immediate";
    const msg =
      `*Bharat Auto Parts*\n\n` +
      `Hello ${c.name},\n\n` +
      `Due: ${formatINR(balance)}\n` +
      `Due Date: ${dueDate}\n\n` +
      `Kindly clear your pending amount at your convenience.\n\n` +
      `Thank you for visiting us! \n` +
      `Have a safe ride.`;
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
      const file = new File([blob], `Statement_${c.name.replace(/\s+/g, "_")}.pdf`, {
        type: "application/pdf",
      });
      const nav = navigator as unknown as {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
      };
      if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
        await nav.share({
          files: [file],
          title: `Statement — ${c.name}`,
          text: `Bharat Auto Parts statement for ${c.name}. Outstanding: ${formatINR(Math.max(balance, 0))}`,
        });
      } else {
        handleDownloadStatement();
        toast.message("Sharing not supported — PDF downloaded instead");
      }
    } catch (e) {
      if (e instanceof Error) {
        if (e.name !== "AbortError") {
          console.error(e);
          toast.error("Something went wrong. Please try again.");
        }
      } else {
        console.error(e);
        toast.error("Something went wrong. Please try again.");
      }
    }
  }

  async function handleDeleteEntry() {
    if (!profile?.shop_id || !selectedEntry) return;

    try {
      setIsDeleting(true);
      await LedgerService.deleteManualEntry(selectedEntry.id, profile.shop_id, id);

      // Await invalidations so the UI updates *before* we dismiss the modal and loading state
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["customer-ledger", id, profile.shop_id] }),
        qc.invalidateQueries({ queryKey: ["khata"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["reports"] }),
      ]);

      SoundManager.play("completion");
      toast.success("Entry deleted successfully");
      setDeleteConfirmOpen(false);
      setActionSheetOpen(false);
      setSelectedEntry(null);
    } catch (e: unknown) {
      console.error(e);
      SoundManager.play("error");
      toast.error((e as Error).message || "Failed to delete entry");
    } finally {
      setIsDeleting(false);
    }
  }

  const initial = c.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-[#eef2ef] flex flex-col pb-[200px]">
      {/* Premium Profile Section */}
      <div className="bg-white px-4 pb-6 pt-5 rounded-b-3xl shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] border-b border-border/50 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/khata" })}
            className="grid place-items-center w-10 h-10 -ml-2 rounded-full hover:bg-muted/80 text-foreground shrink-0 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="grid place-items-center w-14 h-14 rounded-full bg-emerald-600 text-white text-[22px] font-bold shadow-md shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0 ml-1">
            <h1 className="text-[19px] font-bold truncate text-foreground leading-tight">
              {c.name}
            </h1>
            <div className="text-[13px] font-semibold mt-0.5">
              {balance > 0 ? (
                <span className="text-destructive">Due: {formatINR(balance)}</span>
              ) : balance < 0 ? (
                <span className="text-emerald-600">Advance: {formatINR(-balance)}</span>
              ) : (
                <span className="text-muted-foreground">All Clear</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setMoreOpen(true)}
              className="grid place-items-center w-9 h-9 rounded-full bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <MoreHorizontal size={18} />
            </button>
            <button
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="grid place-items-center w-9 h-9 rounded-full bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown
                size={18}
                className={cn("transition-transform duration-300", detailsOpen && "rotate-180")}
              />
            </button>
          </div>
        </div>

        <div
          className={cn(
            "grid transition-all duration-300 ease-in-out",
            detailsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="pt-5">
              {/* Quick Contacts */}
              <div className="flex gap-3 mt-0">
                <Button
                  onClick={callCustomer}
                  className="flex-1 rounded-xl shadow-sm"
                  variant="outline"
                >
                  <Phone size={16} className="mr-2" /> Call
                </Button>
                <Button
                  onClick={sendReminder}
                  className="flex-1 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl shadow-sm"
                >
                  <MessageCircle size={16} className="mr-2" /> WhatsApp
                </Button>
              </div>

              {/* Details Grid */}
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                    <Phone size={12} /> Mobile
                  </div>
                  <div className="text-sm font-medium">{c.mobile || "—"}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                    <Car size={12} /> Vehicle
                  </div>
                  <div className="text-sm font-medium">{c.vehicle_number || "—"}</div>
                </div>
                <div className="space-y-1 col-span-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                    <MapPin size={12} /> Address
                  </div>
                  <div className="text-sm font-medium">{c.address || "—"}</div>
                </div>
                {c.notes && (
                  <div className="space-y-1 col-span-2">
                    <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                      <FileText size={12} /> Notes
                    </div>
                    <div className="text-sm font-medium p-3 bg-muted/30 rounded-xl border border-border/50">
                      {c.notes}
                    </div>
                  </div>
                )}
              </div>
              {/* Stats Summary moved inside collapsible */}
              <div className="mt-4 grid grid-cols-2 gap-3 pb-2">
                <div className="bg-muted/30 border border-border/50 rounded-2xl p-4 shadow-sm">
                  <div className="text-xs font-semibold text-muted-foreground mb-1 uppercase">
                    Total Credit
                  </div>
                  <div className="text-lg font-bold text-destructive">
                    {formatINR(data.credit_total)}
                  </div>
                </div>
                <div className="bg-muted/30 border border-border/50 rounded-2xl p-4 shadow-sm">
                  <div className="text-xs font-semibold text-muted-foreground mb-1 uppercase">
                    Total Paid
                  </div>
                  <div className="text-lg font-bold text-emerald-600">
                    {formatINR(data.payment_total)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline Label */}
      <div className="px-5 mt-6 mb-2 text-sm font-extrabold uppercase tracking-widest text-muted-foreground">
        Ledger Timeline
      </div>

      {/* Transactions feed */}
      <div className="flex-1 px-4 space-y-4">
        {grouped.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-sm text-muted-foreground shadow-sm">
            No entries yet. Tap <span className="font-bold text-foreground">Given</span> or{" "}
            <span className="font-bold text-foreground">Received</span> below to start maintaining
            Khata.
          </div>
        )}
        {grouped.map((g) => (
          <div key={g.day} className="space-y-3">
            <div className="flex justify-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-white shadow-sm border border-border px-3 py-1 rounded-full">
                {g.label}
              </span>
            </div>
            {g.items.map((row) => {
              const e = row.entry as LedgerEntry & {
                transaction_type?: string;
                reference_id?: string | null;
              };
              const isCredit = e.entry_type === "credit";
              return (
                <div
                  key={e.id}
                  className={cn("flex flex-col", isCredit ? "items-end" : "items-start")}
                >
                  <div
                    onClick={() => {
                      setSelectedEntry(e);
                      setActionSheetOpen(true);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(evt) => {
                      if (evt.key === "Enter" || evt.key === " ") {
                        setSelectedEntry(e);
                        setActionSheetOpen(true);
                      }
                    }}
                    className={cn(
                      "max-w-[85%] min-w-[180px] rounded-2xl border bg-white shadow-sm px-4 py-3 text-left cursor-pointer transition-all hover:shadow-md active:scale-[0.98] select-none group relative",
                      isCredit
                        ? "border-destructive/20 hover:border-destructive/40 rounded-tr-sm"
                        : "border-emerald-500/20 hover:border-emerald-500/40 rounded-tl-sm",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {isCredit ? (
                        <ArrowUp size={16} className="text-destructive shrink-0" strokeWidth={3} />
                      ) : (
                        <ArrowDown
                          size={16}
                          className="text-emerald-600 shrink-0"
                          strokeWidth={3}
                        />
                      )}
                      <div
                        className={cn(
                          "text-lg font-bold tracking-tight",
                          isCredit ? "text-destructive" : "text-emerald-600",
                        )}
                      >
                        {formatINR(Number(e.amount))}
                      </div>
                      <div className="ml-auto pl-3 text-[10px] font-medium text-muted-foreground flex items-center gap-1.5">
                        {timeLabel(e.created_at)}
                        <Pencil
                          size={11}
                          className="opacity-0 group-hover:opacity-60 transition-opacity text-muted-foreground shrink-0"
                        />
                      </div>
                    </div>
                    {e.note && (
                      <div className="mt-2 text-xs font-medium text-foreground/80 line-clamp-2 bg-muted/40 p-2 rounded-lg">
                        {e.note}
                      </div>
                    )}
                    {e.receipt_url && (
                      <div className="mt-2 relative rounded-lg overflow-hidden border border-border shadow-sm group/img">
                        <a
                          href={e.receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <img
                            src={e.receipt_url}
                            alt="Receipt"
                            className="max-h-[150px] w-auto max-w-full object-cover transition-transform group-hover/img:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-white text-xs font-bold bg-black/60 px-2 py-1 rounded-full">
                              View Receipt
                            </span>
                          </div>
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] font-bold mt-1.5 px-2 text-muted-foreground uppercase tracking-wide">
                    {row.running === 0
                      ? "Settled"
                      : `${row.running > 0 ? "Due" : "Advance"} : ${formatINR(Math.abs(row.running))}`}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Bottom action stack */}
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 bg-white border-t shadow-[0_-10px_40px_rgba(0,0,0,0.05)] rounded-t-3xl border-border p-4">
        {/* Payment quick actions */}
        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
          <button
            onClick={() => {
              setEntryType("payment");
              setEntryOpen(true);
            }}
            className="h-14 rounded-2xl bg-emerald-600 text-white inline-flex flex-col items-center justify-center gap-0.5 shadow-md active:bg-emerald-700 transition-colors"
          >
            <div className="flex items-center gap-1.5 font-bold text-[15px]">
              <ArrowDown size={18} strokeWidth={2.5} /> Got
            </div>
            <div className="text-[10px] font-medium text-emerald-100 uppercase tracking-widest">
              Payment
            </div>
          </button>
          <button
            onClick={() => {
              setEntryType("credit");
              setEntryOpen(true);
            }}
            className="h-14 rounded-2xl bg-destructive text-white inline-flex flex-col items-center justify-center gap-0.5 shadow-md active:opacity-90 transition-opacity"
          >
            <div className="flex items-center gap-1.5 font-bold text-[15px]">
              <ArrowUp size={18} strokeWidth={2.5} /> Gave
            </div>
            <div className="text-[10px] font-medium text-red-200 uppercase tracking-widest">
              Credit
            </div>
          </button>
        </div>
      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-safe">
          <SheetHeader>
            <SheetTitle>More options</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-1 gap-2">
            <Button
              variant="outline"
              className="justify-start h-12 rounded-xl"
              onClick={() => {
                handleDownloadStatement();
                setMoreOpen(false);
              }}
            >
              <Download size={18} className="mr-3 text-muted-foreground" /> Download Statement
            </Button>
            <Button
              variant="outline"
              className="justify-start h-12 rounded-xl"
              onClick={() => {
                handleShareStatement();
                setMoreOpen(false);
              }}
            >
              <Share2 size={18} className="mr-3 text-muted-foreground" /> Share PDF
            </Button>
            {canEdit && (
              <Button
                variant="outline"
                className="justify-start h-12 rounded-xl"
                onClick={() => {
                  setMoreOpen(false);
                  setEditOpen(true);
                }}
              >
                <Pencil size={18} className="mr-3 text-muted-foreground" /> Edit Profile
              </Button>
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

      <CustomerSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={c}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["customer-ledger"] });
          qc.invalidateQueries({ queryKey: ["khata"] });
        }}
      />

      <EntryActionSheet
        open={actionSheetOpen}
        onOpenChange={setActionSheetOpen}
        entry={selectedEntry}
        customer={c}
        canEdit={canEdit}
        onEdit={() => {
          setActionSheetOpen(false);
          setEditEntryOpen(true);
        }}
        onDelete={() => {
          setDeleteConfirmOpen(true);
        }}
      />

      <EditEntrySheet
        open={editEntryOpen}
        onOpenChange={setEditEntryOpen}
        entry={selectedEntry}
        customer={c}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["customer-ledger"] });
          qc.invalidateQueries({ queryKey: ["khata"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          qc.invalidateQueries({ queryKey: ["reports"] });
        }}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="rounded-3xl max-w-sm w-[90vw]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Delete Entry?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium">
              Are you sure you want to delete this entry of{" "}
              {selectedEntry ? formatINR(Number(selectedEntry.amount)) : ""} ? The customer's
              balance will be updated automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel disabled={isDeleting} className="rounded-xl h-12">
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteEntry}
              disabled={isDeleting}
              className="rounded-xl h-12 text-base font-bold shadow-sm"
            >
              {isDeleting ? "Deleting..." : "Delete Entry"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EntryActionSheet({
  open,
  onOpenChange,
  entry,
  customer,
  onEdit,
  onDelete,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: (LedgerEntry & { transaction_type?: string; reference_id?: string | null }) | null;
  customer: Customer;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
}) {
  if (!entry) return null;
  const isCredit = entry.entry_type === "credit";

  function shareTransaction() {
    if (!entry) return;
    if (!customer.mobile) return toast.error("No mobile number for customer");
    const msg =
      `*Bharat Auto Parts — Transaction Receipt*\n\n` +
      `Customer: *${customer.name}*\n` +
      `Type: *${isCredit ? "Given (Credit)" : "Received (Payment)"}*\n` +
      `Amount: *${formatINR(Number(entry.amount))}*\n` +
      `Date: ${timeLabel(entry.created_at)}\n` +
      (entry.note ? `Note: ${entry.note}\n` : "") +
      `\nThank you for choosing Bharat Auto Parts!`;
    const url = buildWhatsAppUrl(customer.mobile, msg);
    if (url) window.open(url, "_blank");
    else toast.error("Invalid mobile number");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-safe max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Transaction Details</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Main summary badge */}
          <div
            className={cn(
              "rounded-2xl p-4 border flex flex-col items-center justify-center text-center",
              isCredit
                ? "bg-destructive/5 border-destructive/20 text-destructive"
                : "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400",
            )}
          >
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider mb-1">
              {isCredit ? (
                <>
                  <ArrowUp size={14} strokeWidth={3} /> Given (Udhaar)
                </>
              ) : (
                <>
                  <ArrowDown size={14} strokeWidth={3} /> Received (Payment)
                </>
              )}
            </div>
            <div className="text-3xl font-extrabold tracking-tight">
              {formatINR(Number(entry.amount))}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 font-medium">
              <Clock size={12} /> {timeLabel(entry.created_at)}
            </div>
          </div>

          {/* Note */}
          {entry.note && (
            <div className="rounded-2xl bg-muted/40 p-3.5 border border-border/50">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Note / Description
              </div>
              <div className="text-sm font-medium text-foreground">{entry.note}</div>
            </div>
          )}

          {/* Receipt Image */}
          {entry.receipt_url && (
            <div className="rounded-2xl border border-border/60 overflow-hidden bg-muted/20 p-3 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Receipt Attachment</span>
                <a
                  href={entry.receipt_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink size={12} /> Open Full
                </a>
              </div>
              <div className="relative rounded-xl overflow-hidden max-h-52 bg-black/5 flex items-center justify-center">
                <img
                  src={entry.receipt_url}
                  alt="Receipt"
                  className="max-h-52 w-auto object-contain"
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-1 gap-2 pt-2">
            <Button
              variant="outline"
              className="h-12 rounded-xl justify-start text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
              onClick={shareTransaction}
            >
              <MessageCircle size={18} className="mr-3" /> Share Receipt on WhatsApp
            </Button>

            {canEdit && (
              <>
                <Button
                  variant="outline"
                  className="h-12 rounded-xl justify-start"
                  onClick={onEdit}
                >
                  <Pencil size={18} className="mr-3 text-muted-foreground" /> Edit Entry
                </Button>
                <Button
                  variant="outline"
                  className="h-12 rounded-xl justify-start text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                  onClick={onDelete}
                >
                  <Trash2 size={18} className="mr-3 text-destructive" /> Delete Entry
                </Button>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EditEntrySheet({
  open,
  onOpenChange,
  entry,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: (LedgerEntry & { transaction_type?: string; reference_id?: string | null }) | null;
  customer: Customer;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [type, setType] = useState<"credit" | "payment">("credit");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const { status: onlineStatus } = useOnlineStatus();

  useEffect(() => {
    if (entry && open) {
      setType(entry.entry_type);
      setAmount(String(entry.amount));
      setNote(entry.note || "");
      setReceiptUrl(entry.receipt_url || null);
      setReceiptFile(null);
    }
  }, [entry, open]);

  async function handleSave() {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a valid amount");
    if (!entry || !profile?.shop_id) return;

    if (onlineStatus === "OFFLINE") {
      return toast.error("You are offline. Cannot update khata entries.");
    }

    setBusy(true);
    try {
      let finalReceiptUrl = receiptUrl;
      if (receiptFile) {
        const ext = receiptFile.name.split(".").pop();
        const filename = `${crypto.randomUUID()}.${ext}`;
        const filePath = `${profile.shop_id}/${filename}`;

        const { error: uploadError } = await sb.storage
          .from("khata_receipts")
          .upload(filePath, receiptFile);

        if (uploadError) {
          console.error(uploadError);
          throw new Error("Failed to upload receipt image");
        }

        const { data: publicUrlData } = sb.storage.from("khata_receipts").getPublicUrl(filePath);
        finalReceiptUrl = publicUrlData.publicUrl;
      }

      const balanceImpact = type === "credit" ? amt : -amt;
      await LedgerService.updateManualEntry(
        entry.id,
        profile.shop_id,
        customer.id,
        balanceImpact,
        note.trim(),
        finalReceiptUrl,
      );

      SoundManager.play("success");
      toast.success("Entry updated successfully");
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
      <SheetContent side="bottom" className="rounded-t-3xl pb-safe max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Entry</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Type Selector */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted/60 rounded-2xl">
            <button
              type="button"
              onClick={() => setType("payment")}
              className={cn(
                "py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all",
                !isCredit
                  ? "bg-white text-emerald-700 shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ArrowDown size={14} strokeWidth={2.5} /> Received (Payment)
            </button>
            <button
              type="button"
              onClick={() => setType("credit")}
              className={cn(
                "py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all",
                isCredit
                  ? "bg-white text-destructive shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ArrowUp size={14} strokeWidth={2.5} /> Given (Credit)
            </button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Amount (₹) *</Label>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0"
              className="h-14 text-2xl font-bold"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Note / Particulars</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Brake pads or cash payment"
            />
          </div>

          {/* Receipt attachment */}
          <div className="space-y-1.5">
            <Label className="text-xs">Receipt / Bill Photo</Label>
            {receiptUrl && !receiptFile ? (
              <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-border">
                <div className="flex items-center gap-2 truncate">
                  <img
                    src={receiptUrl}
                    alt="Receipt"
                    className="w-10 h-10 object-cover rounded-lg"
                  />
                  <span className="text-xs font-medium text-muted-foreground truncate">
                    Attached receipt
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => setReceiptUrl(null)}
                >
                  <Trash2 size={14} className="mr-1" /> Remove
                </Button>
              </div>
            ) : receiptFile ? (
              <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl border border-border">
                <span className="text-xs font-medium truncate">{receiptFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => setReceiptFile(null)}
                >
                  <X size={14} className="mr-1" /> Cancel
                </Button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-muted/40 transition-colors">
                <Upload size={16} className="text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">
                  Upload Receipt Image
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setReceiptFile(file);
                  }}
                />
              </label>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 h-12 rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={busy || onlineStatus === "OFFLINE"}
              className="flex-1 h-12 rounded-xl"
              variant={isCredit ? "destructive" : "hero"}
            >
              {busy ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
