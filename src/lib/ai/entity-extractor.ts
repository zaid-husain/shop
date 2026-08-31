/**
 * Entity Extractor
 *
 * Extracts structured entities (product names, quantities, customer names,
 * invoice numbers, phone numbers, vehicle numbers) from raw user text
 * using deterministic parsing. ZERO LLM calls.
 * Used exclusively for the Fast Path.
 */

import type { Intent } from "./intent-detector";
import { normalizeForEntityExtraction } from "./core/normalizer";
import { HINDI_NUMBERS } from "./core/constants";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

export interface ExtractedEntities {
  productQuery: string | null;
  quantity: number | null;
  customerQuery: string | null;
  invoiceNumber: string | null;
  phoneNumber: string | null;
  vehicleNumber: string | null;
  priceAmount: number | null;
  dateRange: DateRange | null;
}

// ─── Extractors ─────────────────────────────────────────────────────────────

function extractInvoiceNumber(text: string): string | null {
  const m = text.match(/\b(inv[- ]?[\w-]{4,}|bill\s+\d+)\b/i);
  return m ? m[1].toUpperCase() : null;
}

function extractPhoneNumber(text: string): string | null {
  const m = text.match(/\b(?:\+91|91)?\s?(\d{10})\b/);
  return m ? m[1] : null;
}

