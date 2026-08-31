/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Query Executor
 *
 * Database query layer for all AI-related data access.
 * All queries use the authenticated Supabase client (RLS enforced).
 *
 * Write operations return confirmation previews; actual mutations
 * only execute via `executePendingAction()` after user confirms.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  searchProductsDB,
  searchCustomersDB,
  type SearchableProduct,
  type SearchableCustomer,
  type SearchResult,
} from "./fuzzy-search";
import type { AIIntent as Intent } from "./core/types";
import type { ExtractedEntities, DateRange } from "./entity-extractor";
import type { AIPendingAction as PendingAction } from "./core/types";
import { CustomerService } from "@/lib/domain/CustomerService";
import { LedgerService } from "@/lib/domain/LedgerService";

export interface QueryResult {
  type:
    | "products"
    | "customers"
    | "invoices"
    | "low_stock"
    | "out_of_stock"
    | "top_products"
    | "top_customers"
    | "sales_summary"
    | "purchase_summary"
    | "profit_loss"
    | "customer_balance"
    | "customer_history"
    | "expense_summary"
    | "supplier_dues"
    | "not_found"
    | "error"
    | "success_action"
    | "pending_confirmation";
  data: unknown;
  message?: string;
  /** Set when type is "pending_confirmation" */
  pendingAction?: PendingAction;
}

// ─── Confirmation Helpers ───────────────────────────────────────────────────

const CONFIRMATION_TTL_MS = 60_000; // 60 seconds

export function buildConfirmationRequest(action: PendingAction): string {
  // Map internal intents to UI action card types
  const typeMap: Record<string, string> = {
    PRODUCT_CREATE: "CREATE_PRODUCT",
    PRODUCT_PRICE_UPDATE: "UPDATE_PRODUCT",
    PRODUCT_UPDATE: "UPDATE_PRODUCT",
    PRODUCT_STOCK_ADD: "UPDATE_STOCK",
    PRODUCT_STOCK_SET: "UPDATE_STOCK",
    PRODUCT_STOCK_REMOVE: "STOCK_REDUCE",
    PRODUCT_DELETE: "DELETE_PRODUCT",
    CUSTOMER_CREATE: "CREATE_CUSTOMER",
    CUSTOMER_UPDATE: "UPDATE_CUSTOMER",
    CUSTOMER_DELETE: "DELETE_CUSTOMER",
  };

  const uiType = typeMap[action.intent] || action.intent;

  // Adapt parameters to the payload expected by ProductForms.tsx
  let payload = { ...action.parameters };
  if (action.intent === "PRODUCT_PRICE_UPDATE") {
    payload = {
      product: (action.parameters as any).product,
      newPrice: (action.parameters as any).newPrice,
    };
  } else if (action.intent === "PRODUCT_DELETE") {
    payload = {
      product: (action.parameters as any).product,
      hasHistory: false,
    };
  } else if (action.intent === "CUSTOMER_DELETE") {
    payload = {
      customer: (action.parameters as any).customer,
      hasBalance: (action.parameters as any).customer?.balance_cache !== 0,
    };
  }

  return `:::action_card\n${JSON.stringify({
    type: uiType,
    payload: payload,
    description: action.description,
  })}\n:::`;
}

// ─── Write Operations (Return Confirmation Previews) ────────────────────────

function previewAddProduct(
  _sb: SupabaseClient,
  _shopId: string,
  entities: ExtractedEntities,
): QueryResult {
  if (!entities.productQuery || entities.priceAmount === null) {
    return {
      type: "error",
      data: null,
      message:
        "Naya product add karne ke liye naam aur price (₹) dono batao. Jaise: 'Add Servo Oil price 400'.",
    };
  }

  const action: PendingAction = {
    intent: "PRODUCT_CREATE" as any,
    action: "UNKNOWN" as any,
    entityType: "unknown" as any,
    entityId: null,
    entityName: null,
    status: "PENDING_CONFIRMATION" as any,
    createdAt: Date.now(),
    id: crypto.randomUUID(),
    parameters: {
      name: entities.productQuery,
      price: entities.priceAmount,
      quantity: entities.quantity || 0,
    },
    description: `Naya product add karo:\n📦 **${entities.productQuery}**\n💰 Price: ₹${entities.priceAmount}\n📊 Stock: ${entities.quantity || 0}`,
    expiresAt: Date.now() + CONFIRMATION_TTL_MS,
  };

  return {
    type: "pending_confirmation",
    data: null,
    message: buildConfirmationRequest(action),
    pendingAction: action,
  };
}

async function previewUpdatePrice(
  sb: SupabaseClient,
  shopId: string,
  entities: ExtractedEntities,
): Promise<QueryResult> {
  if (!entities.productQuery || entities.priceAmount === null) {
    return {
      type: "error",
      data: null,
      message: "Price update karne ke liye product ka naam aur naya price (₹) batao.",
    };
  }

  const products = await searchProductsDB(sb, shopId, entities.productQuery, 5);
  if (products.length === 0) {
    return { type: "not_found", data: null, message: `"${entities.productQuery}" nahi mila.` };
  }
  if (products.length > 1) {
    const action: PendingAction = {
      intent: "MULTIPLE_MATCHES" as any,
      action: "UNKNOWN" as any,
      entityType: "unknown" as any,
      entityId: null,
      entityName: null,
      status: "PENDING_CONFIRMATION" as any,
      createdAt: Date.now(),
      id: crypto.randomUUID(),
      parameters: {
        query: entities.productQuery,
        matches: products.map((p) => p.item),
        intent: "PRODUCT_PRICE_UPDATE",
      },
      description: "Select product",
      expiresAt: Date.now() + CONFIRMATION_TTL_MS,
    };
    return {
      type: "pending_confirmation",
      data: null,
      message: buildConfirmationRequest(action),
      pendingAction: action,
    };
  }

  const product = products[0].item;
  const action: PendingAction = {
    intent: "PRODUCT_PRICE_UPDATE" as any,
    action: "UNKNOWN" as any,
    entityType: "unknown" as any,
    entityId: null,
    entityName: null,
    status: "PENDING_CONFIRMATION" as any,
    createdAt: Date.now(),
    id: crypto.randomUUID(),
    parameters: {
      productId: product.id,
      productName: product.name,
      oldPrice: product.selling_price,
      newPrice: entities.priceAmount,
      version: product.version,
      product: product,
    },
    description: `Price update karo:\n📦 **${product.name}**\n💰 Purana: ₹${product.selling_price} → Naya: ₹${entities.priceAmount}`,
    expiresAt: Date.now() + CONFIRMATION_TTL_MS,
  };

  return {
    type: "pending_confirmation",
    data: null,
    message: buildConfirmationRequest(action),
    pendingAction: action,
  };
}

