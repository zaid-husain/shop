/**
 * Fuzzy Search Engine
 *
 * Production-grade typo-tolerant search for products and customers.
 * Now backed by PostgreSQL pg_trgm for massive scalability.
 * Replaces the old in-memory O(N) JavaScript search.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SearchableProduct {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  variant: string | null;
  part_number: string | null;
  selling_price: number;
  purchase_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  version?: number;
}

export interface SearchableCustomer {
  id: string;
  name: string;
  mobile: string | null;
  vehicle_number: string | null;
  balance_cache: number;
}

export interface SearchResult<T> {
  item: T;
  score: number; // 0-1, higher is better
  matchType: "exact" | "contains" | "fuzzy" | "typo-corrected";
}

// ─── Product Search (DB RPC) ────────────────────────────────────────────────

export async function searchProductsDB(
  sb: SupabaseClient,
  shopId: string,
  query: string,
  maxResults: number = 10,
): Promise<SearchResult<SearchableProduct>[]> {
  if (!query.trim()) return [];

  const q = query.trim().toLowerCase();

  // Tier 1: Exact Match (Name or Part Number)
  const { data: exactData, error: exactError } = await sb
    .from("products")
    .select("*")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .or(`name.ilike.${q},part_number.ilike.${q}`)
    .limit(maxResults);

  if (!exactError && exactData && exactData.length > 0) {
    return exactData.map((row) => ({
      item: row as unknown as SearchableProduct,
      score: 1.0,
      matchType: "exact",
    }));
  }

  // Tier 2: Strong Token Match (All tokens present in name, brand, or part_number)
  const tokens = q.split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length > 0) {
    // Build an ilike query for each token
    let queryBuilder = sb
      .from("products")
      .select("*")
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .is("deleted_at", null);

    for (const token of tokens) {
      queryBuilder = queryBuilder.or(
        `name.ilike.%${token}%,brand.ilike.%${token}%,part_number.ilike.%${token}%`,
      );
    }

    const { data: tokenData, error: tokenError } = await queryBuilder.limit(maxResults);

    if (!tokenError && tokenData && tokenData.length > 0) {
      // Validate that ALL tokens actually match the combined product fields
      const filtered = tokenData.filter((p: Record<string, unknown>) => {
        const brand = p.brand as string | null;
        const name = p.name as string;
        const partNumber = p.part_number as string | null;
        const category = p.category as string | null;
        const combined =
          `${brand ?? ""} ${name} ${partNumber ?? ""} ${category ?? ""}`.toLowerCase();
        return tokens.every((t) => combined.includes(t));
      });

      if (filtered.length > 0) {
        // Sort by exact name length ascending (prefer shorter names that contain all tokens)
        const sorted = filtered.sort(
          (a: Record<string, unknown>, b: Record<string, unknown>) =>
            (a.name as string).length - (b.name as string).length,
        );
        return sorted.map((row: Record<string, unknown>) => ({
          item: row as unknown as SearchableProduct,
          score: 0.9,
          matchType: "contains",
        }));
      }
    }
  }

  // Tier 3: Fallback to Fuzzy Search RPC
  const { data: fuzzyData, error: fuzzyError } = await sb.rpc("search_products_fuzzy", {
    p_shop_id: shopId,
    p_query: q,
    p_limit: maxResults,
  });

  if (fuzzyError) {
    console.error("PostgreSQL fuzzy search failed:", fuzzyError);
    return [];
  }

  // Filter out weak matches (similarity < 0.4)
  return (fuzzyData || [])
    .filter((row: Record<string, unknown>) => (row.similarity_score as number) >= 0.4)
    .map((row: Record<string, unknown>) => ({
      item: {
        id: row.id,
        name: row.name,
        brand: row.brand,
        category: row.category,
        variant: row.variant,
        part_number: row.part_number,
        selling_price: row.selling_price,
        purchase_price: row.purchase_price,
        stock_quantity: row.stock_quantity,
        low_stock_threshold: row.low_stock_threshold,
      } as SearchableProduct,
      score: row.similarity_score as number,
      matchType: row.match_type as "fuzzy" | "typo-corrected",
    }));
}

// ─── Customer Search (DB RPC) ───────────────────────────────────────────────

export async function searchCustomersDB(
  sb: SupabaseClient,
  shopId: string,
  query: string,
  maxResults: number = 5,
): Promise<SearchResult<SearchableCustomer>[]> {
  if (!query.trim()) return [];

  const q = query.trim().toLowerCase();

  // Tier 1: Exact Match (Name, Mobile, Vehicle Number)
  const { data: exactData, error: exactError } = await sb
    .from("customers")
    .select("*")
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .or(`name.ilike.${q},mobile.eq.${q},vehicle_number.ilike.${q}`)
    .limit(maxResults);

  if (!exactError && exactData && exactData.length > 0) {
    return exactData.map((row) => ({
      item: row as unknown as SearchableCustomer,
      score: 1.0,
      matchType: "exact",
    }));
  }

  // Tier 2: Strong Token Match
  const tokens = q.split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length > 0) {
    let queryBuilder = sb
      .from("customers")
      .select("*")
      .eq("shop_id", shopId)
      .is("deleted_at", null);

    for (const token of tokens) {
      queryBuilder = queryBuilder.or(
        `name.ilike.%${token}%,mobile.ilike.%${token}%,vehicle_number.ilike.%${token}%`,
      );
    }

    const { data: tokenData, error: tokenError } = await queryBuilder.limit(maxResults);

    if (!tokenError && tokenData && tokenData.length > 0) {
      const filtered = tokenData.filter((c: Record<string, unknown>) => {
        const name = c.name as string;
        const mobile = c.mobile as string | null;
        const vehicleNumber = c.vehicle_number as string | null;
        const combined = `${name} ${mobile ?? ""} ${vehicleNumber ?? ""}`.toLowerCase();
        return tokens.every((t) => combined.includes(t));
      });

      if (filtered.length > 0) {
        const sorted = filtered.sort(
          (a: Record<string, unknown>, b: Record<string, unknown>) =>
            (a.name as string).length - (b.name as string).length,
        );
        return sorted.map((row: Record<string, unknown>) => ({
          item: row as unknown as SearchableCustomer,
          score: 0.9,
          matchType: "contains",
        }));
      }
    }
  }

  // Tier 3: Fallback to Fuzzy Search RPC
  const { data, error } = await sb.rpc("search_customers_fuzzy", {
    p_shop_id: shopId,
    p_query: q,
    p_limit: maxResults,
  });

  if (error) {
    console.error("PostgreSQL customer search failed:", error);
    return [];
  }

  return (data || [])
    .filter((row: Record<string, unknown>) => (row.similarity_score as number) >= 0.4)
    .map((row: Record<string, unknown>) => ({
      item: {
        id: row.id,
        name: row.name,
        mobile: row.mobile,
        vehicle_number: row.vehicle_number,
        balance_cache: row.balance_cache,
      },
      score: row.similarity_score,
      matchType: row.match_type,
    }));
}
