import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Info, Sparkles, ShieldCheck, Zap, Layers, Heart } from "lucide-react";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/_authenticated/settings/about")({
  head: () => ({
    meta: [
      { title: "About Bharat Auto Parts" },
      { name: "description", content: "Version information and platform attribution." },
    ],
  }),
  component: AboutSettingsPage,
});

function AboutSettingsPage() {
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
            <h1 className="text-lg font-bold text-foreground">About</h1>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            v1.0.0
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-6">
        {/* Brand Card */}
        <div className="bg-white rounded-3xl p-6 border border-border/60 shadow-sm flex flex-col items-center text-center space-y-3">
          <Logo size={64} />
          <div>
            <h2 className="text-xl font-bold text-foreground">Bharat Auto Parts</h2>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
              Automotive Spare Parts & Khata Management Software
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">
            <Sparkles size={13} /> Production Release · v1.0.0
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm space-y-3.5">
          <div className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border/40 pb-3">
            <Layers size={16} className="text-primary" /> Platform Highlights
          </div>

          <div className="space-y-3 pt-1 text-xs">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <ShieldCheck size={16} />
              </div>
              <div>
                <div className="font-bold text-foreground">Bank-Grade Shop Isolation</div>
                <div className="text-muted-foreground mt-0.5">
                  Multi-tenant Postgres RLS safeguards your inventory, sales, and khata records.
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Zap size={16} />
              </div>
              <div>
                <div className="font-bold text-foreground">Real-Time Multi-Device Sync</div>
                <div className="text-muted-foreground mt-0.5">
                  Transactions made on mobile sync instantaneously with counter computers and
                  tablets.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Attribution Card */}
        <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm text-center space-y-2">
          <div className="text-xs text-muted-foreground">
            Crafted for automobile retailers & spare parts distributors
          </div>
          <div className="text-sm font-bold text-foreground flex items-center justify-center gap-1.5">
            Powered by <span className="text-primary font-extrabold tracking-tight">Zashly</span>
          </div>
          <p className="text-[11px] text-muted-foreground/80 pt-1">
            &copy; {new Date().getFullYear()} Bharat Auto Parts. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
