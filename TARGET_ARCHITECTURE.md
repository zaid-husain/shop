# TARGET_ARCHITECTURE.md

**Project:** Bharat Auto Parts  
**Phase:** 1 — Target architecture design (Steps 3–11)  
**Status:** Planning document — no implementation yet  
**Based on:** `ARCHITECTURE_AUDIT.md` (approved)

---

## 1. Purpose

Define the **production-grade, offline-first** target architecture for Bharat Auto Parts. This document describes **what will be built** and **how audit findings are resolved**, without claiming implementation is complete.

### Deployment strategy (Step 3 — confirmed)

| Runtime                          | Local database                   | When                        |
| -------------------------------- | -------------------------------- | --------------------------- |
| **Web / PWA (current)**          | IndexedDB via `IndexedDBAdapter` | Phase 1 implementation      |
| **Android / Capacitor (future)** | SQLite via `SQLiteAdapter`       | Phase 2 — same domain layer |

Business logic, sync protocol, and PostgreSQL schema are **shared** across both platforms.

---

## 2. Target architecture diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              UI LAYER                                     │
│  Existing routes (billing, khata, products, …) — minimal sync UI added   │
│  Reads/writes through Domain Services only (no direct sb.from in routes) │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼─────────────────────────────────────────┐
│                         DOMAIN SERVICE LAYER                            │
│  SaleService · PaymentService · PurchaseService · InventoryService      │
│  CustomerService · ProductService · LedgerService · ShopService           │
│  ── Atomic local transactions + idempotency key generation               │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────▼────────┐   ┌─────────▼─────────┐   ┌────────▼────────┐
│ LocalDatabase   │   │   SyncEngine       │   │  RemoteSync    │
│ Adapter         │   │   (Outbox worker)  │   │  Client        │
│                 │   │                    │   │  (RPC calls)   │
│ IndexedDB (web) │   │ ConnectivityMonitor│   │                │
│ SQLite (Android)│   │ Retry / backoff    │   │ Supabase Auth  │
└────────┬────────┘   └─────────┬──────────┘   └────────┬────────┘
         │                       │                       │
         │              outbox_operations                │
         │                       └───────────────────────┘
         │                                   │
         │                                   ▼
         │              ┌────────────────────────────────────────┐
         │              │     Supabase PostgreSQL + RPC Functions   │
         │              │  create_sale · receive_payment · …        │
         │              │  RLS · idempotency UNIQUE · transactions  │
         │              └────────────────────────────────────────┘
         │
         └── Immediate UI reads (local operational source of truth)
```

### Data flow for a user action (example: credit sale)

```
1. User taps "Save + PDF" on billing screen
2. SaleService.createSale() generates:
   - sale_id (UUID, client)
   - idempotency_key (UUID, client)
   - invoice_number (offline-safe display number)
3. LocalDatabaseAdapter.transaction():
   a. INSERT invoices (+ items snapshot fields)
   b. INSERT invoice_items (with price/name snapshots)
   c. INSERT inventory_movements (SALE, negative qty per line)
   d. UPDATE products.current_stock cache (derived)
   e. INSERT payments row (if paid > 0)
   f. INSERT ledger_transactions (CREDIT_SALE for due; PAYMENT if partial)
   g. INSERT audit_log entry (local mirror)
   h. INSERT outbox_operations (operation_type: CREATE_SALE, payload ref)
4. UI re-renders from local DB immediately
5. SyncEngine (background):
   - Detects connectivity (not navigator.onLine alone)
   - Calls supabase.rpc('create_sale', { …, idempotency_key })
   - Server runs single PG transaction (idempotent)
   - On success: marks outbox SYNCED, stores server ack metadata
   - On retryable failure: exponential backoff
   - On permanent failure: surfaces actionable error
