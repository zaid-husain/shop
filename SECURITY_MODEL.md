# SECURITY_MODEL.md

## 1. Overview

This document defines the production security posture, access controls, and disaster recovery plan for Bharat Auto Parts.

## 2. Authentication & Core Roles

- **Provider:** Supabase Auth (OTP / Password over Mobile Number).
- **Client Session:** Handled via standard Supabase JWTs stored in the browser/device keychain.
- **Service Roles:** `service_role` keys are strictly prohibited from frontend exposure and are never compiled into the client.

## 3. Authorization (Row Level Security & RPCs)

### 3.1 Strict RLS

Every database table (except pure internal catalogs, if any) mandates a `shop_id` UUID column.

- **Policy Pattern:** `USING (shop_id = current_shop_id()) WITH CHECK (shop_id = current_shop_id())`
- **Soft Deletes:** RLS policies explicitly check `deleted_at IS NULL` for normal queries.

### 3.2 Security Definer RPC Safety

Complex atomic operations (like `create_sale`) require `SECURITY DEFINER` to bypass strict table-level checks (like mutating inventory from a billing action).

- **Hardened RPC Pattern:**
  1. The RPC explicitly captures the calling user: `_uid := auth.uid();`
  2. The RPC explicitly verifies the user belongs to the requested `shop_id` by querying the `profiles` table.
  3. The RPC explicitly overrides the `search_path` (e.g., `SET search_path = public`) to prevent search path hijacking.
  4. Cross-shop references are rejected with `HTTP 403 / 400`.
  5. `REVOKE EXECUTE ON FUNCTION create_sale FROM PUBLIC; GRANT EXECUTE ON FUNCTION create_sale TO authenticated;`

## 4. Disaster Recovery & Backup

### 4.1 Verification Status

- **Supabase PITR (Point-in-Time Recovery):** **UNVERIFIED.** PITR is a paid add-on for Supabase Pro/Team plans. It must be explicitly verified via the Supabase dashboard by the project owner.
- If PITR is inactive, we are reliant solely on Supabase's default daily logical backups, which offer an RPO (Recovery Point Objective) of 24 hours.

### 4.2 Backup Alternatives

If PITR cannot be afforded/enabled, a `pg_dump` cron job running via a secure CI/CD pipeline (e.g., GitHub Actions) securely dumping encrypted SQL to AWS S3 every 4 hours is required to lower the RPO.

### 4.3 RTO & RPO Definitions

- **Target RPO (Data Loss Window):** < 1 hour (if PITR enabled). 24 hours (if relying on default backups).
- **Target RTO (Downtime):**
  - Device Lost / App Uninstall: < 5 minutes (User simply logs into a new device. Cursor pull protocol fetches all historical data).
  - Cloud Database Outage: 0 minutes for read/write (Offline-first architecture allows continuous operation locally). Sync resumes automatically when cloud is restored.
