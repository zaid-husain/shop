/**
 * AI Core — LLM Structured Understanding
 *
 * The brain of Phase 3. Uses Groq (llama-3.3-70b-versatile) with
 * Vercel AI SDK's structured tool calling to extract:
 *   - Intent
 *   - Action classification (READ/WRITE/DELETE)
 *   - Entity type and query
 *   - Parameters (price, quantity, operation)
 *   - Date ranges
 *   - Confidence
 *   - Clarification/confirmation needs
 *
 * The LLM ONLY understands. It NEVER accesses the database.
 * It NEVER generates SQL. It NEVER controls execution.
 */

import { generateObject } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";
import type { AIStructuredOutput, AIConversationContext } from "./types";

// ─── Zod Schema for Structured Output ───────────────────────────────────────

const StructuredOutputSchema = z.object({
  intent: z
    .enum([
      "PRODUCT_SEARCH",
      "PRODUCT_DETAILS",
      "PRODUCT_PRICE",
      "PRODUCT_PURCHASE_PRICE",
      "PRODUCT_STOCK",
      "PRODUCT_CATEGORY",
      "PRODUCT_HISTORY",
      "PRODUCT_PRICE_AND_STOCK",
      "PRODUCT_CREATE",
      "PRODUCT_UPDATE",
      "PRODUCT_DELETE",
      "PRODUCT_ARCHIVE",
      "PRODUCT_PRICE_UPDATE",
      "PRODUCT_NAME_UPDATE",
      "PRODUCT_CATEGORY_UPDATE",
      "PRODUCT_SKU_UPDATE",
      "PRODUCT_STOCK_ADD",
      "PRODUCT_STOCK_REMOVE",
      "PRODUCT_STOCK_SET",
      "CUSTOMER_SEARCH",
      "CUSTOMER_DETAILS",
      "CUSTOMER_BALANCE",
      "CUSTOMER_HISTORY",
      "CUSTOMER_STATEMENT",
      "CUSTOMER_CREATE",
      "CUSTOMER_UPDATE",
      "CUSTOMER_DELETE",
      "CUSTOMER_ARCHIVE",
      "PAYMENT_READ",
      "PAYMENT_CREATE",
      "CREDIT_READ",
      "CREDIT_CREATE",
      "DEBIT_READ",
      "DEBIT_CREATE",
      "OUTSTANDING_READ",
      "OVERDUE_READ",
      "INVENTORY_SUMMARY",
      "LOW_STOCK",
      "OUT_OF_STOCK",
      "FAST_MOVING",
      "SLOW_MOVING",
      "DEAD_STOCK",
      "STOCK_VALUE",
      "SALES_TODAY",
      "SALES_YESTERDAY",
      "SALES_WEEK",
      "SALES_MONTH",
      "SALES_CUSTOM_RANGE",
      "SALES_COMPARISON",
      "TOP_SELLING_PRODUCTS",
      "TOP_CUSTOMERS",
      "INVOICE_SEARCH",
      "INVOICE_DETAILS",
      "DRAFT_INVOICE_CREATE",
      "BILL_STATUS",
      "EXPENSE_READ",
      "EXPENSE_CREATE",
      "EXPENSE_UPDATE",
      "EXPENSE_DELETE",
      "EXPENSE_SUMMARY",
      "SUPPLIER_SEARCH",
      "SUPPLIER_DETAILS",
      "SUPPLIER_HISTORY",
      "SUPPLIER_DUES",
      "SALES_REPORT",
      "PROFIT_REPORT",
      "INVENTORY_REPORT",
      "BUSINESS_SUMMARY",
      "PURCHASE_REPORT",
      "HELP",
      "GREETING",
      "CONFIRM",
      "CANCEL",
      "CLARIFICATION",
      "GENERAL_CHAT",
      "UNKNOWN",
    ])
    .describe("The detected intent of the user's request"),
  action: z
    .enum([
      "READ",
      "CREATE",
      "UPDATE",
      "DELETE",
      "ARCHIVE",
      "SEARCH",
      "ANALYZE",
      "SUGGEST",
      "CONFIRM",
      "CANCEL",
      "CLARIFY",
    ])
    .describe("The action classification"),
  entityType: z
    .enum([
      "product",
      "customer",
      "invoice",
      "supplier",
      "expense",
      "payment",
      "ledger",
      "date",
      "unknown",
    ])
    .describe("The type of business entity being referenced"),
  entityQuery: z
    .string()
    .nullable()
    .describe(
      "The CLEAN entity search term extracted from the query. E.g. 'Servo Oil' from 'bhai servo oil ka price kya hai'. NEVER include filler words, action verbs, or the full sentence.",
    ),
  parameters: z
    .record(z.string(), z.unknown())
    .describe(
      "Action parameters. For price updates: {selling_price: number}. For stock: {quantity: number, operation: 'ADD'|'REMOVE'|'SET'}. For payments: {amount: number, payment_method: string}.",
    ),
  dateRange: z
    .object({
      startDate: z.string().describe("ISO 8601 start date"),
      endDate: z.string().describe("ISO 8601 end date"),
      label: z.string().describe("Human-readable label like 'Aaj', 'Kal', 'Last 7 days'"),
    })
    .nullable()
    .describe("Parsed date range if the query involves time"),
  confidence: z.number().min(0).max(1).describe("0-1 confidence in the interpretation"),
  needsClarification: z.boolean().describe("True if the request is ambiguous and needs more info"),
  needsConfirmation: z
    .boolean()
    .describe("True if this is a WRITE/DELETE/financial action that needs user confirmation"),
  secondaryIntent: z
    .enum([
      "PRODUCT_SEARCH",
      "PRODUCT_DETAILS",
      "PRODUCT_PRICE",
      "PRODUCT_PURCHASE_PRICE",
      "PRODUCT_STOCK",
      "PRODUCT_CATEGORY",
      "PRODUCT_HISTORY",
      "PRODUCT_PRICE_AND_STOCK",
      "CUSTOMER_SEARCH",
      "CUSTOMER_DETAILS",
      "CUSTOMER_BALANCE",
      "CUSTOMER_HISTORY",
      "CUSTOMER_STATEMENT",
      "LOW_STOCK",
      "OUT_OF_STOCK",
      "SALES_TODAY",
      "SALES_YESTERDAY",
      "SALES_WEEK",
      "SALES_MONTH",
      "TOP_SELLING_PRODUCTS",
      "TOP_CUSTOMERS",
      "SALES_REPORT",
      "PROFIT_REPORT",
      "EXPENSE_SUMMARY",
      "SUPPLIER_DUES",
      "UNKNOWN",
    ])
    .nullable()
    .describe("Secondary intent for multi-intent requests like 'price aur stock batao'"),
});

