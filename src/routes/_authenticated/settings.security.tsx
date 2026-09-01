import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { phoneToEmail } from "@/lib/utils";
import {
  ArrowLeft,
  Shield,
  KeyRound,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Smartphone,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/security")({
  head: () => ({
    meta: [
      { title: "Security & PIN — Bharat Auto Parts" },
      { name: "description", content: "Manage your login PIN and account security." },
    ],
  }),
  component: SecuritySettingsPage,
});

function SecuritySettingsPage() {
  const { profile, role } = useAuth();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!profile?.phone) {
      return toast.error("User phone number not found");
    }

    const phoneDigits = profile.phone.replace(/\D/g, "");
    if (!/^\d{4,6}$/.test(currentPin)) {
      return setErrorMsg("Current PIN must be 4–6 digits");
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      return setErrorMsg("New PIN must be 4–6 digits");
    }
    if (newPin !== confirmPin) {
      return setErrorMsg("New PIN and confirmation PIN do not match");
    }
    if (currentPin === newPin) {
      return setErrorMsg("New PIN must be different from current PIN");
    }

    try {
      setSaving(true);
      const email = phoneToEmail(phoneDigits);
      const oldPassword = `bap_${currentPin}_${phoneDigits.slice(-4)}`;
      const newPassword = `bap_${newPin}_${phoneDigits.slice(-4)}`;

      // 1. Verify current PIN
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email,
        password: oldPassword,
      });

      if (verifyErr) {
        if (verifyErr.message.toLowerCase().includes("invalid login")) {
          setErrorMsg("Current PIN is incorrect. Please try again.");
          return;
        }
        throw verifyErr;
      }

      // 2. Update to new password/PIN
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) throw updateErr;

      toast.success("PIN changed successfully!");
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMsg(e?.message || "Failed to change PIN. Please try again.");
    } finally {
      setSaving(false);
    }
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
            <h1 className="text-lg font-bold text-foreground">Security & Login</h1>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            Protected
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-6">
        {/* Change PIN Form */}
        <form onSubmit={handleChangePin} className="space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm space-y-4">
            <div className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border/40 pb-3">
              <KeyRound size={16} className="text-amber-600" /> Change Security PIN
            </div>

            <p className="text-xs text-muted-foreground">
              Your PIN is used to log in and protect sensitive shop actions.
            </p>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="current_pin" className="text-xs font-bold text-foreground">
                Current PIN
              </Label>
              <Input
                id="current_pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                className="h-12 rounded-xl text-lg tracking-[0.3em] font-bold"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-2">
                <Label htmlFor="new_pin" className="text-xs font-bold text-foreground">
                  New PIN (4–6 digits)
                </Label>
                <Input
                  id="new_pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  className="h-12 rounded-xl text-lg tracking-[0.3em] font-bold"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm_pin" className="text-xs font-bold text-foreground">
                  Confirm New PIN
                </Label>
                <Input
                  id="confirm_pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  className="h-12 rounded-xl text-lg tracking-[0.3em] font-bold"
                  required
                />
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={saving || !currentPin || !newPin || !confirmPin}
                className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="animate-spin" size={18} /> Updating PIN...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Lock size={16} /> Update PIN
                  </span>
                )}
              </Button>
            </div>
          </div>
        </form>

        {/* Active Session Info Card */}
        <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm space-y-3.5">
          <div className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border/40 pb-3">
            <Shield size={16} className="text-emerald-600" /> Active Device Session
          </div>

          <div className="flex items-center justify-between text-sm py-1 border-b border-border/30">
            <span className="text-muted-foreground flex items-center gap-2">
              <Smartphone size={15} /> Logged in Device
            </span>
            <span className="font-semibold text-foreground text-xs flex items-center gap-1 text-emerald-600">
              <CheckCircle2 size={13} /> Active Session
            </span>
          </div>

          <div className="flex items-center justify-between text-sm py-1 border-b border-border/30">
            <span className="text-muted-foreground">Mobile Identifier</span>
            <span className="font-bold text-foreground text-xs">+91 {profile?.phone || "—"}</span>
          </div>

          <div className="flex items-center justify-between text-sm py-1">
            <span className="text-muted-foreground">Assigned Role</span>
            <span className="font-bold capitalize text-primary text-xs">{role ?? "Staff"}</span>
          </div>
        </div>

        {/* Best Practices Advice */}
        <div className="bg-blue-50/60 rounded-2xl p-4 border border-blue-200/60 text-xs text-blue-900 space-y-2">
          <div className="font-bold flex items-center gap-1.5 text-blue-950">
            <Info size={14} className="text-blue-700" /> Security Tip
          </div>
          <p className="leading-relaxed text-blue-800">
            Do not share your PIN with anyone. Team members should be invited individually through
            the <strong>Team Members</strong> section so their actions can be audited separately.
          </p>
        </div>
      </div>
    </div>
  );
}
