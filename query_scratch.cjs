const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" }); // fallback

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: profiles, error } = await supabase.from("profiles").select("*");
  if (error) console.error("Error fetching profiles:", error);
  else console.log("Profiles:", JSON.stringify(profiles, null, 2));

  // Also query one product to see the shop_id match
  const { data: products, error: pError } = await supabase.from("products").select("*").limit(1);
  if (pError) console.error("Error fetching products:", pError);
  else console.log("Sample Product:", JSON.stringify(products, null, 2));
}

run();
