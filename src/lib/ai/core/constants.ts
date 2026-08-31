/**
 * AI Core — Constants
 *
 * Shared constants for the AI system.
 * Filler words, confirmation/cancellation patterns,
 * Hindi number map, and preserved brand terms.
 */

// ─── Filler Words ───────────────────────────────────────────────────────────
// These conversational fillers are stripped during entity extraction.
// IMPORTANT: This list must NOT include words that could be part of
// product names, brands, models, or technical terms.

export const FILLER_WORDS = new Set([
  // Hindi conversational
  "bhai",
  "bhaiya",
  "bro",
  "yaar",
  "sahab",
  "saab",
  "ji",
  "sir",
  "boss",
  // Politeness
  "please",
  "plz",
  "pls",
  "zara",
  "thoda",
  "kindly",
  // Imperative helpers
  "batao",
  "bata",
  "bataiye",
  "batana",
  "dikhao",
  "dikha",
  "dikhana",
  "sunao",
  "bolna",
  "bol",
  // Pronouns / possessives that don't carry entity meaning
  "mujhe",
  "mera",
  "meri",
  "mere",
  "hamara",
  "hamari",
  "hamare",
  "apna",
  "apni",
  "apne",
  "uska",
  "uski",
  "unka",
  "unki",
  // Question particles
  "kya",
  "kab",
  "kaise",
  "kyun",
  "kyu",
  // Common verb forms (safe to strip — not product names)
  "hai",
  "he",
  "h",
  "hain",
  "tha",
  "thi",
  "the",
  "hoga",
  "hogi",
  "honge",
  "hoti",
  "hota",
  // Connectors
  "aur",
  "ya",
  "bhi",
  "toh",
  "to",
  "phir",
  "fir",
  "lekin",
  "par",
  "magar",
  // English stop words (safe subset)
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "of",
  "for",
  "in",
  "on",
  "at",
  "with",
  "from",
  "by",
  "about",
  "how",
  "much",
  "many",
  "does",
  "do",
  "did",
  "can",
  "will",
  "would",
  "should",
  "could",
  "its",
  "it",
  "this",
  "that",
  "these",
  "those",
  "my",
  "your",
  "our",
  "me",
  "us",
  "them",
]);

// ─── Preserved Terms ────────────────────────────────────────────────────────
// These words MUST NOT be stripped even if they appear in filler lists.
// They carry meaning for product/brand/model identification.

export const PRESERVED_TERMS = new Set([
  // Positional / directional (important for auto parts)
  "front",
  "rear",
  "left",
  "right",
  "upper",
  "lower",
  "inner",
  "outer",
  "top",
  "bottom",
  "side",
  // Size / capacity
  "small",
  "medium",
  "large",
  "xl",
  "mini",
  "full",
  "half",
  // Measurements
  "ml",
  "liter",
  "litre",
  "kg",
  "gm",
  "gram",
  "mm",
  "cm",
  "inch",
  // Auto parts specific
  "brake",
  "pad",
  "disc",
  "drum",
  "filter",
  "oil",
  "coolant",
  "belt",
  "chain",
  "clutch",
  "gear",
  "bearing",
  "seal",
  "gasket",
  "plug",
  "wire",
  "cable",
  "hose",
  "pipe",
  "pump",
  "motor",
  "coil",
  "relay",
  "switch",
  "sensor",
  "bulb",
  "lamp",
  "mirror",
  "wiper",
  "horn",
  "fuse",
  // Vehicle references
  "year",
  "model",
  "variant",
  "type",
  // Numeric qualifiers
  "piece",
  "pieces",
  "pcs",
  "nos",
  "set",
  "pair",
  "pack",
  "box",
  "dozen",
]);

// ─── Confirmation Words ─────────────────────────────────────────────────────

export const CONFIRM_WORDS =
  /\b(haan|ha|haa|yes|y|confirm|karo|kar\s*do|theek|thik|ok|okay|sure|done|bilkul|zaroor|agreed|sahi)\b/i;

// ─── Cancellation Words ─────────────────────────────────────────────────────

