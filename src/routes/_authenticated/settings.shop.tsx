import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { TeamService } from "@/lib/domain/TeamService";
import { PinVerificationModal } from "@/components/PinVerificationModal";
import {
  ArrowLeft,
  Store,
  Users,
  ShieldCheck,
  Copy,
  Check,
  CheckCircle2,
  Calendar,
  Building,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/shop")({
  head: () => ({
    meta: [
      { title: "Shop Information — Bharat Auto Parts" },
      { name: "description", content: "View shop details, members, and isolation architecture." },
    ],
  }),
  component: ShopSettingsPage,
});

function ShopSettingsPage() {
  const { profile, role } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [teamPinOpen, setTeamPinOpen] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team", "members"],
    queryFn: () => TeamService.getMembers(),
  });

  const owners = members.filter((m) => m.role === "owner");
  const isOwnerOrManager = role === "owner" || role === "manager";

  const handleCopyShopId = () => {
    if (!profile?.shop_id) return;
    navigator.clipboard.writeText(profile.shop_id);
    setCopied(true);
    toast.success("Shop ID copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-28 font-sans">
      {/* Header */}
      <div className="bg-white border-b border-border/60 sticky top-0 z-20 safe-top">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/settings"
              className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted active:scale-95 transition-all text-foreground"
              aria-label="Back to Settings"
            >
              <ArrowLeft size={18} />
            </Link>
            <h1 className="text-lg font-bold text-foreground">Shop Information</h1>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Active Shop
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-6">
        {/* Main Shop Card */}
        <div className="bg-white rounded-3xl p-6 border border-border/60 shadow-sm space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0B3D91] to-[#1258CD] text-white flex items-center justify-center shadow-md shrink-0">
              <Store size={32} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-foreground leading-tight truncate">
                  Bharat Auto Parts
                </h2>
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automotive Spare Parts & Khata Management
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                  {isLoading ? "Loading..." : `${members.length} Total Members`}
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700">
                  {owners.length} {owners.length === 1 ? "Owner" : "Owners"}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-border/40 pt-4 space-y-3">
            <div className="flex items-center justify-between text-xs py-1">
              <span className="text-muted-foreground flex items-center gap-2">
                <Building size={14} /> Shop ID
              </span>
              <button
                onClick={handleCopyShopId}
                className="flex items-center gap-1.5 font-mono text-[11px] bg-muted/60 hover:bg-muted active:scale-95 px-2.5 py-1 rounded-lg text-foreground transition-all"
                title="Click to copy full shop ID"
              >
                <span>
                  {profile?.shop_id
                    ? `${profile.shop_id.slice(0, 8)}...${profile.shop_id.slice(-6)}`
                    : "—"}
                </span>
                {copied ? (
                  <Check size={12} className="text-emerald-600" />
                ) : (
                  <Copy size={12} className="text-muted-foreground" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs py-1">
              <span className="text-muted-foreground flex items-center gap-2">
                <Calendar size={14} /> Shop Platform
              </span>
              <span className="font-semibold text-foreground">Bharat Auto Parts Cloud</span>
            </div>
          </div>
        </div>

        {/* Shop Owners List */}
        <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div className="text-sm font-bold text-foreground flex items-center gap-2">
              <UserCheck size={16} className="text-blue-600" /> Shop Owners & Administrators
            </div>
            {isOwnerOrManager && (
              <button
                type="button"
                onClick={() => setTeamPinOpen(true)}
                className="text-xs font-bold text-primary hover:underline"
              >
                Manage Team
              </button>
            )}
          </div>

          <div className="divide-y divide-border/30">
            {isLoading ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                Loading owners...
              </div>
            ) : owners.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">No owners found</div>
            ) : (
              owners.map((owner) => (
                <div
                  key={owner.id}
                  className="py-3 flex items-center justify-between first:pt-1 last:pb-1"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-9 w-9 border border-border/40">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                        {owner.full_name?.charAt(0).toUpperCase() || "O"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">
                        {owner.full_name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        +91 {owner.phone}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 capitalize border border-blue-200/40 shrink-0">
                    {owner.role}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Security & Multi-User Architecture */}
        <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm space-y-3">
          <div className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border/40 pb-3">
            <ShieldCheck size={16} className="text-emerald-600" /> Shop Security & Isolation
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your shop operates inside an isolated database partition. All billing, khata ledgers,
            inventory, and customer transactions are strictly accessible only by authenticated
            members of <strong>Bharat Auto Parts</strong>.
          </p>
          <div className="pt-1">
            {isOwnerOrManager && (
              <Button
                type="button"
                onClick={() => setTeamPinOpen(true)}
                className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-xs"
              >
                <Users size={16} className="mr-2" /> Open Team Management
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Team PIN Verification Modal */}
      <PinVerificationModal
        open={teamPinOpen}
        onOpenChange={setTeamPinOpen}
        onSuccess={() => navigate({ to: "/team" })}
      />
    </div>
  );
}