```

---

## 3. Layer responsibilities

### 3.1 UI layer

**Preserves** existing screens and flows. Changes are **internal** (call domain services instead of `sb.from`) plus **minimal** sync status indicator.

| Responsibility                   | Owner                                                                |
| -------------------------------- | -------------------------------------------------------------------- |
| Form state, cart, search filters | Route components (unchanged pattern)                                 |
| Durable reads                    | Domain services → local DB                                           |
| Durable writes                   | Domain services only                                                 |
| Loading / error UX               | React Query over local DB + sync state                               |
| PDF generation                   | From **persisted invoice snapshot**, not live product/customer state |

**Prohibited after migration:** Direct `sb.from('invoices').insert(...)` in route files for critical paths.

### 3.2 Domain service layer

Platform-independent TypeScript modules under `src/lib/domain/`.

| Service            | Operations                                                |
| ------------------ | --------------------------------------------------------- |
| `SaleService`      | `createSale`, `reverseSale`, `getInvoiceForPdf`           |
| `PaymentService`   | `receivePayment`, `reversePayment`                        |
| `PurchaseService`  | `createPurchase`, `reversePurchase`                       |
| `InventoryService` | `adjustInventory`, `getStock`, `getMovements`             |
| `LedgerService`    | `getCustomerBalance`, `getStatement`, `createManualEntry` |
| `CustomerService`  | `create`, `update`, `softDelete`                          |
| `ProductService`   | `create`, `update`, `deactivate`                          |
| `ShopService`      | `getSettings`, `updateSettings`                           |
| `SyncService`      | `getStatus`, `retryFailed`, `forcePull`                   |

Each mutating operation:

1. Validates input (Zod schemas).
2. Generates `idempotency_key` if not supplied (idempotent retry passes same key).
3. Runs **one local adapter transaction**.
4. Returns result for immediate UI update.

### 3.3 LocalDatabaseAdapter

```typescript
interface LocalDatabaseAdapter {
  transaction<T>(fn: (tx: LocalTransaction) => Promise<T>): Promise<T>;
  // Entity CRUD — used by domain services inside transactions
  // Sync metadata accessors
  getOutboxPending(): Promise<OutboxOperation[]>;
  getSyncCursor(entity: EntityType): Promise<SyncCursor | null>;
  setSyncCursor(entity: EntityType, cursor: SyncCursor): Promise<void>;
}
```

Implementations:

| Adapter            | Storage           | Library (recommended)                |
| ------------------ | ----------------- | ------------------------------------ |
| `IndexedDBAdapter` | Browser IndexedDB | Dexie.js (versioned schema, indexes) |
| `SQLiteAdapter`    | Capacitor SQLite  | `@capacitor-community/sqlite`        |

**Schema parity:** Local tables mirror PostgreSQL business entities + `outbox_operations` + `sync_cursors` + `sync_entity_state`. Same column semantics where possible.

### 3.4 SyncEngine

Background worker (Web Worker optional for heavy batching; main thread acceptable initially).

See `SYNC_ENGINE.md` for full protocol.

### 3.5 Remote layer

- **Auth:** Existing Supabase Auth (unchanged phone + PIN model).
- **Mutations:** Supabase RPC functions only for critical financial/inventory operations.
- **Reads (sync pull):** PostgREST with cursor pagination, or `pull_changes` RPC.
- **No service_role on client.**

---

## 4. Data ownership model

### 4.1 Sources of truth by context

| Context                 | Operational source                                    | Durable cloud source      | Cache (discardable) |
| ----------------------- | ----------------------------------------------------- | ------------------------- | ------------------- |
| Shop open, any network  | **Local DB**                                          | PostgreSQL (after SYNCED) | React Query         |
| Customer balance        | **ledger_transactions** (local, then cloud)           | PostgreSQL                | —                   |
| Product stock (display) | **inventory_movements** sum or `stock_quantity` cache | PostgreSQL                | —                   |
| Invoice PDF / history   | **invoices + invoice_items snapshots**                | PostgreSQL                | —                   |
| Auth session            | Supabase JWT                                          | Supabase Auth             | localStorage        |
| Pending changes         | **outbox_operations**                                 | —                         | —                   |

### 4.2 Entity mutability rules

| Entity                | Editable?                    | Deletable?        | Immutable after    |
| --------------------- | ---------------------------- | ----------------- | ------------------ |
| `shops`               | Yes (settings)               | No                | —                  |
| `customers`           | Yes (profile)                | Soft delete only  | —                  |
| `products`            | Yes (except historical refs) | Soft deactivate   | —                  |
| `invoices`            | No (after FINALIZED)         | No hard delete    | Finalization       |
| `invoice_items`       | No                           | No hard delete    | Parent finalized   |
| `payments`            | No                           | No — reverse only | Creation           |
| `ledger_transactions` | **No**                       | **No**            | Always append-only |
| `inventory_movements` | No                           | No                | Always append-only |
| `purchases`           | No (after FINALIZED)         | No hard delete    | Finalization       |
| `audit_log`           | No                           | No                | Always             |

### 4.3 Resolving audit issue #1: disconnected invoice due vs Khata ledger

**Problem:** `invoices.due` used on Customers page; `ledger_entries` used on Khata — credit sales don't create ledger rows.

**Solution:**

| Field / system                        | Role after migration                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `ledger_transactions`                 | **Authoritative customer balance** — single source of truth                   |
| `invoices.due`                        | **Snapshot at sale time** for that bill only (PDF, bill reminder per invoice) |
| `invoices.payment_status`             | Snapshot enum: `paid`, `partial`, `unpaid` (normalized)                       |
| UI: Khata, Dashboard, Reports         | Read balance from `LedgerService.getCustomerBalance()`                        |
| UI: Customers list "Due" badge        | Same ledger balance (not invoice sum)                                         |
| UI: Per-invoice due on customer sheet | Show invoice snapshot `due` for bill-specific reminders                       |

**`create_sale` RPC** atomically:

- Creates invoice with `due` snapshot.
- Creates `ledger_transactions` row `CREDIT_SALE` for `due` amount when `due > 0`.
- Creates `ledger_transactions` row `PAYMENT_APPLIED` when `paid > 0` (linked to `payments` row).

Manual Khata entries map to `MANUAL_CREDIT` / `MANUAL_PAYMENT` transaction types.

**Backfill migration:** For historical credit sales with `due > 0` and no linked ledger row, insert synthetic `CREDIT_SALE` ledger_transactions (see `DATABASE_SCHEMA.md` § Migration).

---

## 5. Audit issue resolutions (explicit)

| #   | Issue                              | Target resolution                                                                   |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Invoice due vs ledger disconnected | Unified ledger authoritative; invoice due = snapshot only; `create_sale` links both |
| 2   | Customer delete cascades ledger    | Soft delete (`deleted_at`); revoke DELETE RLS; FK changed to RESTRICT               |
| 3   | Hard delete ledger entries         | Append-only `ledger_transactions`; reversals only; DELETE revoked                   |
| 4   | Non-atomic invoice creation        | `create_sale` RPC + local single transaction                                        |
| 5   | Non-atomic purchase creation       | `create_purchase` RPC + local single transaction                                    |
| 6   | Duplicate bills (retry/double-tap) | `idempotency_key` UNIQUE + UI debounce; same key returns original                   |
| 7   | Missing idempotency                | All critical ops carry `idempotency_key` (client UUID)                              |
| 8   | No inventory movement history      | `inventory_movements` append-only table                                             |
| 9   | Silent oversell (clamp to 0)       | `create_sale` validates stock; returns `INSUFFICIENT_STOCK` or flags conflict       |
| 10  | Multi-device conflicts             | Movement-event reconciliation; conflict queue (see conflict policy)                 |
| 11  | Offline sales/payments             | Local transaction + outbox; sync when online                                        |
| 12  | Crash during sync                  | Outbox stays PENDING/SYNCING; safe retry with same idempotency_key                  |
| 13  | Server ok, client timeout          | Idempotent RPC — retry marks SYNCED without duplicate                               |
| 14  | Safe retry                         | UNIQUE(idempotency_key) at DB; outbox retry passes same key                         |
| 15  | Offline invoice numbers            | Device-prefixed numbers + UUID internal id; server validates uniqueness             |
| 16  | Historical PDF accuracy            | PDF reads `invoices` + `invoice_items` + `shops` snapshot fields only               |
| 17  | RLS shop isolation                 | Extended to all new tables; RPC SECURITY DEFINER with shop check                    |
| 18  | `.env` in git                      | Add to `.gitignore`; env example template; rotate if repo public                    |
| 19  | Backup / DR                        | Documented in `SECURITY_MODEL.md` § 8                                               |
| 20  | Migration without data loss        | Additive migrations + backfill scripts + validation (DATABASE_SCHEMA.md § 9)        |
| 21  | `payment_status` due vs unpaid     | Normalize to enum `paid`, `partial`, `unpaid`; migrate `due` → `unpaid`             |

---

## 6. Module structure (implementation blueprint)

```
src/lib/
├── local-db/
│   ├── adapter.ts              # LocalDatabaseAdapter interface
│   ├── indexed-db-adapter.ts   # Web implementation
│   ├── sqlite-adapter.ts       # Android stub → full later
│   ├── schema.ts               # Shared table definitions
│   └── migrations/             # IDB version upgrades
├── sync/
│   ├── engine.ts
│   ├── outbox.ts
│   ├── connectivity.ts
│   ├── remote-client.ts
│   └── types.ts
├── domain/
│   ├── sale.service.ts
│   ├── payment.service.ts
│   ├── purchase.service.ts
│   ├── inventory.service.ts
│   ├── ledger.service.ts
│   ├── customer.service.ts
│   ├── product.service.ts
│   └── shop.service.ts
├── pdf/
│   ├── invoice-pdf.ts          # From snapshot rows
│   └── statement-pdf.ts      # Refactor from statement.ts
└── db.ts                       # Types + facade (replaces direct sb usage)
```

---

## 7. PostgreSQL RPC functions (summary)

Full signatures in `DATABASE_SCHEMA.md` § 6.

| RPC                | Purpose                                                        |
| ------------------ | -------------------------------------------------------------- |
| `create_sale`      | Atomic sale + items + movements + payments + ledger + audit    |
| `receive_payment`  | Atomic payment + ledger + optional invoice allocation          |
| `create_purchase`  | Atomic purchase + items + movements + audit                    |
| `reverse_sale`     | Reversal movements + ledger reversals + marks invoice reversed |
| `reverse_payment`  | Ledger + payment reversal                                      |
| `adjust_inventory` | Manual movement + stock cache update                           |
| `pull_changes`     | Cursor-based incremental sync pull                             |
| `register_device`  | Device registration for bill sequences                         |

**Deprecation:** Existing triggers `decrement_stock`, `increment_stock_on_purchase` will be **disabled** after RPCs are live (new migration sets triggers to no-op or drops trigger bodies). Invoice cost/due triggers may remain as safety net inside RPC transactions.

---

## 8. Connectivity and degraded modes

| Mode                        | User experience                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------- |
| **Online + synced**         | Normal; indicator: "All changes saved"                                             |
| **Online + pending**        | Normal operations; indicator: "N changes syncing…"                                 |
| **Offline**                 | Full shop operations against local DB; indicator: "Offline — saved on this device" |
| **Offline → online**        | Auto sync; no re-entry required                                                    |
| **Sync failed (retryable)** | Local data safe; indicator: "Sync delayed — will retry"                            |
| **Sync failed (permanent)** | Action required UI; local data preserved                                           |
| **Conflict**                | Flagged item in sync queue; user resolution workflow                               |

`ConnectivityMonitor` checks:

1. `navigator.onLine` (weak signal)
2. HEAD request to Supabase health (`/auth/v1/health` or lightweight RPC `ping`)
3. Auth token validity
4. Classifies errors: network, auth, RLS, validation, conflict, rate limit

---

## 9. Performance design (scale targets)

| Entity              | Target volume | Strategy                                                          |
| ------------------- | ------------- | ----------------------------------------------------------------- |
| Customers           | 1,000+        | Indexed name/mobile; paginated list; incremental sync             |
| Products            | 10,000+       | Indexed search; picker loads 200 + search local index             |
| Ledger transactions | 100,000+      | Cursor sync; paginated history; balance materialized per customer |
| Inventory movements | 100,000+      | Cursor sync; stock = cache column + periodic reconciliation       |
| Invoices            | 50,000+       | Paginated recent; full history on demand                          |

**Never** download full cloud database on startup. Initial sync: paginated pull per entity. Subsequent: `pull_changes(since_cursor)`.

**Customer balance optimization:** Maintain `customers.balance_cache` updated transactionally in `create_sale` / `receive_payment` (derived from ledger, not separate truth).

---

## 10. PDF and shop settings

### 10.1 Shop settings (`shops` table)

Persist signup `shop_name`, address, phones, GST (optional), invoice footer. PDF reads from `shops` row **at generation time** for new invoices; stored invoice snapshot includes shop fields denormalized on `invoices` for historical accuracy.

### 10.2 Invoice PDF (audit #16)

```
generateInvoicePdf(invoiceId):
  READ invoices WHERE id = invoiceId      -- includes customer_name, customer_mobile snapshots
  READ invoice_items WHERE invoice_id     -- product_name, unit_price snapshots
  READ shop snapshot fields on invoice row (shop_name, shop_address, shop_phone)
  NEVER read live products or customers for historical amounts
