/**
 * AI Core — Main Orchestrator
 *
 * Coordinates the full AI pipeline:
 * 1. Normalize input
 * 2. Deterministic Router (Fast Path vs LLM Path)
 * 3. Context tracking & update
 * 4. Entity extraction / resolution
 * 5. Returns execution plan (Structured Output)
 *
 * It does NOT execute database operations itself. It returns an `AIStructuredOutput`
 * which the API route then passes to `query-executor` or the new tool system.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeInput, normalizeForEntityExtraction } from "./normalizer";
import { routeQuery, shouldUseLLM } from "../router";
import { understandWithLLM } from "./llm-understander";
import { getContext, setActiveProduct, setActiveCustomer, setLastIntent } from "../context-manager";
import { resolveEntity } from "./entity-resolver";
import { extractEntities } from "../entity-extractor";
import { detectIntent } from "../intent-detector";
import { getActionForIntent, REQUIRES_CONFIRMATION_INTENTS } from "./constants";
import type { AIStructuredOutput, AIConversationContext, AIEntityType, AIIntent } from "./types";

export interface OrchestrationResult {
  structuredOutput: AIStructuredOutput;
  resolvedEntityId: string | null;
  candidates?: unknown[];
  clarificationMessage?: string | null;
  path: "FAST" | "LLM";
}

/**
 * Main entry point for processing a user's natural language query.
 */
export async function orchestrateQuery(
  sb: SupabaseClient,
  shopId: string,
  userId: string,
  rawText: string,
): Promise<OrchestrationResult> {
  // 1. Fetch current conversation context
  const context = await getContext(sb, shopId, userId);

  // 2. Normalize input (lowercase, spell correct)
  const normalizedText = normalizeInput(rawText);

  // 3. Fast Path Routing
  const route = routeQuery(normalizedText);

  // 4. Decide Path
  if (shouldUseLLM(normalizedText, route)) {
    return runLLMPath(sb, shopId, userId, normalizedText, context);
  } else {
    return runFastPath(sb, shopId, userId, normalizedText, route.module, context);
  }
}

// ─── Fast Path (Deterministic) ──────────────────────────────────────────────

async function runFastPath(
  sb: SupabaseClient,
  shopId: string,
  userId: string,
  normalizedText: string,
  module: string,
  context: AIConversationContext | null,
): Promise<OrchestrationResult> {
  // Use legacy deterministic extractor for fast path
  // Note: intent here is a placeholder, since fast path relies on module
  // In a full refactor, the legacy intent-detector would be called here.
  // For now, we simulate a fast path output.

  // Simulate legacy extraction (this bridges legacy fast-path with new types)
  const legacyIntentObj = detectIntent(normalizedText);
  const legacyIntent = legacyIntentObj.intent;

  // Map legacy intent to new AIIntent
  let finalIntent: string = "UNKNOWN";
  if (legacyIntent === "ADD_PRODUCT") finalIntent = "PRODUCT_CREATE";
  else if (legacyIntent === "UPDATE_PRICE" || legacyIntent === "PRODUCT_PRICE")
    finalIntent = "PRODUCT_PRICE";
  else if (legacyIntent === "PRODUCT_PRICE_AND_STOCK" || legacyIntent === "PRODUCT_STOCK")
    finalIntent = "PRODUCT_STOCK";
  else if (legacyIntent === "PRODUCT_SEARCH") finalIntent = "PRODUCT_SEARCH";
  else if (legacyIntent === "CREATE_CUSTOMER") finalIntent = "CUSTOMER_CREATE";
  else if (legacyIntent === "CUSTOMER_SEARCH") finalIntent = "CUSTOMER_SEARCH";
  else if (legacyIntent === "CUSTOMER_BALANCE") finalIntent = "CUSTOMER_BALANCE";
  else if (legacyIntent === "PAYMENT_CREATE") finalIntent = "PAYMENT_CREATE";
  else if (legacyIntent === "CREDIT_CREATE") finalIntent = "CREDIT_CREATE";
  else if (legacyIntent === "DEBIT_CREATE") finalIntent = "DEBIT_CREATE";
  else if (legacyIntent === "SALES_REPORT") finalIntent = "SALES_REPORT";
  else if (legacyIntent === "TOP_PRODUCTS") finalIntent = "TOP_SELLING_PRODUCTS";
  else if (legacyIntent === "PROFIT" || legacyIntent === "LOSS") finalIntent = "PROFIT_REPORT";
  else finalIntent = legacyIntent; // fallback

  const extracted = extractEntities(normalizedText, legacyIntent);

  let entityType: AIEntityType = "unknown";
  let entityQuery: string | null = null;

  if (extracted.productQuery) {
    entityType = "product";
    entityQuery = extracted.productQuery;
  } else if (extracted.customerQuery) {
    entityType = "customer";
    entityQuery = extracted.customerQuery;
  } else if (context?.activeTopic === "product" && context.activeProductName) {
    entityType = "product";
    entityQuery = context.activeProductName;
  }

  const structuredOutput: AIStructuredOutput = {
    intent: finalIntent as AIIntent,
    action: "READ",
    entityType,
    entityQuery,
    entityId: null,
    parameters: {
      quantity: extracted.quantity,
      price: extracted.priceAmount,
    },
    dateRange: extracted.dateRange
      ? {
          startDate: extracted.dateRange.start.toISOString(),
          endDate: extracted.dateRange.end.toISOString(),
          label: extracted.dateRange.label,
        }
      : null,
    confidence: 0.9,
    needsClarification: false,
    needsConfirmation: false,
    secondaryIntent: null,
  };

  // If there's an entity, resolve it
  let resolvedEntityId = null;
  let clarificationMessage = null;
  let candidates = undefined;

  if (entityType !== "unknown" && entityQuery) {
    const resolution = await resolveEntity(sb, shopId, entityType, entityQuery);

    if (resolution.status === "RESOLVED" && resolution.entity) {
      resolvedEntityId = resolution.entity.id;
      structuredOutput.entityId = resolvedEntityId;

      // Update context
      if (entityType === "product") {
        await setActiveProduct(sb, shopId, userId, resolvedEntityId, resolution.entity.name);
      } else if (entityType === "customer") {
        await setActiveCustomer(sb, shopId, userId, resolvedEntityId, resolution.entity.name);
      }
    } else if (resolution.status === "AMBIGUOUS") {
      clarificationMessage = resolution.clarificationMessage;
      candidates = resolution.candidates;
      structuredOutput.needsClarification = true;
    }
  }

  return {
    structuredOutput,
    resolvedEntityId,
    candidates,
    clarificationMessage,
    path: "FAST",
  };
}

