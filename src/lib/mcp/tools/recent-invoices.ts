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
  name: "list_recent_invoices",
  title: "List recent invoices (bills)",
  description: "List the most recent bills/invoices for the signed-in user's shop.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20),
    days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe("Optional: only include invoices from the last N days."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, days }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = sbForUser(ctx)
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (days) {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      q = q.gte("created_at", since);
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { invoices: data ?? [] },
    };
  },
});
