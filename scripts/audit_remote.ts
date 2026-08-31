import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const sb = createClient(url, key);

async function checkRemote() {
  console.log("=== CHECK REMOTE DATABASE MIGRATION STATUS ===");

  const checks = ["ledger_transactions", "inventory_movements", "payments", "idempotent_requests"];

  for (const table of checks) {
    const { data, error, count } = await sb.from(table).select("*", { count: "exact", head: true });
    if (error) {
      console.log(`Table ${table}: ERROR - ${error.message}`);
    } else {
      console.log(`Table ${table}: EXISTS (Count: ${count})`);
    }
  }

  // Check RPC by just invoking with no args. If it says it doesn't exist, we know it's not applied.
  const { data: rpcData, error: rpcError } = await sb.rpc(
    "create_sale",
    {} as Record<string, unknown>,
  );
  if (rpcError) {
    console.log(`RPC create_sale: ERROR - ${rpcError.message}`);
  } else {
    console.log(`RPC create_sale: EXISTS`);
  }

  console.log("\n=== CHECK LEGACY DATA SAFETY ===");
  const legacyTables = [
    "customers",
    "products",
    "invoices",
    "invoice_items",
    "ledger_entries",
    "suppliers",
    "purchases",
    "purchase_items",
    "audit_log",
  ];
  for (const table of legacyTables) {
    const { data, error, count } = await sb.from(table).select("*", { count: "exact", head: true });
    if (error) {
      console.log(`Legacy Table ${table}: ERROR - ${error.message}`);
    } else {
      console.log(`Legacy Table ${table}: SAFE (Count: ${count})`);
    }
  }
}

checkRemote().catch(console.error);
