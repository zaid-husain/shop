/**
 * Deterministic Intent Detector
 *
 * Classifies user messages into business intents using keyword/regex patterns.
 * ZERO LLM calls. Handles Hindi, Hinglish, and English.
 */

// ─── Intent Types ───────────────────────────────────────────────────────────

export type Intent =
  | "PRODUCT_PRICE"
  | "PRODUCT_STOCK"
  | "PRODUCT_PRICE_AND_STOCK"
  | "PRODUCT_AVAILABILITY"
  | "PRODUCT_SEARCH"
  | "ADD_PRODUCT"
  | "UPDATE_PRICE"
  | "UPDATE_STOCK"
  | "PRODUCT_STOCK_ADD"
  | "PRODUCT_STOCK_SET"
  | "STOCK_REDUCE"
  | "DELETE_PRODUCT"
  | "CUSTOMER_SEARCH"
  | "CUSTOMER_BALANCE"
  | "CUSTOMER_HISTORY"
  | "CREATE_CUSTOMER"
  | "UPDATE_CUSTOMER"
  | "DELETE_CUSTOMER"
  | "PAYMENT_CREATE"
  | "CREDIT_CREATE"
  | "DEBIT_CREATE"
  | "INVOICE_SEARCH"
  | "BILL_TOTAL"
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "TOP_PRODUCTS"
  | "TOP_CUSTOMERS"
  | "SALES_REPORT"
  | "PURCHASE_REPORT"
  | "PROFIT"
  | "LOSS"
  | "EXPENSE_SUMMARY"
  | "EXPENSE_CREATE"
  | "EXPENSE_UPDATE"
  | "EXPENSE_DELETE"
  | "SUPPLIER_DUES"
  | "SHOP_INSIGHTS"
  | "GENERAL_CHAT"
  | "FOLLOWUP_QUANTITY"
  | "FOLLOWUP_STOCK"
  | "FOLLOWUP_PRICE"
  | "UNKNOWN";

export interface IntentResult {
  intent: Intent;
  confidence: number; // 0-1
}

// ─── Pattern Definitions ────────────────────────────────────────────────────

/**
 * Each rule: [Intent, regex, confidence].
 * Rules are evaluated top-to-bottom; first match wins.
 * Patterns are case-insensitive and tested against the normalized input.
 */
