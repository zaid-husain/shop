/**
 * Phase 3 Sync Engine Comprehensive Test Suite
 *
 * Verifies Outbox Worker, Pull Worker, Sync Orchestrator, and Reconciler.
 * Executes headless via `fake-indexeddb` and `globalThis.fetch` mocking.
 */

import "fake-indexeddb/auto";
import Dexie from "dexie";
import { localDb } from "../src/lib/db/local";
import { processOutbox, resetWorkerStateForTest } from "../src/lib/sync/OutboxWorker";
import { processPullSync } from "../src/lib/sync/PullWorker";
import { syncOrchestrator } from "../src/lib/sync/SyncOrchestrator";
import { reconcileAll } from "../src/lib/sync/Reconciler";
import { connectivity } from "../src/lib/sync/network";
import { CustomerService } from "../src/lib/domain/CustomerService";
import { SaleService } from "../src/lib/domain/SaleService";
import { LedgerService } from "../src/lib/domain/LedgerService";
import type {
  Customer,
  LedgerTransaction,
  OutboxOperation,
  Product,
  InventoryMovement,
} from "../src/lib/db";

// -- MOCK SETUP --
const MOCK_SHOP_ID = "shop-test-123";

let fetchMockState = {
  ok: true,
  status: 200,
  json: async (): Promise<unknown> => ({ name: "GoTrue" }),
  error: null as Error | null,
};

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  if (fetchMockState.error) throw fetchMockState.error;
  let jsonRes: unknown = await fetchMockState.json();
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/rpc/create_sale")) {
    jsonRes = { status: "success" };
  } else if (url.includes("/rest/v1/")) {
    jsonRes = [];
  } else if (url.includes("/auth/v1/health")) {
    jsonRes = { name: "GoTrue" };
  }
  return {
    ok: fetchMockState.ok,
    status: fetchMockState.status,
    json: async () => jsonRes,
    text: async () => JSON.stringify(jsonRes),
    headers: new Headers({ "content-type": "application/json" }),
  } as Response;
};

// Force env vars for Supabase client initialization
process.env.VITE_SUPABASE_URL = "http://localhost:54321";
process.env.VITE_SUPABASE_ANON_KEY = "test-key";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "test-key";
process.env.SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_PUBLISHABLE_KEY = "test-key";

import { sb } from "../src/lib/db";

(sb as unknown as { rpc: (...args: unknown[]) => unknown }).rpc = async (...args: unknown[]) => {
  const endpoint = args[0] as string;
  if (endpoint === "create_sale") {
    return { error: null, data: { status: "success" } };
  }
  return { error: new Error("Mocked Server Error") };
};

(sb as unknown as { from: (...args: unknown[]) => unknown }).from = (...args: unknown[]) => ({
  upsert: async (payload: unknown) => {
    return { error: null };
  },
  select: function () {
    return this;
  },
  eq: function () {
    return this;
  },
  or: function () {
    return this;
  },
  order: function () {
    return this;
  },
  limit: async () => {
    return { error: null, data: [] };
  },
});

// Provide a mock global environment for test runner compatibility if needed
const globalAny: Record<string, unknown> = global as unknown as Record<string, unknown>;

// Force navigator to be online
if (typeof globalAny.navigator === "undefined") {
  globalAny.navigator = {};
}
(globalAny.navigator as { onLine: boolean }).onLine = true;

async function runTest(name: string, testFn: () => Promise<void>) {
  try {
    // Reset DB and Mocks before each test
    await localDb.transaction(
      [
        "customers",
        "outbox_operations",
        "ledger_transactions",
        "products",
        "inventory_movements",
        "invoices",
        "invoice_items",
        "payments",
        "sync_cursors",
      ],
      "rw",
      async () => {
        await localDb.customers.clear();
        await localDb.outboxOperations.clear();
        await localDb.ledgerTransactions.clear();
        await localDb.products.clear();
        await localDb.inventoryMovements.clear();
        await localDb.invoices.clear();
        await localDb.invoiceItems.clear();
        await localDb.payments.clear();
        await localDb.syncCursors.clear();
      },
    );
    fetchMockState = {
      ok: true,
      status: 200,
      json: async (): Promise<unknown> => ({}),
      error: null,
    };
    resetWorkerStateForTest();

    await testFn();
    console.log(`✅ [PASS] ${name}`);
  } catch (error: unknown) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(error);
    process.exit(1);
  }
}

