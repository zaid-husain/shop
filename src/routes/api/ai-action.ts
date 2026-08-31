import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { executePendingAction } from "@/lib/ai/query-executor";
import { authorizeAction, type UserRole, getGracefulError } from "@/lib/ai/permissions";

export const Route = createFileRoute("/api/ai-action")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          if (!authHeader?.toLowerCase().startsWith("bearer ")) {
            return new Response("Unauthorized", { status: 401 });
          }
          const token = authHeader.slice(7).trim();
          const SUPABASE_URL = process.env.SUPABASE_URL!;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });

          // 1. Auth & Profiles
          const { data: claimsData } = await sb.auth.getUser(token);
          if (!claimsData?.user?.id) return new Response("Unauthorized", { status: 401 });
          const authUserId = claimsData.user.id;

          const [{ data: profile }, { data: roles }] = await Promise.all([
            sb.from("profiles").select("shop_id").eq("id", authUserId).single(),
            sb.from("user_roles").select("role").eq("user_id", authUserId),
          ]);

          if (!profile) return new Response("Profile missing", { status: 403 });
          const authShopId = profile.shop_id;
          const userRole = (roles?.[0]?.role as UserRole) || "unknown";

          // 2. Parse Body
          const action = await request.json();
          if (!action || !action.type || !action.payload) {
            return new Response("Invalid action payload", { status: 400 });
          }

          // 2.5. Check RBAC Permissions
          const authResult = authorizeAction(
            { userId: authUserId, role: userRole, shopId: authShopId },
            action.type,
            action.payload,
          );

          if (!authResult.allowed) {
            const msg = getGracefulError(authResult.reason);
            return new Response(JSON.stringify({ success: false, message: msg }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 3. Execute
          const resultMessage = await executePendingAction(sb, authShopId, action);

          // 4. Determine success/error based on resultMessage format
          if (resultMessage.startsWith("❌") || resultMessage.startsWith("⛔")) {
            return new Response(JSON.stringify({ success: false, message: resultMessage }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ success: true, message: resultMessage }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: unknown) {
          console.error("Action execution error:", err);
          const e = err as { message?: string };
          return new Response(JSON.stringify({ success: false, message: e.message || "Error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