async function previewUpdateStock(
  sb: SupabaseClient,
  shopId: string,
  entities: ExtractedEntities,
  intent: Intent,
): Promise<QueryResult> {
  if (!entities.productQuery || entities.quantity === null) {
    return {
      type: "error",
      data: null,
      message: "Stock update karne ke liye product ka naam aur quantity batao.",
    };
  }

  const products = await searchProductsDB(sb, shopId, entities.productQuery, 5);
  if (products.length === 0) {
    return { type: "not_found", data: null, message: `"${entities.productQuery}" nahi mila.` };
  }
  if (products.length > 1) {
    const action: PendingAction = {
      intent: "MULTIPLE_MATCHES" as any,
      action: "UNKNOWN" as any,
      entityType: "unknown" as any,
      entityId: null,
      entityName: null,
      status: "PENDING_CONFIRMATION" as any,
      createdAt: Date.now(),
      id: crypto.randomUUID(),
      parameters: {
        query: entities.productQuery,
        matches: products.map((p) => p.item),
        intent: intent,
      },
      description: "Select product",
      expiresAt: Date.now() + CONFIRMATION_TTL_MS,
    };
    return {
      type: "pending_confirmation",
      data: null,
      message: buildConfirmationRequest(action),
      pendingAction: action,
    };
  }

  const product = products[0].item;

  // Fix 2b: Negate quantity for stock reduction intents
  const isReduction = intent === "PRODUCT_STOCK_REMOVE";
  const quantityChange = isReduction ? -Math.abs(entities.quantity) : Math.abs(entities.quantity);

  const directionLabel = isReduction ? "kam" : "add";
  const newStock = product.stock_quantity + quantityChange;

  const action: PendingAction = {
    intent: isReduction ? "PRODUCT_STOCK_REMOVE" : ("PRODUCT_STOCK_ADD" as any),
    action: "UNKNOWN" as any,
    entityType: "unknown" as any,
    entityId: null,
    entityName: null,
    status: "PENDING_CONFIRMATION" as any,
    createdAt: Date.now(),
    id: crypto.randomUUID(),
    parameters: {
      productId: product.id,
      productName: product.name,
      quantityChange,
      currentStock: product.stock_quantity,
      shopId,
      product: product,
    },
    description: `Stock ${directionLabel} karo:\n📦 **${product.name}**\n📊 Current: ${product.stock_quantity} → Change: ${quantityChange > 0 ? "+" : ""}${Math.abs(quantityChange)} → New: ${newStock}`,
    expiresAt: Date.now() + CONFIRMATION_TTL_MS,
  };

  return {
    type: "pending_confirmation",
    data: null,
    message: buildConfirmationRequest(action),
    pendingAction: action,
  };
}

function previewCreateCustomer(
  _sb: SupabaseClient,
  _shopId: string,
  entities: ExtractedEntities,
): QueryResult {
  if (!entities.customerQuery) {
    return { type: "error", data: null, message: "Naya customer add karne ke liye naam batao." };
  }

  const action: PendingAction = {
    intent: "CUSTOMER_CREATE" as any,
    action: "UNKNOWN" as any,
    entityType: "unknown" as any,
    entityId: null,
    entityName: null,
    status: "PENDING_CONFIRMATION" as any,
    createdAt: Date.now(),
    id: crypto.randomUUID(),
    parameters: {
      name: entities.customerQuery,
      mobile: entities.phoneNumber || null,
      vehicleNumber: entities.vehicleNumber || null,
    },
    description: `Naya customer add karo:\n👤 **${entities.customerQuery}**${entities.phoneNumber ? `\n📱 ${entities.phoneNumber}` : ""}${entities.vehicleNumber ? `\n🚗 ${entities.vehicleNumber}` : ""}`,
    expiresAt: Date.now() + CONFIRMATION_TTL_MS,
  };

  return {
    type: "pending_confirmation",
    data: null,
    message: buildConfirmationRequest(action),
    pendingAction: action,
  };
}

