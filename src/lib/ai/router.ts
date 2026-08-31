/**
 * AI Router
 *
 * Deterministic, sub-millisecond request classifier.
 * Routes user queries to the correct business module
 * BEFORE any database query or LLM call.
 *
 * No LLM. No JSON parsing. No function calling. No AI.
 * Pure regex and keyword matching.
 */

import { CONFIRM_WORDS, CANCEL_WORDS } from "./core/constants";

// ─── Module Types ───────────────────────────────────────────────────────────

export type RouteModule =
  | "INVENTORY"
  | "CUSTOMER"
  | "BILLING"
  | "KHATA"
  | "REPORTS"
  | "SUPPLIER"
  | "DASHBOARD"
  | "SETTINGS"
  | "CONFIRM_CANCEL"
  | "GENERAL_AI"
  | "UNKNOWN";

export interface RouteResult {
  /** The target module */
  module: RouteModule;
  /** 0-1, higher = more certain */
  confidence: number;
  /** Human-readable reason for the routing decision */
  reason: string;
}

// ─── Routing Rules ──────────────────────────────────────────────────────────
//
// Each rule: [Module, RegExp, confidence, reason].
// Evaluated top-to-bottom, first match wins.
// More specific patterns MUST come before broader ones.
//

const RULES: ReadonlyArray<readonly [RouteModule, RegExp, number, string]> = [
  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIRM / CANCEL — for pending actions
  // ═══════════════════════════════════════════════════════════════════════════
  [
    "CONFIRM_CANCEL",
    new RegExp(`^${CONFIRM_WORDS.source}$`, "i"), // Exact match only
    0.95,
    "Exact confirmation word detected",
  ],
  [
    "CONFIRM_CANCEL",
    new RegExp(`^${CANCEL_WORDS.source}$`, "i"), // Exact match only
    0.95,
    "Exact cancellation word detected",
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS — app configuration, profile, account
  // ═══════════════════════════════════════════════════════════════════════════
  [
    "SETTINGS",
    /\b(setting|profile|account|password|pin\s*(change|badal|reset)|logout|sign\s*out|language|theme|dark\s*mode|notification|config)\b/i,
    0.95,
    "Settings/profile/account keyword detected",
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD — app home, overview, summary at a glance
  // ═══════════════════════════════════════════════════════════════════════════
  [
    "DASHBOARD",
    /\b(dashboard|home\s*page|overview|summary\s*(page|screen)|main\s*screen|ghar\s*ka\s*page)\b/i,
    0.9,
    "Dashboard/home keyword detected",
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // KHATA — ledger, udhar, hisab, baaki, credit book
  // Must come BEFORE customer to catch "khata" intent correctly
  // ═══════════════════════════════════════════════════════════════════════════
  [
    "KHATA",
    /\b(khata|udhar|udhaar|hisab\s*kitab|baaki\s*paisa|credit\s*book|ledger|len\s*den|lena\s*dena)\b/i,
    0.95,
    "Khata/ledger keyword detected",
  ],
  [
    "KHATA",
    /\b(baaki|baki|pending\s*(payment|amount|balance|paisa)|udhaar)\b/i,
    0.85,
    "Pending/balance keyword → Khata",
  ],
  [
    "KHATA",
    /\b(kitna\s*(dena|lena)|kya\s*hisab|hisab\s*(batao|dikhao|bata))\b/i,
    0.9,
    "Hindi balance inquiry → Khata",
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // BILLING — invoice, bill, receipt, payment received
  // ═══════════════════════════════════════════════════════════════════════════
  ["BILLING", /\b(invoice|bill|receipt|challan|parchi)\b/i, 0.9, "Invoice/bill keyword detected"],
  ["BILLING", /\binv[- ]?[\w-]{4,}\b/i, 0.95, "Invoice number pattern detected (INV-...)"],
  [
    "BILLING",
    /\b(create\s*bill|make\s*bill|naya\s*bill|bill\s*(bana|banao)|new\s*bill|generate\s*(bill|invoice))\b/i,
    0.95,
    "Bill creation intent detected",
  ],
  [
    "BILLING",
    /\b(payment\s*(receive|mil|aya|aaya|liya)|paisa\s*(mil|aya|aaya|liya))\b/i,
    0.85,
    "Payment received → Billing",
  ],
  [
    "BILLING",
    /\b(bill\s*(total|amount|kitna)|total\s*bill)\b/i,
    0.85,
    "Bill total inquiry → Billing",
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPPLIER — vendor, supplier, distributor, kharidi wala
  // ═══════════════════════════════════════════════════════════════════════════
  [
    "SUPPLIER",
    /\b(supplier|vendor|distributor|dealer|kharidi\s*wala|maal\s*wala|wholesaler)\b/i,
    0.95,
    "Supplier/vendor keyword detected",
  ],
  [
    "SUPPLIER",
    /\b(purchase\s*(order|bill|entry|record|kiya)|kharid(a|i|e)?)\b/i,
    0.85,
    "Purchase/buy action → Supplier",
  ],
  [
    "SUPPLIER",
    /\b(supplier\s*(ka|ki|ke|dues?|payment|list|number|contact))\b/i,
    0.9,
    "Supplier detail query → Supplier",
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORTS — analytics, trends, summaries, top/best, profit, loss
  // ═══════════════════════════════════════════════════════════════════════════
  [
    "REPORTS",
    /\b(report|analytics|analysis|trend|graph|chart|statistics|stats)\b/i,
    0.95,
    "Report/analytics keyword detected",
  ],
  [
    "REPORTS",
    /\b(top\s*(sell|product|item|customer|bik)|best\s*sell|sabse\s*(zyada|jyada))\b/i,
    0.95,
    "Top/best ranking query → Reports",
  ],
  [
    "REPORTS",
    /\b(profit|munafa|margin|kamai|earning|fayda|loss|nuksan|ghata)\b/i,
    0.9,
    "Profit/loss keyword → Reports",
  ],
  [
    "REPORTS",
    /\b(sale(s)?\s*(report|summary|total|aaj|today|month|week|kal)|aaj\s*(ki|ka)\s*sale|bikri)\b/i,
    0.95,
    "Sales report query → Reports",
  ],
  [
    "REPORTS",
    /\b(today('?s)?\s*sale|monthly\s*sale|weekly\s*sale|daily\s*sale)\b/i,
    0.9,
    "Time-based sales query → Reports",
  ],
  [
    "REPORTS",
    /\b(kitna\s*(bik|sell|bech)|bech(a|e|i)\s*(aaj|kal)?)\b/i,
    0.85,
    "Hindi sales inquiry → Reports",
  ],
  ["REPORTS", /\b(purchase\s*(report|summary|total))\b/i, 0.9, "Purchase report → Reports"],
  ["REPORTS", /\b(collection|recovery|vasuli|wapsi)\b/i, 0.8, "Collection/recovery → Reports"],

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOMER — customer lookup, search, add, details
  // ═══════════════════════════════════════════════════════════════════════════
  ["CUSTOMER", /\b(customer|grahak|client|buyer|khariddar)\b/i, 0.9, "Customer keyword detected"],
  [
    "CUSTOMER",
    /\b(add|create|naya|new|banao|bana)\b.*\b(customer|grahak|client)\b/i,
    0.95,
    "Create customer intent detected",
  ],
  [
    "CUSTOMER",
    /\b(customer|grahak)\b.*\b(search|find|dhundh|dekh|kaun|list|detail|info)\b/i,
    0.9,
    "Customer search intent detected",
  ],
  [
    "CUSTOMER",
    /\b(customer|grahak)\b.*\b(history|purana|record|bill)\b/i,
    0.85,
    "Customer history → Customer",
  ],
  [
    "CUSTOMER",
    /\b(customer|grahak)\b.*\b(balance|due|baaki|baki)\b/i,
    0.85,
    "Customer balance → Customer (may also route to Khata)",
  ],
  // Vehicle number pattern → customer lookup
  [
    "CUSTOMER",
    /\b[A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{1,4}\b/i,
    0.85,
    "Vehicle number pattern → Customer lookup",
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // INVENTORY — product, stock, price, item, maal, part
  // This is the broadest category — kept last among business modules
  // ═══════════════════════════════════════════════════════════════════════════
  [
    "INVENTORY",
    /\b(low\s*stock|kam\s*stock|kam\s*maal|stock\s*kam|running\s*low|reorder|re-?order)\b/i,
    0.95,
    "Low stock alert query → Inventory",
  ],
  [
    "INVENTORY",
    /\b(out\s*of\s*stock|khatam|zero\s*stock|stock\s*nahi|finish|band\s*ho\s*gaya)\b/i,
    0.95,
    "Out of stock query → Inventory",
  ],
  [
    "INVENTORY",
    /\b(add|create|naya|new|daal|jod)\b.*\b(product|item|part|stock|maal)\b/i,
    0.95,
    "Add product intent → Inventory",
  ],
  [
    "INVENTORY",
    /\b(update|change|badal|set)\b.*\b(price|rate|stock|quantity|daam|dam)\b/i,
    0.9,
    "Update price/stock intent → Inventory",
  ],
  [
    "INVENTORY",
    /\b(product|item|part|spare|spare\s*part)\b/i,
    0.8,
    "Product/part keyword → Inventory",
  ],
  [
    "INVENTORY",
    /\b(price|rate|daam|dam|kimat|keemat|kitne\s*ka|mrp|cost)\b/i,
    0.85,
    "Price inquiry → Inventory",
  ],
  [
    "INVENTORY",
    /\b(stock|maal|quantity|inventory|godam|available|stk)\b/i,
    0.8,
    "Stock inquiry → Inventory",
  ],
  [
    "INVENTORY",
    /\b(available|milega|mil\s*jayega|hai\s*kya|rakha\s*hai|milta\s*hai)\b/i,
    0.7,
    "Availability check → Inventory",
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL_AI — advice, how-to, help, tips, greetings
  // ═══════════════════════════════════════════════════════════════════════════
  [
    "GENERAL_AI",
    /\b(help|madad|sahayata|how\s*to|kaise|kaise\s*karu|guide|tutorial|step|sikha)\b/i,
    0.8,
    "Help/how-to keyword → General AI",
  ],
  [
    "GENERAL_AI",
    /\b(advice|suggest|improve|tips?|idea|sujhav|salah|recommend)\b/i,
    0.85,
    "Advice/suggestion keyword → General AI",
  ],
  [
    "GENERAL_AI",
    /\b(hello|hi|hey|namaste|namaskar|good\s*(morning|evening|afternoon|night)|shukriya|thank|dhanyavaad)\b/i,
    0.9,
    "Greeting/pleasantry → General AI",
  ],
  [
    "GENERAL_AI",
    /\b(gst|tax|license|registration|compliance|government|sarkari)\b/i,
    0.75,
    "Tax/compliance query → General AI",
  ],
  [
    "GENERAL_AI",
    /\b(what\s*is|kya\s*hai|explain|samjhao|batao\s*kya|meaning)\b/i,
    0.7,
    "Explanation request → General AI",
  ],
];

// ─── Short Query Fallback ───────────────────────────────────────────────────
//
// For very short queries (1-3 words) with no keyword match,
// assume the user is searching for a product.
//

const SHORT_QUERY_MAX_WORDS = 3;

// ─── Main Router Function ───────────────────────────────────────────────────

/**
 * Routes a user query to the appropriate business module.
 *
 * - Deterministic: pure regex, no LLM, no async, no DB.
 * - Fast: <1ms on any hardware.
 * - Supports: English, Hindi, Hinglish, common typos.
 *
 * @param text - Raw user message text
 * @returns RouteResult with module, confidence, and reason
 */
export function routeQuery(text: string): RouteResult {
  const normalized = text
    .toLowerCase()
    .replace(/[?!.,;:'"(){}[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return {
      module: "UNKNOWN",
      confidence: 0,
      reason: "Empty input",
    };
  }

  // Run through rules in priority order — first match wins
  for (const [module, pattern, confidence, reason] of RULES) {
    if (pattern.test(normalized)) {
      return { module, confidence, reason };
    }
  }

  // Short queries (1-3 words) with no keyword match → likely a product name
  const wordCount = normalized.split(/\s+/).length;
  if (wordCount <= SHORT_QUERY_MAX_WORDS && normalized.length >= 2) {
    return {
      module: "INVENTORY",
      confidence: 0.6,
      reason: "Short query with no keyword match — assumed product search",
    };
  }

  // Longer unmatched queries → General AI (conversational)
  if (wordCount > SHORT_QUERY_MAX_WORDS) {
    return {
      module: "GENERAL_AI",
      confidence: 0.5,
      reason: "No business keyword matched — routed to General AI",
    };
  }

  return {
    module: "UNKNOWN",
    confidence: 0.3,
    reason: "Could not classify the query",
  };
}

/**
 * Decides whether to use the fast deterministic path or fallback to LLM.
 * LLM is used when:
 * 1. The router has low confidence (< 0.8)
 * 2. The query is complex (contains numbers, likely a write operation)
 * 3. The query has multiple intents (e.g., "price aur stock batao")
 */
export function shouldUseLLM(text: string, routeResult: RouteResult): boolean {
  // Always use fast path for exact confirm/cancel
  if (routeResult.module === "CONFIRM_CANCEL") return false;

  // Use LLM if router is uncertain
  if (routeResult.confidence < 0.8) return true;

  // Use LLM for anything in GENERAL_AI
  if (routeResult.module === "GENERAL_AI") return true;

  const lower = text.toLowerCase();

  // Use LLM if it looks like a write/update operation (numbers + action verbs)
  if (
    /\d/.test(lower) &&
    /\b(do|karo|daal|nikal|kam|jod|set|update|change|badal|naya|new)\b/.test(lower)
  ) {
    return true;
  }

  // Use LLM for compound queries
  if (/\b(aur|and)\b/.test(lower)) {
    return true;
  }

  // Fast path is fine for simple reads
  return false;
}
