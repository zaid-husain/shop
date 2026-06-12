## Purchases / Stock-In Entries

Lets the shop owner record supplier purchases. Each purchase increases stock and (optionally) updates the product's purchase price so profit on the next bill is accurate.

### Data model (new migration)

`public.suppliers`
- shop_id, name, mobile, address, notes

`public.purchases`
- shop_id, supplier_id (nullable), supplier_name (denorm), bill_number, bill_date, subtotal, discount, total, paid, due, payment_method, notes, created_by

`public.purchase_items`
- purchase_id, shop_id, product_id, product_name, quantity, unit_cost, line_total

Both tables get full RLS (shop-scoped via `current_shop_id()`), GRANTs to authenticated/service_role, and `updated_at` triggers.

Trigger `increment_stock_on_purchase` on `purchase_items` insert:
- `products.stock_quantity += NEW.quantity` where shop matches
- `products.purchase_price = NEW.unit_cost` (last-cost method) when unit_cost > 0

### UI

New route `src/routes/_authenticated/purchases.tsx`:
- List of recent purchases (supplier, date, total, due) with search
- "New Purchase" sheet:
  - Supplier picker (autocomplete from suppliers, allow free-text "walk-in supplier")
  - Bill # + date + payment method (cash/upi/bank/cheque/credit)
  - Item rows: product picker (existing products) + qty + unit cost; live line total
  - Totals: subtotal, discount, total, paid, due
  - Save → inserts purchase + items in one call; stock auto-updates via trigger
- Tap a row → detail sheet with items and supplier info

Small supplier-management surface kept inline (create on the fly from the purchase sheet). No separate suppliers screen for now.

### Wiring

- Add `Purchases` quick action on dashboard and to the bottom nav / khata header
- Update `src/lib/db.ts` with `Supplier`, `Purchase`, `PurchaseItem` types and `PAYMENT_METHODS` reuse
- Update `routeTree.gen.ts` will regenerate on save
- Reports page: add "Purchases this month" tile + "Top suppliers" (optional, deferred if scope grows)

### Out of scope (call out, don't build)
- Supplier ledger / khata for suppliers (mirror of customer khata) — separate feature
- Returns / debit notes
- Average-cost stock valuation (we use last-cost for simplicity)

### Files to create
- `supabase/migrations/<ts>_purchases.sql`
- `src/routes/_authenticated/purchases.tsx`

### Files to edit
- `src/lib/db.ts` — new types + `PAYMENT_METHODS` constant
- `src/routes/_authenticated/dashboard.tsx` — quick action + recent purchases tile (small)
- `src/routes/_authenticated/reports.tsx` — purchases this month tile
