import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zcvvqhytlsheuhbbsceb.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjdnZxaHl0bHNoZXVoYmJzY2ViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mzg2MTU5MiwiZXhwIjoyMDk5NDM3NTkyfQ.A2WzS4r5YxvIP6quzHWNQA8uty0Fkgoat9kHu7fIakc";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log("Checking database...");
  // 1. Check ledger_transactions table
  const { data: rows, error: rowsErr } = await adminClient
    .from("ledger_transactions")
    .select("id, shop_id, customer_id, transaction_type, amount, balance_impact, note")
    .limit(5);

  console.log("Sample ledger_transactions count:", rows?.length);
  if (rows && rows.length > 0) {
    console.log("First row:", rows[0]);
  }
  if (rowsErr) console.error("Error reading ledger_transactions:", rowsErr);

  // 2. Check if RPC exists
  const { data: rpcRes, error: rpcErr } = await adminClient.rpc("delete_manual_ledger_entry", {
    p_transaction_id: "00000000-0000-0000-0000-000000000000",
    p_shop_id: "00000000-0000-0000-0000-000000000000",
    p_customer_id: "00000000-0000-0000-0000-000000000000",
  });

  console.log("Test RPC call:", { rpcRes, rpcErr });
}

main().catch(console.error);