```

---

## 11. Bill numbering (summary)

See `DATABASE_SCHEMA.md` § 7 for full spec.

- **Internal ID:** UUID v4 (client-generated, offline-safe).
- **Display number:** `{SHOP_CODE}-{DEVICE_CODE}-{YYYYMMDD}-{SEQ}`.
- **SEQ:** Per-device daily counter in local DB + `device_sequences` cloud table.
- **Collision:** UNIQUE `(shop_id, invoice_number)` — on conflict, server returns existing sale via idempotency_key lookup first; if new idempotency but duplicate number, RPC assigns `-R1` suffix and flags for review.

---

## 12. Relationship to existing codebase

| Current                      | Target                                                                   |
| ---------------------------- | ------------------------------------------------------------------------ |
| `invoices` + `invoice_items` | Retained — conceptually "sales" (no rename)                              |
| `ledger_entries`             | Migrated to `ledger_transactions`; legacy table frozen                   |
| `sb.from()` in routes        | Replaced by domain services                                              |
| React Query                  | Caches local DB reads + sync metadata                                    |
| `audit_log`                  | Written on every RPC mutation                                            |
| MCP tools                    | Updated to read via same tables / optional local-agnostic server queries |

---

## 13. Implementation phases (high level)

| Phase                  | Deliverable                                                 |
| ---------------------- | ----------------------------------------------------------- |
| **A — Foundation**     | LocalDatabaseAdapter (IndexedDB), schema, domain interfaces |
| **B — Cloud schema**   | Additive PG migrations, RPC functions, RLS                  |
| **C — Domain + local** | Services write locally + outbox                             |
| **D — Sync engine**    | Push/pull, connectivity, retry                              |
| **E — UI wiring**      | Route migration one feature at a time                       |
| **F — Data migration** | Backfill ledger, movements, shops                           |
| **G — Hardening**      | Tests, conflict UI, backup verification                     |
| **H — Android**        | SQLiteAdapter (same schema SQL)                             |

Detailed order in planning summary § 15.

---

## 14. Out of scope for Phase 1 implementation

- Capacitor Android build
- Full PWA service worker (optional enhancement later)
- Real-time Supabase subscriptions (pull-based sync sufficient)
- Multi-shop per user (current model: one shop per owner profile)

---

## 15. Document cross-references

| Topic                               | Document                  |
| ----------------------------------- | ------------------------- |
| Table definitions, indexes, RPC SQL | `DATABASE_SCHEMA.md`      |
| Outbox, protocol, retry, cursors    | `SYNC_ENGINE.md`          |
| Per-entity conflict rules           | `SYNC_CONFLICT_POLICY.md` |
| RLS, auth, backup, `.env`           | `SECURITY_MODEL.md`       |
| Current state                       | `ARCHITECTURE_AUDIT.md`   |
