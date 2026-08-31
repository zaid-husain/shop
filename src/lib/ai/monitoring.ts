/**
 * AI Monitoring & Analytics Layer
 *
 * Captures telemetry for all AI requests.
 * Logs performance (latency), usage (intents, modules), and errors
 * directly to PostgreSQL.
 *
 * NEVER logs PII, passwords, API keys, JWTs, or financial secrets.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Intent } from "./intent-detector";
import type { RouteModule } from "./router";
import type { AIIntent } from "./core/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AITelemetryPayload {
  /** Unique ID for the shop/tenant */
  shopId: string;
  /** Unique ID for the user */
  userId: string;
  /** The module chosen by the router */
  module: RouteModule;
  /** The specific intent detected */
  intent: AIIntent | Intent | string;
  /** What product/customer was searched (safe for analytics) */
  searchEntity?: string | null;
  /** Total end-to-end processing time (ms) */
  totalLatencyMs: number;
  /** Time spent querying the database (ms) */
  dbLatencyMs: number;
  /** Time spent calling the LLM (ms, 0 if deterministic) */
  aiLatencyMs: number;
  /** Did the request succeed? */
  success: boolean;
  /** Was this a cache hit? */
  cacheHit: boolean;
  /** Error category if failed */
  errorType?: "PERMISSION_DENIED" | "DB_ERROR" | "AI_TIMEOUT" | "AI_RATE_LIMIT" | "UNKNOWN" | null;
  /** Which path was taken? */
  pathType?: "FAST" | "LLM";
  /** Outcome of entity resolution */
  entityResolutionOutcome?: "RESOLVED" | "AMBIGUOUS" | "NOT_FOUND";
}

// ─── Database Telemetry Service ─────────────────────────────────────────────

export async function logAITelemetry(
  sb: SupabaseClient,
  payload: AITelemetryPayload,
): Promise<void> {
  // Fire-and-forget logging. We don't await/throw to prevent blocking the user response.
  sb.from("ai_telemetry_logs")
    .insert({
      shop_id: payload.shopId,
      user_id: payload.userId,
      module: payload.module,
      intent: payload.intent,
      search_entity: payload.searchEntity || null,
      total_latency_ms: payload.totalLatencyMs,
      db_latency_ms: payload.dbLatencyMs,
      ai_latency_ms: payload.aiLatencyMs,
      success: payload.success,
      cache_hit: payload.cacheHit,
      error_type: payload.errorType || null,
      path_type: payload.pathType || "FAST",
      entity_resolution_outcome: payload.entityResolutionOutcome || null,
    })
    .then(({ error }) => {
      if (error) {
        console.error("Failed to log AI telemetry:", error);
      }
    });
}

/**
 * Utility for tracking execution time of an async function
 */
export async function trackDuration<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return { result, durationMs: Math.round(end - start) };
}
