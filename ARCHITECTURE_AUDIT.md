# ARCHITECTURE_AUDIT.md

**Project:** Bharat Auto Parts  
**Audit date:** 2026-07-12  
**Phase:** 0 — Complete codebase audit (read-only)  
**Status:** Audit complete. No implementation changes have been made.

---

## Executive summary

Bharat Auto Parts is a **cloud-only, online-dependent** mobile-first web application built with **TanStack Start + React + Supabase PostgreSQL**. All business data (customers, products, invoices, ledger, purchases) is read and written **directly from UI route components** via the Supabase JavaScript client. There is **no local database**, **no offline persistence**, **no sync engine**, and **no outbox**.

The application is suitable for online shop use today, but it is **not production-ready for offline-first or multi-device financial operations** without substantial architectural work. The highest-risk gaps are:

1. **Zero offline operation** — network loss blocks all shop work.
2. **Non-atomic billing** — invoice header and line items are separate writes.
3. **Disconnected financial models** — invoice `due` and Khata `ledger_entries` are not linked.
4. **Mutable financial history** — ledger entries and customers can be hard-deleted.
5. **Inventory by overwrite** — `stock_quantity` is updated by triggers; no movement audit trail.
6. **No idempotency** — retries and double-clicks can duplicate records.
7. **No backup verification** — Supabase backups cannot be confirmed from this repository.

This document reflects the **actual codebase as inspected**, not a target design.

---

## 1. Current architecture

### 1.1 High-level diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Browser (primary runtime)                    │
│  React 19 UI ──► TanStack Router ──► TanStack React Query       │
│       │                    │                  │ (in-memory)    │
│       └────────────────────┴──────────────────┘                  │
│                            │                                     │
│                   Supabase JS Client (sb)                        │
│                   localStorage: auth session only                │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (requires network)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Supabase (PostgreSQL + Auth + PostgREST)            │
│  RLS policies (shop_id isolation)                                │
│  DB triggers: stock +/- invoice integrity                        │
└─────────────────────────────────────────────────────────────────┘

Optional server paths (not used for core CRUD today):
  TanStack Start SSR / Nitro (Cloudflare Workers default)
  MCP tools, AI chat API — read-only shop data via authenticated context
