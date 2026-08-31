# SYNC_CONFLICT_POLICY.md

## 1. Overview

Conflict resolution governs how the system handles simultaneous edits to the same records across multiple devices (e.g., Device A and Device B both offline, making changes).

## 2. Version-Based Optimistic Concurrency

We explicitly reject blind Last-Write-Wins (LWW).

Mutable entities (`customers`, `products`, `shop_settings`) use a `version` integer.

1. Client fetches record with `version = 1`.
2. Client modifies record and sends RPC update with `base_version = 1`.
3. Server checks if current `version == base_version`.
4. If true, server updates the record and increments `version` to `2`.
5. If false (another device already updated it to `2`), the server rejects the request with a `CONFLICT` status.

### 2.1 Conflict Resolution Workflow

When an outbox operation hits a `CONFLICT` state:

- The UI surfaces a "Sync Conflict" notification to the user.
- The user is presented with the remote version and their local version side-by-side.
- The user selects "Keep Mine" (forces update with new base version) or "Keep Theirs" (discards local outbox operation).
- Silently losing offline edits is strictly prohibited.

## 3. Append-Only Architectures (Conflict-Free)

### 3.1 Ledger Transactions & Payments

- **Policy:** **No Conflict Possible.**
- **Reason:** Ledger transactions and payments are immutable events. Two devices adding manual credits to the same customer simply create two distinct rows in `ledger_transactions`. The server safely aggregates the `balance_impact` of both.

### 3.2 Inventory Movements

- **Policy:** **No Conflict Possible, but Constraint Violations Handled.**
- **Reason:** Inventory adjustments are relative (+10, -5). If Device A and Device B both sell 5 units of a product that only has 8 in stock:
  - Device A syncs first: Stock becomes 3. Success.
  - Device B syncs second: The `create_sale` RPC attempts to insert a `-5` movement, but the server-side aggregation detects stock would fall below 0.
  - **Negative-Stock Handling:** The RPC throws `INSUFFICIENT_STOCK`. The outbox operation goes to `FAILED_PERMANENT` (or `CONFLICT`). The user must manually adjust stock or cancel the invoice locally.

### 3.3 Invoices & Purchases

- **Policy:** **No Conflict Possible.**
- **Reason:** Every bill is created with a highly unique, deterministic UUID. Modifying an existing, finalized invoice is prohibited. Adjustments require creating a `REVERSAL` movement or a new manual ledger entry.

## 4. Policy Summary by Entity

- **Customers:** Optimistic Concurrency (Version integer).
- **Products:** Optimistic Concurrency (Version integer).
- **Shop Settings:** Optimistic Concurrency (Version integer).
- **Invoices:** Immutable (No conflict).
- **Payments:** Append-Only Immutable (No conflict).
- **Ledger Transactions:** Append-Only Immutable (No conflict).
- **Inventory Movements:** Append-Only Immutable (Constraint violations possible).
- **Purchases:** Immutable (No conflict).
