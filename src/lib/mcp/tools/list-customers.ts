import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { CustomerService } from "@/lib/domain/CustomerService";

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

    const sb = sbForUser(ctx);
    const { data: profile, error: profileError } = await sb
      .from("profiles")
      .select("shop_id")
      .single();

    if (profileError || !profile?.shop_id) {
      return { content: [{ type: "text", text: "Shop not found" }], isError: true };
    }

    try {
      let customers = await CustomerService.searchCustomers(profile.shop_id, search || "", sb);
      if (limit && limit > 0) {
        customers = customers.slice(0, limit);
      }
      return {
        content: [{ type: "text", text: JSON.stringify(customers, null, 2) }],
        structuredContent: { customers },
      };
    } catch (e: unknown) {
      return {
        content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
        isError: true,
      };
    }
  },
});