const RULES: Array<[Intent, RegExp, number]> = [
  // ── Follow-ups (short queries referencing previous context) ──
  // "2 do", "3 de do", "5 laga do", "kitne ka hua"
  [
    "FOLLOWUP_QUANTITY",
    /^\s*(\d+)\s*(do|de|dedo|de\s*do|laga|pack|piece|pcs|nos|set|liter|litre)?\s*$/i,
    0.95,
  ],
  [
    "FOLLOWUP_QUANTITY",
    /^\s*(ek|do|teen|char|panch|chhe|saat|aath|nau|das)\s*(do|de|dedo|de\s*do|laga)?\s*$/i,
    0.95,
  ],
  ["FOLLOWUP_STOCK", /^\s*(stock|maal|quantity|kitna\s*(hai|h|he)?|available|stk)\s*\??\s*$/i, 0.9],
  [
    "FOLLOWUP_PRICE",
    /^\s*(price|rate|daam|dam|kimat|keemat|kitne\s*ka|kitna|cost|mrp)\s*\??\s*$/i,
    0.9,
  ],

  // ── Low stock / Out of stock (must precede PRODUCT_STOCK) ──
  [
    "LOW_STOCK",
    /\b(low\s*stock|kam\s*stock|kam\s*maal|stock\s*kam|running\s*low|reorder|re-?order)\b/i,
    0.95,
  ],
  [
    "OUT_OF_STOCK",
    /\b(out\s*of\s*stock|khatam|zero\s*stock|stock\s*nahi|stock\s*(0|zero)|nahi\s*hai\s*stock|finish)\b/i,
    0.95,
  ],

  // ── Reports & Analytics ──
  [
    "TOP_PRODUCTS",
    /\b(top\s*(sell|product|item|bik)|best\s*sell|sabse\s*(zyada|jyada)\s*(bik|sell)|popular\s*product)\b/i,
    0.95,
  ],
  [
    "TOP_CUSTOMERS",
    /\b(top\s*customer|best\s*customer|sabse\s*bada\s*(customer|grahak)|regular\s*customer)\b/i,
    0.95,
  ],
  [
    "SALES_REPORT",
    /\b(sale(s)?\s*(report|summary|total|aaj|today|month|week|kal)|aaj\s*(ki|ka)\s*sale|bikri|today('?s)?\s*sale|monthly\s*sale|kitna\s*(bik|sell|bech)|bech(a|e|i))\b/i,
    0.95,
  ],
  [
    "PURCHASE_REPORT",
    /\b(purchase\s*(report|summary|total)|kharid(i|a)|supplier\s*(report)|purchase\s*(aaj|today|month))\b/i,
    0.95,
  ],
  ["PROFIT", /\b(profit|munafa|margin|kamai|earning|fayda)\b/i, 0.9],
  ["LOSS", /\b(loss|nuksan|ghata)\b/i, 0.9],
  ["EXPENSE_SUMMARY", /\b(kharcha|expense|vyay)\b/i, 0.9],
  ["SUPPLIER_DUES", /\b(supplier.*(due|baki)|udhar.*supplier|dena.*hai.*supplier)\b/i, 0.9],
  [
    "SHOP_INSIGHTS",
    /\b(insight|advice|suggest|improve|tips?|business\s*(advice|tip)|shop\s*(improve|tip|grow)|kya\s*karu)\b/i,
    0.85,
  ],

  // ── Customer operations ──
  [
    "CUSTOMER_BALANCE",
    /\b(balance|baaki|baki|udhar|hisab|dues?|pending|udhaar|khata)\b.*\b(customer|grahak|ka|ki|ke)\b/i,
    0.9,
  ],
  [
    "CUSTOMER_BALANCE",
    /\b(customer|grahak)\b.*\b(balance|baaki|baki|udhar|hisab|dues?|pending|udhaar|khata)\b/i,
    0.9,
  ],
  ["CUSTOMER_BALANCE", /\b(kitna\s*(dena|lena|baaki|baki|udhar)|kya\s*hisab)\b/i, 0.85],
  ["CUSTOMER_HISTORY", /\b(customer|grahak)\b.*\b(history|invoice|bill|record|purana)\b/i, 0.9],
  ["CUSTOMER_HISTORY", /\b(history|purana\s*(bill|invoice|record))\b.*\b(customer|grahak)\b/i, 0.9],
  [
    "CUSTOMER_SEARCH",
    /\b(customer|grahak)\b.*\b(search|find|dhundh|dekh|kaun|kon|info|detail)\b/i,
    0.85,
  ],
  ["CUSTOMER_SEARCH", /\b(search|find|dhundh|dekh)\b.*\b(customer|grahak)\b/i, 0.85],
  ["CREATE_CUSTOMER", /\b(add|create|naya|new|banao|bana)\b.*\b(customer|grahak)\b/i, 0.9],

  // ── Invoice operations ──
  ["INVOICE_SEARCH", /\b(invoice|bill|inv-)\b.*\b(search|find|dekh|dhundh|detail|status)\b/i, 0.9],
  ["INVOICE_SEARCH", /\binv-[\w-]+/i, 0.95],
  ["BILL_TOTAL", /\b(bill|invoice)\b.*\b(total|amount|kitna|sum)\b/i, 0.85],

  // ── Khata / Payment operations ──
  ["PAYMENT_CREATE", /\b(receive|cash|payment|mila|jama|aaya)\b/i, 0.85],
  ["CREDIT_CREATE", /\b(diye|diya|udhar|udhaar\s*diya)\b/i, 0.85],
  ["DEBIT_CREATE", /\b(debit|charge|fine|kata)\b/i, 0.8],

  // ── Product write operations ──
  [
    "DELETE_PRODUCT",
    /\b(delete|remove|hata\s*do|archive|deactivate)\b.*\b(product|item|part)\b/i,
    0.9,
  ],
  [
    "DELETE_PRODUCT",
    /\b(product|item|part)\b.*\b(delete|remove|hata\s*do|archive|deactivate)\b/i,
    0.9,
  ],
  [
    "DELETE_PRODUCT",
    /\b(delete|remove|hata\s*do|archive|deactivate)\b/i, // Fallback, will rely on context/entities
    0.85,
  ],
  [
    "ADD_PRODUCT",
    /\b(add|create|naya|new|banao|bana|jod|daal)\b.*\b(product|item|part|stock|maal)\b/i,
    0.9,
  ],
  ["ADD_PRODUCT", /\b(add|create|naya|new|banao)\b/i, 0.85],
  ["UPDATE_PRICE", /\b(update|change|badal|set|kar)\b.*\b(price|rate|daam|dam|kimat)\b/i, 0.9],
  [
    "STOCK_REDUCE",
    /\b(nikal|remove|kam|ghata|deduct|sell|bech)\b.*\b(stock|maal|piece|pcs|quantity)\b/i,
    0.9,
  ],
  [
    "STOCK_REDUCE",
    /\b(stock|maal|piece|pcs|quantity)\b.*\b(nikal|remove|kam|ghata|deduct|sell|bech)\b/i,
    0.9,
  ],
  ["STOCK_REDUCE", /\b(nikal\s*gaye|bik\s*gaye|kam\s*karo|ghatao|minus\s*karo)\b/i, 0.85],
  [
    "PRODUCT_STOCK_ADD",
    /\b(add\s*karo|aur\s*daal\s*do|daal\s*do|badha\s*do|plus\s*karo|aaye\s*hai)\b.*\b(stock|maal|piece|pcs|quantity)?/i,
    0.9,
  ],
  ["PRODUCT_STOCK_SET", /\b(set\s*karo|kar\s*do)\b.*\b(stock|maal|piece|pcs|quantity)\b/i, 0.9],
  ["PRODUCT_STOCK_SET", /\b(stock|maal|piece|pcs|quantity)\b.*\b(set\s*karo|kar\s*do)\b/i, 0.9],
  [
    "UPDATE_STOCK", // Generic update
    /\b(update|change|badal|set|kar|adjust|add|daal)\b.*\b(stock|quantity|maal)\b/i,
    0.85,
  ],

  // ── Customer write operations ──
  [
    "DELETE_CUSTOMER",
    /\b(delete|remove|hata\s*do|archive|deactivate)\b.*\b(customer|grahak)\b/i,
    0.9,
  ],
  [
    "DELETE_CUSTOMER",
    /\b(customer|grahak)\b.*\b(delete|remove|hata\s*do|archive|deactivate)\b/i,
    0.9,
  ],
  [
    "UPDATE_CUSTOMER",
    /\b(update|change|badal|set|kar)\b.*\b(customer|grahak|mobile|number|address|vehicle|naam|name)\b/i,
    0.9,
  ],
  [
    "UPDATE_CUSTOMER",
    /\b(customer|grahak|mobile|number|address|vehicle|naam|name)\b.*\b(update|change|badal|set|kar)\b/i,
    0.9,
  ],

  // ── Product Price + Stock combined ──
  [
    "PRODUCT_PRICE_AND_STOCK",
    /\b(price|rate|daam|dam|kimat).*(stock|maal|quantity|available)/i,
    0.9,
  ],
  [
    "PRODUCT_PRICE_AND_STOCK",
    /\b(stock|maal|quantity|available).*(price|rate|daam|dam|kimat)/i,
    0.9,
  ],

  // ── Product Price (broad patterns) ──
  [
    "PRODUCT_PRICE",
    /\b(price|rate|daam|dam|kimat|keemat|kitne\s*(ka|ke|ki)|cost|mrp|amount)\b/i,
    0.85,
  ],
  ["PRODUCT_PRICE", /\b(kitna\s*(hai|h|he|hoga|lagega|paisa))\b/i, 0.8],
  ["PRODUCT_PRICE", /\bkitne\s*(ka|ke|ki)\b/i, 0.85],

  // ── Product Stock ──
  [
    "PRODUCT_STOCK",
    /\b(stock|maal|quantity|available|stk|inventory|kitna\s*(hai|h|he)\s*(stock|maal)?)\b/i,
    0.8,
  ],

  // ── Product Availability ──
  [
    "PRODUCT_AVAILABILITY",
    /\b(available|milega|mil\s*jayega|hai\s*kya|rakha\s*hai|ata\s*hai|milta\s*hai)\b/i,
    0.75,
  ],

  // ── Product Search (catch-all for product-related queries) ──
  [
    "PRODUCT_SEARCH",
    /\b(search|find|dhundh|dekh|dikhao|show|list)\b.*\b(product|item|part)\b/i,
    0.8,
  ],
];

// ─── Detector Function ──────────────────────────────────────────────────────

export function detectIntent(text: string): IntentResult {
  const normalized = text
    .toLowerCase()
    .replace(/[?!.,;:'"(){}[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return { intent: "UNKNOWN", confidence: 0 };
  }

  // Run through rules in priority order
  for (const [intent, pattern, confidence] of RULES) {
    if (pattern.test(normalized)) {
      return { intent, confidence };
    }
  }

  // If the message is very short (1-3 words) and doesn't match any rule,
  // it's likely a product name search (implicit "price/availability" query)
  const wordCount = normalized.split(/\s+/).length;
  if (wordCount <= 3 && normalized.length >= 2) {
    return { intent: "PRODUCT_SEARCH", confidence: 0.6 };
  }

  // Longer unmatched messages → general chat (send to LLM)
  return { intent: "GENERAL_CHAT", confidence: 0.5 };
}

/**
 * Returns true if this intent should be handled deterministically
 * (no LLM call needed).
 */
export function isDeterministicIntent(intent: Intent): boolean {
  const DETERMINISTIC: Set<Intent> = new Set([
    "PRODUCT_PRICE",
    "PRODUCT_STOCK",
    "PRODUCT_PRICE_AND_STOCK",
    "PRODUCT_AVAILABILITY",
    "PRODUCT_SEARCH",
    "CUSTOMER_SEARCH",
    "CUSTOMER_BALANCE",
    "CUSTOMER_HISTORY",
    "INVOICE_SEARCH",
    "BILL_TOTAL",
    "LOW_STOCK",
    "OUT_OF_STOCK",
    "TOP_PRODUCTS",
    "TOP_CUSTOMERS",
    "SALES_REPORT",
    "PURCHASE_REPORT",
    "PROFIT",
    "LOSS",
    "EXPENSE_SUMMARY",
    "SUPPLIER_DUES",
    "FOLLOWUP_QUANTITY",
    "FOLLOWUP_STOCK",
    "FOLLOWUP_PRICE",
    "ADD_PRODUCT",
    "UPDATE_PRICE",
    "UPDATE_STOCK",
    "STOCK_REDUCE",
    "CREATE_CUSTOMER",
  ]);
  return DETERMINISTIC.has(intent);
}
