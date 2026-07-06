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
  name: "list_customers",
  title: "List customers",
  description:
    "List customers (Khata accounts) for the signed-in user's shop. Optionally filter by name or mobile number.",
  inputSchema: {
    search: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Optional name or mobile number substring to filter by."),
    limit: z.number().int().min(1).max(200).default(50).describe("Max rows to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };

    let q = sbForUser(ctx)
      .from("customers")
      .select("id, name, mobile, vehicle_number, address, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (search) q = q.or(`name.ilike.%${search}%,mobile.ilike.%${search}%`);

    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { customers: data ?? [] },
    };
  },
});
