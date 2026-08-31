# SERVER_CAPABILITY_MATRIX

## Business Mutations

### 1. `create_sale`

- **Current UI entry point**: Unknown (likely non-atomic direct UI write or missing)
- **Current Domain Service**: `SaleService.ts` (Offline-first, uses IndexedDB and Outbox)
- **Current direct Supabase usage**: Yes, in migration files.
- **Current local Dexie usage**: Yes, `localDb.invoices`, `localDb.invoiceItems`, etc.
- **Current outbox usage**: Yes, via `OutboxWorker`
- **Required database tables**: `invoices`, `invoice_items`, `inventory_movements`, `ledger_transactions`, `products`, `customers`, `idempotent_requests`
- **Required authorization rules**: Shop isolation, `auth.uid()` membership check
- **Required validation rules**: Valid prices, integer quantities, correct discounts
- **Required atomic transaction boundary**: Yes
- **Idempotency requirement**: Yes
- **Server Capability Status**: `GENERATED_NOT_DEPLOYED`

### 2. `receive_payment`

- **Server Capability Status**: `NOT_IMPLEMENTED`
- **Required Actions**: Create an RPC that atomically inserts into `payments`, `ledger_transactions`, and updates `invoices` payment status, tracking idempotency.

### 3. `create_purchase`

- **Server Capability Status**: `NOT_IMPLEMENTED`
- **Required Actions**: Create an RPC that inserts into `purchases`, `purchase_items`, `inventory_movements` (positive stock), and tracks idempotency.

### 4. `adjust_inventory`

- **Server Capability Status**: `NOT_IMPLEMENTED`
- **Required Actions**: Create an RPC that inserts into `inventory_movements` for manual adjustment.

### 5. `reverse_sale`

- **Server Capability Status**: `NOT_IMPLEMENTED`
- **Required Actions**: Create an RPC that performs exactly opposite movements in `inventory_movements` and `ledger_transactions` and marks the invoice as reversed.

### 6. `reverse_payment`

- **Server Capability Status**: `NOT_IMPLEMENTED`
- **Required Actions**: Create an RPC that performs the opposite `ledger_transactions` and updates `invoices` payment status.

### 7. `create_customer`

- **Server Capability Status**: `UNSAFE_DIRECT_WRITE`
- **Required Actions**: Can use direct insert if simple, but needs to be evaluated if we want to ensure idempotency. If no complex cross-table constraints exist, standard RLS might suffice, but an RPC is safer for enforcing zero initial balance and idempotent UUID assignment.

### 8. `update_customer`

- **Server Capability Status**: `UNSAFE_DIRECT_WRITE`

### 9. `soft_delete_customer`

- **Server Capability Status**: `UNSAFE_DIRECT_WRITE`

### 10. `create_product`

- **Server Capability Status**: `UNSAFE_DIRECT_WRITE`

### 11. `update_product`

- **Server Capability Status**: `UNSAFE_DIRECT_WRITE`

### 12. `soft_delete_product`

- **Server Capability Status**: `UNSAFE_DIRECT_WRITE`

### 13. `create_manual_ledger_entry`

- **Server Capability Status**: `NOT_IMPLEMENTED`

### 14. `supplier mutations` & `purchase-related mutations`

- **Server Capability Status**: `NOT_IMPLEMENTED`