async function previewDeleteProduct(
  sb: SupabaseClient,
  shopId: string,
  entities: ExtractedEntities,
): Promise<QueryResult> {
  if (!entities.productQuery) {
    return { type: "error", data: null, message: "Kiska delete karna hai? Product ka naam batao." };
  }

  const products = await searchProductsDB(sb, shopId, entities.productQuery, 5);
  if (products.length === 0) {
    return { type: "not_found", data: null, message: `"${entities.productQuery}" nahi mila.` };
  }
  if (products.length > 1) {
    const action: PendingAction = {
      intent: "MULTIPLE_MATCHES" as any,
      action: "UNKNOWN" as any,
      entityType: "unknown" as any,
      entityId: null,
      entityName: null,
      status: "PENDING_CONFIRMATION" as any,
      createdAt: Date.now(),
      id: crypto.randomUUID(),
      parameters: {
        query: entities.productQuery,
        matches: products.map((p) => p.item),
        intent: "PRODUCT_DELETE",
      },
      description: "Select product",
      expiresAt: Date.now() + CONFIRMATION_TTL_MS,
    };
    return {
      type: "pending_confirmation",
      data: null,
      message: buildConfirmationRequest(action),
      pendingAction: action,
    };
  }

  const product = products[0].item;

  // Check dependencies: any invoice_items using this product?
  const { data: invItems, error } = await sb
    .from("invoice_items")
    .select("id")
    .eq("product_id", product.id)
    .limit(1);

  const hasHistory = !error && invItems && invItems.length > 0;

  const action: PendingAction = {
    intent: "PRODUCT_DELETE" as any,
    action: "UNKNOWN" as any,
    entityType: "unknown" as any,
    entityId: null,
    entityName: null,
    status: "PENDING_CONFIRMATION" as any,
    createdAt: Date.now(),
    id: crypto.randomUUID(),
    parameters: {
      productId: product.id,
      productName: product.name,
      product: product,
      hasHistory: hasHistory,
    },
    description: `Product Delete Warning:\n📦 **${product.name}**\n📊 Current Stock: ${product.stock_quantity}\n🔗 Invoices linked: ${hasHistory ? "Yes" : "No"}\n\n⚠️ ${hasHistory ? "Safe Delete (Deactivate) kiya jayega." : "Product delete kar diya jayega."}`,
    expiresAt: Date.now() + CONFIRMATION_TTL_MS,
  };

  return {
    type: "pending_confirmation",
    data: null,
    message: buildConfirmationRequest(action),
    pendingAction: action,
  };
}

async function previewUpdateCustomer(
  sb: SupabaseClient,
  shopId: string,
  entities: ExtractedEntities,
): Promise<QueryResult> {
  if (!entities.customerQuery) {
    return {
      type: "error",
      data: null,
      message: "Kiska update karna hai? Customer ka naam batao.",
    };
  }

  const customers = await searchCustomersDB(sb, shopId, entities.customerQuery, 5);
  if (customers.length === 0) {
    return {
      type: "not_found",
      data: null,
      message: `"${entities.customerQuery}" naam ka customer nahi mila.`,
    };
  }
  if (customers.length > 1) {
    const action: PendingAction = {
      intent: "MULTIPLE_MATCHES" as any,
      action: "UNKNOWN" as any,
      entityType: "unknown" as any,
      entityId: null,
      entityName: null,
      status: "PENDING_CONFIRMATION" as any,
      createdAt: Date.now(),
      id: crypto.randomUUID(),
      parameters: {
        query: entities.customerQuery,
        matches: customers.map((c) => c.item),
        intent: "CUSTOMER_UPDATE",
      },
      description: "Select customer",
      expiresAt: Date.now() + CONFIRMATION_TTL_MS,
    };
    return {
      type: "pending_confirmation",
      data: null,
      message: buildConfirmationRequest(action),
      pendingAction: action,
    };
  }

  const customer = customers[0].item;
  const oldMobile = customer.mobile || "N/A";
  const newMobile = entities.phoneNumber;
  const oldVehicle = customer.vehicle_number || "N/A";
  const newVehicle = entities.vehicleNumber;

  let updates = "";
  if (newMobile) updates += `\n📱 Mobile: ${oldMobile} → ${newMobile}`;
  if (newVehicle) updates += `\n🚗 Vehicle: ${oldVehicle} → ${newVehicle}`;

  if (!updates) {
    return {
      type: "error",
      data: null,
      message: "Update karne ke liye naya mobile number ya vehicle number batao.",
    };
  }

  const action: PendingAction = {
    intent: "CUSTOMER_UPDATE" as any,
    action: "UNKNOWN" as any,
    entityType: "unknown" as any,
    entityId: null,
    entityName: null,
    status: "PENDING_CONFIRMATION" as any,
    createdAt: Date.now(),
    id: crypto.randomUUID(),
    parameters: {
      customerId: customer.id,
      customerName: customer.name,
      mobile: newMobile || undefined,
      vehicleNumber: newVehicle || undefined,
      customer: customer,
    },
    description: `Customer Update:\n👤 **${customer.name}**${updates}`,
    expiresAt: Date.now() + CONFIRMATION_TTL_MS,
  };

  return {
    type: "pending_confirmation",
    data: null,
    message: buildConfirmationRequest(action),
    pendingAction: action,
  };
}

