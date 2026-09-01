import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { sb } from "@/lib/db";
import {
  ArrowLeft,
  User,
  Smartphone,
  Shield,
  Store,
  Calendar,
  Check,
  Loader2,
  Lock,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/profile")({
  head: () => ({
    meta: [
      { title: "Personal Profile — Bharat Auto Parts" },
      { name: "description", content: "View and edit your personal profile information." },
    ],
  }),
  component: ProfileSettingsPage,
});

function ProfileSettingsPage() {
  const { profile, role, user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.full_name) {
      setFullName(profile.full_name);
    }
  }, [profile?.full_name]);

  const avatarFallback = (fullName || profile?.full_name || "U").charAt(0).toUpperCase();
  const isDirty = fullName.trim() !== (profile?.full_name || "").trim();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      return toast.error("Full name cannot be empty");
    }
    if (!user?.id) {
      return toast.error("User session not found");
    }

    try {
      setSaving(true);
      const { error } = await sb
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      await refreshProfile();
      toast.success("Profile updated successfully");
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e?.message || "Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const formattedJoinDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

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
            <h1 className="text-lg font-bold text-foreground">Personal Profile</h1>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary capitalize border border-primary/20">
            {role ?? "Staff"}
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-6">
        {/* Avatar Presentation Card */}
        <div className="bg-white rounded-3xl p-6 border border-border/60 shadow-sm flex flex-col items-center text-center space-y-3">
          <div className="relative">
            <Avatar className="h-20 w-20 border-4 border-primary/10 shadow-md">
              <AvatarFallback className="bg-gradient-to-br from-[#0B3D91] to-[#1258CD] text-white text-3xl font-extrabold">
                {avatarFallback}
              </AvatarFallback>
            </Avatar>
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">{fullName || "Admin User"}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              +91 {profile?.phone || "—"} ·{" "}
              <span className="capitalize font-semibold text-primary">{role ?? "Staff"}</span>
            </p>
          </div>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm space-y-4">
            <div className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border/40 pb-3">
              <User size={16} className="text-primary" /> Profile Information
            </div>

            <div className="space-y-2">
              <Label htmlFor="full_name" className="text-xs font-bold text-foreground">
                Full Name
              </Label>
              <Input
                id="full_name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="h-12 rounded-xl text-base"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="phone" className="text-xs font-bold text-foreground">
                  Mobile Number
                </Label>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Lock size={10} /> Locked for security
                </span>
              </div>
              <div className="relative">
                <Smartphone className="absolute left-3.5 top-3.5 h-5 w-5 text-muted-foreground" />
                <Input
                  id="phone"
                  type="text"
                  value={profile?.phone ? `+91 ${profile.phone}` : ""}
                  disabled
                  className="pl-11 h-12 rounded-xl bg-muted/40 text-muted-foreground cursor-not-allowed text-base font-medium"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Your mobile number is your login identity and cannot be changed directly.
              </p>
            </div>
          </div>

          {/* Account Details Card */}
          <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm space-y-3.5">
            <div className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border/40 pb-3">
              <Shield size={16} className="text-emerald-600" /> Account & Shop Identity
            </div>

            <div className="flex items-center justify-between text-sm py-1 border-b border-border/30">
              <span className="text-muted-foreground flex items-center gap-2">
                <Store size={15} /> Assigned Shop
              </span>
              <span className="font-bold text-foreground">Bharat Auto Parts</span>
            </div>

            <div className="flex items-center justify-between text-sm py-1 border-b border-border/30">
              <span className="text-muted-foreground flex items-center gap-2">
                <Shield size={15} /> Your Role
              </span>
              <span className="font-bold capitalize text-primary bg-primary/10 px-2.5 py-0.5 rounded-full text-xs">
                {role ?? "Staff"}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm py-1">
              <span className="text-muted-foreground flex items-center gap-2">
                <Calendar size={15} /> Member Since
              </span>
              <span className="font-semibold text-foreground text-xs">{formattedJoinDate}</span>
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: "/settings" })}
              className="flex-1 h-12 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !isDirty || !fullName.trim()}
              className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="animate-spin" size={18} /> Saving...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Check size={18} /> Save Changes
                </span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
