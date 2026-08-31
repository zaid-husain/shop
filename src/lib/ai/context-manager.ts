/**
 * AI Core — Context Manager
 *
 * Tracks conversation context per user session to support follow-up queries.
 * Example: "servo oil price" → "2 do" → "stock?"
 *
 * Backed by PostgreSQL (Supabase) for serverless compatibility.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIConversationContext, AIPendingAction, AIIntent } from "./core/types";
import { CONTEXT_TTL_MS, PENDING_ACTION_TTL_MS } from "./core/constants";

// ─── Default Context ────────────────────────────────────────────────────────

function emptyContext(): AIConversationContext {
  return {
    activeProductId: null,
    activeProductName: null,
    activeCustomerId: null,
    activeCustomerName: null,
    activeTopic: null,
    activeDateRange: null,
    pendingAction: null,
    lastIntent: null,
    lastMessageTimestamp: Date.now(),
  };
}

// ─── Database Operations ────────────────────────────────────────────────────

/**
 * Get the current conversation context for a user from the database.
 * Returns null if no context exists or it has expired.
 */
export async function getContext(
  sb: SupabaseClient,
  shopId: string,
  userId: string,
): Promise<AIConversationContext | null> {
  const { data, error } = await sb
    .from("ai_conversations")
    .select("context_data, updated_at")
    .eq("shop_id", shopId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const lastUpdated = new Date(data.updated_at).getTime();
  const ctx = data.context_data as AIConversationContext;

  // 1. Check overall TTL
  if (Date.now() - lastUpdated > CONTEXT_TTL_MS) {
    await clearContext(sb, shopId, userId);
    return null;
  }

  // 2. Check pending action TTL
  if (ctx.pendingAction) {
    if (Date.now() > ctx.pendingAction.expiresAt) {
      // Action expired, clear it but keep rest of context
      ctx.pendingAction = null;
      await updateContext(sb, shopId, userId, { pendingAction: null });
    }
  }

  return ctx;
}

/**
 * Update the conversation context after a successful query.
 */
export async function updateContext(
  sb: SupabaseClient,
  shopId: string,
  userId: string,
  update: Partial<AIConversationContext>,
): Promise<void> {
  // First get existing
  const current = (await getContext(sb, shopId, userId)) || emptyContext();

  const merged: AIConversationContext = {
    ...current,
    ...update,
    lastMessageTimestamp: Date.now(),
  };

  // Upsert into DB
  const { error } = await sb.from("ai_conversations").upsert(
    {
      shop_id: shopId,
      user_id: userId,
      context_data: merged, // Supabase jsonb
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shop_id, user_id" },
  );

  if (error) {
    console.error("Failed to update AI context:", error);
  }
}

/**
 * Touch the context to keep it alive without changing data.
 */
export async function touchContext(
  sb: SupabaseClient,
  shopId: string,
  userId: string,
): Promise<void> {
  await sb
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("shop_id", shopId)
    .eq("user_id", userId);
}

/**
 * Clear context for a user.
 */
export async function clearContext(
  sb: SupabaseClient,
  shopId: string,
  userId: string,
): Promise<void> {
  await sb.from("ai_conversations").delete().eq("shop_id", shopId).eq("user_id", userId);
}

/**
 * Set the active product context.
 */
export async function setActiveProduct(
  sb: SupabaseClient,
  shopId: string,
  userId: string,
  productId: string,
  productName: string,
): Promise<void> {
  await updateContext(sb, shopId, userId, {
    activeProductId: productId,
    activeProductName: productName,
    activeTopic: "product",
  });
}

/**
 * Set the active customer context.
 */
export async function setActiveCustomer(
  sb: SupabaseClient,
  shopId: string,
  userId: string,
  customerId: string,
  customerName: string,
): Promise<void> {
  await updateContext(sb, shopId, userId, {
    activeCustomerId: customerId,
    activeCustomerName: customerName,
    activeTopic: "customer",
  });
}

/**
 * Update the last intent.
 */
export async function setLastIntent(
  sb: SupabaseClient,
  shopId: string,
  userId: string,
  intent: AIIntent,
): Promise<void> {
  await updateContext(sb, shopId, userId, { lastIntent: intent });
}

/**
 * Set a pending action for confirmation.
 */
export async function setPendingAction(
  sb: SupabaseClient,
  shopId: string,
  userId: string,
  action: Omit<AIPendingAction, "createdAt" | "expiresAt">,
): Promise<void> {
  const pendingAction: AIPendingAction = {
    ...action,
    createdAt: Date.now(),
    expiresAt: Date.now() + PENDING_ACTION_TTL_MS,
  };

  await updateContext(sb, shopId, userId, { pendingAction });
}

/**
 * Clear only the pending action from context.
 */
export async function clearPendingAction(
  sb: SupabaseClient,
  shopId: string,
  userId: string,
): Promise<void> {
  await updateContext(sb, shopId, userId, { pendingAction: null });
}
