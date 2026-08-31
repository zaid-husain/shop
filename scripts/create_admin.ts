import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const adminClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Use this to bypass the UI email rate limit
const phoneDigits = "8421438127";
const pin = "5285";
const email = `bap-${phoneDigits}@bharatautoparts.app`;
const password = `bap_${pin}_${phoneDigits.slice(-4)}`;

async function createAdmin() {
  console.log(`Creating user for phone: ${phoneDigits}`);
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: "Admin User",
      phone: phoneDigits,
      shop_name: "Bharat Auto Parts",
    },
  });

  if (error) {
    console.error("Failed to create user:", error.message);
  } else {
    console.log("Success! You can now log in with:");
    console.log(`Mobile: ${phoneDigits}`);
    console.log(`PIN: ${pin}`);
  }
}

createAdmin();