async function previewDeleteCustomer(
  sb: SupabaseClient,
  shopId: string,
  entities: ExtractedEntities,
): Promise<QueryResult> {
  if (!entities.customerQuery) {
    return { type: "error", data: null, message: "Kis customer ko delete karna hai? Naam batao." };
  }

  const customers = await searchCustomersDB(sb, shopId, entities.customerQuery, 5);
  if (customers.length === 0) {
    return { type: "not_found", data: null, message: `"${entities.customerQuery}" nahi mila.` };
  }
  if (customers.length > 1) {
    const action: PendingAction = {
      intent: "MULTIPLE_MATCHES" as any,
      action: "UNKNOWN" as any,
      entityType: "unknown" as any,
      entityId: null,
      entityName: null,
      status: "PENDING_CONFIRMATION" as any,
      createdAt: Date.now(),
      id: crypto.randomUUID(),
      parameters: {
        query: entities.customerQuery,
        matches: customers.map((c) => c.item),
        intent: "CUSTOMER_DELETE",
      },
      description: "Select customer",
      expiresAt: Date.now() + CONFIRMATION_TTL_MS,
    };
    return {
      type: "pending_confirmation",
      data: null,
      message: buildConfirmationRequest(action),
      pendingAction: action,
    };
  }

  const customer = customers[0].item;
  const hasBalance = customer.balance_cache !== 0;

  const action: PendingAction = {
    intent: "CUSTOMER_DELETE" as any,
    action: "UNKNOWN" as any,
    entityType: "unknown" as any,
    entityId: null,
    entityName: null,
    status: "PENDING_CONFIRMATION" as any,
    createdAt: Date.now(),
    id: crypto.randomUUID(),
    parameters: {
      customerId: customer.id,
      customerName: customer.name,
      customer: customer,
    },
    description: `Customer delete karo:\n👤 **${customer.name}**\n📱 Mobile: ${customer.mobile || "N/A"}\n🚗 Vehicle: ${customer.vehicle_number || "N/A"}\n\n⚠️ ${hasBalance ? "Balance non-zero hai, safe archive kiya jayega." : "Customer delete kar diya jayega."}`,
    expiresAt: Date.now() + CONFIRMATION_TTL_MS,
  };

  return {
    type: "pending_confirmation",
    data: null,
    message: buildConfirmationRequest(action),
    pendingAction: action,
  };
}

async function previewKhataAction(
  sb: SupabaseClient,
  shopId: string,
  entities: ExtractedEntities,
  type: "PAYMENT_CREATE" | "CREDIT_CREATE" | "DEBIT_CREATE",
): Promise<QueryResult> {
  if (!entities.customerQuery || !entities.priceAmount) {
    return {
      type: "error",
      data: null,
      message: "Khata entry ke liye customer ka naam aur amount batao. Jaise 'Rahul ne 500 diye'.",
    };
  }

  const customers = await searchCustomersDB(sb, shopId, entities.customerQuery, 5);
  if (customers.length === 0) {
    return { type: "not_found", data: null, message: `"${entities.customerQuery}" nahi mila.` };
  }
  if (customers.length > 1) {
    const action: PendingAction = {
      intent: "MULTIPLE_MATCHES" as any,
      action: "UNKNOWN" as any,
      entityType: "unknown" as any,
      entityId: null,
      entityName: null,
      status: "PENDING_CONFIRMATION" as any,
      createdAt: Date.now(),
      id: crypto.randomUUID(),
      parameters: {
        query: entities.customerQuery,
        matches: customers.map((c) => c.item),
        intent: type,
      },
      description: "Select customer",
      expiresAt: Date.now() + CONFIRMATION_TTL_MS,
    };
    return {
      type: "pending_confirmation",
      data: null,
      message: buildConfirmationRequest(action),
      pendingAction: action,
    };
  }

  const customer = customers[0].item;
  let actionDesc = "";
  let icon = "📝";
  if (type === "PAYMENT_CREATE") {
    actionDesc = `Payment Received`;
    icon = "💰";
  }
  if (type === "CREDIT_CREATE") {
    actionDesc = `Udhaar Diya`;
    icon = "➕";
  }
  if (type === "DEBIT_CREATE") {
    actionDesc = `Charge/Fine`;
    icon = "➖";
  }

  const action: PendingAction = {
    intent: type as any,
    action: "UNKNOWN" as any,
    entityType: "unknown" as any,
    entityId: null,
    entityName: null,
    status: "PENDING_CONFIRMATION" as any,
    createdAt: Date.now(),
    id: crypto.randomUUID(),
    parameters: {
      customerId: customer.id,
      customerName: customer.name,
      amount: entities.priceAmount,
      customer: customer,
    },
    description: `Khata Entry:\n👤 **${customer.name}**\n${icon} ${actionDesc}: ₹${entities.priceAmount}\n📊 Purana Balance: ₹${customer.balance_cache}`,
    expiresAt: Date.now() + CONFIRMATION_TTL_MS,
  };

  return {
    type: "pending_confirmation",
    data: null,
    message: buildConfirmationRequest(action),
    pendingAction: action,
  };
}

// ─── Execute Pending Action (After Confirmation) ────────────────────────────