function extractVehicleNumber(text: string): string | null {
  const m = text.match(/\b([A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{1,4})\b/i);
  return m ? m[1].replace(/\s+/g, "").toUpperCase() : null;
}

function extractQuantity(text: string): { quantity: number | null; remaining: string } {
  const words = text.split(/\s+/);
  let quantity: number | null = null;
  const remaining: string[] = [];

  for (const word of words) {
    const lower = word.toLowerCase();
    if (quantity === null && HINDI_NUMBERS[lower] !== undefined) {
      quantity = HINDI_NUMBERS[lower];
    } else if (quantity === null && /^\d+(\.\d+)?$/.test(word)) {
      quantity = parseFloat(word);
    } else {
      remaining.push(word);
    }
  }
  return { quantity, remaining: remaining.join(" ") };
}

function extractPrice(text: string): { price: number | null; remaining: string } {
  // Extract patterns like "₹400", "400 rs", "price 400", "400" if explicitly tied to price updates
  const priceRegex =
    /\b(?:price|rate|rs|rupees?|₹)\s*(\d+(?:\.\d+)?)\b|\b(\d+(?:\.\d+)?)\s*(?:rs|rupees?|₹)\b/i;
  const match = text.match(priceRegex);

  if (match) {
    const val = parseFloat(match[1] || match[2]);
    const remaining = text.replace(match[0], " ").trim();
    return { price: val, remaining };
  }
  return { price: null, remaining: text };
}

export function extractDateRange(text: string): { dateRange: DateRange | null; remaining: string } {
  const normalized = text.toLowerCase();
  let start: Date;
  let end: Date;
  let label: string;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Parse custom range "1 Aug se 15 Aug"
  const customRangeMatch = normalized.match(
    /\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(?:se|to)\s*(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/,
  );

  if (customRangeMatch) {
    const startDay = parseInt(customRangeMatch[1]);
    const startMonth = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(customRangeMatch[2]);
    const endDay = parseInt(customRangeMatch[3]);
    const endMonth = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(customRangeMatch[4]);

    start = new Date(today.getFullYear(), startMonth, startDay);
    end = new Date(today.getFullYear(), endMonth, endDay);
    end.setHours(23, 59, 59, 999);
    label = `${startDay} ${customRangeMatch[2]} to ${endDay} ${customRangeMatch[4]}`;

    return {
      dateRange: { start, end, label },
      remaining: text.replace(customRangeMatch[0], " ").replace(/\s+/g, " ").trim(),
    };
  }

  // Parse specific date "15 August"
  const specificDateMatch = normalized.match(
    /\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/,
  );

  if (specificDateMatch) {
    const day = parseInt(specificDateMatch[1]);
    const month = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(specificDateMatch[2]);
    start = new Date(today.getFullYear(), month, day);
    end = new Date(start);
    end.setHours(23, 59, 59, 999);
    label = `${day} ${specificDateMatch[2]}`;

    return {
      dateRange: { start, end, label },
      remaining: text.replace(specificDateMatch[0], " ").replace(/\s+/g, " ").trim(),
    };
  }

  // Relative dates
  if (/\b(aaj|today)\b/.test(normalized)) {
    start = new Date(today);
    end = new Date(today);
    end.setHours(23, 59, 59, 999);
    label = "Aaj";
  } else if (/\b(kal|yesterday)\b/.test(normalized)) {
    start = new Date(today);
    start.setDate(start.getDate() - 1);
    end = new Date(start);
    end.setHours(23, 59, 59, 999);
    label = "Kal";
  } else if (/\b(parso|day before yesterday)\b/.test(normalized)) {
    start = new Date(today);
    start.setDate(start.getDate() - 2);
    end = new Date(start);
    end.setHours(23, 59, 59, 999);
    label = "Parso";
  } else if (/\b(pichle 7 din|last 7 days)\b/.test(normalized)) {
    start = new Date(today);
    start.setDate(start.getDate() - 7);
    end = new Date(today);
    end.setHours(23, 59, 59, 999);
    label = "Last 7 days";
  } else if (/\b(pichle 30 din|last 30 days)\b/.test(normalized)) {
    start = new Date(today);
    start.setDate(start.getDate() - 30);
    end = new Date(today);
    end.setHours(23, 59, 59, 999);
    label = "Last 30 days";
  } else if (/\b(is hafte|this week)\b/.test(normalized)) {
    start = new Date(today);
    start.setDate(start.getDate() - start.getDay());
    end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    label = "Is hafte";
  } else if (/\b(pichle hafte|last week)\b/.test(normalized)) {
    start = new Date(today);
    start.setDate(start.getDate() - start.getDay() - 7);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    label = "Pichle hafte";
  } else if (/\b(is mahine|this month)\b/.test(normalized)) {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    label = "Is mahine";
  } else if (/\b(pichle mahine|last month)\b/.test(normalized)) {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    end = new Date(today.getFullYear(), today.getMonth(), 0);
    end.setHours(23, 59, 59, 999);
    label = "Pichle mahine";
  } else {
    return { dateRange: null, remaining: text };
  }

  const remaining = text
    .replace(
      /\b(aaj|today|kal|yesterday|parso|day before yesterday|pichle 7 din|last 7 days|pichle 30 din|last 30 days|is mahine|this month|pichle mahine|last month|is hafte|this week|pichle hafte|last week)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  return { dateRange: { start, end, label }, remaining };
}

// ─── Main Extractor ─────────────────────────────────────────────────────────

export function extractEntities(text: string, intent: Intent): ExtractedEntities {
  const result: ExtractedEntities = {
    productQuery: null,
    quantity: null,
    customerQuery: null,
    invoiceNumber: null,
    phoneNumber: null,
    vehicleNumber: null,
    priceAmount: null,
    dateRange: null,
  };

  result.invoiceNumber = extractInvoiceNumber(text);
  result.phoneNumber = extractPhoneNumber(text);
  result.vehicleNumber = extractVehicleNumber(text);

  // Extract Date Range
  const { dateRange, remaining: textWithoutDate } = extractDateRange(text);
  result.dateRange = dateRange;

  // Extract price BEFORE cleaning words
  const { price, remaining: textWithoutPrice } = extractPrice(textWithoutDate);
  result.priceAmount = price;

  // Use the new powerful normalizer for entity extraction
  // This automatically strips filler words while preserving brand names
  const entityText = normalizeForEntityExtraction(textWithoutPrice);

  const { quantity, remaining } = extractQuantity(entityText);
  result.quantity = quantity;

  const isCustomerIntent = [
    "CUSTOMER_SEARCH",
    "CUSTOMER_BALANCE",
    "CUSTOMER_HISTORY",
    "CREATE_CUSTOMER",
    "UPDATE_CUSTOMER",
    "DELETE_CUSTOMER",
    "PAYMENT_CREATE",
    "CREDIT_CREATE",
    "DEBIT_CREATE",
  ].includes(intent);

  const isProductIntent = [
    "PRODUCT_PRICE",
    "PRODUCT_STOCK",
    "PRODUCT_PRICE_AND_STOCK",
    "PRODUCT_AVAILABILITY",
    "PRODUCT_SEARCH",
    "ADD_PRODUCT",
    "UPDATE_PRICE",
    "UPDATE_STOCK",
    "PRODUCT_STOCK_ADD",
    "PRODUCT_STOCK_SET",
    "FOLLOWUP_QUANTITY",
    "FOLLOWUP_STOCK",
    "FOLLOWUP_PRICE",
    "STOCK_REDUCE",
    "DELETE_PRODUCT",
  ].includes(intent);

  if (isCustomerIntent && remaining) {
    result.customerQuery = remaining;
  } else if (isProductIntent && remaining) {
    result.productQuery = remaining;
  } else if (remaining) {
    result.productQuery = remaining;
    result.customerQuery = remaining;
  }

  return result;
}
