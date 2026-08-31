# ONLINE_ONLY_MIGRATION_AUDIT

## Overview

This audit evaluates the current architecture of Bharat Auto Parts to plan the transition from an offline-first architecture to a strictly online-only architecture.

## Component Classifications

### 1. KEEP_AS_IS

- **`supabase/migrations/` (Existing base tables and auth)**: The core Supabase tables (`customers`, `products`, `profiles`, etc.) remain the authoritative source of truth.
- **`src/components/` & `src/pages/` (Current UI)**: The UI currently uses direct Supabase clients and React Query and hasn't been integrated with the offline architecture yet (Phase 4 was never started). The UI will remain as-is for simple reads, but will be adapted to call domain services for writes.

### 2. KEEP_AND_ADAPT

- **`src/lib/domain/SaleService.ts`**: Contains valuable validation and business logic for creating sales (e.g. idempotency, total calculation). It must be adapted from local IndexedDB operations to directly invoking the `create_sale` Supabase RPC.
- **`src/lib/domain/LedgerService.ts`**: Must be adapted to invoke a secure `create_manual_ledger_entry` RPC instead of local IndexedDB and outbox.
- **`src/lib/domain/CustomerService.ts`**: Must be adapted to perform direct, atomic Supabase writes.
- **`src/lib/domain/ProductService.ts`**: Must be adapted similarly.

### 3. REMOVE_AFTER_VERIFICATION

- **`src/lib/db/local.ts`**: Dexie database initialization and schema definition. No longer needed as we are not using IndexedDB.
- **`src/lib/db/LocalDatabaseAdapter.ts`**: Abstraction over local database. No longer needed.
- **`src/lib/sync/OutboxWorker.ts`**: Offline mutation queue processing. Must be removed.
- **`src/lib/sync/PullWorker.ts`**: Background data pulling. Must be removed.
- **`src/lib/sync/SyncOrchestrator.ts`**: Sync engine entry point. Must be removed.
- **`src/lib/sync/Reconciler.ts`**: Local data reconciliation. Must be removed.
- **`src/lib/sync/network.ts`**: Re-evaluate network state management for online-only blocking behavior (can be adapted or removed depending on needs).

### 4. REQUIRES_MANUAL_REVIEW

- **`vite.config.ts` & PWA configs**: Need to ensure Workbox isn't caching API mutation requests via Background Sync.
- **Service Workers**: Remove any offline fallback or mutation caching logic.

## Why these classifications?

Because UI integration (Phase 4) was never started, the UI components do not depend on the offline architecture. This makes the removal of the offline architecture (`src/lib/sync/` and `src/lib/db/local.ts`) extremely safe. We must, however, retain the business logic in the Domain Services (`src/lib/domain/`) and adapt it to point to Supabase RPCs.
