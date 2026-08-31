import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

// This script is strictly read-only and non-destructive.
// It generates a dry-run report for the financial migration without altering any data.
// It requires a SUPABASE_SERVICE_ROLE_KEY to bypass RLS for a complete analysis.

async function runDryRun() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.",
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Fetching historical invoices and manual ledger entries...");

  const { data: invoices, error: invError } = await supabase
    .from("invoices")
    .select("id, shop_id, customer_id, due, created_at, invoice_number");

  if (invError) throw invError;

  const { data: ledgerEntries, error: ledError } = await supabase
    .from("ledger_entries")
    .select("id, shop_id, customer_id, amount, created_at, entry_type");

  if (ledError) throw ledError;

  let safeToBackfill = 0;
  let possibleDuplicate = 0;
  let ambiguous = 0;
  const alreadyRepresented = 0;
  let manualReviewRequired = 0;
  let safeValue = 0;

  const results = [];

  for (const inv of invoices || []) {
    if (!inv.customer_id) continue;
    if (inv.due <= 0) continue; // Only process invoices with outstanding due amounts

    // Find manual ledger entries for the same customer
    const customerLedgers = (ledgerEntries || []).filter(
      (l) => l.customer_id === inv.customer_id && l.entry_type === "credit",
    );

    let classification = "SAFE_TO_BACKFILL";
    let reason = "No manual credit entries found for this customer.";

    if (customerLedgers.length > 0) {
      // Check for exact amount match
      const exactAmountMatch = customerLedgers.find((l) => Number(l.amount) === Number(inv.due));

      // Check date proximity (e.g., within 24 hours)
      const invDate = new Date(inv.created_at).getTime();
      const closeDateMatch = customerLedgers.find((l) => {
        const lDate = new Date(l.created_at).getTime();
        const diffHours = Math.abs(lDate - invDate) / (1000 * 60 * 60);
        return diffHours <= 24;
      });

      if (exactAmountMatch && closeDateMatch) {
        classification = "POSSIBLE_DUPLICATE";
        reason = "Found manual entry with exact amount within 24 hours of invoice.";
      } else if (exactAmountMatch || closeDateMatch) {
        classification = "AMBIGUOUS";
        reason = "Found manual entry with matching amount OR close date, but not both.";
      } else {
        classification = "MANUAL_REVIEW_REQUIRED";
        reason = "Manual entries exist for customer, but no obvious correlation to this invoice.";
      }
    }

    // Tally up
    if (classification === "SAFE_TO_BACKFILL") {
      safeToBackfill++;
      safeValue += Number(inv.due);
    } else if (classification === "POSSIBLE_DUPLICATE") {
      possibleDuplicate++;
    } else if (classification === "AMBIGUOUS") {
      ambiguous++;
    } else if (classification === "MANUAL_REVIEW_REQUIRED") {
      manualReviewRequired++;
    }

    results.push({
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      customer_id: inv.customer_id,
      due_amount: inv.due,
      classification,
      reason,
    });
  }

  const report = `# FINANCIAL_MIGRATION_DRY_RUN.md

## Dry Run Summary
- **Total Invoices Analyzed:** ${invoices?.length || 0}
- **Total Outstanding Invoices (Due > 0):** ${results.length}

## Classification Counts
- **SAFE_TO_BACKFILL:** ${safeToBackfill} (Total Value: ${safeValue})
- **POSSIBLE_DUPLICATE:** ${possibleDuplicate}
- **AMBIGUOUS:** ${ambiguous}
- **ALREADY_REPRESENTED:** ${alreadyRepresented}
- **MANUAL_REVIEW_REQUIRED:** ${manualReviewRequired}

*Note: Only SAFE_TO_BACKFILL records may be automatically migrated.*

## Detailed Results
\`\`\`json
${JSON.stringify(results, null, 2)}
\`\`\`
`;

  fs.writeFileSync("FINANCIAL_MIGRATION_DRY_RUN.md", report);
  fs.writeFileSync("financial_migration_dry_run.json", JSON.stringify(results, null, 2));

  console.log(
    "Dry run complete. Reports generated: FINANCIAL_MIGRATION_DRY_RUN.md and financial_migration_dry_run.json",
  );
}

runDryRun().catch(console.error);
