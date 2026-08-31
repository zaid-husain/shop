# DRY_RUN_EXECUTION_GUIDE.md

## Overview

Because this application enforces strict multi-tenant Row Level Security (RLS) via Supabase, querying across all `invoices` and `ledger_entries` simultaneously for a dry-run analysis requires privileged access.
This guide documents the safe, approved methods for executing the `scripts/financial_migration_dry_run.ts` script.

## Preferred Options (Safest First)

### OPTION A — Local Execution via Environment Variables (Recommended)

This is the most secure method because it guarantees credentials are never exposed in the source code or version control.

1. Create a `.env.local` file (already `.gitignore`d).
2. Insert your service role key locally:
   ```env
   SUPABASE_URL="https://your_project.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="your_secret_key_here"
   ```
3. Run the script using `tsx` or `ts-node`:
   ```bash
   npx tsx scripts/financial_migration_dry_run.ts
   ```
4. The script will securely fetch the records, run the analysis locally in memory, and generate the `FINANCIAL_MIGRATION_DRY_RUN.md` report.

### OPTION B — Safe SQL Editor Analysis

If you prefer not to use the service role key locally, you can execute a read-only query directly in the Supabase SQL Editor.

1. Log into your Supabase Dashboard.
2. Go to the SQL Editor.
3. Run the following read-only classification query:
   ```sql
   SELECT
       i.id AS invoice_id,
       i.customer_id,
       i.due,
       i.created_at AS invoice_date,
       (
           SELECT count(*)
           FROM ledger_entries le
           WHERE le.customer_id = i.customer_id
             AND le.entry_type = 'credit'
       ) AS manual_khata_credits
   FROM invoices i
   WHERE i.due > 0;
   ```
4. Export the results as CSV. This avoids any code execution or key exposure entirely.

### OPTION C — Temporary Read-Only PostgreSQL Role

For strict compliance, you can create a temporary read-only database role that only has `SELECT` access to `invoices` and `ledger_entries`. You can then update the script to use `pg` (node-postgres) with a direct connection string using that read-only role, bypassing the Supabase JS client altogether.

## Security Reminders

- **NEVER** paste the `SUPABASE_SERVICE_ROLE_KEY` or Database Password into this chat.
- **NEVER** commit `.env` or `.env.local` to Git.
- **NEVER** hardcode credentials in `financial_migration_dry_run.ts`.