export async function executePendingAction(
  sb: SupabaseClient,
  shopId: string,
  action: any, // PendingAction | { type: string, payload: any }
): Promise<string> {
  // Determine intent and parameters based on payload structure
  const intent = action.intent || action.type;
  const parameters = action.parameters || action.payload;

  // Map UI action types back to internal intents if necessary
  let internalIntent = intent;
  if (intent === "CREATE_PRODUCT") internalIntent = "PRODUCT_CREATE";
  if (intent === "UPDATE_PRODUCT") internalIntent = "PRODUCT_UPDATE";
  if (intent === "DELETE_PRODUCT") internalIntent = "PRODUCT_DELETE";
  if (intent === "UPDATE_STOCK" || intent === "STOCK_REDUCE") internalIntent = "PRODUCT_STOCK_ADD";
  if (intent === "CREATE_CUSTOMER") internalIntent = "CUSTOMER_CREATE";
  if (intent === "UPDATE_CUSTOMER") internalIntent = "CUSTOMER_UPDATE";
  if (intent === "DELETE_CUSTOMER") internalIntent = "CUSTOMER_DELETE";

  // Check TTL only for chat-based confirmations
  if (action.expiresAt && Date.now() > action.expiresAt) {
    return "⏰ Yeh action expire ho gaya (60 sec). Dobara request karo.";
  }

  try {
    switch (internalIntent) {
      case "PRODUCT_CREATE": {
        const { name, price, quantity } = parameters as {
          name: string;
          price: number;
          quantity: number;
        };
        const { error } = await sb.from("products").insert({
          shop_id: shopId,
          name,
          selling_price: price,
          stock_quantity: quantity,
          category: "General",
          is_active: true,
        });
        if (error) return `❌ Product add nahi ho paya: ${error.message}`;
        return `✅ Naya product "${name}" (Price: ₹${price}, Stock: ${quantity}) add ho gaya.`;
      }

      case "PRODUCT_UPDATE": {
        const { productId, changes } = parameters as {
          productId: string;
          changes: Record<string, any>;
        };
        const { error } = await sb.from("products").update(changes).eq("id", productId);
        if (error) return `❌ Product update fail hua: ${error.message}`;
        return `✅ Product update ho gaya.`;
      }

      case "PRODUCT_PRICE_UPDATE": {
        const { productId, productName, newPrice, version } = parameters as {
          productId: string;
          productName: string;
          newPrice: number;
          version?: number;
        };
        const { error } = await sb
          .from("products")
          .update({
            selling_price: newPrice,
            version: version ? version + 1 : 2,
          })
          .eq("id", productId);
        if (error) return `❌ Price update fail hua: ${error.message}`;
        return `✅ ${productName} ka naya price ₹${newPrice} set ho gaya.`;
      }

      case "PRODUCT_STOCK_ADD":
      case "PRODUCT_STOCK_REMOVE": {
        const { productId, productName, quantityChange, currentStock } = parameters as {
          productId: string;
          productName: string;
          quantityChange: number;
          currentStock: number;
          shopId: string;
        };

        const { error } = await sb.rpc("adjust_inventory", {
          p_idempotency_key: crypto.randomUUID(),
          p_request_hash: "ai-update",
          p_shop_id: shopId,
          p_product_id: productId,
          p_quantity_change: quantityChange,
          p_notes: `AI Assistant ${quantityChange < 0 ? "Reduction" : "Addition"}`,
        });

        if (error) {
          // Fallback if RPC fails
          await sb
            .from("products")
            .update({ stock_quantity: currentStock + quantityChange })
            .eq("id", productId);
        }

        const newStock = currentStock + quantityChange;
        const verb = quantityChange < 0 ? "kam" : "add";
        return `✅ ${productName} ka stock ${verb} ho gaya. ${Math.abs(quantityChange)} pcs ${quantityChange < 0 ? "nikle" : "aaye"}. Naya stock: ${newStock}`;
      }

      case "CUSTOMER_CREATE": {
        const { name, mobile, vehicleNumber } = parameters as {
          name: string;
          mobile: string | null;
          vehicleNumber: string | null;
        };
        const customer = await CustomerService.createCustomer(
          shopId,
          {
            name,
            mobile: mobile || null,
            vehicle_number: vehicleNumber || null,
            address: null,
            notes: null,
          },
          sb,
        );
        return `✅ Naya customer "${customer.name}" add ho gaya.`;
      }

      case "CUSTOMER_UPDATE": {
        const { customerId, customerName, mobile, vehicleNumber } = parameters as {
          customerId: string;
          customerName: string;
          mobile?: string;
          vehicleNumber?: string;
        };
        const updates: Record<string, string> = {};
        if (mobile) updates.mobile = mobile;
        if (vehicleNumber) updates.vehicle_number = vehicleNumber;

        await CustomerService.updateCustomer(customerId, shopId, updates, sb);
        return `✅ ${customerName} ki details update ho gayi.`;
      }

      case "PRODUCT_DELETE": {
        const { productId, productName } = parameters as {
          productId: string;
          productName: string;
        };
        // Soft delete
        const { error } = await sb
          .from("products")
          .update({
            is_active: false,
            deleted_at: new Date().toISOString(),
          })
          .eq("id", productId);
        if (error) return `❌ Delete fail hua: ${error.message}`;
        return `✅ Product "${productName}" delete (archive) ho gaya.`;
      }

      case "CUSTOMER_DELETE": {
        const { customerId, customerName } = parameters as {
          customerId: string;
          customerName: string;
        };
        // Soft delete
        await CustomerService.softDeleteCustomer(customerId, shopId, sb);
        return `✅ Customer "${customerName}" archive ho gaya.`;
      }

      case "PAYMENT_CREATE":
      case "CREDIT_CREATE":
      case "DEBIT_CREATE": {
        const { customerId, customerName, amount } = parameters as {
          customerId: string;
          customerName: string;
          amount: number;
        };

        let balanceImpact = 0;
        let note = "";

        if (action.intent === "PAYMENT_CREATE") {
          balanceImpact = -amount;
          note = "Payment via AI Assistant";
        } else if (action.intent === "CREDIT_CREATE") {
          balanceImpact = amount;
          note = "Udhaar via AI Assistant";
        } else if (action.intent === "DEBIT_CREATE") {
          balanceImpact = amount;
          note = "Charge/Fine via AI Assistant";
        }

        await LedgerService.createManualEntry(shopId, customerId, balanceImpact, note);

        // Fetch new balance to show in UI
        const customer = await CustomerService.getCustomerById(customerId, shopId, sb);
        const newBalance = customer?.balance_cache || 0;

        return `✅ Khata entry successful. ${customerName} ka naya balance: ₹${newBalance}.`;
      }

      default:
        return "❌ Unknown action type.";
    }
  } catch (err) {
    console.error("executePendingAction error:", err);
    return "❌ Action execute karte waqt error aaya. Please dobara try karo.";
  }
}

// ─── Report Queries ─────────────────────────────────────────────────────────

async function queryLowStock(sb: SupabaseClient, shopId: string) {
  const { data, error } = await sb
    .from("products")
    .select("id, name, brand, stock_quantity, low_stock_threshold")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("stock_quantity", { ascending: true })
    .limit(50); // Paginated

  if (error) throw new Error(`Failed to fetch low stock: ${error.message}`);
  return (data || []).filter(
    (p: { stock_quantity: number; low_stock_threshold: number }) =>
      p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold,
  );
}

