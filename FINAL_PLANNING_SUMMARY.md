# FINAL_PLANNING_SUMMARY.md

## 1. Verified Architecture vs Target Architecture

**Current State (Verified):** The application reads and writes directly from UI route components via the Supabase JavaScript client. There is no local database, no offline persistence, and no sync engine.
**Target Architecture:**
Web/PWA: UI → Domain Services → IndexedDB → Outbox → Sync Engine → Supabase PostgreSQL.
Future Android: UI → Domain Services → SQLite → Outbox → Sync Engine → Supabase PostgreSQL.

## 2. PostgreSQL Schema Breakdown

**Exact Tables to Create:** `outbox_operations`, `inventory_movements`, `sync_cursors`, `payments`, `idempotent_requests`.
**Exact Tables to Modify:** `customers` (add `balance_cache`, `deleted_at`, `version`), `invoices` (add `idempotency_key`, `payment_status`), `ledger_transactions` (renamed from `ledger_entries`, add `idempotency_key`, `transaction_type`, `reference_id`), `products` (add `deleted_at`, `version`).
**Existing Tables to Preserve:** `profiles`, `user_roles`, `suppliers`, `purchases`.

## 3. Local Databases & Adapters

**Exact Local IndexedDB Stores:** `customers`, `products`, `invoices`, `invoice_items`, `ledger_transactions`, `inventory_movements`, `payments`, `outbox_operations`, `sync_cursors`.
**Future SQLite Mapping:** Identical tables mapping via `@capacitor-community/sqlite`.

## 4. Architectural Strategies

### 4.1 Invoice Numbering

- **Identity:** Internal database joins use standard UUIDs (`id`).
- **Human Readable Number:** Generated offline deterministically (`INV-{SHOP_CODE}-{DEVICE_ID}-{TIMESTAMP}-{COUNTER}`).
- **Immutability:** Once an invoice is finalized, the `invoice_number` is strictly immutable. It cannot be renamed, even if synced to the cloud out-of-order.

### 4.2 Financial Migration Dry-Run

Before generating synthetic `CREDIT_SALE` rows for historical invoices without existing ledger entries, a Node.js script will compare `invoices.due` and manual `ledger_entries`.
It will produce a report categorizing records as:

- `SAFE_TO_BACKFILL`: No manual khata entries found for the customer within the timeframe.
- `POSSIBLE_DUPLICATE`: Same amount and exact date exist in Khata manual entries.
- `AMBIGUOUS`: Close dates/amounts requiring manual review.
- `ALREADY_REPRESENTED`: Invoice explicitly linked to a known ledger entry.
- `MANUAL_REVIEW_REQUIRED`: High complexity. Do not migrate automatically.

### 4.3 Unified Ledger & Inventory Reconciliation

- `ledger_transactions` and `inventory_movements` are the sole authorities for balances and stock.
- Derived caches (`customers.balance_cache` and `products.stock_quantity`) are updated transactionally.
- Mismatches detected during background pulls are auto-repaired in the cache, emitting an audit log entry (`CACHE_RECONCILIATION_REPAIR`).

### 4.4 Idempotency & Composite Cursors

- **Idempotency:** A dedicated `idempotent_requests` table records all critical mutation requests (`request_hash`, `idempotency_key`). Identical replays return the cached `result_reference_id`.
- **Cursors:** `(updated_at, id)` protocol prevents pagination skipping across large datasets.
- **Bootstrap:** Entities are pulled in dependency order (Settings -> Users -> Customers -> Products -> Invoices -> Ledgers) in batches of 500. `sync_cursors` are persisted after every batch. Crash resumes immediately from the last committed batch.

### 4.5 Conflict Resolution & Security Definer RPCs

- **Conflicts:** Optimistic Concurrency (`version` integer) on all mutable profiles. Append-only on financials. No "Last-Write-Wins" on critical data.
- **RPCs:** Strict `auth.uid()` injection, explicit `search_path` locks, and shop validation guarantee tenant isolation even during complex, multi-table transactions.

## 5. Cross-Check Verification

- Table names (`ledger_transactions`, `idempotent_requests`, `inventory_movements`), sync states (`PENDING`, `SYNCING`, `SYNCED`, `FAILED_RETRYABLE`, `FAILED_PERMANENT`, `CONFLICT`), and UUID fields have been identically mapped across `DATABASE_SCHEMA.md`, `SYNC_ENGINE.md`, `SYNC_CONFLICT_POLICY.md`, and `SECURITY_MODEL.md`. No contradictions exist between the Audit Phase and this Target Phase.

## 6. Implementation Phases

1. **Phase 1:** DB Schema, Migration Dry-Run, & Security Definer RPCs.
2. **Phase 2:** IndexedDB, Dexie.js Schema & Domain Services.
3. **Phase 3:** Outbox, Idempotency tracking & Sync Engine (Push/Pull Cursors).
4. **Phase 4:** UI Integration.
5. **Phase 5:** PWA & Offline UX Polish.

## 7. Blockers & Actions Required

No technical blockers remain for architectural design. All 12 mandatory corrections have been applied across the documentation.

**User Action Required:**
Review the four detailed markdown documents and this final summary. If the design is approved, please explicitly authorize Phase 1 Implementation.

PLANNING STATUS: COMPLETE
