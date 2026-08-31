import { orchestrateQuery } from "../src/lib/ai/core/orchestrator";
import { executeQuery } from "../src/lib/ai/query-executor";
import assert from "node:assert";

// ─── Mock Supabase Client ───────────────────────────────────────────────────
class MockSupabaseQueryBuilder {
  private tableName: string;
  private mockData: Record<string, unknown[]>;

  constructor(tableName: string, mockData: Record<string, unknown[]>) {
    this.tableName = tableName;
    this.mockData = mockData;
  }

  select(columns?: string) {
    return this;
  }
  eq(column: string, value: unknown) {
    return this;
  }
  neq(column: string, value: unknown) {
    return this;
  }
  ilike(column: string, value: string) {
    return this;
  }
  or(query: string) {
    return this;
  }
  limit(count: number) {
    return this;
  }
  order(column: string, options?: unknown) {
    return this;
  }
  gte(column: string, value: unknown) {
    return this;
  }
  lte(column: string, value: unknown) {
    return this;
  }
  is(column: string, value: unknown) {
    return this;
  }

  async maybeSingle() {
    const data = this.mockData[this.tableName];
    return { data: data ? data[0] : null, error: null };
  }

  async single() {
    const data = this.mockData[this.tableName];
    return { data: data ? data[0] : null, error: null };
  }

  then(resolve: (value: unknown) => void) {
    const data = this.mockData[this.tableName] || [];
    resolve({ data, error: null });
  }

  async upsert(data: unknown) {
    return { data, error: null };
  }
}

class MockSupabaseClient {
  private mockData: Record<string, unknown[]>;
  constructor(mockData: Record<string, unknown[]> = {}) {
    this.mockData = mockData;
  }
  from(tableName: string) {
    return new MockSupabaseQueryBuilder(tableName, this.mockData);
  }
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

async function runTests() {
  console.log("🚀 Starting Golden AI Pipeline Test Suite...");

  const shopId = "test-shop";
  const userId = "test-user";

  const mockDbData = {
    ai_conversations: [], // No previous context
    products: [
      { id: "p1", name: "Maggi", price: 15, stock: 100, shop_id: shopId, is_active: true },
    ],
    customers: [
      { id: "c1", name: "Rahul", phone: "1234567890", balance_cache: 50, shop_id: shopId },
    ],
  };

  const sb = new MockSupabaseClient(
    mockDbData,
  ) as unknown as import("@supabase/supabase-js").SupabaseClient;

  // ─── Test 1: Fast Path Routing (Product Query) ───
  console.log("\n🧪 Test 1: 'maggi kitne ka hai' (Fast Path -> PRODUCT_PRICE)");
  const res1 = await orchestrateQuery(sb, shopId, userId, "maggi kitne ka hai");

  assert.strictEqual(res1.path, "FAST", "Should route via FAST path");
  assert.strictEqual(
    res1.structuredOutput.intent,
    "PRODUCT_PRICE",
    "Intent should be PRODUCT_PRICE",
  );

  // ─── Test 2: Fast Path Routing (Customer Create) ───
  console.log("🧪 Test 2: 'naya grahak banish' (Fast Path -> CUSTOMER_CREATE)");
  const res2 = await orchestrateQuery(sb, shopId, userId, "naya grahak manish");

  assert.strictEqual(res2.path, "FAST", "Should route via FAST path");
  assert.strictEqual(
    res2.structuredOutput.intent,
    "CUSTOMER_CREATE",
    "Intent should be CUSTOMER_CREATE",
  );

  // ─── Test 3: Query Executor (PRODUCT_PRICE) ───
  console.log("🧪 Test 3: Query Executor handling PRODUCT_PRICE");
  const qRes1 = await executeQuery(sb, shopId, "PRODUCT_PRICE", {
    productQuery: "maggi",
  } as import("../src/lib/ai/entity-extractor").ExtractedEntities);
  assert.strictEqual(qRes1.type, "products", "Should return products list");
  assert.strictEqual((qRes1.data as unknown[]).length, 1, "Should find 1 product");

  // ─── Test 4: Query Executor (CUSTOMER_CREATE Confirmation) ───
  console.log("🧪 Test 4: Query Executor handles CUSTOMER_CREATE by requiring confirmation");
  const qRes2 = await executeQuery(sb, shopId, "CUSTOMER_CREATE", {
    customerQuery: "manish",
    phoneNumber: "9876543210",
  } as import("../src/lib/ai/entity-extractor").ExtractedEntities);
  assert.strictEqual(qRes2.type, "pending_confirmation", "Should return pending_confirmation");
  assert.ok(qRes2.pendingAction, "Should contain pending action");
  assert.strictEqual(
    qRes2.pendingAction?.intent,
    "CUSTOMER_CREATE",
    "Pending action intent should match",
  );

  console.log("\n✅ All Golden Tests Passed!");
}

runTests().catch(console.error);
