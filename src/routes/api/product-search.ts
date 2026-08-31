import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { searchProductsDB } from "@/lib/ai/fuzzy-search";

export const Route = createFileRoute("/api/product-search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // 1. Authenticate user from JWT
          const authHeader = request.headers.get("authorization");
          if (!authHeader?.toLowerCase().startsWith("bearer ")) {
            return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }
          const token = authHeader.slice(7).trim();
          const SUPABASE_URL = process.env.SUPABASE_URL!;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;

          const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });

          const { data: claimsData } = await sb.auth.getUser(token);
          if (!claimsData?.user?.id) {
            return new Response(JSON.stringify({ success: false, message: "Unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }
          const authUserId = claimsData.user.id;

          // 2. Resolve shop_id securely
          const { data: profile } = await sb
            .from("profiles")
            .select("shop_id")
            .eq("id", authUserId)
            .single();

          if (!profile) {
            return new Response(
              JSON.stringify({ success: false, message: "Profile missing or access denied" }),
              {
                status: 403,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
          const shopId = profile.shop_id;

          // 3. Parse request payload
          const body = await request.json().catch(() => ({}));
          const query = body?.query;
          const limit = typeof body?.limit === "number" ? body.limit : 10;

          if (!query || typeof query !== "string") {
            return new Response(
              JSON.stringify({ success: false, message: "Invalid or missing 'query' parameter" }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          // 4. Call existing fuzzy search functionality
          const rawResults = await searchProductsDB(sb, shopId, query, limit);

          // 5. Map fields exactly as n8n AI needs
          const mappedData = rawResults.map((r) => ({
            id: r.item.id,
            name: r.item.name,
            category: r.item.category,
            brand: r.item.brand,
            variant: r.item.variant,
            part_number: r.item.part_number,
            selling_price: r.item.selling_price,
            purchase_price: r.item.purchase_price,
            stock_quantity: r.item.stock_quantity,
            score: r.score,
            matchType: r.matchType,
          }));

          return new Response(JSON.stringify({ success: true, data: mappedData }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: unknown) {
          console.error("Product search API error:", err);
          const e = err as { message?: string };
          return new Response(
            JSON.stringify({ success: false, message: e.message || "Internal Server Error" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },
    },
  },
});
