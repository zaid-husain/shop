import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { phoneToEmail } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Bharat Auto Parts" },
      {
        name: "description",
        content:
          "Sign in to your auto parts shop with your mobile number and PIN to manage billing, stock, and customer Khata.",
      },
      { property: "og:title", content: "Sign in — Bharat Auto Parts" },
      {
        property: "og:description",
        content: "Sign in to manage billing, stock, and customer Khata for your auto parts shop.",
      },
      { property: "og:url", content: "/auth" },
    ],
    links: [{ rel: "canonical", href: "/auth" }],
  }),
  component: AuthPage,
});

// Only accept same-origin relative paths — never an absolute URL an attacker
// could stuff into ?next to bounce the user off-site after sign-in.
function safeNext(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function AuthPage() {
  const { session, loading } = useAuth();
  const { next } = Route.useSearch();
  const target = safeNext(next) ?? "/dashboard";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      window.location.href = target;
    }
  }, [session, loading, target]);

  if (session) {
    if (typeof window !== "undefined") window.location.href = target;
    return null;
  }

  const phoneDigits = phone.replace(/\D/g, "");
  const phoneValid = phoneDigits.length === 10;
  const pinValid = /^\d{4,6}$/.test(pin);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneValid) return toast.error("Enter a valid 10-digit mobile number");
    if (!pinValid) return toast.error("PIN must be 4-6 digits");

    setBusy(true);
    try {
      const email = phoneToEmail(phoneDigits);
      // We use the PIN as the auth password (server-side bcrypt). Prefix
      // ensures it always meets Supabase's 6-char minimum.
      const password = `bap_${pin}_${phoneDigits.slice(-4)}`;

      if (mode === "signup") {
        if (!ownerName.trim()) {
          setBusy(false);
          return toast.error("Enter the owner's name");
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${target}`,
            data: {
              full_name: ownerName.trim(),
              phone: phoneDigits,
              shop_name: shopName.trim() || "My Shop",
            },
          },
        });
        if (error) throw error;
        // try sign-in immediately (if email confirmation is off)
        const { error: sErr } = await supabase.auth.signInWithPassword({ email, password });
        if (sErr) {
          toast.success("Account created. Please sign in.");
          setMode("signin");
        } else {
          toast.success("Welcome to Bharat Auto Parts!");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
      }
    } catch (err: unknown) {
      console.error(err);
      const e = err as { message?: string };
      const msg = String(e?.message ?? err);
      if (/invalid login/i.test(msg)) toast.error("Wrong mobile number or PIN");
      else if (/already registered|already exists/i.test(msg))
        toast.error("This mobile is already registered. Please sign in.");
      else toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="gradient-brand text-primary-foreground px-6 pt-12 pb-16 safe-top">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center gap-3"
        >
          <Logo size={72} />
          <h1 className="text-2xl font-bold tracking-tight">Sign in — Bharat Auto Parts</h1>
          <p className="text-sm text-primary-foreground/80">Shop management, made simple</p>
        </motion.div>
      </div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="-mt-10 mx-4 rounded-2xl bg-card p-6 shadow-floating flex-1"
      >
        <div className="flex rounded-xl bg-muted p-1 mb-6">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {m === "signin" ? "Sign In" : "Create Shop"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="shop">Shop name</Label>
                <Input
                  id="shop"
                  placeholder="e.g. Sharma Auto Parts"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="h-12"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner">Owner name</Label>
                <Input
                  id="owner"
                  placeholder="Your full name"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="h-12"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="phone">Mobile number</Label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-input bg-muted text-muted-foreground font-medium">
                +91
              </span>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit number"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="h-12 rounded-l-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pin">PIN</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="4-6 digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-12 tracking-[0.4em] font-semibold"
            />
            <p className="text-xs text-muted-foreground">
              Set a PIN you'll remember. You'll use it to sign in every time.
            </p>
          </div>

          <Button
            type="submit"
            variant="hero"
            size="lg"
            className="w-full mt-2"
            disabled={busy || !phoneValid || !pinValid}
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign In" : "Create my shop"}
          </Button>
        </form>
      </motion.div>

      <p className="text-center text-xs text-muted-foreground py-4">
        By continuing you accept the terms of use.
      </p>
    </div>
  );
}
