/* eslint-disable @typescript-eslint/no-explicit-any */
import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchProductsDB, searchCustomersDB } from "./fuzzy-search";
import { executeQuery } from "./query-executor";

/**
 * Enhanced Tool System
 *
 * Provides comprehensive read/write capabilities for the LLM fallback path (GENERAL_AI).
 * Each tool calls the existing secure query-executor or domain service functions.
 * Never constructs raw SQL.
 */
export function createShopTools(sb: SupabaseClient, shopId: string) {
  return {
    // ─── Inventory Tools ───────────────────────────────────────────────────

    searchProducts: tool({
      description: "Search for products in the shop's inventory by name.",
      parameters: z.object({
        query: z.string().describe("The product name to search for (e.g. 'servo', 'oil')"),
        limit: z.number().optional().describe("Max number of results to return (default 5)"),
      }),
      execute: async ({ query, limit = 5 }: any) => {
        try {
          const results = await searchProductsDB(sb, shopId, query, limit);
          return results.map((r) => ({
            id: r.item.id,
            name: r.item.name,
            brand: r.item.brand,
            price: r.item.selling_price,
            stock: r.item.stock_quantity,
          }));
        } catch (error) {
          return { error: "Failed to search products" };
        }
      },
    } as any),

    getProductStock: tool({
      description: "Get the stock quantity of a specific product",
      parameters: z.object({
        productName: z.string().describe("Name of the product"),
      }),
      execute: async ({ productName }: any) => {
        const results = await searchProductsDB(sb, shopId, productName, 1);
        if (results.length === 0) return { error: "Product not found" };
        const p = results[0].item;
        return {
          name: p.name,
          stock: p.stock_quantity,
          status: p.stock_quantity <= 0 ? "Out of stock" : "In stock",
        };
      },
    } as any),

    getProductPrice: tool({
      description: "Get the selling price of a specific product",
      parameters: z.object({
        productName: z.string().describe("Name of the product"),
      }),
      execute: async ({ productName }: any) => {
        const results = await searchProductsDB(sb, shopId, productName, 1);
        if (results.length === 0) return { error: "Product not found" };
        const p = results[0].item;
        return { name: p.name, price: p.selling_price };
      },
    } as any),

    getLowStock: tool({
      description: "Get a list of products that are running low on stock",
      parameters: z.object({}),
      execute: async () => {
        const result = await executeQuery(sb, shopId, "LOW_STOCK" as any, {
          productQuery: null,
          quantity: null,
          customerQuery: null,
          invoiceNumber: null,
          phoneNumber: null,
          vehicleNumber: null,
          priceAmount: null,
          dateRange: null,
        });
        return result.data;
      },
    } as any),

    getOutOfStock: tool({
      description: "Get a list of products that are completely out of stock",
      parameters: z.object({}),
      execute: async () => {
        const result = await executeQuery(sb, shopId, "OUT_OF_STOCK" as any, {
          productQuery: null,
          quantity: null,
          customerQuery: null,
          invoiceNumber: null,
          phoneNumber: null,
          vehicleNumber: null,
          priceAmount: null,
          dateRange: null,
        });
        return result.data;
      },
    } as any),

    // ─── Customer Tools ────────────────────────────────────────────────────

    searchCustomers: tool({
      description: "Search for customers by name or phone number.",
      parameters: z.object({
        query: z.string().describe("Customer name or phone to search for"),
        limit: z.number().optional().describe("Max number of results to return (default 3)"),
      }),
      execute: async ({ query, limit = 3 }: any) => {
        try {
          const results = await searchCustomersDB(sb, shopId, query, limit);
          return results.map((r) => ({
            id: r.item.id,
            name: r.item.name,
            phone: r.item.mobile,
            balance: r.item.balance_cache,
          }));
        } catch (error) {
          return { error: "Failed to search customers" };
        }
      },
    } as any),

    getCustomerBalance: tool({
      description: "Get the outstanding balance for a customer",
      parameters: z.object({
        customerName: z.string().describe("Name of the customer"),
      }),
      execute: async ({ customerName }: any) => {
        const results = await searchCustomersDB(sb, shopId, customerName, 1);
        if (results.length === 0) return { error: "Customer not found" };
        const c = results[0].item;
        return {
          name: c.name,
          balance: c.balance_cache,
          status: c.balance_cache > 0 ? "Due" : c.balance_cache < 0 ? "Advance" : "Cleared",
        };
      },
    } as any),

    getCustomerHistory: tool({
      description: "Get the recent purchase history for a customer",
      parameters: z.object({
        customerName: z.string().describe("Name of the customer"),
      }),
      execute: async ({ customerName }: any) => {
        const result = await executeQuery(sb, shopId, "CUSTOMER_HISTORY" as any, {
          customerQuery: customerName,
          productQuery: null,
          quantity: null,
          invoiceNumber: null,
          phoneNumber: null,
          vehicleNumber: null,
          priceAmount: null,
          dateRange: null,
        });
        return result.data;
      },
    } as any),

    // ─── Reporting & Analytics ─────────────────────────────────────────────

    getShopStats: tool({
      description: "Get basic shop statistics (total products, low stock items).",
      parameters: z.object({}),
      execute: async () => {
        try {
          const [productsRes, lowStockRes] = await Promise.all([
            sb
              .from("products")
              .select("id", { count: "exact", head: true })
              .eq("shop_id", shopId)
              .eq("is_active", true),
            sb
              .from("products")
              .select("id", { count: "exact", head: true })
              .eq("shop_id", shopId)
              .eq("is_active", true)
              .lte("stock_quantity", 5),
          ]);

          return {
            totalActiveProducts: productsRes.count || 0,
            lowStockItemsCount: lowStockRes.count || 0,
          };
        } catch (error) {
          return { error: "Failed to fetch shop stats" };
        }
      },
    } as any),

    getSalesSummary: tool({
      description: "Get sales summary for today and this month",
      parameters: z.object({}),
      execute: async () => {
        const result = await executeQuery(sb, shopId, "SALES_REPORT" as any, {
          productQuery: null,
          quantity: null,
          customerQuery: null,
          invoiceNumber: null,
          phoneNumber: null,
          vehicleNumber: null,
          priceAmount: null,
          dateRange: null,
        });
        return result.data;
      },
    } as any),

    getTopProducts: tool({
      description: "Get top selling products",
      parameters: z.object({}),
      execute: async () => {
        const result = await executeQuery(sb, shopId, "TOP_PRODUCTS" as any, {
          productQuery: null,
          quantity: null,
          customerQuery: null,
          invoiceNumber: null,
          phoneNumber: null,
          vehicleNumber: null,
          priceAmount: null,
          dateRange: null,
        });
        return result.data;
      },
    } as any),

    getTopCustomers: tool({
      description: "Get top customers by sales volume",
      parameters: z.object({}),
      execute: async () => {
        const result = await executeQuery(sb, shopId, "TOP_CUSTOMERS" as any, {
          productQuery: null,
          quantity: null,
          customerQuery: null,
          invoiceNumber: null,
          phoneNumber: null,
          vehicleNumber: null,
          priceAmount: null,
          dateRange: null,
        });
        return result.data;
      },
    } as any),

    getProfitReport: tool({
      description: "Get profit summary for today and this month",
      parameters: z.object({}),
      execute: async () => {
        const result = await executeQuery(sb, shopId, "PROFIT" as any, {
          productQuery: null,
          quantity: null,
          customerQuery: null,
          invoiceNumber: null,
          phoneNumber: null,
          vehicleNumber: null,
          priceAmount: null,
          dateRange: null,
        });
        return result.data;
      },
    } as any),

    // ─── Write Actions (Will trigger confirmation) ─────────────────────────

    updateProductPrice: tool({
      description: "Queue an update to a product's price (user must confirm)",
      parameters: z.object({
        productName: z.string().describe("Name of the product"),
        newPrice: z.number().describe("New selling price in INR"),
      }),
      execute: async ({ productName, newPrice }: any) => {
        const result = await executeQuery(sb, shopId, "UPDATE_PRICE" as any, {
          productQuery: productName,
          priceAmount: newPrice,
          quantity: null,
          customerQuery: null,
          invoiceNumber: null,
          phoneNumber: null,
          vehicleNumber: null,
          dateRange: null,
        });
        return { message: "Action queued for user confirmation", preview: result.message };
      },
    } as any),

    adjustProductStock: tool({
      description: "Queue an adjustment to a product's stock (user must confirm)",
      parameters: z.object({
        productName: z.string().describe("Name of the product"),
        quantity: z.number().describe("Quantity to add (positive) or remove (negative)"),
      }),
      execute: async ({ productName, quantity }: any) => {
        const intent = quantity < 0 ? "STOCK_REDUCE" : "PRODUCT_STOCK_ADD";
        const result = await executeQuery(sb, shopId, intent as any, {
          productQuery: productName,
          quantity: Math.abs(quantity),
          priceAmount: null,
          customerQuery: null,
          invoiceNumber: null,
          phoneNumber: null,
          vehicleNumber: null,
          dateRange: null,
        });
        return { message: "Action queued for user confirmation", preview: result.message };
      },
    } as any),

    recordPayment: tool({
      description: "Queue a payment received from a customer (user must confirm)",
      parameters: z.object({
        customerName: z.string().describe("Name of the customer"),
        amount: z.number().describe("Amount received in INR"),
      }),
      execute: async ({ customerName, amount }: any) => {
        const result = await executeQuery(sb, shopId, "PAYMENT_CREATE" as any, {
          customerQuery: customerName,
          priceAmount: amount,
          productQuery: null,
          quantity: null,
          invoiceNumber: null,
          phoneNumber: null,
          vehicleNumber: null,
          dateRange: null,
        });
        return { message: "Action queued for user confirmation", preview: result.message };
      },
    } as any),
  };
}