async function queryOutOfStock(sb: SupabaseClient, shopId: string) {
  const { data, error } = await sb
    .from("products")
    .select("id, name, brand, stock_quantity")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .lte("stock_quantity", 0)
    .order("name")
    .limit(50);

  if (error) throw new Error(`Failed to fetch out of stock: ${error.message}`);
  return data || [];
}

async function querySalesSummary(sb: SupabaseClient, shopId: string, dateRange?: DateRange) {
  // If a date range is provided, query that specific range
  if (dateRange) {
    const { data, error } = await sb
      .from("invoices")
      .select("total, paid, due, profit, created_at, payment_status")
      .eq("shop_id", shopId)
      .neq("payment_status", "reversed")
      .gte("created_at", dateRange.start.toISOString())
      .lte("created_at", dateRange.end.toISOString());

    if (error) throw new Error(`Failed to fetch sales: ${error.message}`);

    type InvoiceData = {
      total: number | null;
      paid: number | null;
      due: number | null;
      profit: number | null;
      created_at: string;
      payment_status: string;
    };
    const invoices: InvoiceData[] = data || [];

    return {
      label: dateRange.label,
      period: {
        count: invoices.length,
        total: invoices.reduce((s: number, i) => s + (i.total || 0), 0),
        paid: invoices.reduce((s: number, i) => s + (i.paid || 0), 0),
        due: invoices.reduce((s: number, i) => s + (i.due || 0), 0),
        profit: invoices.reduce((s: number, i) => s + (i.profit || 0), 0),
      },
    };
  }

  // Default: today + this month
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

  const { data, error } = await sb
    .from("invoices")
    .select("total, paid, due, profit, created_at, payment_status")
    .eq("shop_id", shopId)
    .neq("payment_status", "reversed")
    .gte("created_at", monthStart);

  if (error) throw new Error(`Failed to fetch sales: ${error.message}`);

  type InvoiceData = {
    total: number | null;
    paid: number | null;
    due: number | null;
    profit: number | null;
    created_at: string;
    payment_status: string;
  };
  const invoices: InvoiceData[] = data || [];
  const todayInvoices = invoices.filter((i) => i.created_at.slice(0, 10) === todayStr);

  return {
    today: {
      count: todayInvoices.length,
      total: todayInvoices.reduce((s: number, i) => s + (i.total || 0), 0),
      paid: todayInvoices.reduce((s: number, i) => s + (i.paid || 0), 0),
      due: todayInvoices.reduce((s: number, i) => s + (i.due || 0), 0),
      profit: todayInvoices.reduce((s: number, i) => s + (i.profit || 0), 0),
    },
    month: {
      count: invoices.length,
      total: invoices.reduce((s: number, i) => s + (i.total || 0), 0),
      paid: invoices.reduce((s: number, i) => s + (i.paid || 0), 0),
      due: invoices.reduce((s: number, i) => s + (i.due || 0), 0),
      profit: invoices.reduce((s: number, i) => s + (i.profit || 0), 0),
    },
  };
}

async function queryPurchaseSummary(sb: SupabaseClient, shopId: string, dateRange?: DateRange) {
  if (dateRange) {
    const { data, error } = await sb
      .from("purchases")
      .select("total, paid, due, bill_date")
      .eq("shop_id", shopId)
      .gte("bill_date", dateRange.start.toISOString().slice(0, 10))
      .lte("bill_date", dateRange.end.toISOString().slice(0, 10));

    if (error) throw new Error(`Failed to fetch purchases: ${error.message}`);

    type PurchaseData = {
      total: number | null;
      paid: number | null;
      due: number | null;
      bill_date: string;
    };
    const purchases: PurchaseData[] = data || [];

    return {
      label: dateRange.label,
      period: {
        count: purchases.length,
        total: purchases.reduce((s: number, p) => s + (p.total || 0), 0),
        paid: purchases.reduce((s: number, p) => s + (p.paid || 0), 0),
        due: purchases.reduce((s: number, p) => s + (p.due || 0), 0),
      },
    };
  }

  // Default: this month
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

  const { data, error } = await sb
    .from("purchases")
    .select("total, paid, due, bill_date")
    .eq("shop_id", shopId)
    .gte("bill_date", monthStart);

  if (error) throw new Error(`Failed to fetch purchases: ${error.message}`);

  type PurchaseData = {
    total: number | null;
    paid: number | null;
    due: number | null;
    bill_date: string;
  };
  const monthPurchases: PurchaseData[] = data || [];

  return {
    month: {
      count: monthPurchases.length,
      total: monthPurchases.reduce((s: number, p) => s + (p.total || 0), 0),
      paid: monthPurchases.reduce((s: number, p) => s + (p.paid || 0), 0),
      due: monthPurchases.reduce((s: number, p) => s + (p.due || 0), 0),
    },
  };
}

// Fix 8b: Use RPCs for top products/customers (with JS fallback if RPC doesn't exist yet)

