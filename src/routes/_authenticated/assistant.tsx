import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Sparkles,
  ShoppingCart,
  LayoutDashboard,
  Zap,
  Mic,
  BookOpen,
  ShieldCheck,
} from "lucide-react";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({
    meta: [
      { title: "AI Assistant (Coming Soon) — Bharat Auto Parts" },
      {
        name: "description",
        content:
          "Smart AI shop assistant for Bharat Auto Parts. Voice and automated intelligence for billing, inventory, and Khata coming soon.",
      },
    ],
  }),
  component: AssistantPage,
});

const UPCOMING_FEATURES = [
  {
    icon: Zap,
    title: "Instant Stock & Price Lookup",
    desc: "Search parts, check MRP, purchase rate, and current shelf stock instantly.",
  },
  {
    icon: BookOpen,
    title: "Automated Customer Khata",
    desc: "Check udhaar balances, record payments, and track customer history seamlessly.",
  },
  {
    icon: Mic,
    title: "Hindi & English Voice Support",
    desc: "Speak naturally in Hindi or English to find parts or manage shop tasks hands-free.",
  },
  {
    icon: ShieldCheck,
    title: "Integrated n8n AI Agent",
    desc: "Enterprise-grade automations directly integrated with your shop database.",
  },
];

function AssistantPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <ScreenHeader title="AI Assistant" subtitle="Smart Shop Intelligence" />

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden rounded-3xl bg-card border border-border p-6 shadow-floating text-center"
        >
          <div className="absolute top-0 right-0 w-36 h-36 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-36 h-36 bg-accent/10 rounded-full blur-2xl pointer-events-none" />

          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-semibold uppercase tracking-wider mb-4">
            <Sparkles className="w-3.5 h-3.5 animate-spin-slow" />
            <span>Coming Soon</span>
          </div>

          {/* Icon */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-foreground mx-auto mb-4 shadow-lg shadow-primary/20">
            <Sparkles className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold text-foreground mb-2">
            AI Assistant is Under Construction
          </h2>

          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto mb-6">
            Bharat Auto Parts ke liye advanced AI Agent develop ho raha hai. Jald hi aap voice aur
            text ke sath seedha stock check, billing, aur khata manage kar sakenge.
          </p>

          {/* Quick Actions */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <Link to="/dashboard" className="flex-1">
              <Button variant="hero" className="w-full gap-2 justify-center">
                <LayoutDashboard className="w-4 h-4" />
                Go to Home
              </Button>
            </Link>
            <Link to="/billing" className="flex-1">
              <Button variant="outline" className="w-full gap-2 justify-center">
                <ShoppingCart className="w-4 h-4" />
                Open Bill
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* Feature Highlights */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              What's Coming in AI Agent
            </h3>
            <span className="text-[11px] text-primary font-medium">In Development</span>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {UPCOMING_FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-card border border-border/80 shadow-sm"
              >
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-primary shrink-0 mt-0.5">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold text-foreground">{title}</h4>
                  <p className="text-xs text-muted-foreground leading-snug">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
