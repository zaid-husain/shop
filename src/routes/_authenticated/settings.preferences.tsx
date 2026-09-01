import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  Sliders,
  Globe,
  IndianRupee,
  Calendar,
  Check,
  Sparkles,
  Bot,
  Volume2,
  VolumeX,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { useSoundPreferences } from "@/hooks/use-sound-preferences";

export const Route = createFileRoute("/_authenticated/settings/preferences")({
  head: () => ({
    meta: [
      { title: "App Preferences — Bharat Auto Parts" },
      {
        name: "description",
        content: "Customize language, regional display and assistant formatting.",
      },
    ],
  }),
  component: PreferencesSettingsPage,
});

function PreferencesSettingsPage() {
  const [lang, setLang] = useState<"en" | "hi" | "hinglish">("en");
  const { preferences, updatePreferences } = useSoundPreferences();

  const handleLanguageChange = (selected: "en" | "hi" | "hinglish") => {
    setLang(selected);
    toast.success(
      `Language preference set to ${selected === "en" ? "English" : selected === "hi" ? "हिन्दी (Hindi)" : "Hinglish"}`,
    );
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
            <h1 className="text-lg font-bold text-foreground">App Preferences</h1>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
            Regional
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-6">
        {/* Language Selection */}
        <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm space-y-4">
          <div className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border/40 pb-3">
            <Globe size={16} className="text-purple-600" /> Language & AI Assistant Dialect
          </div>
          <p className="text-xs text-muted-foreground">
            Select your preferred display and voice assistant communication style.
          </p>

          <div className="space-y-2 pt-1">
            {[
              { id: "en", label: "English", desc: "Standard English interface" },
              {
                id: "hinglish",
                label: "Hinglish",
                desc: "Hindi + English mixed (Recommended for shop billing)",
              },
              { id: "hi", label: "हिन्दी (Hindi)", desc: "Full Hindi voice & interface support" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleLanguageChange(item.id as "en" | "hi" | "hinglish")}
                className={`w-full p-3.5 rounded-xl border flex items-center justify-between transition-all text-left ${
                  lang === item.id
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border/60 hover:bg-muted/30 text-foreground"
                }`}
              >
                <div>
                  <div className="text-sm font-bold">{item.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
                </div>
                {lang === item.id && (
                  <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
                    <Check size={14} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Currency & Financial Standards */}
        <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm space-y-3.5">
          <div className="text-sm font-bold text-foreground flex items-center gap-2 border-b border-border/40 pb-3">
            <IndianRupee size={16} className="text-emerald-600" /> Currency & Regional Formats
          </div>

          <div className="flex items-center justify-between text-sm py-1 border-b border-border/30">
            <span className="text-muted-foreground flex items-center gap-2">
              <IndianRupee size={14} /> Primary Currency
            </span>
            <span className="font-bold text-foreground text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md border border-emerald-200/50">
              ₹ INR (Indian Rupee)
            </span>
          </div>

          <div className="flex items-center justify-between text-sm py-1">
            <span className="text-muted-foreground flex items-center gap-2">
              <Calendar size={14} /> Date Format
            </span>
            <span className="font-semibold text-foreground text-xs">
              DD MMM YYYY (e.g. 01 Sep 2026)
            </span>
          </div>
        </div>

        {/* Sound Effects & Audio */}
        <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm space-y-4">
          <div className="text-sm font-bold text-foreground flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-2">
              <Volume2 size={16} className="text-blue-600" /> Sound Effects & Audio
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={preferences.soundEnabled}
                onChange={(e) => updatePreferences({ soundEnabled: e.target.checked })}
              />
              <div className="w-11 h-6 bg-muted-foreground/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          <div
            className={`transition-opacity ${preferences.soundEnabled ? "opacity-100" : "opacity-50 pointer-events-none"}`}
          >
            <div className="flex items-center justify-between text-sm py-1 mb-2">
              <span className="text-muted-foreground flex items-center gap-2">
                <Bell size={14} /> Volume ({preferences.volume}%)
              </span>
            </div>
            <div className="flex items-center gap-4">
              <VolumeX size={16} className="text-muted-foreground shrink-0" />
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={preferences.volume}
                onChange={(e) => updatePreferences({ volume: parseInt(e.target.value) })}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <Volume2 size={16} className="text-muted-foreground shrink-0" />
            </div>
          </div>
        </div>

        {/* AI Assistant Note */}
        <div className="bg-purple-50/60 rounded-2xl p-4 border border-purple-200/60 text-xs text-purple-900 space-y-2">
          <div className="font-bold flex items-center gap-1.5 text-purple-950">
            <Bot size={14} className="text-purple-700" /> AI Assistant Optimization
          </div>
          <p className="leading-relaxed text-purple-800">
            Bharat Auto Parts voice & AI tools dynamically recognize Hindi and Hinglish voice inputs
            for adding khata transactions, finding parts, and creating invoices.
          </p>
        </div>
      </div>
    </div>
  );
}