async function queryTopProducts(sb: SupabaseClient, shopId: string, dateRange?: DateRange) {
  const start = dateRange?.start ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = dateRange?.end ?? new Date();

  // Try RPC first
  const { data: rpcData, error: rpcError } = await sb.rpc("get_top_selling_products", {
    p_shop_id: shopId,
    p_start_date: start.toISOString(),
    p_end_date: end.toISOString(),
    p_limit: 10,
  });

  if (!rpcError && rpcData) {
    return (
      rpcData as Array<{
        product_name: string;
        total_quantity: number;
        total_revenue: number;
      }>
    ).map((r) => ({
      name: r.product_name,
      quantity: Number(r.total_quantity),
      revenue: Number(r.total_revenue),
    }));
  }

  // Fallback: in-memory aggregation (for shops that haven't run the migration yet)
  console.warn("get_top_selling_products RPC not available, using fallback:", rpcError?.message);
  const { data, error } = await sb
    .from("invoice_items")
    .select("product_name, quantity, line_total")
    .eq("shop_id", shopId)
    .limit(1000);

  if (error) throw new Error(`Failed to fetch top products: ${error.message}`);

  const stats: Record<string, { quantity: number; revenue: number }> = {};
  for (const item of data || []) {
    const name = item.product_name;
    if (!stats[name]) stats[name] = { quantity: 0, revenue: 0 };
    stats[name].quantity += item.quantity || 0;
    stats[name].revenue += item.line_total || 0;
  }

  return Object.entries(stats)
    .sort((a, b) => b[1].quantity - a[1].quantity)
    .slice(0, 10)
    .map(([name, s]) => ({ name, ...s }));
}

async function queryTopCustomers(sb: SupabaseClient, shopId: string, dateRange?: DateRange) {
  const start = dateRange?.start ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = dateRange?.end ?? new Date();

  // Try RPC first
  const { data: rpcData, error: rpcError } = await sb.rpc("get_top_customers", {
    p_shop_id: shopId,
    p_start_date: start.toISOString(),
    p_end_date: end.toISOString(),
    p_limit: 10,
  });

  if (!rpcError && rpcData) {
    return (
      rpcData as Array<{
        customer_name: string;
        total_spent: number;
        invoice_count: number;
        outstanding_due: number;
      }>
    ).map((r) => ({
      name: r.customer_name,
      total: Number(r.total_spent),
      count: Number(r.invoice_count),
      due: Number(r.outstanding_due),
    }));
  }

  // Fallback: in-memory aggregation
  console.warn("get_top_customers RPC not available, using fallback:", rpcError?.message);
  const { data, error } = await sb
    .from("invoices")
    .select("customer_name, total, due")
    .eq("shop_id", shopId)
    .neq("payment_status", "reversed")
    .limit(1000);

  if (error) throw new Error(`Failed to fetch top customers: ${error.message}`);

  const stats: Record<string, { total: number; due: number; count: number }> = {};
  for (const inv of data || []) {
    const name = inv.customer_name || "Walk-in";
    if (!stats[name]) stats[name] = { total: 0, due: 0, count: 0 };
    stats[name].total += inv.total || 0;
    stats[name].due += inv.due || 0;
    stats[name].count += 1;
  }

  return Object.entries(stats)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([name, s]) => ({ name, ...s }));
}

async function queryCustomerBalance(
  sb: SupabaseClient,
  shopId: string,
  query: string,
): Promise<{ customer: SearchableCustomer; balance: number } | null> {
  const results = await searchCustomersDB(sb, shopId, query, 1);
  if (results.length === 0) return null;
  const customer = results[0].item;
  return { customer, balance: customer.balance_cache };
}

async function queryCustomerHistory(sb: SupabaseClient, shopId: string, query: string) {
  const results = await searchCustomersDB(sb, shopId, query, 1);
  if (results.length === 0) return { customer: null, invoices: [] };

  const customer = results[0].item;
  const { data, error } = await sb
    .from("invoices")
    .select("invoice_number, total, paid, due, created_at, payment_status")
    .eq("customer_id", customer.id)
    .eq("shop_id", shopId)
    .neq("payment_status", "reversed")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(`Failed to fetch history: ${error.message}`);
  return { customer, invoices: data || [] };
}

async function queryInvoice(sb: SupabaseClient, shopId: string, invoiceNumber: string) {
  const { data, error } = await sb
    .from("invoices")
    .select("invoice_number, customer_name, total, paid, due, payment_status, created_at")
    .eq("shop_id", shopId)
    .ilike("invoice_number", `%${invoiceNumber}%`)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw new Error(`Failed to fetch invoice: ${error.message}`);
  return data || [];
}

// ─── Expense & Supplier Queries (Fix 9b) ────────────────────────────────────

async function queryExpenseSummary(sb: SupabaseClient, shopId: string, dateRange?: DateRange) {
  const start = dateRange?.start ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = dateRange?.end ?? new Date();

  const { data, error } = await sb
    .from("expenses")
    .select("amount, category, description, expense_date")
    .eq("shop_id", shopId)
    .gte("expense_date", start.toISOString().split("T")[0])
    .lte("expense_date", end.toISOString().split("T")[0]);

  if (error) throw new Error(`Failed to fetch expenses: ${error.message}`);

  const items = data || [];
  const total = items.reduce((s, e) => s + (e.amount ?? 0), 0);
  const byCategory: Record<string, number> = {};
  for (const exp of items) {
    const cat = exp.category ?? "Other";
    byCategory[cat] = (byCategory[cat] ?? 0) + (exp.amount ?? 0);
  }

  return {
    total,
    count: items.length,
    byCategory,
    label: dateRange?.label ?? "Is mahine",
  };
}

async function querySupplierDues(sb: SupabaseClient, shopId: string) {
  const { data, error } = await sb
    .from("purchases")
    .select("supplier_name, due, bill_date")
    .eq("shop_id", shopId)
    .gt("due", 0)
    .order("due", { ascending: false });

  if (error) throw new Error(`Failed to fetch supplier dues: ${error.message}`);

  const items = data || [];
  const totalDue = items.reduce((s, p) => s + (p.due ?? 0), 0);
  return { suppliers: items, totalDue };
}

// ─── Main Executor ──────────────────────────────────────────────────────────

