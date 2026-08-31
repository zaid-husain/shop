import { sb, type Customer } from "@/lib/db";

export class CustomerService {
  /**
   * Creates a new customer directly in Supabase.
   */
  static async createCustomer(
    shopId: string,
    data: Omit<
      Customer,
      "id" | "shop_id" | "created_at" | "updated_at" | "version" | "deleted_at" | "balance_cache"
    >,
    client: typeof sb = sb,
  ): Promise<Customer> {
    const customerId = crypto.randomUUID();

    const customer = {
      ...data,
      id: customerId,
      shop_id: shopId,
      balance_cache: 0,
      version: 1,
      deleted_at: null,
    };

    const { data: result, error } = await client
      .from("customers")
      .insert(customer)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return result as Customer;
  }

  /**
   * Updates an existing customer directly in Supabase.
   */
  static async updateCustomer(
    customerId: string,
    shopId: string,
    data: Partial<
      Omit<
        Customer,
        "id" | "shop_id" | "created_at" | "updated_at" | "version" | "deleted_at" | "balance_cache"
      >
    >,
    client: typeof sb = sb,
  ): Promise<Customer> {
    const { data: result, error } = await client
      .from("customers")
      .update(data)
      .eq("id", customerId)
      .eq("shop_id", shopId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return result as Customer;
  }

  /**
   * Soft deletes a customer directly in Supabase.
   */
  static async softDeleteCustomer(
    customerId: string,
    shopId: string,
    client: typeof sb = sb,
  ): Promise<void> {
    const now = new Date().toISOString();

    const { error } = await client
      .from("customers")
      .update({ deleted_at: now })
      .eq("id", customerId)
      .eq("shop_id", shopId);

    if (error) {
      throw error;
    }
  }

  /**
   * Fetches all non-deleted customers for a shop.
   */
  static async getCustomers(shopId: string, client: typeof sb = sb): Promise<Customer[]> {
    const { data, error } = await client
      .from("customers")
      .select("*")
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .order("name");

    if (error) {
      throw error;
    }

    return data as Customer[];
  }

  /**
   * Fetches a specific customer by ID.
   */
  static async getCustomerById(
    customerId: string,
    shopId: string,
    client: typeof sb = sb,
  ): Promise<Customer | null> {
    const { data, error } = await client
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data as Customer | null;
  }

  /**
   * Searches customers by name, mobile, or vehicle number.
   */
  static async searchCustomers(
    shopId: string,
    query: string,
    client: typeof sb = sb,
  ): Promise<Customer[]> {
    const q = query.trim();
    if (!q) return this.getCustomers(shopId, client);
    const { data, error } = await client
      .from("customers")
      .select("*")
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .or(`name.ilike.%${q}%,mobile.ilike.%${q}%,vehicle_number.ilike.%${q}%`)
      .order("name");

    if (error) {
      throw error;
    }

    return data as Customer[];
  }
}
