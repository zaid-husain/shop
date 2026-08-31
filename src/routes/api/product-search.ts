import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { searchProductsDB } from "@/lib/ai/fuzzy-search";

export const Route = createFileRoute("/api/product-search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const SUPABASE_URL = process.env.SUPABASE_URL!;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const N8N_INTEGRATION_SECRET = process.env.N8N_INTEGRATION_SECRET;
          const N8N_SHOP_ID = process.env.N8N_SHOP_ID;

          const authHeader = request.headers.get("authorization");

          let shopId: string | null = null;
          let sbClient;
          let isN8nRequest = false;

          const authBearer = authHeader?.toLowerCase().startsWith("bearer ")
            ? authHeader.slice(7).trim()
            : null;

          if (!authBearer) {
            return new Response(
              JSON.stringify({
                success: false,
                message: "Unauthorized: Missing authentication credentials (Bearer token required)",
              }),
              {
                status: 401,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          // Mode A: Server-to-server n8n Integration Secret
          if (N8N_INTEGRATION_SECRET && authBearer === N8N_INTEGRATION_SECRET) {
            const uuidRegex =
              /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!N8N_SHOP_ID || !uuidRegex.test(N8N_SHOP_ID)) {
              return new Response(
                JSON.stringify({
                  success: false,
                  message: "Server configuration error: N8N_SHOP_ID is not configured or invalid",
                }),
                {
                  status: 500,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            shopId = N8N_SHOP_ID;
            isN8nRequest = true;

            const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_PUBLISHABLE_KEY;
            sbClient = createClient(SUPABASE_URL, serviceKey, {
              auth: { persistSession: false, autoRefreshToken: false },
            });
          }
          // Mode B: Standard Supabase Bearer JWT
          else {
            const token = authBearer;
            const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
              auth: { persistSession: false, autoRefreshToken: false },
              global: { headers: { Authorization: `Bearer ${token}` } },
            });

            const { data: claimsData } = await sb.auth.getUser(token);
            if (!claimsData?.user?.id) {
              return new Response(
                JSON.stringify({ success: false, message: "Unauthorized: Invalid token" }),
                {
                  status: 401,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            const { data: profile } = await sb
              .from("profiles")
              .select("shop_id")
              .eq("id", claimsData.user.id)
              .single();

            if (!profile?.shop_id) {
              return new Response(
                JSON.stringify({ success: false, message: "Profile missing or access denied" }),
                {
                  status: 403,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            shopId = profile.shop_id;
            sbClient = sb;
          }

          if (!shopId || !sbClient) {
            return new Response(
              JSON.stringify({
                success: false,
                message: "Unauthorized: Failed to resolve shop scope or database client",
              }),
              {
                status: 401,
                headers: { "Content-Type": "application/json" },
              },
            );
          }

          // Parse request payload
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

          // Audit logging for n8n requests
          if (isN8nRequest) {
            console.log(
              `[n8n Audit] Product Search | Query: "${query}" | Limit: ${limit} | ShopID: ${shopId} | Time: ${new Date().toISOString()}`,
            );
          }

          // Call existing fuzzy search functionality
          const rawResults = await searchProductsDB(sbClient, shopId, query, limit);

          // Map fields exactly as n8n AI needs
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
