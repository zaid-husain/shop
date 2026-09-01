import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  HelpCircle,
  BookOpen,
  ClipboardList,
  Receipt,
  Users,
  ShieldCheck,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/settings/help")({
  head: () => ({
    meta: [
      { title: "Help & Support — Bharat Auto Parts" },
      { name: "description", content: "Guides, tutorials, and frequently asked questions." },
    ],
  }),
  component: HelpSettingsPage,
});

function HelpSettingsPage() {
  const [openSection, setOpenSection] = useState<number | null>(0);

  const faqs = [
    {
      icon: BookOpen,
      iconColor: "text-blue-600 bg-blue-50",
      title: "How Khata ledger works",
      content:
        "Every customer has a live Khata ledger. When you give items on credit, tap 'Give Credit' to increase their due balance. When they make a cash, UPI, or bank payment, tap 'Got Payment' to reduce their balance. You can send reminder messages on WhatsApp directly from the customer's Khata profile.",
    },
    {
      icon: ClipboardList,
      iconColor: "text-amber-600 bg-amber-50",
      title: "How to use Short Maal",
      content:
        "Short Maal helps you track out-of-stock items demanded by customers. When a customer asks for a part not available in the shop, quickly add it with Priority (Urgent, High, Normal). You can mark items as Ordered or Received when you procure them from suppliers.",
    },
    {
      icon: Receipt,
      iconColor: "text-emerald-600 bg-emerald-50",
      title: "Creating Bills & GST Invoices",
      content:
        "Go to Quick Billing from the Dashboard. Search or scan parts, select quantities and discount, and pick customer details. Invoices automatically update your stock count and record payment amounts in the customer's ledger.",
    },
    {
      icon: Users,
      iconColor: "text-indigo-600 bg-indigo-50",
      title: "Adding Team Members & Staff",
      content:
        "Owners and Managers can invite staff using their 10-digit mobile number in the Team section. When the invited member logs in using their mobile number, they will automatically join your shop. Staff members cannot delete records or change shop settings.",
    },
    {
      icon: ShieldCheck,
      iconColor: "text-teal-600 bg-teal-50",
      title: "Protecting Sensitive Actions with PIN",
      content:
        "Your login PIN protects sensitive operations like Team Management and critical configuration. You can change your PIN anytime in the 'Security & PIN' section using your current PIN.",
    },
  ];

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
            <h1 className="text-lg font-bold text-foreground">Help & Support</h1>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
            Guide
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-6">
        {/* Banner */}
        <div className="bg-gradient-to-br from-[#0B3D91] to-[#1258CD] rounded-3xl p-5 text-white shadow-md space-y-2">
          <div className="flex items-center gap-2 font-bold text-base">
            <Sparkles size={18} /> Bharat Auto Parts User Guide
          </div>
          <p className="text-xs text-white/80 leading-relaxed">
            Find answers to common questions about managing customers, inventory, billing, team
            permissions, and Khata ledgers.
          </p>
        </div>

        {/* FAQs */}
        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
            Common Topics & How-To Guides
          </div>

          <div className="space-y-2.5">
            {faqs.map((faq, index) => {
              const isOpen = openSection === index;
              const Icon = faq.icon;
              return (
                <div
                  key={index}
                  className="bg-white rounded-2xl border border-border/60 shadow-sm overflow-hidden transition-all"
                >
                  <button
                    type="button"
                    onClick={() => setOpenSection(isOpen ? null : index)}
                    className="w-full p-4 text-left flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl ${faq.iconColor} flex items-center justify-center shrink-0 shadow-xs`}
                      >
                        <Icon size={18} />
                      </div>
                      <span className="text-sm font-bold text-foreground">{faq.title}</span>
                    </div>
                    <ChevronDown
                      size={18}
                      className={`text-muted-foreground transition-transform duration-200 shrink-0 ${
                        isOpen ? "rotate-180 text-foreground" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 text-xs text-muted-foreground leading-relaxed border-t border-border/30">
                      {faq.content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Contact Note */}
        <div className="bg-white rounded-2xl p-5 border border-border/60 shadow-sm space-y-2 text-center">
          <h3 className="text-sm font-bold text-foreground">Need More Assistance?</h3>
          <p className="text-xs text-muted-foreground">
            Contact your shop administrator or support team for assistance with hardware, barcode
            scanners, or custom integrations.
          </p>
        </div>
      </div>
    </div>
  );
}
