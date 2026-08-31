# SYNC_ENGINE.md

## 1. Overview

The Sync Engine defines the protocols for bidirectional data synchronization between the local IndexedDB/SQLite database and the Supabase PostgreSQL backend. It ensures zero data loss, exact idempotency, and resumable transfers for massive datasets.

## 2. Push Synchronization (Outbox Pattern)

Every mutating action generates an `outbox_operations` record in the local database.

### 2.1 Worker Loop

1. The background worker evaluates connectivity (beyond `navigator.onLine`, confirming actual server reachability).
2. It fetches records where `state IN ('PENDING', 'FAILED_RETRYABLE')` ordered by `created_at ASC`.
3. It dispatches the corresponding RPC.

### 2.2 Idempotency Hardening

- **Payload Hash:** The client hashes the request body (e.g., SHA-256).
- **Execution:** The server checks the `idempotent_requests` table.
  - If `idempotency_key` exists & hash matches: Returns the saved `result_reference_id` immediately. Outbox is marked `SYNCED`.
  - If `idempotency_key` exists & hash differs: Server throws `IDEMPOTENCY_KEY_REUSE_MISMATCH`. Outbox is marked `FAILED_PERMANENT` to prevent corruption.

## 3. Pull Synchronization & Composite Cursors

### 3.1 Composite Cursors

Relying solely on `updated_at > last_cursor` is fundamentally flawed. If multiple records are updated in the exact same millisecond, pagination boundaries will skip records.

- **Protocol:** `(updated_at, id)`
- **Query Condition:**
  ```sql
  WHERE updated_at > last_updated_at
     OR (updated_at = last_updated_at AND id > last_id)
  ORDER BY updated_at ASC, id ASC
  LIMIT 500
  ```

### 3.2 Pagination & Crash Recovery

- Sync batches are explicitly chunked to 500 records.
- The `sync_cursors` record in the local database is updated in the **same local transaction** that commits the batch of 500 records.
- If the app crashes mid-pull, the next restart will resume exactly from the last committed `(updated_at, id)`, preventing redownloads and skipping nothing.
- Deleted/soft-deleted records are included in the payload if they fall in the cursor window, allowing the local DB to mirror the deletion.

## 4. Bootstrap and New Device Restore

Bootstrapping a massive dataset (1,000+ customers, 100k+ ledger transactions) requires a structured approach.

### 4.1 Sync Order

Entities must be pulled in dependency order to prevent local foreign-key violations:

1. `shop_settings` & `users`
2. `customers` & `products`
3. `invoices`, `purchases`, `payments`
4. `invoice_items`, `purchase_items`
5. `ledger_transactions`, `inventory_movements`

### 4.2 Partial Bootstrap State

- While bootstrap is incomplete, the UI explicitly shows a "Syncing Initial Data..." overlay or progress bar.
- Creating new records locally is permitted (outbox pattern handles it), but viewing historical lists may be disabled until the specific entity cursor indicates completion (i.e., when a batch returns `< 500` records).

## 5. Ledger and Balance Cache Reconciliation

The client periodically (or upon detecting a specific sync flag) verifies local caches.

- **Local Check:** Computes `SUM(balance_impact)` from local `ledger_transactions` for a customer.
- **Mismatch:** If it differs from `customers.balance_cache`, an automated local repair is triggered, updating the cache to match the ledger.
- **Server Check:** The `pull_changes` RPC performs a background `SUM` check for modified customers. If the server-side cache is broken, it repairs it and pushes the updated customer row down to the client. This guarantees `ledger_transactions` is always the ultimate authority.

## 6. Inventory Reconciliation

Similar to the ledger, `inventory_movements` dictates the exact stock quantity.

- The `pull_changes` RPC performs a continuous background consistency check of `products.stock_quantity` versus the `SUM(quantity)` of `inventory_movements`. Mismatches are repaired server-side and the corrected product row is synced.