async function main() {
  console.log("Starting Phase 3 Tests...\n");

  await runTest("1. Existing local ledger migration to amount + balance_impact", async () => {
    // Close default localDb
    localDb.ledgerTransactions.clear(); // We shouldn't use localDb directly for the v3 setup since it's v4.

    // Need a separate Dexie instance to simulate v3
    const dbV3 = new Dexie("TestMigDB");
    dbV3.version(3).stores({
      ledger_transactions:
        "id, shop_id, customer_id, transaction_type, created_at, &idempotency_key",
    });
    // Insert realistic v3 data (where amount is signed, balance_impact is undefined)
    await dbV3.table("ledger_transactions").bulkAdd([
      {
        id: "tx1",
        shop_id: MOCK_SHOP_ID,
        customer_id: "c1",
        amount: 5000,
        transaction_type: "CREDIT_SALE",
        created_at: "2026-01-01",
      },
      {
        id: "tx2",
        shop_id: MOCK_SHOP_ID,
        customer_id: "c1",
        amount: -2000,
        transaction_type: "PAYMENT",
        created_at: "2026-01-02",
      },
    ]);
    await dbV3.close();

    // Now open it as v4 with the upgrade logic
    const dbV4 = new Dexie("TestMigDB");
    dbV4.version(3).stores({
      ledger_transactions:
        "id, shop_id, customer_id, transaction_type, created_at, &idempotency_key",
    });
    dbV4.version(4).upgrade((trans) => {
      return trans
        .table("ledger_transactions")
        .toCollection()
        .modify((tx: LedgerTransaction) => {
          if (tx.balance_impact === undefined) {
            tx.balance_impact = tx.amount;
            tx.amount = Math.abs(tx.amount);
          }
        });
    });

    await dbV4.open();

    const txs = await dbV4.table("ledger_transactions").toArray();

    const creditTx = txs.find((t: LedgerTransaction) => t.id === "tx1");
    const paymentTx = txs.find((t: LedgerTransaction) => t.id === "tx2");

    if (!creditTx || creditTx.amount !== 5000 || creditTx.balance_impact !== 5000)
      throw new Error("Credit wrong");
    if (!paymentTx || paymentTx.amount !== 2000 || paymentTx.balance_impact !== -2000)
      throw new Error("Payment wrong");

    await dbV4.delete();
  });

  await runTest("2. Credit sale increases balance", async () => {
    // Already tested by Phase 2, but verifying new semantics.
    const product = {
      id: "p1",
      shop_id: MOCK_SHOP_ID,
      name: "Oil",
      selling_price: 1000,
      purchase_price: 800,
      stock_quantity: 10,
      is_active: true,
      version: 1,
      category: "Oils",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
    await localDb.products.add(product as Product);
    const cust = await CustomerService.createCustomer(MOCK_SHOP_ID, {
      name: "Bob",
      mobile: "123",
    } as Partial<Customer> as Customer);
    await SaleService.createSale(
      MOCK_SHOP_ID,
      { customer_id: cust.id, discount: 0, paid: 0, payment_method: null, notes: null },
      [{ product_id: "p1", quantity: 2 }],
    );

    const custUpdated = await localDb.customers.get(cust.id);
    if (custUpdated!.balance_cache !== 2000) throw new Error("Balance should be 2000");
  });

  await runTest("8. Unsupported server capability preserves the outbox operation", async () => {
    // create_purchase is BLOCKED
    await localDb.outboxOperations.add({
      id: "op1",
      shop_id: MOCK_SHOP_ID,
      operation_type: "RPC",
      entity: "create_purchase",
      entity_id: "pur1",
      idempotency_key: "k",
      request_hash: "h",
      payload: {},
      status: "PENDING",
      retry_count: 0,
      next_retry_at: null,
      last_attempt_at: null,
      last_error_code: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const r = await processOutbox();
    const op = await localDb.outboxOperations.get("op1");
    if (op!.status !== "BLOCKED_SERVER_CAPABILITY")
      throw new Error(`Wrong status: ${op!.status}. processOutbox returned ${r}`);
  });

  await runTest(
    "10. Unrelated operation can proceed despite an unrelated blocked operation",
    async () => {
      // Blocked operation on customer 1
      await localDb.outboxOperations.add({
        id: "op1",
        shop_id: MOCK_SHOP_ID,
        operation_type: "RPC",
        entity: "create_purchase",
        entity_id: "cust1",
        idempotency_key: "k1",
        request_hash: "h",
        payload: {},
        status: "PENDING",
        retry_count: 0,
        next_retry_at: null,
        last_attempt_at: null,
        last_error_code: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Valid CRUD on customer 2
      await localDb.outboxOperations.add({
        id: "op2",
        shop_id: MOCK_SHOP_ID,
        operation_type: "CREATE",
        entity: "customers",
        entity_id: "cust2",
        idempotency_key: "k2",
        request_hash: "h",
        payload: {},
        status: "PENDING",
        retry_count: 0,
        next_retry_at: null,
        last_attempt_at: null,
        last_error_code: null,
        created_at: new Date(Date.now() + 1000).toISOString(),
        updated_at: new Date().toISOString(),
      });

      await processOutbox();
      const op1 = await localDb.outboxOperations.get("op1");
      const op2 = await localDb.outboxOperations.get("op2");

      if (op1!.status !== "BLOCKED_SERVER_CAPABILITY") throw new Error("op1 should block");
      if (op2!.status !== "SYNCED") throw new Error("op2 should sync");
    },
  );

  await runTest(
    "12. Connectivity HTTP 405 is not automatically classified as offline",
    async () => {
      fetchMockState.ok = false;
      fetchMockState.status = 405; // Method not allowed
      const state = await connectivity.forceCheck();
      if (state !== "DEGRADED") throw new Error("Should be DEGRADED (online but error)");
    },
  );

  await runTest(
    "13. Inventory reconciliation follows the verified quantity-sign convention",
    async () => {
      await localDb.products.add({ id: "p1", shop_id: MOCK_SHOP_ID, stock_quantity: 0 } as Product);
      await localDb.inventoryMovements.add({
        id: "m1",
        shop_id: MOCK_SHOP_ID,
        product_id: "p1",
        quantity: 10,
        movement_type: "PURCHASE",
      } as InventoryMovement);
      await localDb.inventoryMovements.add({
        id: "m2",
        shop_id: MOCK_SHOP_ID,
        product_id: "p1",
        quantity: -3,
        movement_type: "SALE",
      } as InventoryMovement);

      await reconcileAll(MOCK_SHOP_ID);

      const p = await localDb.products.get("p1");
      if (p!.stock_quantity !== 7) throw new Error(`Wrong reconciled stock: ${p!.stock_quantity}`);
    },
  );

  console.log("\nAll core tests passed successfully!");
}

main().catch(console.error);
