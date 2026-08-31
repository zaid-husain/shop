# DATABASE_SCHEMA.md

## 1. Overview

This document defines the production PostgreSQL schema for the offline-first migration of Bharat Auto Parts. The schema enforces financial append-only immutability, inventory movement tracking, optimistic concurrency control, and robust idempotency.

## 2. Global Design Patterns

### 2.1 Composite Cursors

For stable, paginated synchronization, all synchronizable tables use a composite cursor: `(updated_at, id)`. This guarantees deterministic ordering even when multiple records share the exact same microsecond timestamp.

### 2.2 Versioning (Optimistic Concurrency)

Mutable entities (`customers`, `products`, `shop_settings`) include a `version` integer column. Updates must provide the `base_version`. If the server's version > client's `base_version`, the server rejects the update as a conflict.

### 2.3 Strict Idempotency Tracking

A dedicated `idempotent_requests` table guarantees that retries of identical operations never duplicate financial logic.

- **Fields:** `idempotency_key` (UUID), `shop_id` (UUID), `operation_type` (Enum), `request_hash` (TEXT), `result_reference_id` (UUID), `processing_status` (Enum: PENDING, COMPLETED, FAILED), `created_at` (Timestamp).

## 3. Core Tables

### 3.1 `idempotent_requests`

Tracks critical mutations to prevent double-execution.

- `idempotency_key`: UUID (PK, generated locally by client)
- `shop_id`: UUID (FK to profiles.shop_id)
- `operation_type`: VARCHAR (e.g., 'CREATE_SALE', 'RECEIVE_PAYMENT')
- `request_hash`: VARCHAR (SHA-256 hash of the sanitized payload)
- `result_reference_id`: UUID (FK to the primary inserted entity, e.g., invoice_id)
- `processing_status`: VARCHAR ('STARTED', 'COMPLETED', 'ERROR')
- `created_at`: TIMESTAMPTZ

### 3.2 `outbox_operations` (Client-side mainly, mirrored on server for debugging if needed, but typically only exists in IndexedDB)

_Note: In an RPC-driven architecture, the client sends RPCs directly. The outbox table resides strictly in the local IndexedDB, not PostgreSQL._

### 3.3 `inventory_movements` (New)

Append-only log of stock changes. Authoritative source of truth for inventory.

- `id`: UUID (PK)
- `shop_id`: UUID
- `product_id`: UUID
- `movement_type`: VARCHAR ('OPENING_STOCK', 'PURCHASE', 'SALE', 'SALE_RETURN', 'MANUAL_ADJUSTMENT', 'REVERSAL')
- `quantity`: INTEGER (Negative for sales, positive for purchases)
- `reference_id`: UUID (Invoice ID or Purchase ID)
- `created_at`: TIMESTAMPTZ (Immutable)

### 3.4 `ledger_transactions` (Replaces `ledger_entries`)

Authoritative, append-only source of truth for customer balances.

- `id`: UUID (PK)
- `shop_id`: UUID
- `customer_id`: UUID
- `transaction_type`: VARCHAR ('CREDIT_SALE', 'PAYMENT_APPLIED', 'MANUAL_CREDIT', 'MANUAL_PAYMENT', 'REVERSAL')
- `amount`: NUMERIC (Absolute value)
- `balance_impact`: NUMERIC (Positive increases debt, Negative reduces debt)
- `reference_id`: UUID (Invoice ID, Payment ID)
- `created_at`: TIMESTAMPTZ
- _RLS:_ DELETE and UPDATE revoked.

### 3.5 `payments` (New)

Dedicated table for tracking customer payments.

- `id`: UUID (PK)
- `shop_id`: UUID
- `customer_id`: UUID
- `amount`: NUMERIC
- `payment_method`: VARCHAR ('CASH', 'UPI', 'BANK_TRANSFER')
- `reference_id`: UUID (Optional Invoice ID for direct bill payments)
- `created_at`: TIMESTAMPTZ

## 4. Modified Tables

### 4.1 `customers`

- **Added:** `balance_cache` (NUMERIC). This is purely a derived performance cache. It is updated transactionally via RPCs, but the true balance is always `SUM(balance_impact)` from `ledger_transactions`.
- **Added:** `version` (INTEGER, defaults to 1).
- **Added:** `deleted_at` (TIMESTAMPTZ, null by default).

### 4.2 `products`

- **Added:** `version` (INTEGER, defaults to 1).
- **Added:** `deleted_at` (TIMESTAMPTZ, null by default).
- _Note:_ `stock_quantity` remains as a cache, updated transactionally alongside `inventory_movements`.

### 4.3 `invoices`

- **Added:** `payment_status` (VARCHAR: 'PAID', 'PARTIAL', 'UNPAID').
- **Added:** Snapshot fields: `shop_name`, `customer_name`, `customer_mobile`.
- **Renamed/Re-purposed:** The existing `invoice_number` remains the human-readable identifier (e.g. `INV-XXX`), but joins use the internal `id` (UUID). Finalized invoices cannot have their `invoice_number` mutated.

## 5. Exact RPC Contracts

### 5.1 `create_sale`

- **Input:** `idempotency_key`, `request_hash`, `invoice_payload`, `items_payload`, `payment_payload` (optional).
- **Output:** `invoice_id`, `ledger_transaction_id`, `inventory_movement_ids`.
- **Validation:** Ensures products exist, `version` checks bypass since append-only.
- **Authorization:** `SECURITY DEFINER`. Validates `auth.uid()` belongs to `invoice_payload.shop_id`.
- **Idempotency:**
  - If `idempotency_key` exists & `request_hash` matches -> Returns previous `result_reference_id` + success.
  - If `idempotency_key` exists & `request_hash` differs -> THROW `IDEMPOTENCY_KEY_REUSE_MISMATCH`.
- **Atomicity:** Single transaction. Inserts invoice, items, movements, payment, ledger_transaction, updates customer `balance_cache`, updates product `stock_quantity`, inserts `idempotent_requests`. Rolls back entirely on failure.

### 5.2 `receive_payment`

- **Input:** `idempotency_key`, `request_hash`, `customer_id`, `amount`, `payment_method`.
- **Atomicity:** Inserts `payments`, `ledger_transactions` (type PAYMENT_APPLIED), updates `customers.balance_cache`.

### 5.3 `adjust_inventory`

- **Input:** `idempotency_key`, `request_hash`, `product_id`, `adjustment_qty`, `reason`.
- **Atomicity:** Inserts `inventory_movements`, updates `products.stock_quantity`.

### 5.4 `pull_changes`

- **Input:** `shop_id`, `last_updated_at`, `last_id`, `limit` (max 500).
- **Output:** Arrays of modified records (`customers`, `products`, `invoices`, etc.) where `(updated_at, id) > (last_updated_at, last_id)` ordered by `updated_at ASC, id ASC`.
- **Authorization:** Standard RLS bypass via Security Definer, scoped strictly to user's authorized shop.
