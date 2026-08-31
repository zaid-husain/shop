/**
 * AI Core — Entity Resolver
 *
 * The CRITICAL bridge between LLM-extracted entity names and actual database records.
 * Uses the existing fuzzy-search system (exact → token → pg_trgm fuzzy)
 * with enhanced disambiguation logic.
 *
 * Rules:
 * 1. Exact match → RESOLVED (no ambiguity)
 * 2. Single strong match (score ≥ 0.85) → RESOLVED
 * 3. Multiple matches with one clearly better (gap ≥ 0.15) → RESOLVED to best
 * 4. Multiple equally strong matches → AMBIGUOUS (return candidates)
 * 5. No match → NOT_FOUND
 *
 * The LLM NEVER accesses the database directly.
 * This resolver is the only path from entity name → entity record.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EntityResolutionResult,
  EntityResolutionStatus,
  ResolvedEntity,
  AIEntityType,
} from "./types";
import {
  searchProductsDB,
  searchCustomersDB,
  type SearchResult,
  type SearchableProduct,
  type SearchableCustomer,
} from "../fuzzy-search";

// ─── Configuration ──────────────────────────────────────────────────────────

/** Minimum score to consider a match viable */
const MIN_VIABLE_SCORE = 0.4;

/** Score at or above which a single result is considered confidently resolved */
const CONFIDENT_SCORE = 0.85;

/** Minimum gap between best and second-best to auto-resolve */
const DISAMBIGUATION_GAP = 0.15;

// ─── Product Resolution ─────────────────────────────────────────────────────

/**
 * Resolves a product entity query to an actual database record.
 *
 * @param sb - Authenticated Supabase client (RLS-enforced)
 * @param shopId - The shop's ID (from auth context, never from LLM)
 * @param query - The cleaned entity query (e.g. "Servo Oil")
 * @returns Resolution result with status, entity, candidates, and clarification message
 */
export async function resolveProduct(
  sb: SupabaseClient,
  shopId: string,
  query: string,
): Promise<EntityResolutionResult> {
  if (!query || !query.trim()) {
    return {
      status: "NOT_FOUND",
      entity: null,
      candidates: [],
      clarificationMessage: "Product ka naam batao.",
    };
  }

  const results = await searchProductsDB(sb, shopId, query.trim(), 5);

  if (results.length === 0) {
    return {
      status: "NOT_FOUND",
      entity: null,
      candidates: [],
      clarificationMessage: `"${query}" inventory me nahi mila. Sahi naam ya part number try karo.`,
    };
  }

  // Filter out weak matches
  const viableResults = results.filter((r) => r.score >= MIN_VIABLE_SCORE);
  if (viableResults.length === 0) {
    return {
      status: "NOT_FOUND",
      entity: null,
      candidates: [],
      clarificationMessage: `"${query}" se milta julta koi product nahi mila.`,
    };
  }

  // Single result → RESOLVED
  if (viableResults.length === 1) {
    return {
      status: "RESOLVED",
      entity: productToResolvedEntity(viableResults[0].item),
      candidates: [],
      clarificationMessage: null,
    };
  }

  // Multiple results — check if best is confidently ahead
  const best = viableResults[0];
  const secondBest = viableResults[1];

  // Best is very confident and clearly ahead of second
  if (best.score >= CONFIDENT_SCORE && best.score - secondBest.score >= DISAMBIGUATION_GAP) {
    return {
      status: "RESOLVED",
      entity: productToResolvedEntity(best.item),
      candidates: [],
      clarificationMessage: null,
    };
  }

  // Exact name match takes priority even with multiple results
  const exactMatch = viableResults.find(
    (r) => r.item.name.toLowerCase() === query.toLowerCase() || r.matchType === "exact",
  );
  if (exactMatch) {
    return {
      status: "RESOLVED",
      entity: productToResolvedEntity(exactMatch.item),
      candidates: [],
      clarificationMessage: null,
    };
  }

  // Ambiguous — present candidates for user selection
  const candidates = viableResults.map((r) => productToResolvedEntity(r.item));
  const clarification = buildProductClarification(query, viableResults);

  return {
    status: "AMBIGUOUS",
    entity: null,
    candidates,
    clarificationMessage: clarification,
  };
}

// ─── Customer Resolution ────────────────────────────────────────────────────

/**
 * Resolves a customer entity query to an actual database record.
 * Same tiered approach as product resolution.
 */
