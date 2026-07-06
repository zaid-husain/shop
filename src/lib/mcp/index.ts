import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCustomers from "./tools/list-customers";
import listProducts from "./tools/list-products";
import recentInvoices from "./tools/recent-invoices";
import salesSummary from "./tools/sales-summary";

// The OAuth issuer MUST be the direct Supabase host — the .lovable.cloud proxy
// is rewritten on publish and fails RFC 8414 issuer matching. Read the project
// ref via import.meta.env so Vite inlines it as a literal at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "bharat-auto-parts-mcp",
  title: "Bharat Auto Parts",
  version: "0.1.0",
  instructions:
    "Tools for a shop owner's Bharat Auto Parts account: read customers (Khata), products (stock), recent bills, and sales summaries. All data is scoped to the signed-in shop.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCustomers, listProducts, recentInvoices, salesSummary],
});