export async function executeQuery(
  sb: SupabaseClient,
  shopId: string,
  intent: Intent,
  entities: ExtractedEntities,
): Promise<QueryResult> {
  try {
    switch (intent) {
      // ── Write Operations (return confirmation previews) ──
      case "PRODUCT_CREATE":
        return previewAddProduct(sb, shopId, entities);
      case "PRODUCT_PRICE_UPDATE":
        return await previewUpdatePrice(sb, shopId, entities);
      case "PRODUCT_STOCK_ADD":
      case "PRODUCT_STOCK_SET":
      case "PRODUCT_STOCK_REMOVE":
        // Fallback generic logic for add/reduce/set
        return await previewUpdateStock(sb, shopId, entities, intent);
      case "PRODUCT_DELETE":
        return await previewDeleteProduct(sb, shopId, entities);
      case "CUSTOMER_CREATE":
        return previewCreateCustomer(sb, shopId, entities);
      case "CUSTOMER_UPDATE":
        return await previewUpdateCustomer(sb, shopId, entities);
      case "CUSTOMER_DELETE":
        return await previewDeleteCustomer(sb, shopId, entities);
      case "PAYMENT_CREATE":
      case "CREDIT_CREATE":
      case "DEBIT_CREATE":
        return await previewKhataAction(
          sb,
          shopId,
          entities,
          intent as "PAYMENT_CREATE" | "CREDIT_CREATE" | "DEBIT_CREATE",
        );

      // ── Product queries ──
      case "PRODUCT_PRICE":
      case "PRODUCT_STOCK":
      case "PRODUCT_PRICE_AND_STOCK":
      case "PRODUCT_SEARCH": {
        if (!entities.productQuery) {
          return {
            type: "not_found",
            data: null,
            message: "Kya dhundhna hai? Product ka naam batao.",
          };
        }
        const results = await searchProductsDB(sb, shopId, entities.productQuery, 10);
        if (results.length === 0) {
          return {
            type: "not_found",
            data: null,
            message: `"${entities.productQuery}" inventory me nahi mila.`,
          };
        }
        return { type: "products", data: results };
      }

      // ── Customer queries ──
      case "CUSTOMER_SEARCH": {
        if (!entities.customerQuery) {
          return { type: "not_found", data: null, message: "Customer ka naam ya number batao." };
        }
        const results = await searchCustomersDB(sb, shopId, entities.customerQuery, 5);
        if (results.length === 0) {
          return {
            type: "not_found",
            data: null,
            message: `"${entities.customerQuery}" naam ka customer nahi mila.`,
          };
        }
        return { type: "customers", data: results };
      }

      case "CUSTOMER_BALANCE": {
        const q = entities.customerQuery || entities.productQuery;
        if (!q) {
          return { type: "not_found", data: null, message: "Customer ka naam batao." };
        }
        const result = await queryCustomerBalance(sb, shopId, q);
        if (!result) {
          return { type: "not_found", data: null, message: `"${q}" naam ka customer nahi mila.` };
        }
        return { type: "customer_balance", data: result };
      }

      case "CUSTOMER_HISTORY": {
        const q = entities.customerQuery || entities.productQuery;
        if (!q) {
          return { type: "not_found", data: null, message: "Customer ka naam batao." };
        }
        const result = await queryCustomerHistory(sb, shopId, q);
        if (!result.customer) {
          return { type: "not_found", data: null, message: `"${q}" naam ka customer nahi mila.` };
        }
        return { type: "customer_history", data: result };
      }

      // ── Invoice queries ──
      case "INVOICE_SEARCH":
      case "INVOICE_DETAILS": {
        const q = entities.invoiceNumber || entities.productQuery || entities.customerQuery;
        if (!q) {
          return { type: "not_found", data: null, message: "Invoice number batao." };
        }
        const invoices = await queryInvoice(sb, shopId, q);
        if (invoices.length === 0) {
          return { type: "not_found", data: null, message: `Invoice "${q}" nahi mila.` };
        }
        return { type: "invoices", data: invoices };
      }

      // ── Report queries ──
      case "LOW_STOCK": {
        const items = await queryLowStock(sb, shopId);
        return { type: "low_stock", data: items };
      }
      case "OUT_OF_STOCK": {
        const items = await queryOutOfStock(sb, shopId);
        return { type: "out_of_stock", data: items };
      }
      case "TOP_SELLING_PRODUCTS": {
        const items = await queryTopProducts(sb, shopId, entities.dateRange ?? undefined);
        return { type: "top_products", data: items };
      }
      case "TOP_CUSTOMERS": {
        const items = await queryTopCustomers(sb, shopId, entities.dateRange ?? undefined);
        return { type: "top_customers", data: items };
      }
      case "SALES_REPORT":
      case "PROFIT_REPORT": {
        const summary = await querySalesSummary(sb, shopId, entities.dateRange ?? undefined);
        return { type: "sales_summary", data: summary };
      }
      case "PURCHASE_REPORT": {
        const summary = await queryPurchaseSummary(sb, shopId, entities.dateRange ?? undefined);
        return { type: "purchase_summary", data: summary };
      }

      // ── Expense & Supplier queries (Fix 9b) ──
      case "EXPENSE_SUMMARY": {
        const data = await queryExpenseSummary(sb, shopId, entities.dateRange ?? undefined);
        return { type: "expense_summary", data };
      }
      case "SUPPLIER_DUES": {
        const data = await querySupplierDues(sb, shopId);
        return { type: "supplier_dues", data };
      }

      default:
        return {
          type: "not_found",
          data: null,
          message: "Yeh query backend execute nahi kar paya.",
        };
    }
  } catch (err) {
    console.error("Query execution error:", err);
    return {
      type: "error",
      data: null,
      message: "Database error. Please try again.",
    };
  }
}
