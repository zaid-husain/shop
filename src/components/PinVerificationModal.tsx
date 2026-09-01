import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { phoneToEmail } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Lock } from "lucide-react";

interface PinVerificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
}

export function PinVerificationModal({
  open,
  onOpenChange,
  onSuccess,
  title = "Enter Shop PIN",
  description = "Please enter your shop's security PIN to access Team Management.",
}: PinVerificationModalProps) {
  const { profile } = useAuth();
  const [pinInput, setPinInput] = useState("");
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinError, setPinError] = useState("");

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.phone) return;
    setPinVerifying(true);
    setPinError("");

    try {
      const phoneDigits = profile.phone.replace(/\D/g, "");
      const email = phoneToEmail(phoneDigits);
      const password = `bap_${pinInput}_${phoneDigits.slice(-4)}`;

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      setPinInput("");
      setPinError("");
      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      const e = err as { message?: string };
      if (e?.message?.toLowerCase().includes("invalid login")) {
        setPinError("Incorrect PIN. Please try again.");
      } else {
        setPinError("Verification failed. Please try again.");
      }
    } finally {
      setPinVerifying(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setPinInput("");
      setPinError("");
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[90vw] max-w-[400px] rounded-3xl p-6 shadow-2xl border-border/80">
        <DialogHeader className="space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-1">
            <Lock size={22} />
          </div>
          <DialogTitle className="text-xl font-bold text-center">{title}</DialogTitle>
          <DialogDescription className="text-xs text-center text-muted-foreground leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleVerifyPin} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-14 tracking-[0.4em] font-extrabold text-center text-xl rounded-2xl border-border/80 bg-muted/20 focus-visible:ring-primary"
              autoFocus
            />
            {pinError && (
              <p className="text-xs text-destructive font-semibold text-center mt-1">{pinError}</p>
            )}
          </div>

          <DialogFooter className="mt-6 flex flex-row gap-3 sm:justify-center">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12 rounded-xl text-sm font-semibold"
              onClick={() => handleClose(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pinVerifying || pinInput.length < 4}
              className="flex-1 h-12 rounded-xl text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
            >
              {pinVerifying ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="animate-spin" size={16} /> Verifying...
                </span>
              ) : (
                "Unlock"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