export async function resolveCustomer(
  sb: SupabaseClient,
  shopId: string,
  query: string,
): Promise<EntityResolutionResult> {
  if (!query || !query.trim()) {
    return {
      status: "NOT_FOUND",
      entity: null,
      candidates: [],
      clarificationMessage: "Customer ka naam ya number batao.",
    };
  }

  const results = await searchCustomersDB(sb, shopId, query.trim(), 5);

  if (results.length === 0) {
    return {
      status: "NOT_FOUND",
      entity: null,
      candidates: [],
      clarificationMessage: `"${query}" naam ka customer nahi mila.`,
    };
  }

  const viableResults = results.filter((r) => r.score >= MIN_VIABLE_SCORE);
  if (viableResults.length === 0) {
    return {
      status: "NOT_FOUND",
      entity: null,
      candidates: [],
      clarificationMessage: `"${query}" se milta julta customer nahi mila.`,
    };
  }

  // Single result → RESOLVED
  if (viableResults.length === 1) {
    return {
      status: "RESOLVED",
      entity: customerToResolvedEntity(viableResults[0].item),
      candidates: [],
      clarificationMessage: null,
    };
  }

  // Check for confident disambiguation
  const best = viableResults[0];
  const secondBest = viableResults[1];

  if (best.score >= CONFIDENT_SCORE && best.score - secondBest.score >= DISAMBIGUATION_GAP) {
    return {
      status: "RESOLVED",
      entity: customerToResolvedEntity(best.item),
      candidates: [],
      clarificationMessage: null,
    };
  }

  // Exact name match
  const exactMatch = viableResults.find(
    (r) => r.item.name.toLowerCase() === query.toLowerCase() || r.matchType === "exact",
  );
  if (exactMatch) {
    return {
      status: "RESOLVED",
      entity: customerToResolvedEntity(exactMatch.item),
      candidates: [],
      clarificationMessage: null,
    };
  }

  // Ambiguous
  const candidates = viableResults.map((r) => customerToResolvedEntity(r.item));
  const clarification = buildCustomerClarification(query, viableResults);

  return {
    status: "AMBIGUOUS",
    entity: null,
    candidates,
    clarificationMessage: clarification,
  };
}

// ─── Generic Resolver ───────────────────────────────────────────────────────

/**
 * Resolves any entity type by delegating to the appropriate resolver.
 */
export async function resolveEntity(
  sb: SupabaseClient,
  shopId: string,
  entityType: AIEntityType,
  query: string,
): Promise<EntityResolutionResult> {
  switch (entityType) {
    case "product":
      return resolveProduct(sb, shopId, query);
    case "customer":
      return resolveCustomer(sb, shopId, query);
    default:
      return {
        status: "NOT_FOUND",
        entity: null,
        candidates: [],
        clarificationMessage: `${entityType} resolution is not supported yet.`,
      };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function productToResolvedEntity(product: SearchableProduct): ResolvedEntity {
  return {
    id: product.id,
    name: product.name,
    type: "product",
    data: {
      brand: product.brand,
      category: product.category,
      variant: product.variant,
      part_number: product.part_number,
      selling_price: product.selling_price,
      purchase_price: product.purchase_price,
      stock_quantity: product.stock_quantity,
      low_stock_threshold: product.low_stock_threshold,
      version: product.version,
    },
  };
}

function customerToResolvedEntity(customer: SearchableCustomer): ResolvedEntity {
  return {
    id: customer.id,
    name: customer.name,
    type: "customer",
    data: {
      mobile: customer.mobile,
      vehicle_number: customer.vehicle_number,
      balance_cache: customer.balance_cache,
    },
  };
}

function buildProductClarification(
  query: string,
  results: SearchResult<SearchableProduct>[],
): string {
  const lines = results
    .slice(0, 5)
    .map((r, i) => {
      const p = r.item;
      const brand = p.brand ? `${p.brand} ` : "";
      return `${i + 1}. ${brand}${p.name} — ₹${p.selling_price}`;
    })
    .join("\n");

  return `"${query}" se ${results.length} products mile:\n\n${lines}\n\nKaunsa product?`;
}

function buildCustomerClarification(
  query: string,
  results: SearchResult<SearchableCustomer>[],
): string {
  const lines = results
    .slice(0, 5)
    .map((r, i) => {
      const c = r.item;
      const mobile = c.mobile ? ` — ${c.mobile}` : "";
      return `${i + 1}. ${c.name}${mobile}`;
    })
    .join("\n");

  return `"${query}" naam ke ${results.length} customers mile:\n\n${lines}\n\nKaunsa customer?`;
}