```

### 1.2 Source of truth

| Data             | Current source of truth                          | Local persistence             |
| ---------------- | ------------------------------------------------ | ----------------------------- |
| Customers        | Supabase `customers`                             | None                          |
| Products / stock | Supabase `products.stock_quantity`               | None                          |
| Sales / bills    | Supabase `invoices` + `invoice_items`            | None                          |
| Khata / udhaar   | Supabase `ledger_entries`                        | None                          |
| Purchases        | Supabase `purchases` + `purchase_items`          | None                          |
| Auth session     | Supabase Auth JWT                                | `localStorage` (tokens only)  |
| UI lists / KPIs  | React Query cache                                | Memory only (lost on refresh) |
| PDF invoices     | Generated in-browser from **current form state** | Not stored                    |

**There is no operational local database.** React state and React Query are caches, not durable storage.

### 1.3 Deployment target (actual)

| Target                         | Present?                 | Evidence                                                       |
| ------------------------------ | ------------------------ | -------------------------------------------------------------- |
| Web browser                    | **Yes**                  | TanStack Start, Vite, viewport meta, mobile-first UI           |
| PWA (service worker, manifest) | **No**                   | No `manifest.json`, no service worker registration             |
| Capacitor / Android native     | **No**                   | No `@capacitor/*` in `package.json`; no `capacitor.config`     |
| iOS native                     | **No**                   | —                                                              |
| SSR hosting                    | **Yes (infrastructure)** | Nitro + `src/server.ts`; default Cloudflare via Lovable config |

**Conclusion:** Current deployment is a **web application** (likely hosted on Lovable Cloud / Cloudflare). It is **not** a native Android app today. For offline-first local storage, the realistic near-term path is **IndexedDB in browser** plus a future **SQLite adapter** when Capacitor/Android is added.

---

## 2. Tech stack

| Layer                | Technology                         | Version / notes                               |
| -------------------- | ---------------------------------- | --------------------------------------------- |
| Language             | TypeScript                         | 5.8                                           |
| UI framework         | React                              | 19.2                                          |
| Meta-framework       | TanStack Start                     | 1.167                                         |
| Router               | TanStack Router                    | 1.168 (file-based, `src/routes/`)             |
| Server state         | TanStack React Query               | 5.83 (in-memory cache only)                   |
| Build tool           | Vite                               | 7.3                                           |
| SSR / deploy bundler | Nitro                              | 3.0 beta (Cloudflare default)                 |
| Styling              | Tailwind CSS 4 + Radix/shadcn UI   | —                                             |
| Cloud DB + Auth      | Supabase (`@supabase/supabase-js`) | 2.107                                         |
| PDF                  | jsPDF                              | Invoice + customer statement                  |
| Animation            | Framer Motion                      | —                                             |
| Validation           | Zod                                | Present; lightly used in routes               |
| Package managers     | npm + bun lockfiles                | Both `package-lock.json` and `bun.lock` exist |
| AI / MCP             | `@lovable.dev/mcp-js`, AI SDK      | Read-only shop tools                          |

**Not present:** Redux, Zustand, Drizzle ORM, Prisma, IndexedDB libraries, SQLite drivers, Capacitor, service workers, dedicated API/repository layer.

---

## 3. Application structure and routing

### 3.1 Route map

| Route             | File                                            | Purpose                             |
| ----------------- | ----------------------------------------------- | ----------------------------------- |
| `/`               | `src/routes/index.tsx`                          | Landing                             |
| `/auth`           | `src/routes/auth.tsx`                           | Sign in / create shop (phone + PIN) |
| `/dashboard`      | `src/routes/_authenticated/dashboard.tsx`       | KPIs, low stock, recent ledger      |
| `/khata`          | `src/routes/_authenticated/khata.tsx`           | Customer ledger book                |
| `/billing`        | `src/routes/_authenticated/billing.tsx`         | Create invoices, PDF, WhatsApp      |
| `/customers`      | `src/routes/_authenticated/customers.index.tsx` | Customer CRUD                       |
| `/customers/:id`  | `src/routes/_authenticated/customers.$id.tsx`   | Customer profile + ledger history   |
| `/products`       | `src/routes/_authenticated/products.tsx`        | Inventory CRUD                      |
| `/purchases`      | `src/routes/_authenticated/purchases.tsx`       | Supplier purchases, stock-in        |
| `/reports`        | `src/routes/_authenticated/reports.tsx`         | Outstanding, collections, CSV       |
| `/assistant`      | `src/routes/_authenticated/assistant.tsx`       | AI chat                             |
| MCP / OAuth / API | `src/routes/mcp.ts`, `[.mcp]/`, `api/chat.ts`   | Integrations                        |

Authenticated shell: `src/routes/_authenticated/route.tsx` (bottom nav, auth guard).

### 3.2 State management pattern

- **Auth:** React Context (`src/lib/auth-context.tsx`) — session, profile, role.
- **Business data:** React Query per page; queries call `sb.from(...)` directly.
- **Forms:** Local `useState` in route components (billing cart, product form, etc.).
- **No global store** for customers, products, or financial data.
- **No repository / service layer** — UI components own database access.

---

## 4. Database schema (Supabase PostgreSQL)

Migrations live in `supabase/migrations/` (11 files). Generated types: `src/integrations/supabase/types.ts`.

### 4.1 Tables

| Table            | Purpose                              | Soft delete                 | Versioning                            |
| ---------------- | ------------------------------------ | --------------------------- | ------------------------------------- |
| `profiles`       | User profile; holds `shop_id` UUID   | No                          | `updated_at` trigger                  |
| `user_roles`     | `owner` / `staff` per shop           | No                          | —                                     |
| `products`       | Catalog + `stock_quantity`           | `is_active` flag            | `updated_at`                          |
| `customers`      | Customer master                      | No (hard delete in UI)      | `updated_at`                          |
| `invoices`       | Sales bills (with snapshot fields)   | No                          | Immutable in practice? No enforcement |
| `invoice_items`  | Line items with price/name snapshots | Cascade delete with invoice | —                                     |
| `ledger_entries` | Khata credit/payment entries         | No (hard delete in UI)      | `updated_at`                          |
| `suppliers`      | Supplier master                      | No                          | `updated_at`                          |
| `purchases`      | Purchase bills                       | No                          | `updated_at`                          |
| `purchase_items` | Purchase lines                       | Cascade delete              | —                                     |
| `audit_log`      | Audit trail schema                   | —                           | **Never written by app**              |

**Notable absence:** There is **no `shops` table**. `shop_id` is a UUID assigned at signup (`handle_new_user` trigger). Signup `shop_name` metadata is **not persisted** to a shop settings table.

### 4.2 Enums

- `app_role`: `owner`, `staff`
- `ledger_entry_type`: `credit`, `payment`

### 4.3 Key constraints

- `invoices`: `UNIQUE (shop_id, invoice_number)`
- `ledger_entries`: `amount > 0` CHECK
- FK: `ledger_entries.customer_id` → `customers` **ON DELETE CASCADE**
- FK: `invoice_items.invoice_id` → `invoices` **ON DELETE CASCADE**

### 4.4 Database triggers (server-side logic)

| Trigger                           | Behavior                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `invoice_item_decrement_stock`    | On `invoice_items` INSERT → decrement `products.stock_quantity` (clamped with `GREATEST(..., 0)`) |
| `purchase_items_increment_stock`  | On `purchase_items` INSERT → increment `stock_quantity`                                           |
| `trg_enforce_invoice_item_cost`   | Overwrites `unit_cost` from `products.purchase_price`                                             |
| `trg_recompute_invoice_totals`    | Recomputes `cost_total` and `profit` on invoice                                                   |
| `trg_enforce_invoice_consistency` | Sets `due = total - paid`, `profit = total - cost_total`                                          |
| `handle_new_user`                 | Creates `profiles` + `user_roles` on auth signup                                                  |
| `touch_updated_at`                | Updates `updated_at` on profiles, products, customers, ledger, suppliers, purchases               |

**Gap:** No RPC/function wraps **atomic bill creation** (invoice + items + ledger + stock movements in one transaction).

---

## 5. Security model

### 5.1 Authentication

- **Provider:** Supabase Auth (email/password under the hood).
- **User-facing:** 10-digit Indian mobile + 4–6 digit PIN.
- **Internal mapping:** `phoneToEmail()` → `bap-{phone}@bharatautoparts.app`; password `bap_{pin}_{last4}`.
- **Session storage:** `localStorage` via Supabase client (`src/integrations/supabase/client.ts`).
- **Signup hook:** DB trigger creates profile with new random `shop_id` and `owner` role.

### 5.2 Authorization (RLS)

All business tables have RLS enabled with **shop isolation** via `current_shop_id()`:

```sql
USING (shop_id = public.current_shop_id())
WITH CHECK (shop_id = public.current_shop_id())
```

Additional rules:

- `profiles`: users read/update own profile only; `pin_hash` column revoked from authenticated SELECT (migration `20260707050042`).
- `audit_log`: owners read; inserts require `user_id = auth.uid()`.
- `ledger_entries`: insert requires `created_by = auth.uid()`.

Helper functions `current_shop_id()` and `has_role()` were changed to **SECURITY INVOKER** (migration `20260707050042`) to reduce privilege escalation risk.

### 5.3 Secrets and environment variables

| Variable                        | Where used              | Client-exposed?                  |
| ------------------------------- | ----------------------- | -------------------------------- |
| `VITE_SUPABASE_URL`             | Browser + server        | Yes (public)                     |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser + server        | Yes (anon key — expected public) |
| `VITE_SUPABASE_PROJECT_ID`      | MCP manifest            | Yes                              |
| `SUPABASE_SERVICE_ROLE_KEY`     | `client.server.ts` only | **No** (server-only)             |
| `SUPABASE_URL`                  | Server                  | No                               |

**Findings:**

1. `.env` is **tracked in git** (`git ls-files .env` returns the file) and is **not** in `.gitignore`. The anon/publishable key is committed. This is a **repository hygiene risk** (rotate if repo is or was public).
2. `supabaseAdmin` / service role client exists at `src/integrations/supabase/client.server.ts` but is **not imported by any route examined** — good; stays server-side.
3. No `service_role` key found in frontend bundle sources.
4. `pin_hash` column exists in schema but **auth uses Supabase password**, not `pin_hash` — column appears unused.

### 5.4 Security strengths

- RLS on all tenant tables.
- Shop scoping consistently applied.
- Invoice cost/profit/due enforced server-side via triggers.
- Server-only config pattern (`*.server.ts`).
- Open redirect protection on auth `?next=` param.

### 5.5 Security weaknesses

- UI-only authorization for destructive actions (delete customer, delete ledger entry) — RLS allows DELETE.
- No idempotency / duplicate-transaction protection.
- Full table scans in reports (`ledger_entries` select `*`).
- `audit_log` table unused — no application-level audit trail.
- Auth tokens in `localStorage` (XSS risk surface; common Supabase pattern).

---

## 6. Data flow by feature

### 6.1 Customers

**Files:** `customers.index.tsx`, `customers.$id.tsx`

| Operation          | Flow                                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| List               | `sb.from("customers").select("*")`                                       |
| Create/Update      | Direct insert/update with `shop_id` from profile                         |
| Delete             | **Hard delete** `sb.from("customers").delete()`                          |
| Due display (list) | Aggregated from `invoices` where `payment_status` in `unpaid`, `partial` |

**Risk:** Customer delete cascades to `ledger_entries` (FK ON DELETE CASCADE) — **financial history loss**.

### 6.2 Products / inventory

**File:** `products.tsx`

| Operation         | Flow                                            |
| ----------------- | ----------------------------------------------- |
| List              | `products` where `is_active = true`             |
| Create/Update     | Direct insert/update including `stock_quantity` |
| Remove            | Soft delete: `is_active = false`                |
| Stock on sale     | DB trigger on `invoice_items` insert            |
| Stock on purchase | DB trigger on `purchase_items` insert           |

**Gaps:**

- Manual stock edits overwrite `stock_quantity` with no movement history.
- Sale trigger uses `GREATEST(stock_quantity - qty, 0)` — **silent stock floor at 0**, no oversell alert.
- Billing UI shows stock but **does not block** overselling.
- No `inventory_movements` table.

### 6.3 Billing / invoices

**File:** `billing.tsx`, `format.ts` (`nextInvoiceNumber`)

**Save flow (current):**

1. Client generates `invoice_number` via `nextInvoiceNumber()` → `INV-YYMMDD-HHMMSS`-style.
2. Insert `invoices` row.
3. Insert `invoice_items` rows (separate request).
4. Triggers: decrement stock, recompute cost/profit/due.

**Not performed:**

- No `ledger_entries` insert for credit/due amounts.
- No explicit payment record table.
- No idempotency key.
- No transaction rollback if step 3 fails after step 2 succeeds.

**PDF generation:**

- Client-side jsPDF from **live cart state** and hardcoded shop address ("Near Bus Stand, Balapur, Akola").
- Invoice row stores customer name/mobile snapshots — good for DB record.
- **Historical invoice PDF re-generation from DB** is not implemented as a feature.

### 6.4 Khata / ledger

**Files:** `khata.tsx`, `customers.$id.tsx` (`EntrySheet`)

| Operation          | Flow                                                                      |
| ------------------ | ------------------------------------------------------------------------- |
| Balance            | Client-side sum: `credit_total - payment_total` from all `ledger_entries` |
| Add credit/payment | Direct `ledger_entries` insert                                            |
| Delete entry       | **Hard delete** from customer profile UI                                  |

**Disconnected from billing:** A credit sale in billing sets `invoices.due` but does **not** create a `ledger_entries` credit row. Shop may show different "due" on Customers page (invoice-based) vs Khata page (ledger-based).

### 6.5 Purchases

**File:** `purchases.tsx`

- Creates `suppliers` (auto), `purchases`, `purchase_items` in sequence.
- Stock incremented by trigger.
- Not atomic across three inserts (partial failure possible).

### 6.6 Dashboard & reports

**Files:** `dashboard.tsx`, `reports.tsx`

- Multiple parallel Supabase queries per page load.
- Reports load **all** `customers` and **all** `ledger_entries` — no pagination.
- Outstanding balances computed client-side from ledger.

### 6.7 PDF statements

**File:** `statement.ts`

- Khata statement PDF from `ledger_entries` — correct chronological running balance.
- Shop name/phone defaulted to constants, not from DB.

---

## 7. Existing offline capabilities

| Capability                   | Status                                         |
| ---------------------------- | ---------------------------------------------- |
| Offline data reads           | **None** — all queries need network            |
| Offline writes / queue       | **None**                                       |
| Sync engine / outbox         | **None**                                       |
| Network detection            | **None** (`navigator.onLine` not used)         |
| Service worker cache         | **None**                                       |
| IndexedDB                    | **None**                                       |
| SQLite                       | **None** (only transitive lockfile references) |
| localStorage (business data) | **None**                                       |
| Background sync              | **None**                                       |
| Conflict resolution          | **None**                                       |
| Idempotency keys             | **None**                                       |

**Verdict:** The app is **100% online-dependent** for shop operations. Refreshing the page without network shows loading states or errors. Unsaved form data is lost on navigation/refresh.

---

## 8. Financial integrity analysis

### 8.1 Dual balance systems (critical)

The app maintains **two unrelated "due" concepts**:

| System         | Source                                                      | Used on                               |
| -------------- | ----------------------------------------------------------- | ------------------------------------- |
| Invoice due    | `invoices.due` where `payment_status` ∈ `unpaid`, `partial` | Customers list, reminders             |
| Ledger balance | Sum of `ledger_entries` credit − payment                    | Khata, dashboard outstanding, reports |

Credit sales in billing update `invoices.due` only. Manual Khata entries update `ledger_entries` only. **These are not synchronized.**

### 8.2 Append-only violations

| Entity           | Can hard-delete?                     | Can update?                          |
| ---------------- | ------------------------------------ | ------------------------------------ |
| `ledger_entries` | **Yes** (customer profile UI)        | Yes (RLS allows UPDATE; UI doesn't)  |
| `invoices`       | RLS allows DELETE; UI doesn't expose | RLS allows UPDATE; UI doesn't expose |
| `customers`      | **Yes**                              | Yes                                  |
| `payments`       | No dedicated table                   | —                                    |

Financial history is **not append-only** today.

### 8.3 Atomicity gaps

| Business action              | Steps                                      | Atomic?         |
| ---------------------------- | ------------------------------------------ | --------------- |
| Create bill                  | invoice INSERT → items INSERT              | **No**          |
| Record purchase              | supplier? → purchase INSERT → items INSERT | **No**          |
| Khata payment                | single ledger INSERT                       | Single row only |
| Credit sale + ledger + stock | Not linked                                 | **N/A**         |

### 8.4 Duplicate prevention

- Save buttons use `busy` / `saving` flags — **UI only**.
- No `idempotency_key` columns.
- No unique constraints beyond `(shop_id, invoice_number)`.
- `saveAndDownload` and `saveAndShare` each call `saveInvoice()` separately — double save if user taps both flows.

### 8.5 Bill number strategy (current)

`nextInvoiceNumber()` in `src/lib/format.ts`:

```ts
INV-{YY}{MM}{DD}-{HHMMSS-based 5 digits}
```

- Generated on **client** at save time.
- Unique per shop in DB — duplicate insert fails.
- **Offline collision risk** if two devices save at same second (unlikely but possible).
- Not sequential/fiscal — acceptable for informal memos, weak for strict audit.

---

## 9. Inventory consistency analysis

| Aspect                        | Current behavior                             | Risk                                    |
| ----------------------------- | -------------------------------------------- | --------------------------------------- |
| Stock source                  | `products.stock_quantity` column             | Overwrite-only                          |
| Sale deduction                | Trigger after `invoice_items` insert         | Decoupled from invoice atomicity        |
| Negative stock                | Clamped to 0                                 | Oversell invisible                      |
| Movement audit                | None                                         | Cannot reconcile multi-device conflicts |
| Manual adjustment             | Direct edit `stock_quantity` in product form | No reason/audit                         |
| Purchase return / sale return | Not implemented                              | —                                       |

---

## 10. Backup and disaster recovery (current)

| Item                        | Status                                                                       |
| --------------------------- | ---------------------------------------------------------------------------- |
| Application-level backup    | **None**                                                                     |
| Supabase managed backups    | **Not verifiable from repo** — requires Supabase dashboard / plan inspection |
| Export scripts              | **None**                                                                     |
| Point-in-time recovery docs | **None**                                                                     |
| Local device backup         | **N/A** — no local business data                                             |

**If Supabase is unavailable:** App cannot authenticate or read/write data. No degraded offline mode.

**If phone is lost:** Data remains in cloud (if synced). No local copy.

**If app uninstalled:** Cloud data intact; local auth session lost.

---

## 11. MCP / AI integration

**Files:** `src/lib/mcp/`, `src/routes/mcp.ts`, `[.mcp]/invoke-tool/`

Read-only tools:

- `list_customers`
- `list_products`
- `recent_invoices`
- `get_sales_summary`

Uses authenticated Supabase context via middleware. Does not modify data. Secondary feature — not part of core ledger path.

---

## 12. Current weaknesses (prioritized)

### P0 — Data loss / financial integrity

1. No offline persistence — operations fail when network fails mid-sale.
2. Non-atomic billing and purchase writes — partial records possible.
3. Invoice due vs ledger balance divergence — incorrect customer balances depending on screen.
4. Hard delete of customers (cascade ledger) and ledger entries.
5. No idempotency — duplicate bills/payments on retry/double-tap.

### P1 — Inventory & multi-device

6. Stock clamped to zero — overselling undetected.
7. No inventory movement history.
8. Client-generated invoice numbers — weak offline/multi-device safety.
9. Full-table downloads on reports — will not scale; no incremental sync.

### P2 — Security & operations

10. `.env` committed to git.
11. `audit_log` unused.
12. No sync status / error recovery UX.
13. Shop settings (name, address, phone) hardcoded in PDF — not in database.
14. `shop_name` from signup not stored.

---

## 13. Data-loss and synchronization risks

| Scenario                                                | Current outcome                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Network drops during `saveInvoice` after invoice insert | Orphan invoice without items; stock not decremented                                   |
| User double-clicks Save                                 | Duplicate invoice if different `invoice_number`; or second fails on unique constraint |
| User works offline                                      | Complete failure — cannot load products/customers or save                             |
| App crash before save                                   | All cart data lost (React state only)                                                 |
| Delete customer with history                            | All `ledger_entries` CASCADE deleted                                                  |
| Delete ledger entry                                     | Balance changes with no audit trail                                                   |
| Two devices sell same SKU offline                       | Not supported offline; online sequential sales can oversell silently                  |
| Server processes payment, client times out              | Retry may duplicate without idempotency                                               |

---

## 14. Files that need modification (for offline-first migration)

### 14.1 Core — new modules (recommended)

| New area                         | Purpose                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/lib/local-db/`              | Storage abstraction (`LocalDatabaseAdapter`)                                                  |
| `src/lib/sync/`                  | Outbox, sync engine, connectivity                                                             |
| `src/lib/domain/`                | Repository/services — atomic billing, ledger, inventory                                       |
| `supabase/migrations/`           | New tables: `shops`, `inventory_movements`, `sync_operations`, `devices`, idempotency columns |
| `supabase/functions/` or RPC SQL | Atomic `create_sale`, `receive_payment`, etc.                                                 |

### 14.2 Existing files — likely changes

| File                                            | Why                                           |
| ----------------------------------------------- | --------------------------------------------- |
| `src/lib/db.ts`                                 | Expand types; become facade over local+remote |
| `src/integrations/supabase/client.ts`           | Auth only or sync client wrapper              |
| `src/lib/auth-context.tsx`                      | Device registration, sync bootstrap           |
| `src/routes/_authenticated/billing.tsx`         | Local-first save, idempotency, atomic sale    |
| `src/routes/_authenticated/khata.tsx`           | Local ledger, unified balance model           |
| `src/routes/_authenticated/products.tsx`        | Movement-based stock                          |
| `src/routes/_authenticated/purchases.tsx`       | Atomic purchase + movements                   |
| `src/routes/_authenticated/customers.index.tsx` | Soft delete; unified due                      |
| `src/routes/_authenticated/customers.$id.tsx`   | Reversal not delete                           |
| `src/routes/_authenticated/dashboard.tsx`       | Read from local DB                            |
| `src/routes/_authenticated/reports.tsx`         | Paginated queries                             |
| `src/lib/format.ts`                             | Safer bill number strategy                    |
| `src/routes/_authenticated/route.tsx`           | Minimal sync status indicator                 |
| `src/router.tsx`                                | Sync provider initialization                  |

### 14.3 Database migrations

All files in `supabase/migrations/` — additive migrations only; do not destructive-drop existing data.

### 14.4 MCP tools (minor)

`src/lib/mcp/tools/*` — may read via server APIs post-migration.

---

## 15. Files that should NOT be modified (unless necessary)

| File / area                                       | Reason                                                 |
| ------------------------------------------------- | ------------------------------------------------------ |
| `src/components/ui/*`                             | Generated shadcn primitives — avoid unrelated churn    |
| `src/routeTree.gen.ts`                            | Auto-generated                                         |
| `src/components/Logo.tsx`, marketing copy         | No functional impact                                   |
| `eslint.config.js`, `prettier`, `components.json` | Tooling                                                |
| `.lovable/*`                                      | Platform metadata                                      |
| Existing migration SQL files                      | Immutable history — only add new migrations            |
| `src/styles.css`                                  | UI theme — preserve unless sync indicator needs tokens |

---

## 16. Recommended target architecture

Based on **actual deployment** (web/PWA-capable browser, future Android) and requirements:

```
USER ACTION
    ↓
DOMAIN SERVICE (atomic business transaction)
    ↓
LOCAL TRANSACTION
    ↓
IndexedDBAdapter (browser now) / SQLiteAdapter (Android later)
    ↓
Immediate UI Update (read from local DB)
    ↓
Outbox entry (same local transaction)
    ↓
Connectivity monitor (not navigator.onLine alone)
    ↓
Sync Engine (exponential backoff, idempotency)
    ↓
Supabase RPC / PostgreSQL transaction
    ↓
Server validation + acknowledgement
    ↓
Local sync_status = SYNCED
```

### 16.1 Storage abstraction

```
LocalDatabaseAdapter
├── IndexedDBAdapter   ← Phase 1 (current web runtime)
└── SQLiteAdapter      ← Phase 2 (Capacitor Android)
```

Business logic must depend on `LocalDatabaseAdapter`, not Supabase client directly.

### 16.2 Unified financial model

- **Single ledger** for customer balance (append-only `ledger_transactions`).
- Credit sales create ledger credit entries linked to `sale_id`.
- Payments create ledger payment entries with `idempotency_key`.
- `invoices` remain immutable snapshots for PDF/history.
- Invoice `due` becomes derived or snapshot at issue time — not a second source of truth.

### 16.3 Inventory model

- Append-only `inventory_movements` with derived `current_stock` cache per product.
- Sale/purchase/adjustment each insert movements in same transaction as parent document.

### 16.4 Cloud source of truth

- Supabase PostgreSQL remains **durable cross-device** store after sync acknowledgement.
- Local DB is **operational source** while working.

### 16.5 New PostgreSQL objects (additive)

Recommended new tables (names align with requirements):  
`shops`, `shop_members`, `inventory_movements`, `ledger_transactions` (or evolve `ledger_entries`), `sync_operations`, `devices`, `audit_logs` (use existing `audit_log`), idempotency columns on sales/payments/movements.

### 16.6 Bill numbers

Recommend: internal UUID + display number with device prefix offline, server reconciliation optional. Document final choice in `DATABASE_SCHEMA.md` after shop workflow confirmation.

---

## 17. Existing data sources for migration (Phase 19 prep)

| Source                    | Expected content          | Notes                    |
| ------------------------- | ------------------------- | ------------------------ |
| Supabase PostgreSQL       | All production data       | Primary migration source |
| localStorage              | Supabase auth tokens only | Not business data        |
| React Query cache         | Ephemeral                 | Not migratable           |
| IndexedDB / SQLite        | None                      | —                        |
| JSON / Firebase / MongoDB | None found                | —                        |

**Before any migration:** export Supabase table counts and financial totals via SQL or dashboard.

---

## 18. Environment variables required

| Variable                        | Required               | Exposure                  |
| ------------------------------- | ---------------------- | ------------------------- |
| `VITE_SUPABASE_URL`             | Yes                    | Public                    |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes                    | Public (anon)             |
| `VITE_SUPABASE_PROJECT_ID`      | MCP                    | Public                    |
| `SUPABASE_URL`                  | Server                 | Secret                    |
| `SUPABASE_PUBLISHABLE_KEY`      | Server auth middleware | Server                    |
| `SUPABASE_SERVICE_ROLE_KEY`     | Admin server ops only  | **Secret — never client** |

**Action required:** Add `.env` to `.gitignore`; rotate keys if repository was shared publicly.

---

## 19. What is blocked for later phases

| Blocker                                   | Needed from operator                   |
| ----------------------------------------- | -------------------------------------- |
| Supabase backup verification              | Dashboard access / plan details        |
| Live data migration dry-run               | Supabase credentials + row counts      |
| RLS penetration testing                   | Two test shop accounts                 |
| Production deployment target confirmation | Web only vs Capacitor Android priority |
| Shop fiscal bill number rules             | Legal/operational preference           |

---

## 20. Audit conclusion

The codebase is a **well-structured, mobile-first Lovable/TanStack Start shop app** with **solid RLS foundations** and **some server-side invoice/stock triggers**, but it is architecturally a **cloud-direct CRUD application**, not an offline-first system.

**Phase 0 is complete.** Safe next steps per the master plan:

1. **STEP 2** — This document ✓
2. **STEP 3** — Confirm deployment: **Web/PWA first**; plan Android SQLite adapter later
3. **STEP 4–11** — Design docs: `TARGET_ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `SYNC_ENGINE.md`, `SYNC_CONFLICT_POLICY.md`, `SECURITY_MODEL.md`
4. **STEP 12** — Backup existing Supabase data before schema changes
5. **STEP 13+** — Implementation only after designs and backup

**No destructive migration or library installation has been performed.**

---

## Appendix A — Complete file inventory for data operations

| Concern      | Primary files                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------- |
| DB client    | `src/integrations/supabase/client.ts`, `src/lib/db.ts`                                            |
| Auth         | `src/lib/auth-context.tsx`, `src/routes/auth.tsx`, `src/integrations/supabase/auth-middleware.ts` |
| Customers    | `src/routes/_authenticated/customers.index.tsx`, `customers.$id.tsx`                              |
| Products     | `src/routes/_authenticated/products.tsx`                                                          |
| Billing      | `src/routes/_authenticated/billing.tsx`, `src/lib/format.ts`                                      |
| Khata        | `src/routes/_authenticated/khata.tsx`                                                             |
| Purchases    | `src/routes/_authenticated/purchases.tsx`                                                         |
| Reports      | `src/routes/_authenticated/reports.tsx`                                                           |
| Dashboard    | `src/routes/_authenticated/dashboard.tsx`                                                         |
| PDF          | `src/lib/statement.ts`, jsPDF in `billing.tsx`                                                    |
| Schema       | `supabase/migrations/*.sql`, `src/integrations/supabase/types.ts`                                 |
| Server admin | `src/integrations/supabase/client.server.ts`                                                      |
| MCP          | `src/lib/mcp/tools/*.ts`                                                                          |

## Appendix B — `payment_status` inconsistency

Migration comment lists `paid, partial, due` but application code uses `unpaid` (not `due`) for open invoices. Both may exist in DB if data was created at different times. Migration mapping must normalize this.
