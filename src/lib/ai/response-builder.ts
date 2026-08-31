/**
 * Response Builder
 *
 * Deterministic response formatter using templates.
 * Short, business-style, Hinglish responses.
 * Never generates essays for data queries.
 */

import type { Intent } from "./intent-detector";
import type { AIIntent } from "./core/types";
import type { QueryResult } from "./query-executor";
import type { SearchableProduct, SearchResult } from "./fuzzy-search";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  if (!Number.isFinite(amount)) return "₹0";
  return "₹" + amount.toLocaleString("en-IN");
}

function capitalize(s: string): string {
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function productTitle(p: { brand?: string | null; name?: string | null }): string {
  const b = (p.brand || "").trim();
  const n = (p.name || "").trim();
  if (b && n) return capitalize(`${b} ${n}`);
  if (n) return capitalize(n);
  if (b) return capitalize(b);
  return "Product";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ─── Product Response Builders ──────────────────────────────────────────────

function buildProductPrice(
  results: SearchResult<SearchableProduct>[],
  quantity: number | null,
): string {
  const qty = quantity || 1;

  if (results.length === 1) {
    const p = results[0].item;
    const title = productTitle(p);
    if (qty > 1) {
      const total = p.selling_price * qty;
      return `${qty} ${title} ka total ${formatINR(total)} hai. (${formatINR(p.selling_price)}/piece)`;
    }
    return `${title} ki price ${formatINR(p.selling_price)} hai.`;
  }

  // Multiple results
  const header =
    qty > 1 ? `${results.length} options available hain:\n` : `${results.length} products mile:\n`;

  const lines = results.map((r, i) => {
    const title = productTitle(r.item);
    if (qty > 1) {
      const total = r.item.selling_price * qty;
      return `${i + 1}. ${title} — ${qty} × ${formatINR(r.item.selling_price)} = ${formatINR(total)}`;
    }
    return `${i + 1}. ${title} — ${formatINR(r.item.selling_price)}`;
  });

  return header + lines.join("\n");
}

function buildProductStock(results: SearchResult<SearchableProduct>[]): string {
  if (results.length === 1) {
    const p = results[0].item;
    const title = productTitle(p);
    if (p.stock_quantity <= 0) {
      return `${title} out of stock hai. 🔴`;
    }
    if (p.stock_quantity <= p.low_stock_threshold) {
      return `${title} ke sirf ${p.stock_quantity} pieces bache hain. ⚠️ (Low stock)`;
    }
    return `${title} ke ${p.stock_quantity} pieces stock me hain. ✅`;
  }

  const lines = results.map((r, i) => {
    const title = productTitle(r.item);
    const indicator =
      r.item.stock_quantity <= 0
        ? "🔴 Out"
        : r.item.stock_quantity <= r.item.low_stock_threshold
          ? `⚠️ ${r.item.stock_quantity}`
          : `✅ ${r.item.stock_quantity}`;
    return `${i + 1}. ${title} — ${indicator}`;
  });

  return `Stock status:\n${lines.join("\n")}`;
}

function buildProductPriceAndStock(
  results: SearchResult<SearchableProduct>[],
  quantity: number | null,
): string {
  const qty = quantity || 1;

  if (results.length === 1) {
    const p = results[0].item;
    const title = productTitle(p);
    const stockStatus =
      p.stock_quantity <= 0
        ? "Out of stock 🔴"
        : p.stock_quantity <= p.low_stock_threshold
          ? `${p.stock_quantity} pcs ⚠️`
          : `${p.stock_quantity} pcs ✅`;

    if (qty > 1) {
      const total = p.selling_price * qty;
      return `${title}\nPrice: ${formatINR(p.selling_price)}/pc\n${qty} ka total: ${formatINR(total)}\nStock: ${stockStatus}`;
    }
    return `${title}\nPrice: ${formatINR(p.selling_price)}\nStock: ${stockStatus}`;
  }

  const lines = results.map((r, i) => {
    const title = productTitle(r.item);
    const stock = r.item.stock_quantity <= 0 ? "Out 🔴" : `${r.item.stock_quantity} pcs`;
    return `${i + 1}. ${title} — ${formatINR(r.item.selling_price)} | ${stock}`;
  });

  return `${results.length} options:\n${lines.join("\n")}`;
}

function buildProductSearch(results: SearchResult<SearchableProduct>[]): string {
  if (results.length === 1) {
    const p = results[0].item;
    const title = productTitle(p);
    return `${title}\nPrice: ${formatINR(p.selling_price)} | Stock: ${p.stock_quantity} pcs | Category: ${p.category}`;
  }

  const lines = results.map((r, i) => {
    const title = productTitle(r.item);
    return `${i + 1}. ${title} — ${formatINR(r.item.selling_price)} | ${r.item.stock_quantity} pcs`;
  });

  return `${results.length} products mile:\n${lines.join("\n")}`;
}

// ─── Report Response Builders ───────────────────────────────────────────────

function buildLowStockResponse(
  items: Array<{ name: string; brand?: string | null; stock_quantity: number }>,
): string {
  if (items.length === 0) return "Sab stock me hai! Koi item low stock me nahi hai. ✅";

  const lines = items.slice(0, 15).map((p, i) => {
    const title = productTitle(p);
    return `${i + 1}. ${title} — ${p.stock_quantity} pcs ⚠️`;
  });

  return `${items.length} items low stock me hain:\n${lines.join("\n")}`;
}

function buildOutOfStockResponse(items: Array<{ name: string; brand?: string | null }>): string {
  if (items.length === 0) return "Koi item out of stock nahi hai! ✅";

  const lines = items.slice(0, 15).map((p, i) => {
    const title = productTitle(p);
    return `${i + 1}. ${title} 🔴`;
  });

  return `${items.length} items out of stock hain:\n${lines.join("\n")}`;
}

function buildSalesSummary(data: {
  today: { count: number; total: number; paid: number; due: number; profit: number };
  month: { count: number; total: number; paid: number; due: number; profit: number };
}): string {
  const t = data.today;
  const m = data.month;

  const lines = [
    `📊 Sales Summary`,
    ``,
    `Aaj: ${t.count} bills — ${formatINR(t.total)}`,
    `  Received: ${formatINR(t.paid)} | Due: ${formatINR(t.due)}`,
    ``,
    `Is mahine: ${m.count} bills — ${formatINR(m.total)}`,
    `  Received: ${formatINR(m.paid)} | Due: ${formatINR(m.due)}`,
  ];

  return lines.join("\n");
}

function buildPurchaseSummary(data: {
  month: { count: number; total: number; paid: number; due: number };
  overall: { count: number; total: number };
}): string {
  return [
    `🛒 Purchase Summary`,
    ``,
    `Is mahine: ${data.month.count} bills — ${formatINR(data.month.total)}`,
    `  Paid: ${formatINR(data.month.paid)} | Due: ${formatINR(data.month.due)}`,
    ``,
    `Overall: ${data.overall.count} bills — ${formatINR(data.overall.total)}`,
  ].join("\n");
}

function buildProfitLoss(data: {
  today: { total: number; profit: number };
  month: { total: number; profit: number };
}): string {
  return [
    `💰 Profit Summary`,
    ``,
    `Aaj: Sale ${formatINR(data.today.total)} | Profit ${formatINR(data.today.profit)}`,
    `Is mahine: Sale ${formatINR(data.month.total)} | Profit ${formatINR(data.month.profit)}`,
  ].join("\n");
}

function buildTopProducts(
  items: Array<{ name: string; quantity: number; revenue: number }>,
): string {
  if (items.length === 0) return "Abhi tak koi sale record nahi hai.";

  const lines = items.map(
    (p, i) => `${i + 1}. ${capitalize(p.name)} — ${p.quantity} sold, ${formatINR(p.revenue)}`,
  );

  return `🏆 Top Selling Products:\n${lines.join("\n")}`;
}

function buildTopCustomers(
  items: Array<{ name: string; total: number; due: number; count: number }>,
): string {
  if (items.length === 0) return "Abhi tak koi customer record nahi hai.";

  const lines = items.map((c, i) => {
    const dueStr = c.due > 0 ? ` | Due: ${formatINR(c.due)}` : "";
    return `${i + 1}. ${capitalize(c.name)} — ${formatINR(c.total)} (${c.count} bills)${dueStr}`;
  });

  return `🏆 Top Customers:\n${lines.join("\n")}`;
}

function buildCustomerBalance(data: {
  customer: { name: string; mobile?: string | null };
  balance: number;
}): string {
  const name = capitalize(data.customer.name);
  if (data.balance > 0) {
    return `${name} ka ${formatINR(data.balance)} baaki hai. 🔴`;
  }
  if (data.balance < 0) {
    return `${name} ka ${formatINR(Math.abs(data.balance))} advance hai. ✅`;
  }
  return `${name} ka koi balance pending nahi hai. ✅`;
}

function buildCustomerHistory(data: {
  customer: { name: string };
  invoices: Array<{
    invoice_number: string;
    total: number;
    paid: number;
    due: number;
    created_at: string;
    payment_status: string;
  }>;
}): string {
  const name = capitalize(data.customer.name);
  if (data.invoices.length === 0) {
    return `${name} ka koi invoice record nahi hai.`;
  }

  const lines = data.invoices.map((inv, i) => {
    const status =
      inv.payment_status === "paid"
        ? "✅ Paid"
        : inv.payment_status === "partial"
          ? `⚠️ Due ${formatINR(inv.due)}`
          : `🔴 Unpaid ${formatINR(inv.due)}`;
    return `${i + 1}. ${inv.invoice_number} — ${formatINR(inv.total)} | ${status} | ${formatDate(inv.created_at)}`;
  });

  return `${name} ke recent bills:\n${lines.join("\n")}`;
}

function buildInvoiceResponse(
  invoices: Array<{
    invoice_number: string;
    customer_name?: string | null;
    total: number;
    paid: number;
    due: number;
    payment_status: string;
    created_at: string;
  }>,
): string {
  if (invoices.length === 1) {
    const inv = invoices[0];
    const status =
      inv.payment_status === "paid"
        ? "✅ Paid"
        : inv.payment_status === "partial"
          ? `⚠️ Partial (Due: ${formatINR(inv.due)})`
          : `🔴 Unpaid`;
    return [
      `Invoice: ${inv.invoice_number}`,
      `Customer: ${inv.customer_name || "Walk-in"}`,
      `Total: ${formatINR(inv.total)} | Paid: ${formatINR(inv.paid)}`,
      `Status: ${status}`,
      `Date: ${formatDate(inv.created_at)}`,
    ].join("\n");
  }

  const lines = invoices.map((inv, i) => {
    const status = inv.payment_status === "paid" ? "✅" : inv.due > 0 ? "🔴" : "⚠️";
    return `${i + 1}. ${inv.invoice_number} — ${formatINR(inv.total)} ${status} | ${inv.customer_name || "Walk-in"}`;
  });

  return `${invoices.length} invoices mile:\n${lines.join("\n")}`;
}

// ─── Main Builder ───────────────────────────────────────────────────────────

export function buildResponse(
  intent: AIIntent | Intent | string,
  queryResult: QueryResult,
  quantity: number | null = null,
): string {
  // Error or not found — return the message directly
  if (queryResult.type === "error" || queryResult.type === "not_found") {
    return queryResult.message || "Kuch samajh nahi aaya. Please dobara try karo.";
  }

  const data = queryResult.data;

  switch (queryResult.type) {
    case "products": {
      const results = data as SearchResult<SearchableProduct>[];
      switch (intent) {
        case "PRODUCT_PRICE":
        case "FOLLOWUP_PRICE":
          return buildProductPrice(results, quantity);
        case "PRODUCT_STOCK":
        case "FOLLOWUP_STOCK":
        case "PRODUCT_AVAILABILITY":
          return buildProductStock(results);
        case "PRODUCT_PRICE_AND_STOCK":
          return buildProductPriceAndStock(results, quantity);
        case "FOLLOWUP_QUANTITY":
          return buildProductPrice(results, quantity);
        default:
          return buildProductSearch(results);
      }
    }

    case "customers":
      return buildProductSearch(data as SearchResult<SearchableProduct>[]);

    case "customer_balance":
      return buildCustomerBalance(
        data as { customer: { name: string; mobile?: string | null }; balance: number },
      );

    case "customer_history":
      return buildCustomerHistory(
        data as {
          customer: { name: string };
          invoices: Array<{
            invoice_number: string;
            total: number;
            paid: number;
            due: number;
            created_at: string;
            payment_status: string;
          }>;
        },
      );

    case "invoices":
      return buildInvoiceResponse(
        data as Array<{
          invoice_number: string;
          customer_name?: string | null;
          total: number;
          paid: number;
          due: number;
          payment_status: string;
          created_at: string;
        }>,
      );

    case "low_stock":
      return buildLowStockResponse(
        data as Array<{ name: string; brand?: string | null; stock_quantity: number }>,
      );

    case "out_of_stock":
      return buildOutOfStockResponse(data as Array<{ name: string; brand?: string | null }>);

    case "top_products":
      return buildTopProducts(data as Array<{ name: string; quantity: number; revenue: number }>);

    case "top_customers":
      return buildTopCustomers(
        data as Array<{ name: string; total: number; due: number; count: number }>,
      );

    case "sales_summary":
      return buildSalesSummary(
        data as {
          today: { count: number; total: number; paid: number; due: number; profit: number };
          month: { count: number; total: number; paid: number; due: number; profit: number };
        },
      );

    case "purchase_summary":
      return buildPurchaseSummary(
        data as {
          month: { count: number; total: number; paid: number; due: number };
          overall: { count: number; total: number };
        },
      );

    case "profit_loss":
      return buildProfitLoss(
        data as {
          today: { total: number; profit: number };
          month: { total: number; profit: number };
        },
      );

    case "success_action":
      return queryResult.message || "Done.";

    default:
      return queryResult.message || "Done.";
  }
}