// ─── LLM Path (Structured Understanding) ────────────────────────────────────

async function runLLMPath(
  sb: SupabaseClient,
  shopId: string,
  userId: string,
  normalizedText: string,
  context: AIConversationContext | null,
): Promise<OrchestrationResult> {
  // 1. Get structured understanding from LLM
  const output = await understandWithLLM(normalizedText, context);

  // 2. Validate/enrich action and confirmation needs based on constants
  const expectedAction = getActionForIntent(output.intent);
  if (expectedAction) {
    output.action = expectedAction;
  }

  if (REQUIRES_CONFIRMATION_INTENTS.has(output.intent)) {
    output.needsConfirmation = true;
  }

  // 3. Resolve Entity if present
  let resolvedEntityId = null;
  let clarificationMessage = null;
  let candidates = undefined;

  // Use the active entity if the LLM didn't extract one but context implies it
  if (!output.entityQuery && output.entityType !== "unknown") {
    if (output.entityType === "product" && context?.activeProductName) {
      output.entityQuery = context.activeProductName;
    } else if (output.entityType === "customer" && context?.activeCustomerName) {
      output.entityQuery = context.activeCustomerName;
    }
  }

  if (output.entityType !== "unknown" && output.entityQuery) {
    // LLM gave us an entity, we must map it to a DB ID
    const resolution = await resolveEntity(sb, shopId, output.entityType, output.entityQuery);

    if (resolution.status === "RESOLVED" && resolution.entity) {
      resolvedEntityId = resolution.entity.id;
      output.entityId = resolvedEntityId;

      // Update context
      if (output.entityType === "product") {
        await setActiveProduct(sb, shopId, userId, resolvedEntityId, resolution.entity.name);
      } else if (output.entityType === "customer") {
        await setActiveCustomer(sb, shopId, userId, resolvedEntityId, resolution.entity.name);
      }
    } else if (resolution.status === "AMBIGUOUS") {
      clarificationMessage = resolution.clarificationMessage;
      candidates = resolution.candidates;
      output.needsClarification = true;
    } else if (resolution.status === "NOT_FOUND") {
      clarificationMessage = resolution.clarificationMessage;
      output.needsClarification = true;
    }
  }

  // 4. Update intent context
  await setLastIntent(sb, shopId, userId, output.intent);

  return {
    structuredOutput: output,
    resolvedEntityId,
    candidates,
    clarificationMessage,
    path: "LLM",
  };
}
