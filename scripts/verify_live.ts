import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

const url = process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const adminClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// We will use random passwords
const testPassword = "testPassword123!@#";
const userAEmail = `test_user_a_${Date.now()}@example.com`;
const userBEmail = `test_user_b_${Date.now()}@example.com`;

let uidA: string | undefined;
let uidB: string | undefined;
const shopIdA = uuidv4();
const shopIdB = uuidv4();

async function createUser(email: string) {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password: testPassword,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Failed to create user: ${error?.message}`);
  return data.user.id;
}

async function getAuthenticatedClient(email: string) {
  const client = createClient(url, process.env.VITE_SUPABASE_ANON_KEY || serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email,
    password: testPassword,
  });
  if (error) throw new Error(`Failed to sign in: ${error.message}`);
  return client;
}

async function runTests() {
  console.log("=== SETUP ISOLATED TEST DATA ===");
  try {
    uidA = await createUser(userAEmail);
    console.log(`Created User A: ${uidA}`);
    uidB = await createUser(userBEmail);
    console.log(`Created User B: ${uidB}`);

    const clientA = await getAuthenticatedClient(userAEmail);
    const clientB = await getAuthenticatedClient(userBEmail);

    // Setup shop A data using service key to bypass RLS for initial seed if needed,
    // wait, authenticated users can't bypass RLS to create a customer unless they have access.
    // Assuming RLS allows insert if shop_id matches their tenant, but how is tenant assigned?
    // We haven't implemented tenant assignment in auth.users yet probably, or maybe we did?
    // Let's just use adminClient to seed the customer and product for shopIdA.
    const customerId = uuidv4();
    const productId = uuidv4();

    console.log("Reading auto-generated Shop IDs...");
    const { data: profA } = await adminClient
      .from("profiles")
      .select("shop_id")
      .eq("id", uidA)
      .single();
    const { data: profB } = await adminClient
      .from("profiles")
      .select("shop_id")
      .eq("id", uidB)
      .single();

    if (!profA || !profB) {
      throw new Error("Failed to read generated shop_ids");
    }

    const shopIdA = profA.shop_id;
    const shopIdB = profB.shop_id;
    console.log(`User A Shop ID: ${shopIdA}`);
    console.log(`User B Shop ID: ${shopIdB}`);

    console.log("Seeding Customer and Product for Shop A...");
    const { error: errC } = await adminClient.from("customers").insert({
      id: customerId,
      shop_id: shopIdA,
      name: "Test Customer",
    });
    if (errC) console.error("Error C:", errC);

    const { error: errP } = await adminClient.from("products").insert({
      id: productId,
      shop_id: shopIdA,
      name: "Test Product",
      stock_quantity: 10,
      selling_price: 100,
      purchase_price: 80,
    });
    if (errP) console.error("Error P:", errP);

    console.log("=== 1. VERIFY RLS ISOLATION ===");
    console.log("User B attempting to read Shop A customers...");
    const { data: readB, error: errReadB } = await clientB
      .from("customers")
      .select("*")
      .eq("shop_id", shopIdA);
    if (errReadB)
      console.log(
        "User B read error (Expected if RLS strictly denies instead of filtering):",
        errReadB.message,
      );
    console.log(`User B read returned ${readB?.length || 0} rows (Expected 0).`);

    console.log("\n=== 2. SERVER-SIDE ATOMICITY & IDEMPOTENCY ===");
    const idempotencyKey = uuidv4();
    const requestHash = "hash123";
    const invoiceNumber = `INV-TEST-${Date.now()}`;
    const payload = {
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
      p_shop_id: shopIdA,
      p_customer_id: customerId,
      p_invoice_number: invoiceNumber,
      p_cost_total: 80,
      p_discount: 0,
      p_total: 100,
      p_paid: 100,
      p_due: 0,
      p_notes: "Test sale",
      p_items: [
        {
          product_id: productId,
          product_name: "Test Product",
          quantity: 1,
          unit_price: 100,
          cost_price: 80,
          line_total: 100,
        },
      ],
    };
    console.log("User A invoking create_sale...");
    const { data: saleA, error: errSaleA } = await clientA.rpc("create_sale", payload);
    if (errSaleA) {
      console.log("create_sale failed:", errSaleA.message);
    } else {
      console.log("create_sale succeeded.");

      // Verify atomic records
      const { count: invCount } = await adminClient
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("idempotency_key", idempotencyKey);
      console.log(`Invoices created: ${invCount} (Expected 1)`);

      const { count: moveCount } = await adminClient
        .from("inventory_movements")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shopIdA);
      console.log(`Movements created: ${moveCount} (Expected 1)`);
    }

    console.log("\nSimulating Lost Acknowledgement (Retry exact payload)...");
    const { error: errRetry } = await clientA.rpc("create_sale", payload);
    if (errRetry) {
      console.log("Retry failed with error:", errRetry.message);
    } else {
      console.log("Retry completed. Checking for duplicates...");
      const { count: dupCount } = await adminClient
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("idempotency_key", idempotencyKey);
      console.log(`Invoices count after retry: ${dupCount} (Expected 1)`);
    }

    console.log("\nSimulating Idempotency Conflict (Same key, different hash/payload)...");
    const { error: errConflict } = await clientA.rpc("create_sale", {
      ...payload,
      p_request_hash: "hash456",
      p_total: 999,
    });
    if (errConflict) {
      console.log("Conflict rejected as expected:", errConflict.message);
    } else {
      console.log("WARNING: Conflict was NOT rejected!");
    }

    console.log("\n=== 3. SECURITY DEFINER CROSS-TENANT WRITE ===");
    console.log("User B attempting to create sale for Shop A...");
    const { error: errWriteB } = await clientB.rpc("create_sale", {
      ...payload,
      p_idempotency_key: uuidv4(),
    });
    if (errWriteB) {
      console.log("Cross-tenant write rejected as expected:", errWriteB.message);
    } else {
      console.log("WARNING: Cross-tenant write was NOT rejected!");
    }
  } catch (err: unknown) {
    console.error("Test execution error:", err);
  } finally {
    console.log("\n=== CLEANUP ISOLATED TEST DATA ===");
    // Delete test users (this cascades to all their data if RLS/foreign keys are set up, but we use admin client anyway)
    if (uidA) {
      await adminClient.auth.admin.deleteUser(uidA);
      console.log(`Deleted User A`);
    }
    if (uidB) {
      await adminClient.auth.admin.deleteUser(uidB);
      console.log(`Deleted User B`);
    }
    // Delete the shop data explicitly to be safe
    await adminClient.from("invoices").delete().eq("shop_id", shopIdA);
    await adminClient.from("invoices").delete().eq("shop_id", shopIdB);
    await adminClient.from("products").delete().eq("shop_id", shopIdA);
    await adminClient.from("customers").delete().eq("shop_id", shopIdA);
    console.log("Cleanup complete.");
  }
}

runTests();
