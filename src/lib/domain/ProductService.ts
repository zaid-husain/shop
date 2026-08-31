import { sb, type Product } from "@/lib/db";

export class ProductService {
  /**
   * Creates a new product directly in Supabase.
   */
  static async createProduct(
    shopId: string,
    data: Omit<
      Product,
      "id" | "shop_id" | "created_at" | "updated_at" | "version" | "deleted_at" | "stock_quantity"
    > & { stock_quantity?: number },
  ): Promise<Product> {
    const productId = crypto.randomUUID();

    const product = {
      ...data,
      id: productId,
      shop_id: shopId,
      stock_quantity: data.stock_quantity ?? 0,
      version: 1,
      deleted_at: null,
    };

    const { data: result, error } = await sb.from("products").insert(product).select().single();

    if (error) {
      throw error;
    }

    return result as Product;
  }

  /**
   * Updates an existing product directly in Supabase.
   */
  static async updateProduct(
    productId: string,
    shopId: string,
    data: Partial<
      Omit<
        Product,
        "id" | "shop_id" | "created_at" | "updated_at" | "version" | "deleted_at" | "stock_quantity"
      >
    >,
  ): Promise<Product> {
    const { data: result, error } = await sb
      .from("products")
      .update(data)
      .eq("id", productId)
      .eq("shop_id", shopId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return result as Product;
  }

  /**
   * Soft deletes a product (deactivates it) directly in Supabase.
   */
  static async deactivateProduct(productId: string, shopId: string): Promise<void> {
    const now = new Date().toISOString();

    const { error } = await sb
      .from("products")
      .update({ is_active: false, deleted_at: now })
      .eq("id", productId)
      .eq("shop_id", shopId);

    if (error) {
      throw error;
    }
  }
}
