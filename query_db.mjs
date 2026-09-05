import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  const { data, error } = await supabase.rpc("get_schema_functions", {}); // We don't have this
  // Instead, let's just do a query using REST if possible? No, we can't query pg_proc via REST.
  console.log("We need to query pg_catalog. Can we?");
}
inspect();
