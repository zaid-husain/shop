import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  User,
  Store,
  Users,
  Shield,
  Sliders,
  HelpCircle,
  Info,
  LogOut,
  ChevronRight,
  ArrowLeft,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PinVerificationModal } from "@/components/PinVerificationModal";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({
    meta: [
      { title: "Settings & Profile — Bharat Auto Parts" },
      { name: "description", content: "Manage your profile, shop details, team, and security." },
    ],
  }),
  component: SettingsIndexPage,
});

function SettingsIndexPage() {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [teamPinOpen, setTeamPinOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const isOwnerOrManager = role === "owner" || role === "manager";
  const avatarFallback = profile?.full_name?.charAt(0).toUpperCase() ?? "U";

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      toast.success("Signed out successfully");
      navigate({ to: "/auth", search: { next: "/dashboard" }, replace: true });
    } catch {
      toast.error("Failed to sign out");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-28 font-sans">
      {/* Header */}
      <div className="bg-white border-b border-border/60 sticky top-0 z-20 safe-top">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted active:scale-95 transition-all text-foreground"
              aria-label="Back to Dashboard"
            >
              <ArrowLeft size={18} />
            </Link>
            <h1 className="text-lg font-bold text-foreground">Profile & Settings</h1>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary capitalize border border-primary/20">
            {role ?? "Staff"}
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-6">
        {/* Profile Card */}
        <div className="bg-gradient-to-br from-[#0B3D91] to-[#1258CD] rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <Avatar className="h-14 w-14 border-2 border-white/30 shadow-md">
                <AvatarFallback className="bg-white/15 text-white text-xl font-bold">
                  {avatarFallback}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h2 className="text-lg font-bold truncate leading-tight">
                  {profile?.full_name || "Admin User"}
                </h2>
                <div className="text-xs text-white/80 flex items-center gap-1.5 mt-1 font-medium">
                  <Smartphone size={13} className="shrink-0 text-white/70" />
                  <span>+91 {profile?.phone || "—"}</span>
                </div>
                <div className="text-[11px] text-white/70 mt-0.5 truncate">
                  Shop: <span className="font-semibold text-white">Bharat Auto Parts</span>
                </div>
              </div>
            </div>
            <Link
              to="/settings/profile"
              className="shrink-0 bg-white/15 hover:bg-white/25 active:scale-95 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all border border-white/20"
            >
              Edit
            </Link>
          </div>
        </div>

        {/* Section: Account & Shop */}
        <div className="space-y-2.5">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
            Account & Shop
          </div>
          <div className="bg-white rounded-2xl border border-border/60 shadow-sm overflow-hidden divide-y divide-border/40">
            <SettingRow
              to="/settings/profile"
              icon={<User size={18} className="text-blue-600" />}
              iconBg="bg-blue-50"
              title="Personal Profile"
              subtitle="Name, phone number, and account details"
            />
            <SettingRow
              to="/settings/shop"
              icon={<Store size={18} className="text-emerald-600" />}
              iconBg="bg-emerald-50"
              title="Shop Information"
              subtitle="Bharat Auto Parts, shop ID, and details"
            />
            {isOwnerOrManager && (
              <SettingRow
                onClick={() => setTeamPinOpen(true)}
                icon={<Users size={18} className="text-indigo-600" />}
                iconBg="bg-indigo-50"
                title="Team Members"
                subtitle="Manage owners, managers, and staff"
                badge="Active"
              />
            )}
          </div>
        </div>

        {/* Section: Security */}
        <div className="space-y-2.5">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
            Security & Login
          </div>
          <div className="bg-white rounded-2xl border border-border/60 shadow-sm overflow-hidden divide-y divide-border/40">
            <SettingRow
              to="/settings/security"
              icon={<Shield size={18} className="text-amber-600" />}
              iconBg="bg-amber-50"
              title="Security & PIN"
              subtitle="Change account PIN, active sessions"
            />
          </div>
        </div>

        {/* Section: App Preferences & Help */}
        <div className="space-y-2.5">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
            Preferences & Support
          </div>
          <div className="bg-white rounded-2xl border border-border/60 shadow-sm overflow-hidden divide-y divide-border/40">
            <SettingRow
              to="/settings/preferences"
              icon={<Sliders size={18} className="text-purple-600" />}
              iconBg="bg-purple-50"
              title="App Preferences"
              subtitle="Language, currency, date formatting"
            />
            <SettingRow
              to="/settings/help"
              icon={<HelpCircle size={18} className="text-teal-600" />}
              iconBg="bg-teal-50"
              title="Help & Support"
              subtitle="How to use Khata, billing, inventory"
            />
            <SettingRow
              to="/settings/about"
              icon={<Info size={18} className="text-slate-600" />}
              iconBg="bg-slate-100"
              title="About Bharat Auto Parts"
              subtitle="Version 1.0.0 · Powered by Zashly"
            />
          </div>
        </div>

        {/* Sign Out Button */}
        <div className="pt-2">
          <button
            onClick={() => setLogoutOpen(true)}
            className="w-full bg-white hover:bg-rose-50/60 active:bg-rose-100/60 border border-rose-200/80 text-rose-600 font-bold py-3.5 px-4 rounded-2xl shadow-sm flex items-center justify-center gap-2.5 transition-all text-sm group"
          >
            <LogOut size={18} className="group-hover:-translate-x-0.5 transition-transform" />
            Sign Out of Bharat Auto Parts
          </button>
        </div>

        {/* Footer info */}
        <div className="text-center pt-2 space-y-1">
          <div className="text-xs font-semibold text-muted-foreground/80 flex items-center justify-center gap-1.5">
            <Sparkles size={12} className="text-primary" /> Bharat Auto Parts
          </div>
          <div className="text-[11px] text-muted-foreground/60">
            Shop Management System · Powered by{" "}
            <span className="font-semibold text-foreground/70">Zashly</span>
          </div>
        </div>
      </div>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent className="w-[90vw] max-w-[400px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of your account?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be returned to the sign in screen. You can log back in at any time using your
              mobile number and PIN.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex gap-2 sm:justify-end">
            <AlertDialogCancel disabled={isSigningOut} className="rounded-xl">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl"
            >
              {isSigningOut ? "Signing out..." : "Sign Out"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Team PIN Verification Modal */}
      <PinVerificationModal
        open={teamPinOpen}
        onOpenChange={setTeamPinOpen}
        onSuccess={() => navigate({ to: "/team" })}
      />
    </div>
  );
}

function SettingRow({
  to,
  onClick,
  icon,
  iconBg,
  title,
  subtitle,
  badge,
}: {
  to?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  const content = (
    <div className="flex items-center justify-between p-4 hover:bg-muted/40 active:bg-muted/70 transition-colors group w-full text-left">
      <div className="flex items-center gap-3.5 min-w-0">
        <div
          className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0 shadow-xs`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors flex items-center gap-2">
            {title}
            {badge && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200/50">
                {badge}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</div>
        </div>
      </div>
      <ChevronRight
        size={18}
        className="text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 ml-2"
      />
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full">
        {content}
      </button>
    );
  }

  return (
    <Link to={to || "#"} className="block w-full">
      {content}
    </Link>
  );
}
