import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  UserPlus,
  Users,
  Phone,
  MessageCircle,
  Car,
  MapPin,
  ChevronRight,
  Plus,
  ArrowUpDown,
  Filter,
  SlidersHorizontal,
  X,
  CreditCard,
  BookOpen,
  Calendar,
  AlertCircle,
  ExternalLink,
  Pencil,
  Sparkles,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import { sb, type Customer } from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import { formatINR, formatDate, buildWhatsAppUrl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CustomerSheet } from "@/components/CustomerSheet";
import { CustomerService } from "@/lib/domain/CustomerService";
import { SoundManager } from "@/lib/sounds";
import { ScreenHeader } from "@/components/ScreenHeader";

export const Route = createFileRoute("/_authenticated/customers/")({
  head: () => ({
    meta: [
      { title: "Customers Directory — Bharat Auto Parts" },
      {
        name: "description",
        content:
          "Complete customer directory and profiles. Manage contact information, vehicles, address details, and view purchase history.",
      },
    ],
  }),
  component: CustomersDirectoryPage,
});

type FilterTab = "all" | "vehicles" | "dues" | "cleared";
type SortOption = "name_asc" | "name_desc" | "newest" | "highest_due";

function CustomersDirectoryPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [sortOption, setSortOption] = useState<SortOption>("name_asc");
  const [customerSheetOpen, setCustomerSheetOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", profile?.shop_id],
    enabled: !!profile?.shop_id,
    queryFn: async () => {
      if (!profile?.shop_id) throw new Error("Shop ID not found");
      return CustomerService.getCustomers(profile.shop_id);
    },
  });

  // Calculate high level customer stats
  const stats = useMemo(() => {
    if (!customers) return { total: 0, withVehicles: 0, withDues: 0, totalDues: 0 };
    let withVehicles = 0;
    let withDues = 0;
    let totalDues = 0;

    for (const c of customers) {
      if (c.vehicle_number && c.vehicle_number.trim().length > 0) withVehicles++;
      const balance = Number(c.balance_cache ?? 0);
      if (balance > 0) {
        withDues++;
        totalDues += balance;
      }
    }

    return {
      total: customers.length,
      withVehicles,
      withDues,
      totalDues,
    };
  }, [customers]);

  // Filter and sort customers
  const filteredCustomers = useMemo(() => {
    if (!customers) return [];

    return customers
      .filter((c) => {
        // Tab filtering
        if (filterTab === "vehicles") {
          if (!c.vehicle_number || c.vehicle_number.trim().length === 0) return false;
        } else if (filterTab === "dues") {
          if (Number(c.balance_cache ?? 0) <= 0) return false;
        } else if (filterTab === "cleared") {
          if (Number(c.balance_cache ?? 0) > 0) return false;
        }

        // Search text matching
        const q = search.trim().toLowerCase();
        if (!q) return true;

        const nameMatch = c.name.toLowerCase().includes(q);
        const mobileMatch = c.mobile ? c.mobile.includes(q) : false;
        const vehicleMatch = c.vehicle_number ? c.vehicle_number.toLowerCase().includes(q) : false;
        const addressMatch = c.address ? c.address.toLowerCase().includes(q) : false;
        const notesMatch = c.notes ? c.notes.toLowerCase().includes(q) : false;

        return nameMatch || mobileMatch || vehicleMatch || addressMatch || notesMatch;
      })
      .sort((a, b) => {
        if (sortOption === "name_asc") {
          return a.name.localeCompare(b.name);
        } else if (sortOption === "name_desc") {
          return b.name.localeCompare(a.name);
        } else if (sortOption === "newest") {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        } else if (sortOption === "highest_due") {
          return Number(b.balance_cache ?? 0) - Number(a.balance_cache ?? 0);
        }
        return 0;
      });
  }, [customers, filterTab, search, sortOption]);

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setCustomerSheetOpen(true);
    SoundManager.play("notification");
  };

  const handleEdit = (c: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCustomer(c);
    setCustomerSheetOpen(true);
    SoundManager.play("notification");
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 font-sans">
      {/* 1. Header Section */}
      <div className="bg-gradient-to-br from-[#0B3D91] to-[#1258CD] rounded-b-3xl px-5 pt-10 pb-16 shadow-lg relative overflow-hidden text-white">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-50%] right-[-10%] w-64 h-64 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute bottom-[-20%] left-[-20%] w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        </div>

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 grid place-items-center text-white shadow-sm">
              <Users size={24} />
            </div>
            <div>
              <div className="text-white/80 text-xs font-bold uppercase tracking-wider">
                Directory & Profiles
              </div>
              <h1 className="text-xl font-extrabold tracking-tight">Customers</h1>
            </div>
          </div>

          <Button
            onClick={handleOpenAdd}
            size="sm"
            className="bg-white text-[#0B3D91] hover:bg-white/90 shadow-md font-bold text-xs h-10 px-4 rounded-xl flex items-center gap-1.5 active:scale-95 transition-all"
          >
            <Plus size={16} className="stroke-[2.5]" />
            <span>New Customer</span>
          </Button>
        </div>

        {/* Quick KPI Strip inside Header */}
        <div className="relative z-10 grid grid-cols-3 gap-2.5 mt-6">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/15">
            <div className="text-white/70 text-[11px] font-semibold uppercase">Total Clients</div>
            <div className="text-xl font-extrabold mt-0.5">{stats.total}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/15">
            <div className="text-white/70 text-[11px] font-semibold uppercase">With Vehicles</div>
            <div className="text-xl font-extrabold mt-0.5">{stats.withVehicles}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/15">
            <div className="text-white/70 text-[11px] font-semibold uppercase">
              Total Outstanding
            </div>
            <div className="text-sm font-extrabold mt-1.5 truncate text-rose-200">
              {formatINR(stats.totalDues)}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Floating Search & Filter Bar */}
      <div className="px-5 -mt-6 relative z-30 space-y-3">
        <div className="bg-white rounded-2xl border border-border/70 shadow-[0_8px_30px_rgb(0,0,0,0.08)] flex items-center px-4 py-2.5 transition-all focus-within:ring-2 focus-within:ring-primary/20">
          <Search size={18} className="text-muted-foreground mr-3 shrink-0" />
          <input
            type="text"
            placeholder="Search by name, phone, vehicle #, or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full font-medium placeholder:text-muted-foreground/70 text-foreground"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 ml-1.5 transition-colors"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filter Pills & Sorting */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-1">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setFilterTab("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterTab === "all"
                  ? "bg-primary text-white shadow-sm"
                  : "bg-white text-muted-foreground border border-border/80 hover:bg-muted/50"
              }`}
            >
              All ({customers?.length ?? 0})
            </button>
            <button
              onClick={() => setFilterTab("vehicles")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterTab === "vehicles"
                  ? "bg-primary text-white shadow-sm"
                  : "bg-white text-muted-foreground border border-border/80 hover:bg-muted/50"
              }`}
            >
              <Car size={13} />
              Vehicles ({stats.withVehicles})
            </button>
            <button
              onClick={() => setFilterTab("dues")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterTab === "dues"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "bg-white text-rose-600 border border-rose-200 hover:bg-rose-50/50"
              }`}
            >
              Has Dues ({stats.withDues})
            </button>
            <button
              onClick={() => setFilterTab("cleared")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterTab === "cleared"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-white text-muted-foreground border border-border/80 hover:bg-muted/50"
              }`}
            >
              Cleared / Adv
            </button>
          </div>

          <div className="shrink-0 flex items-center gap-1">
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="text-xs font-semibold bg-white border border-border/80 rounded-xl px-2.5 py-1.5 text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="newest">Recently Added</option>
              <option value="highest_due">Highest Due</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Customer List Content */}
      <div className="px-5 mt-4">
        {isLoading ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-4 border border-border/50 shadow-sm animate-pulse flex items-center gap-3.5"
              >
                <div className="w-12 h-12 rounded-2xl bg-muted shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-2/5" />
                  <div className="h-3 bg-muted rounded w-3/5" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 border border-border/60 shadow-sm text-center my-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 text-primary grid place-items-center mx-auto">
              <Users size={32} />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {search ? "No matching customers found" : "No customers in directory"}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                {search
                  ? `No customer matching "${search}". Try searching with a different name or number.`
                  : "Add your first customer to manage contacts, vehicles, invoices, and purchase records."}
              </p>
            </div>
            <Button
              onClick={search ? () => setSearch("") : handleOpenAdd}
              variant="default"
              className="rounded-xl px-5 font-bold"
            >
              {search ? (
                "Clear Search Filter"
              ) : (
                <>
                  <UserPlus size={16} className="mr-1.5" /> Add First Customer
                </>
              )}
            </Button>
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-3 pt-1"
          >
            {filteredCustomers.map((c) => {
              const due = Number(c.balance_cache ?? 0);
              const waUrl = c.mobile
                ? buildWhatsAppUrl(c.mobile, `Namaste ${c.name}, greetings from Bharat Auto Parts!`)
                : null;

              return (
                <motion.div
                  key={c.id}
                  variants={itemVariants}
                  onClick={() => navigate({ to: "/customers/$id", params: { id: c.id } })}
                  className="group bg-white hover:bg-slate-50/80 rounded-2xl p-4 border border-border/60 shadow-[0_2px_12px_rgb(0,0,0,0.03)] hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: Avatar + Basic Info */}
                    <div className="flex items-start gap-3.5 min-w-0">
                      <Avatar className="h-12 w-12 rounded-2xl border border-border/60 shadow-sm shrink-0 mt-0.5">
                        <AvatarFallback className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 text-primary font-extrabold text-sm">
                          {c.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-foreground truncate group-hover:text-primary transition-colors">
                            {c.name}
                          </h2>
                        </div>

                        {/* Phone & Location */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground font-medium">
                          {c.mobile ? (
                            <span className="flex items-center gap-1 text-foreground/80 font-semibold">
                              <Phone size={12} className="text-muted-foreground" />
                              {c.mobile}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60 italic">No mobile</span>
                          )}

                          {c.address && (
                            <span className="flex items-center gap-1 truncate max-w-[180px]">
                              <MapPin size={12} className="text-muted-foreground shrink-0" />
                              <span className="truncate">{c.address}</span>
                            </span>
                          )}
                        </div>

                        {/* Badges: Vehicle Plate & Notes */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {c.vehicle_number && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 font-mono text-[11px] font-bold border border-amber-500/20">
                              <Car size={11} className="text-amber-600" />
                              {c.vehicle_number}
                            </span>
                          )}

                          {c.notes && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-muted text-muted-foreground text-[11px] font-medium truncate max-w-[200px]">
                              {c.notes}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Balance Pill & Arrow */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="text-right">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-xl text-xs font-extrabold tracking-tight ${
                            due > 0
                              ? "bg-rose-50 text-rose-600 border border-rose-200/80"
                              : due < 0
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-200/80"
                                : "bg-slate-100 text-slate-600 border border-slate-200/70"
                          }`}
                        >
                          {due > 0
                            ? `${formatINR(due)} Due`
                            : due < 0
                              ? `${formatINR(Math.abs(due))} Adv`
                              : "Cleared"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all text-xs font-semibold">
                        <span>Profile</span>
                        <ChevronRight size={15} />
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Shortcuts Bar */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-3.5 pt-2.5 border-t border-border/40 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-1.5">
                      {c.mobile && (
                        <>
                          <a
                            href={`tel:${c.mobile}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/70 hover:bg-muted text-foreground text-xs font-semibold transition-colors"
                            aria-label={`Call ${c.name}`}
                          >
                            <Phone size={12} className="text-blue-600" />
                            <span>Call</span>
                          </a>

                          {waUrl && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100/70 text-emerald-700 text-xs font-semibold transition-colors"
                              aria-label={`WhatsApp ${c.name}`}
                            >
                              <MessageCircle size={12} />
                              <span>WhatsApp</span>
                            </a>
                          )}
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Link
                        to="/khata/$id"
                        params={{ id: c.id }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100/70 text-amber-800 text-xs font-semibold transition-colors"
                      >
                        <BookOpen size={12} />
                        <span>Khata</span>
                      </Link>

                      <button
                        onClick={(e) => handleEdit(c, e)}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={`Edit ${c.name}`}
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Customer Sheet (Add / Edit) */}
      <CustomerSheet
        open={customerSheetOpen}
        onOpenChange={setCustomerSheetOpen}
        initial={editingCustomer}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["customers"] });
          qc.invalidateQueries({ queryKey: ["khata"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
        }}
      />
    </div>
  );
}
