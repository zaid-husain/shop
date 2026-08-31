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
  ): Promise<{ transaction_id: string; replayed: boolean }> {
    if (amount === 0) throw new Error("Amount must not be zero");

    const idempotencyKey = crypto.randomUUID();

    const logicalPayload = {
      p_shop_id: shopId,
      p_customer_id: customerId,
      p_amount: amount,
      p_notes: note,
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
}
