import { sb } from "@/lib/db";
import { generateRequestHash } from "@/lib/utils/hash";

export class LedgerService {
  /**
   * Creates a manual adjustment entry in the ledger directly in Supabase.
   */
  static async createManualEntry(
    shopId: string,
    customerId: string,
    amount: number, // Positive adds to balance (customer owes more), negative reduces balance
    note: string,
    receiptUrl: string | null = null,
    paymentDueDate: string | null = null,
  ): Promise<{ transaction_id: string; replayed: boolean }> {
    if (amount === 0) throw new Error("Amount must not be zero");

    const idempotencyKey = crypto.randomUUID();

    const logicalPayload = {
      p_shop_id: shopId,
      p_customer_id: customerId,
      p_amount: amount,
      p_notes: note,
      p_receipt_url: receiptUrl,
      p_payment_due_date: paymentDueDate,
    };

    const requestHash = await generateRequestHash(logicalPayload);

    const { data, error } = await sb.rpc("create_manual_ledger_entry", {
      ...logicalPayload,
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
    });

    if (error) {
      if (error.message.includes("IDEMPOTENCY_KEY_REUSE_MISMATCH")) {
        throw new Error("Duplicate request detected with different payload.");
      }
      throw error;
    }

    return data as { transaction_id: string; replayed: boolean };
  }

  /**
   * Updates an existing manual ledger transaction and recalculates the customer balance cache.
   */
  static async updateManualEntry(
    transactionId: string,
    shopId: string,
    customerId: string,
    amount: number, // Positive for credit, negative for payment
    note: string,
    receiptUrl: string | null = null,
    paymentDueDate: string | null = null,
  ): Promise<void> {
    if (amount === 0) throw new Error("Amount must not be zero");

    const { error: updateErr } = await sb
      .from("ledger_transactions")
      .update({
        amount: Math.abs(amount),
        balance_impact: amount,
        note: note.trim() || null,
        receipt_url: receiptUrl,
        payment_due_date: paymentDueDate,
      })
      .eq("id", transactionId)
      .eq("shop_id", shopId);

    if (updateErr) throw updateErr;

    // Recalculate customer balance cache
    const { data: sumData, error: sumErr } = await sb
      .from("ledger_transactions")
      .select("balance_impact")
      .eq("customer_id", customerId)
      .eq("shop_id", shopId);

    if (!sumErr && sumData) {
      const totalBalance = sumData.reduce((acc, curr) => acc + Number(curr.balance_impact || 0), 0);
      await sb
        .from("customers")
        .update({ balance_cache: totalBalance, updated_at: new Date().toISOString() })
        .eq("id", customerId)
        .eq("shop_id", shopId);
    }
  }

  /**
   * Deletes a ledger transaction and recalculates customer balance cache.
   */
  static async deleteManualEntry(
    transactionId: string,
    shopId: string,
    customerId: string,
  ): Promise<void> {
    const { error: delErr } = await sb
      .from("ledger_transactions")
      .delete()
      .eq("id", transactionId)
      .eq("shop_id", shopId);

    if (delErr) throw delErr;

    // Recalculate customer balance cache
    const { data: sumData, error: sumErr } = await sb
      .from("ledger_transactions")
      .select("balance_impact")
      .eq("customer_id", customerId)
      .eq("shop_id", shopId);

    if (!sumErr && sumData) {
      const totalBalance = sumData.reduce((acc, curr) => acc + Number(curr.balance_impact || 0), 0);
      await sb
        .from("customers")
        .update({ balance_cache: totalBalance, updated_at: new Date().toISOString() })
        .eq("id", customerId)
        .eq("shop_id", shopId);
    }
  }
}