// ─── System Prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(context: AIConversationContext | null): string {
  const contextBlock = context
    ? `
CURRENT CONVERSATION CONTEXT:
- Active product: ${context.activeProductName || "none"}
- Active customer: ${context.activeCustomerName || "none"}  
- Active topic: ${context.activeTopic || "none"}
- Last intent: ${context.lastIntent || "none"}

If the user's message is a follow-up (e.g. "stock?", "600 kar do", "last payment?"), 
use the context to fill in the entity. For example, if activeProduct is "Servo Oil" 
and user says "stock?", the entityQuery should be "Servo Oil".
`
    : "";

  return `You are a structured language understanding engine for an Indian auto parts shop management app.

Your ONLY job is to analyze the user's message and extract structured information.
You do NOT generate responses, advice, or conversation. You ONLY extract structure.

RULES:
1. The user speaks Hindi, Hinglish, English, or a mix. Understand all.
2. Extract the CLEAN entity name — strip filler words (bhai, yaar, please, zara, batao, etc.)
   but PRESERVE brand names, model names, part descriptions (front, rear, brake, pad, etc.)
3. For product queries: entityQuery should be JUST the product name (e.g. "Servo Oil", not "bhai servo oil ka price kya hai")
4. For customer queries: entityQuery should be JUST the customer name (e.g. "Rahul", not "rahul ka hisab bata")
5. Set needsConfirmation=true for ALL write operations (CREATE, UPDATE, DELETE, financial transactions)
6. Set needsClarification=true when the request is too vague to determine the entity or action
7. For "servo oil ko 600 ka kar do": intent=PRODUCT_PRICE_UPDATE, entityQuery="Servo Oil", parameters={selling_price: 600}
8. For "servo me 5 aur daal do": intent=PRODUCT_STOCK_ADD, entityQuery="Servo", parameters={quantity: 5, operation: "ADD"}
9. For "servo se 5 kam kar": intent=PRODUCT_STOCK_REMOVE, parameters={quantity: 5, operation: "REMOVE"}
10. For "servo ka stock 20 kar do": intent=PRODUCT_STOCK_SET, parameters={quantity: 20, operation: "SET"}
11. For date queries: Parse Hindi dates (aaj=today, kal=yesterday, parso=day before yesterday, 
    pichle 7 din=last 7 days, is hafte=this week, pichle hafte=last week, is mahine=this month, pichle mahine=last month)
12. For multi-intent: "price aur stock batao" → intent=PRODUCT_PRICE, secondaryIntent=PRODUCT_STOCK
13. For payment received: "Rahul se 500 mila" → intent=PAYMENT_CREATE, entityQuery="Rahul", parameters={amount: 500}
14. For "servo ka naam change kar": intent=PRODUCT_NAME_UPDATE, entityQuery="Servo Oil"
15. For "servo category update karo": intent=PRODUCT_CATEGORY_UPDATE, entityQuery="Servo Oil"
16. For "servo ka sku change karo": intent=PRODUCT_SKU_UPDATE, entityQuery="Servo Oil"
17. Confidence should reflect how certain you are. High (>0.8) for clear requests, low (<0.5) for vague ones.
18. NEVER set entityQuery to the full input sentence. Extract ONLY the entity name.
19. For "haan", "yes" etc. with no context → intent=CONFIRM, action=CONFIRM, confidence=0.9
20. For "nahi", "cancel" etc. → intent=CANCEL, action=CANCEL, confidence=0.9

HINDI/HINGLISH VOCABULARY:
- price/rate/daam/dam/kimat/keemat/bhav → product price
- stock/maal/quantity → product stock
- kitne ka/kitna hai → price inquiry
- hisab/khata/baaki/udhar/udhaar → customer balance/ledger
- daal do/add karo → stock add
- nikal/kam kar/ghata → stock remove
- kar do/set karo → set value
- hatao/delete/nikaal do → delete
- banao/add/naya → create
- badal do/update → update
- aaj/today, kal/yesterday, parso/day before yesterday
- is hafte/this week, pichle hafte/last week
- is mahine/this month, pichle mahine/last month
- bikri/sale, munafa/profit, ghata/loss
${contextBlock}`;
}