export const CANCEL_WORDS =
  /\b(nahi|nah|nahin|no|n|cancel|mat\s*karo|rehne\s*do|rahne\s*do|chhod\s*do|chod\s*do|band\s*karo|ruk|stop|don'?t|nope|abort)\b/i;

// ─── Hindi Number Map ───────────────────────────────────────────────────────

export const HINDI_NUMBERS: Record<string, number> = {
  ek: 1,
  one: 1,
  do: 2,
  don: 2,
  two: 2,
  teen: 3,
  tin: 3,
  three: 3,
  char: 4,
  chaar: 4,
  four: 4,
  panch: 5,
  paanch: 5,
  five: 5,
  chhe: 6,
  cheh: 6,
  six: 6,
  saat: 7,
  sat: 7,
  seven: 7,
  aath: 8,
  aat: 8,
  eight: 8,
  nau: 9,
  nine: 9,
  das: 10,
  ten: 10,
  gyarah: 11,
  barah: 12,
  terah: 13,
  chaudah: 14,
  pandrah: 15,
  solah: 16,
  satrah: 17,
  atharah: 18,
  unnis: 19,
  bees: 20,
  bis: 20,
  pachchis: 25,
  tees: 30,
  chalis: 40,
  pachas: 50,
  saath: 60,
  sattar: 70,
  assi: 80,
  nabbe: 90,
  sau: 100,
  hazaar: 1000,
  hazar: 1000,
  lakh: 100000,
};

// ─── Intent → Action Mapping ────────────────────────────────────────────────

import type { AIIntent, AIAction } from "./types";

/** Maps an intent to its default action classification. */
export function getActionForIntent(intent: AIIntent): AIAction {
  switch (intent) {
    // READ intents
    case "PRODUCT_SEARCH":
    case "PRODUCT_DETAILS":
    case "PRODUCT_PRICE":
    case "PRODUCT_PURCHASE_PRICE":
    case "PRODUCT_STOCK":
    case "PRODUCT_CATEGORY":
    case "PRODUCT_HISTORY":
    case "PRODUCT_PRICE_AND_STOCK":
    case "CUSTOMER_SEARCH":
    case "CUSTOMER_DETAILS":
    case "CUSTOMER_BALANCE":
    case "CUSTOMER_HISTORY":
    case "CUSTOMER_STATEMENT":
    case "PAYMENT_READ":
    case "CREDIT_READ":
    case "DEBIT_READ":
    case "OUTSTANDING_READ":
    case "OVERDUE_READ":
    case "INVENTORY_SUMMARY":
    case "LOW_STOCK":
    case "OUT_OF_STOCK":
    case "FAST_MOVING":
    case "SLOW_MOVING":
    case "DEAD_STOCK":
    case "STOCK_VALUE":
    case "SALES_TODAY":
    case "SALES_YESTERDAY":
    case "SALES_WEEK":
    case "SALES_MONTH":
    case "SALES_CUSTOM_RANGE":
    case "SALES_COMPARISON":
    case "TOP_SELLING_PRODUCTS":
    case "TOP_CUSTOMERS":
    case "INVOICE_SEARCH":
    case "INVOICE_DETAILS":
    case "BILL_STATUS":
    case "EXPENSE_READ":
    case "EXPENSE_SUMMARY":
    case "SUPPLIER_SEARCH":
    case "SUPPLIER_DETAILS":
    case "SUPPLIER_HISTORY":
    case "SUPPLIER_DUES":
    case "SALES_REPORT":
    case "PROFIT_REPORT":
    case "INVENTORY_REPORT":
    case "BUSINESS_SUMMARY":
    case "PURCHASE_REPORT":
      return "READ";

    // CREATE intents
    case "PRODUCT_CREATE":
    case "CUSTOMER_CREATE":
    case "PAYMENT_CREATE":
    case "CREDIT_CREATE":
    case "DEBIT_CREATE":
    case "DRAFT_INVOICE_CREATE":
    case "EXPENSE_CREATE":
      return "CREATE";

    // UPDATE intents
    case "PRODUCT_UPDATE":
    case "PRODUCT_PRICE_UPDATE":
    case "PRODUCT_NAME_UPDATE":
    case "PRODUCT_CATEGORY_UPDATE":
    case "PRODUCT_SKU_UPDATE":
    case "PRODUCT_STOCK_ADD":
    case "PRODUCT_STOCK_REMOVE":
    case "PRODUCT_STOCK_SET":
    case "CUSTOMER_UPDATE":
    case "EXPENSE_UPDATE":
      return "UPDATE";

    // DELETE intents
    case "PRODUCT_DELETE":
    case "CUSTOMER_DELETE":
    case "EXPENSE_DELETE":
      return "DELETE";

    // ARCHIVE intents
    case "PRODUCT_ARCHIVE":
    case "CUSTOMER_ARCHIVE":
      return "ARCHIVE";

    // Conversational
    case "CONFIRM":
      return "CONFIRM";
    case "CANCEL":
      return "CANCEL";
    case "CLARIFICATION":
      return "CLARIFY";

    // Suggestions / Analysis
    case "HELP":
    case "GREETING":
    case "GENERAL_CHAT":
    case "UNKNOWN":
    default:
      return "READ";
  }
}

// ─── Confirmation TTL ───────────────────────────────────────────────────────

/** Pending actions expire after 60 seconds. */
export const PENDING_ACTION_TTL_MS = 60_000;

/** Conversation context expires after 30 minutes. */
export const CONTEXT_TTL_MS = 30 * 60 * 1000;

export const REQUIRES_CONFIRMATION_INTENTS = new Set([
  "PRODUCT_CREATE",
  "CUSTOMER_CREATE",
  "PRODUCT_UPDATE",
  "PRODUCT_PRICE_UPDATE",
  "PRODUCT_NAME_UPDATE",
  "PRODUCT_CATEGORY_UPDATE",
  "PRODUCT_SKU_UPDATE",
  "PRODUCT_STOCK_ADD",
  "PRODUCT_STOCK_REMOVE",
  "PRODUCT_STOCK_SET",
  "CUSTOMER_UPDATE",
  "PRODUCT_DELETE",
  "CUSTOMER_DELETE",
  "PAYMENT_CREATE",
  "CREDIT_CREATE",
  "DEBIT_CREATE",
  "EXPENSE_CREATE",
  "EXPENSE_UPDATE",
  "EXPENSE_DELETE",
]);
