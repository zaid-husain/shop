/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mic, MicOff, Send, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CreateProductForm,
  UpdateProductForm,
  DeleteProductCard,
  StockAdjustmentForm,
} from "@/components/ui/../ai-elements/ProductForms";
import {
  CreateCustomerForm,
  UpdateCustomerForm,
  DeleteCustomerCard,
  KhataEntryForm,
} from "@/components/ui/../ai-elements/CustomerForms";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({
    meta: [
      { title: "AI Assistant — Bharat Auto Parts" },
      {
        name: "description",
        content:
          "Ask the AI shop assistant questions about billing, inventory, and managing your auto parts business.",
      },
    ],
  }),
  component: AssistantPage,
});

const SUGGESTIONS = [
  "Servo oil ki price?",
  "Low stock items dikhao",
  "Aaj ki sale kitni hui?",
  "Top selling products",
];

function parseMessageText(rawText: string) {
  // Backwards compatibility for preview_card
  let match = rawText.match(/:::preview_card\n([\s\S]*?)\n:::/);
  if (match) {
    try {
      const data = JSON.parse(match[1]);
      return { text: rawText.replace(match[0], "").trim(), actionCard: data };
    } catch {
      return { text: rawText, actionCard: null };
    }
  }

  // New action_card logic
  match = rawText.match(/:::action_card\n([\s\S]*?)\n:::/);
  if (match) {
    try {
      const data = JSON.parse(match[1]);
      return { text: rawText.replace(match[0], "").trim(), actionCard: data };
    } catch {
      return { text: rawText, actionCard: null };
    }
  }
  return { text: rawText, actionCard: null };
}

