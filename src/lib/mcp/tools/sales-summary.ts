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
  name: "get_sales_summary",
  title: "Sales summary",
  description:
    "Get a sales summary for the signed-in user's shop over the last N days: total sales, invoice count, and average bill value (INR).",
  inputSchema: {
    days: z.number().int().min(1).max(365).default(7),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error } = await sbForUser(ctx)
      .from("invoices")
      .select("total, created_at")
      .gte("created_at", since);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    const total = rows.reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
    const count = rows.length;
    const avg = count > 0 ? total / count : 0;
    const summary = {
      window_days: days,
      total_sales_inr: Math.round(total * 100) / 100,
      invoice_count: count,
      average_bill_inr: Math.round(avg * 100) / 100,
    };
    return {
      content: [
        {
          type: "text",
          text: `Last ${days} day(s): ₹${summary.total_sales_inr} across ${count} bills (avg ₹${summary.average_bill_inr}).`,
        },
      ],
      structuredContent: summary,
    };
  },
});
