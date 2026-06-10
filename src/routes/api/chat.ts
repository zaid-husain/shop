import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // --- Auth guard: only authenticated shop users can use AI credits ---
          const authHeader = request.headers.get("authorization");
          if (!authHeader?.toLowerCase().startsWith("bearer ")) {
            return new Response("Unauthorized", { status: 401 });
          }
          const token = authHeader.slice(7).trim();
          const SUPABASE_URL = process.env.SUPABASE_URL;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
            return new Response("Server misconfigured", { status: 500 });
          }
          const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: claimsData, error: claimsError } = await sb.auth.getClaims(token);
          if (claimsError || !claimsData?.claims?.sub) {
            return new Response("Unauthorized", { status: 401 });
          }

          const { messages } = (await request.json()) as { messages?: UIMessage[] };
          if (!Array.isArray(messages)) {
            return new Response("Messages required", { status: 400 });
          }
          const key = process.env.LOVABLE_API_KEY;
          if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

          const gateway = createLovableAiGatewayProvider(key);
          const result = streamText({
            model: gateway("google/gemini-3-flash-preview"),
            system: `You are the in-app assistant for "Bharat Auto Parts", a mobile shop management app used by Indian auto parts shop owners.

Your job:
- Help the owner understand how to use the app (billing, products, customers, dashboard).
- Answer business questions about auto parts retail in India (pricing, GST basics, inventory tips, customer follow-ups).
- Be concise, friendly, and use simple English. Owners may not be tech-savvy.
- Prices are always in Indian Rupees (₹).
- Refer to app sections by name: Home (dashboard), Bill (billing), Stock (products), Clients (customers).
- For app questions, give step-by-step instructions: tap → tap → fill → save.
- Never ask for or expose passwords, PINs, or sensitive data.
- If the user types in Hindi or Hinglish, reply in the same style.
- Keep answers under 6 short lines unless a list is needed.`,
            messages: await convertToModelMessages(messages),
          });
          return result.toUIMessageStreamResponse({ originalMessages: messages });
        } catch (err: any) {
          const msg = String(err?.message ?? err);
          if (/429/.test(msg)) return new Response("Rate limit. Try again in a moment.", { status: 429 });
          if (/402/.test(msg)) return new Response("AI credits exhausted. Please upgrade.", { status: 402 });
          return new Response(`AI error: ${msg}`, { status: 500 });
        }
      },
    },
  },
});