// ─── Main Understanding Function ────────────────────────────────────────────

/**
 * Uses LLM structured output to understand a user's natural language request.
 *
 * @param userText - The raw user message (already normalized)
 * @param context - Current conversation context for follow-up resolution
 * @returns Structured output representing the user's intent
 */
export async function understandWithLLM(
  userText: string,
  context: AIConversationContext | null,
): Promise<AIStructuredOutput> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    // Fallback: return UNKNOWN if no API key
    return createFallbackOutput(userText);
  }

  try {
    const groq = createGroq({ apiKey: groqKey });
    const systemPrompt = buildSystemPrompt(context);

    const { object } = await generateObject({
      model: groq("llama-3.1-70b-versatile"),
      schema: StructuredOutputSchema,
      system: systemPrompt,
      prompt: userText,
      temperature: 0.1, // Low temperature for consistent structured extraction
    });

    // Map the zod-validated result to our AIStructuredOutput type
    const result: AIStructuredOutput = {
      intent: object.intent,
      action: object.action,
      entityType: object.entityType,
      entityQuery: object.entityQuery || null,
      entityId: null, // Set by entity resolver later
      parameters: object.parameters || {},
      dateRange: object.dateRange
        ? {
            startDate: object.dateRange.startDate,
            endDate: object.dateRange.endDate,
            label: object.dateRange.label,
          }
        : null,
      confidence: object.confidence,
      needsClarification: object.needsClarification,
      needsConfirmation: object.needsConfirmation,
      secondaryIntent: object.secondaryIntent || null,
    };

    return result;
  } catch (error) {
    console.error("LLM understanding failed:", error);
    return createFallbackOutput(userText);
  }
}

// ─── Fallback ───────────────────────────────────────────────────────────────

function createFallbackOutput(userText: string): AIStructuredOutput {
  return {
    intent: "UNKNOWN",
    action: "READ",
    entityType: "unknown",
    entityQuery: userText,
    entityId: null,
    parameters: {},
    dateRange: null,
    confidence: 0.1,
    needsClarification: true,
    needsConfirmation: false,
    secondaryIntent: null,
  };
}