function AssistantPage() {
  const initial = useMemo<UIMessage[]>(
    () => [
      {
        id: "welcome",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Namaste! 👋 I'm your AI shop assistant. Ask me anything about using Bharat Auto Parts or running your shop. You can also tap the mic to speak.",
          },
        ],
      } as UIMessage,
    ],
    [],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    [],
  );
  const { messages, sendMessage, status, error, setMessages, stop } = useChat({
    id: "assistant",
    messages: initial,
    transport,
    onError: (e) => {
      toast.error(e.message);
      // Remove the hanging "submitted" or empty message if it failed
      setMessages((prev) =>
        prev.filter((m) => m.parts.some((p) => p.type === "text" && (p as { text?: string }).text)),
      );
    },
  });

  // Timeout watchdog for stuck requests
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (status === "submitted") {
      timeout = setTimeout(() => {
        stop(); // Safely abort using Vercel AI SDK
        toast.error("The AI Assistant took too long to respond. Please try again.");
        setMessages((prev) =>
          prev.filter((m) =>
            m.parts.some((p) => p.type === "text" && (p as { text?: string }).text),
          ),
        );
      }, 15000);
    }
    return () => clearTimeout(timeout);
  }, [status, setMessages, stop]);

  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const recogRef = useRef<any>(null);
  const lastSpokenIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  // text-to-speech for new assistant messages
  useEffect(() => {
    if (!voiceOn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (status === "streaming") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || last.id === lastSpokenIdRef.current) return;
    const text = last.parts
      .map((p: { type: string; text?: string }) => (p.type === "text" ? p.text : ""))
      .join(" ")
      .trim();
    if (!text) return;

    const parsed = parseMessageText(text);
    const textToSpeak = parsed.text || "Action confirmation pending.";

    lastSpokenIdRef.current = last.id;
    const u = new SpeechSynthesisUtterance(textToSpeak);
    u.lang = "en-IN";
    u.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [messages, voiceOn, status]);

  function send(text: string) {
    const t = text.trim();
    if (!t) return;
    sendMessage({ text: t });
    setInput("");
  }

  function toggleMic() {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice input is not supported on this browser. Try Chrome on Android.");
      return;
    }
    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }
    const r = new SR();
    r.lang = "en-IN";
    r.continuous = false;
    r.interimResults = true;
    let finalText = "";
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setInput(finalText + interim);
    };
    r.onerror = () => setListening(false);
    r.onend = () => {
      setListening(false);
      if (finalText.trim()) send(finalText);
    };
    recogRef.current = r;
    setListening(true);
    r.start();
  }

  function toggleVoice() {
    setVoiceOn((v) => {
      if (v && typeof window !== "undefined") window.speechSynthesis?.cancel();
      return !v;
    });
  }

  const busy = status === "submitted" || status === "streaming";

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      <ScreenHeader
        title="AI Assistant"
        subtitle="Ask anything about your shop"
        right={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleVoice}
            className="text-primary-foreground hover:bg-white/10"
            aria-label="Toggle voice output"
          >
            {voiceOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </Button>
        }
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <AnimatePresence initial={false}>
          {messages.map((m) => {
            const rawText = m.parts
              .map((p: { type: string; text?: string }) => (p.type === "text" ? p.text : ""))
              .join("");
            const isUser = m.role === "user";

            const { text, actionCard } = isUser
              ? { text: rawText, actionCard: null }
              : parseMessageText(rawText);

            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap shadow-card ${
                    isUser
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-card text-foreground rounded-bl-sm"
                  }`}
                >
                  {!isUser && (
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-accent mb-1">
                      <Sparkles size={10} /> Assistant
                    </div>
                  )}
                  {text ||
                    (busy && m.role === "assistant" && m.id === messages[messages.length - 1].id
                      ? "…"
                      : "")}
                </div>
                {actionCard && (
                  <div className="mt-2 w-full max-w-md">
                    {actionCard.type === "CREATE_PRODUCT" && (
                      <CreateProductForm payload={actionCard.payload} onComplete={() => {}} />
                    )}
                    {actionCard.type === "UPDATE_PRODUCT" && (
                      <UpdateProductForm payload={actionCard.payload} onComplete={() => {}} />
                    )}
                    {actionCard.type === "DELETE_PRODUCT" && (
                      <DeleteProductCard payload={actionCard.payload} onComplete={() => {}} />
                    )}
                    {(actionCard.type === "UPDATE_STOCK" || actionCard.type === "STOCK_REDUCE") && (
                      <StockAdjustmentForm payload={actionCard.payload} onComplete={() => {}} />
                    )}
                    {actionCard.type === "CREATE_CUSTOMER" && (
                      <CreateCustomerForm payload={actionCard.payload} onComplete={() => {}} />
                    )}
                    {actionCard.type === "UPDATE_CUSTOMER" && (
                      <UpdateCustomerForm payload={actionCard.payload} onComplete={() => {}} />
                    )}
                    {actionCard.type === "DELETE_CUSTOMER" && (
                      <DeleteCustomerCard payload={actionCard.payload} onComplete={() => {}} />
                    )}
                    {(actionCard.type === "PAYMENT_CREATE" ||
                      actionCard.type === "CREDIT_CREATE" ||
                      actionCard.type === "DEBIT_CREATE") && (
                      <KhataEntryForm
                        payload={actionCard.payload}
                        intentType={actionCard.type}
                        onComplete={() => {}}
                      />
                    )}
                    {actionCard.type === "MULTIPLE_MATCHES" && (
                      <div className="bg-card text-card-foreground p-4 rounded-2xl rounded-bl-sm shadow-card border border-border">
                        <div className="font-bold text-sm mb-3 text-primary">
                          Select {actionCard.payload.intent.replace(/_/g, " ")} Target
                        </div>
                        <div className="flex flex-col gap-2">
                          {actionCard.payload.matches.map((m: any) => (
                            <Button
                              key={m.id}
                              variant="outline"
                              className="justify-start text-left h-auto py-2"
                              onClick={() =>
                                send(
                                  `${m.name} ${actionCard.payload.intent.toLowerCase().replace(/_/g, " ")}`,
                                )
                              }
                            >
                              <div>
                                <div className="font-semibold">{m.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {m.mobile || `₹${m.selling_price || 0}`}
                                </div>
                              </div>
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Fallback for unhandled forms */}
                    {![
                      "CREATE_PRODUCT",
                      "UPDATE_PRODUCT",
                      "DELETE_PRODUCT",
                      "UPDATE_STOCK",
                      "STOCK_REDUCE",
                      "CREATE_CUSTOMER",
                      "UPDATE_CUSTOMER",
                      "DELETE_CUSTOMER",
                      "PAYMENT_CREATE",
                      "CREDIT_CREATE",
                      "DEBIT_CREATE",
                      "MULTIPLE_MATCHES",
                    ].includes(actionCard.type) && (
                      <div className="bg-card text-card-foreground p-3 rounded-2xl rounded-bl-sm shadow-card border border-border">
                        <div className="font-bold text-sm mb-2 text-primary">
                          {actionCard.type.replace(/_/g, " ")}
                        </div>
                        <div className="text-sm whitespace-pre-wrap text-muted-foreground">
                          {actionCard.description}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" onClick={() => send("yes")} className="flex-1">
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => send("no")}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {status === "submitted" && (
          <div className="flex justify-start">
            <div className="bg-card rounded-2xl px-4 py-3 shadow-card text-sm text-muted-foreground">
              Thinking…
            </div>
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-xs bg-secondary text-secondary-foreground rounded-full px-3 py-1.5 font-medium"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="px-3 py-2 border-t border-border bg-card flex items-end gap-2"
      >
        <Button
          type="button"
          size="icon"
          variant={listening ? "destructive" : "outline"}
          onClick={toggleMic}
          aria-label="Voice input"
        >
          {listening ? <MicOff size={18} /> : <Mic size={18} />}
        </Button>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={listening ? "Listening…" : "Type or speak…"}
          rows={1}
          className="flex-1 min-h-[44px] max-h-32 resize-none"
        />
        <Button
          type="submit"
          size="icon"
          variant="hero"
          disabled={busy || !input.trim()}
          aria-label="Send"
        >
          <Send size={18} />
        </Button>
      </form>
    </div>
  );
}
