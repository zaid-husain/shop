import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createGroq } from "@ai-sdk/groq";

import { getContext, clearPendingAction, updateContext } from "@/lib/ai/context-manager";
import {
  authorizeAction,
  type PermissionContext,
  type AIAction,
  getGracefulError,
  type UserRole,
} from "@/lib/ai/permissions";
import { executeQuery, executePendingAction } from "@/lib/ai/query-executor";
import { buildResponse } from "@/lib/ai/response-builder";
import { logAITelemetry, trackDuration } from "@/lib/ai/monitoring";
import { getPromptForModule } from "@/lib/ai/prompts";
import { createShopTools } from "@/lib/ai/tools";
import { orchestrateQuery } from "@/lib/ai/core/orchestrator";
import { getActionForIntent } from "@/lib/ai/core/constants";
import type { AIIntent, AIPendingAction } from "@/lib/ai/core/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function textToStreamResponse(text: string): Response {
  const id = crypto.randomUUID();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text-start", id })}\n\n`));
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "text-delta", id, delta: text })}\n\n`),
      );
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Vercel-AI-UI-Message-Stream": "v1",
      "X-Accel-Buffering": "no",
    },
  });
}

function extractUserText(messages: UIMessage[]): string {
  if (messages.length === 0) return "";
  const last = messages[messages.length - 1];
  if (last?.role !== "user") return "";
  return (
    last.parts
      ?.map((p: { type: string; text?: string }) => (p.type === "text" ? p.text : ""))
      .join("")
      .trim() || ""
  );
}

// ─── Map Intent to AI Action for RBAC ───────────────────────────────────────

function mapIntentToAction(intent: string): AIAction {
  // Use the constants map, fallback to GENERAL_AI
  const action = getActionForIntent(intent as AIIntent);
  if (action) {
    // Map the new AIAction to the old Permission AIAction for now
    if (action === "READ") return "READ_INVENTORY";
    if (action === "CREATE") return "CREATE_PRODUCT";
    if (action === "UPDATE") return "UPDATE_PRICE";
    if (action === "DELETE") return "DELETE_PRODUCT";
  }
  return "GENERAL_AI";
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTotal = performance.now();
        let dbLatencyMs = 0;
        let aiLatencyMs = 0;
        let authUserId = "";
        let authShopId = "";
        const routerModule = "UNKNOWN";
        let resolvedIntent = "UNKNOWN";
        let searchEntityText = "";
        let pathType: "FAST" | "LLM" = "FAST";

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.toLowerCase().startsWith("bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.slice(7).trim();
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });

        try {
          // ── 1. Auth ──
          const { data: claimsData } = await sb.auth.getUser(token);
          if (!claimsData?.user?.id) return new Response("Unauthorized", { status: 401 });
          authUserId = claimsData.user.id;

          const [{ data: profile, error: profileError }, { data: roles }] = await Promise.all([
            sb.from("profiles").select("shop_id").eq("id", authUserId).single(),
            sb.from("user_roles").select("role").eq("user_id", authUserId),
          ]);

          if (profileError || !profile) {
            console.error("Profile fetch error:", profileError);
            return new Response(
              JSON.stringify({ error: "Profile missing", details: profileError }),
              { status: 403 },
            );
          }
          authShopId = profile.shop_id;
          const userRole = roles?.[0]?.role || "unknown";

          // ── 2. Parse Request ──
          const { messages } = (await request.json()) as { messages?: UIMessage[] };
          const userText = extractUserText(messages || []);
          if (!userText) return textToStreamResponse("Namaste! Kuch bhi poocho...");

          // ── Handle Pending Confirmation ──
          const ctx = await getContext(sb, authShopId, authUserId);
          if (ctx?.pendingAction) {
            const lowerText = userText.toLowerCase();
            const isConfirm = /\b(haan|yes|y|confirm|karo|kar do)\b/.test(lowerText);
            const isCancel = /\b(nahi|no|n|cancel|mat karo|chhod do)\b/.test(lowerText);

            if (isConfirm) {
              const resMsg = await executePendingAction(
                sb,
                authShopId,
                ctx.pendingAction as AIPendingAction,
              );
              await clearPendingAction(sb, authShopId, authUserId);
              return textToStreamResponse(resMsg);
            } else if (isCancel) {
              await clearPendingAction(sb, authShopId, authUserId);
              return textToStreamResponse("❌ Action cancel kar diya gaya hai.");
            }

            // If they type something unrelated, clear pending action and proceed with new request
            await clearPendingAction(sb, authShopId, authUserId);
          }

          // ── 3. Core Engine Orchestration ──
          const { result: orchestration, durationMs: orchDuration } = await trackDuration(() =>
            orchestrateQuery(sb, authShopId, authUserId, userText),
          );

          if (orchestration.path === "LLM") aiLatencyMs += orchDuration;
          else dbLatencyMs += orchDuration;

          pathType = orchestration.path;
          resolvedIntent = orchestration.structuredOutput.intent;
          searchEntityText = orchestration.structuredOutput.entityQuery || "";

          // ── 4. Ambiguity / Clarification ──
          if (orchestration.structuredOutput.needsClarification) {
            return textToStreamResponse(
              orchestration.clarificationMessage || "Kya aap clarify kar sakte hain?",
            );
          }

          // ── 5. Authorization (RBAC) ──
          // Use the old map for now, to ensure Phase 2 compat
          const requiredAction = mapIntentToAction(resolvedIntent);
          const permissionCtx: PermissionContext = {
            userId: authUserId,
            role: userRole as UserRole,
            shopId: authShopId,
          };

          const authResult = authorizeAction(permissionCtx, requiredAction);
          if (!authResult.allowed) {
            logAITelemetry(sb, {
              shopId: authShopId,
              userId: authUserId,
              module: routerModule,
              intent: resolvedIntent as AIIntent,
              searchEntity: searchEntityText,
              totalLatencyMs: Math.round(performance.now() - startTotal),
              dbLatencyMs,
              aiLatencyMs,
              success: false,
              cacheHit: false,
              errorType: "PERMISSION_DENIED",
              pathType,
            });
            return textToStreamResponse(getGracefulError(authResult.reason));
          }

          // ── 6. Database Executor ──
          if (resolvedIntent !== "GENERAL_CHAT" && resolvedIntent !== "UNKNOWN") {
            // Map new structured output to old extracted entities format for query-executor
            const extractedEntities = {
              productQuery:
                orchestration.structuredOutput.entityType === "product" ? searchEntityText : null,
              customerQuery:
                orchestration.structuredOutput.entityType === "customer" ? searchEntityText : null,
              quantity: (orchestration.structuredOutput.parameters?.quantity as number) || null,
              priceAmount:
                (orchestration.structuredOutput.parameters?.price as number) ||
                (orchestration.structuredOutput.parameters?.selling_price as number) ||
                null,
              invoiceNumber: null,
              phoneNumber: null,
              vehicleNumber: null,
              dateRange: null,
            };

            const { result: queryResult, durationMs } = await trackDuration(() =>
              executeQuery(
                sb,
                authShopId,
                resolvedIntent as AIIntent,
                extractedEntities as import("../../lib/ai/entity-extractor").ExtractedEntities,
              ),
            );
            dbLatencyMs += durationMs;

            const responseText = buildResponse(
              resolvedIntent as AIIntent,
              queryResult,
              extractedEntities.quantity,
            );

            // Persist pending action
            if (queryResult.type === "pending_confirmation" && queryResult.pendingAction) {
              await updateContext(sb, authShopId, authUserId, {
                pendingAction: queryResult.pendingAction as AIPendingAction,
              });
            }

            logAITelemetry(sb, {
              shopId: authShopId,
              userId: authUserId,
              module: routerModule,
              intent: resolvedIntent as AIIntent,
              searchEntity: searchEntityText,
              totalLatencyMs: Math.round(performance.now() - startTotal),
              dbLatencyMs,
              aiLatencyMs,
              success: queryResult.type !== "error",
              cacheHit: false,
              pathType,
            });
            return textToStreamResponse(responseText);
          }

          // ── 7. LLM Fallback (Groq) for GENERAL_CHAT ──
          const groqKey = process.env.GROQ_API_KEY;
          if (!groqKey) {
            return textToStreamResponse(
              "AI Assistant abhi available nahi hai. Simple queries try karo.",
            );
          }

          const systemPrompt = getPromptForModule("GENERAL_AI");
          const groq = createGroq({ apiKey: groqKey });
          const shopTools = createShopTools(sb, authShopId);

          const aiStart = performance.now();
          const result = streamText({
            model: groq("llama-3.3-70b-versatile"),
            system: systemPrompt,
            messages: await convertToModelMessages(messages!),
            tools: shopTools,
            onFinish: () => {
              aiLatencyMs += Math.round(performance.now() - aiStart);
              logAITelemetry(sb, {
                shopId: authShopId,
                userId: authUserId,
                module: "GENERAL_AI",
                intent: "GENERAL_CHAT" as AIIntent,
                searchEntity: searchEntityText,
                totalLatencyMs: Math.round(performance.now() - startTotal),
                dbLatencyMs,
                aiLatencyMs,
                success: true,
                cacheHit: false,
                pathType: "LLM",
              });
            },
          });

          return result.toUIMessageStreamResponse({ originalMessages: messages });
        } catch (err: unknown) {
          logAITelemetry(sb, {
            shopId: authShopId,
            userId: authUserId,
            module: "UNKNOWN",
            intent: "UNKNOWN" as AIIntent,
            searchEntity: searchEntityText,
            totalLatencyMs: Math.round(performance.now() - startTotal),
            dbLatencyMs,
            aiLatencyMs,
            success: false,
            cacheHit: false,
            errorType: "UNKNOWN",
          });
          return textToStreamResponse("Kuch gadbad ho gayi. Please dobara try karo.");
        }
      },
    },
  },
});
