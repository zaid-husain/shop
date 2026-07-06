import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sbForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_products",
  title: "List products (stock)",
  description:
    "List products in stock for the signed-in user's shop. Optionally filter by name and only show low stock.",
  inputSchema: {
    search: z.string().trim().min(1).optional().describe("Optional name substring filter."),
    low_stock_only: z
      .boolean()
      .default(false)
      .describe("If true, return only items where stock is at or below the low-stock threshold."),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, low_stock_only, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = sbForUser(ctx)
      .from("products")
      .select("*")
      .order("name", { ascending: true })
      .limit(limit);
    if (search) q = q.ilike("name", `%${search}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = low_stock_only
      ? (data ?? []).filter((p: any) => {
          const threshold = p.low_stock_threshold ?? p.min_stock ?? 5;
          const stock = p.stock ?? p.quantity ?? 0;
          return stock <= threshold;
        })
      : (data ?? []);
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { products: rows },
    };
  },
});
