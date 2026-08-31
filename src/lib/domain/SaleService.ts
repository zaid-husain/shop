import { sb, type Invoice } from "@/lib/db";
import { generateRequestHash } from "@/lib/utils/hash";

export class SaleService {
  /**
   * Creates a sale transaction directly in Supabase using the secure RPC.
   */
  static async createSale(
    shopId: string,
    invoiceData: Pick<Invoice, "customer_id" | "discount" | "paid" | "payment_method" | "notes">,
    itemsData: Array<{
      product_id: string | null;
      product_name: string;
      quantity: number;
      unit_price: number;
      unit_cost: number;
      discount_amount?: number;
    }>,
    injectedIdempotencyKey?: string, // Allow simulating duplicate idempotency keys for testing
  ): Promise<{ invoice_id: string; replayed: boolean }> {
    if (itemsData.length === 0) throw new Error("Sale must have at least one item");

    const invoiceId = crypto.randomUUID();
    const idempotencyKey = injectedIdempotencyKey || crypto.randomUUID();

    // Format: INV-{TIMESTAMP_HEX}-{RANDOM}
    const timestampHex = Date.now().toString(16).toUpperCase();
    const invoiceNumber = `INV-${timestampHex}-${invoiceId.split("-")[0].toUpperCase()}`;

    let subtotal = 0;
    let costTotal = 0;

    // We expect the UI to provide the product name and prices for the snapshot.
    // In a fully strictly online system, the server might pull prices, but for snapshotting
    // it's common to pass the exact sold prices (to allow price overrides by the cashier).
    const formattedItems = itemsData.map((item) => {
      const itemDiscount = item.discount_amount || 0;
      const lineTotal = item.unit_price * item.quantity - itemDiscount;

      subtotal += lineTotal;
      costTotal += item.unit_cost * item.quantity;

      return {
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: lineTotal,
      };
    });

    const discount = invoiceData.discount || 0;
    if (discount < 0) throw new Error("Discount cannot be negative");

    const total = subtotal - discount;
    if (total < 0) throw new Error("Total cannot be negative");

    const paid = invoiceData.paid || 0;
    if (paid < 0) throw new Error("Paid amount cannot be negative");

    const due = total - paid;
    if (due < 0) throw new Error("Paid amount cannot exceed total");

    const logicalPayload = {
      p_shop_id: shopId,
      p_customer_id: invoiceData.customer_id || null,
      p_invoice_number: invoiceNumber,
      p_cost_total: costTotal,
      p_discount: discount,
      p_total: total,
      p_paid: paid,
      p_due: due,
      p_notes: invoiceData.notes || null,
      p_items: formattedItems,
    };

    const requestHash = await generateRequestHash(logicalPayload);

    // Call the Supabase RPC
    const { data, error } = await sb.rpc("create_sale", {
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

    return data as { invoice_id: string; replayed: boolean };
  }
}
