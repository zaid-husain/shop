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

export const Route = createFileRoute("/_authenticated/assistant")({
  component: AssistantPage,
});

const SUGGESTIONS = [
  "How do I create a bill?",
  "Add a new product to stock",
  "Today's sales summary",
  "Send invoice on WhatsApp",
];

function AssistantPage() {
  const initial = useMemo<UIMessage[]>(
    () => [
      {
        id: "welcome",
        role: "assistant",
        parts: [
          {
            type: "text",
            text:
              "Namaste! 👋 I'm your AI shop assistant. Ask me anything about using Bharat Auto Parts or running your shop. You can also tap the mic to speak.",
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
        headers: async () => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    [],
  );
  const { messages, sendMessage, status, error } = useChat({
    id: "assistant",
    messages: initial,
    transport,
    onError: (e) => toast.error(e.message),
  });

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
    const text = last.parts.map((p: any) => (p.type === "text" ? p.text : "")).join(" ").trim();
    if (!text) return;
    lastSpokenIdRef.current = last.id;
    const u = new SpeechSynthesisUtterance(text);
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
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
    <div className="flex flex-col h-[100dvh] pb-20">
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
            const text = m.parts.map((p: any) => (p.type === "text" ? p.text : "")).join("");
            const isUser = m.role === "user";
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
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
                  {text || (busy && m.role === "assistant" ? "…" : "")}
                </div>
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
        onSubmit={(e) => { e.preventDefault(); send(input); }}
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
