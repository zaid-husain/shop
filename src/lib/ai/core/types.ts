/**
 * AI Core — Type Definitions
 *
 * Central types for the entire AI system.
 * Every module imports from here to ensure consistency.
 */

// ─── Intent Taxonomy ────────────────────────────────────────────────────────

/** All supported intents in the AI system. */
export type AIIntent =
  // Product READ
  | "PRODUCT_SEARCH"
  | "PRODUCT_DETAILS"
  | "PRODUCT_PRICE"
  | "PRODUCT_PURCHASE_PRICE"
  | "PRODUCT_STOCK"
  | "PRODUCT_CATEGORY"
  | "PRODUCT_HISTORY"
  // Product WRITE
  | "PRODUCT_CREATE"
  | "PRODUCT_UPDATE"
  | "PRODUCT_DELETE"
  | "PRODUCT_ARCHIVE"
  // Product field updates
  | "PRODUCT_PRICE_UPDATE"
  | "PRODUCT_NAME_UPDATE"
  | "PRODUCT_CATEGORY_UPDATE"
  | "PRODUCT_SKU_UPDATE"
  // Stock operations
  | "PRODUCT_STOCK_ADD"
  | "PRODUCT_STOCK_REMOVE"
  | "PRODUCT_STOCK_SET"
  // Combined product queries
  | "PRODUCT_PRICE_AND_STOCK"
  // Customer READ
  | "CUSTOMER_SEARCH"
  | "CUSTOMER_DETAILS"
  | "CUSTOMER_BALANCE"
  | "CUSTOMER_HISTORY"
  | "CUSTOMER_STATEMENT"
  // Customer WRITE
  | "CUSTOMER_CREATE"
  | "CUSTOMER_UPDATE"
  | "CUSTOMER_DELETE"
  | "CUSTOMER_ARCHIVE"
  // Khata / Finance
  | "PAYMENT_READ"
  | "PAYMENT_CREATE"
  | "CREDIT_READ"
  | "CREDIT_CREATE"
  | "DEBIT_READ"
  | "DEBIT_CREATE"
  | "OUTSTANDING_READ"
  | "OVERDUE_READ"
  // Inventory
  | "INVENTORY_SUMMARY"
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "FAST_MOVING"
  | "SLOW_MOVING"
  | "DEAD_STOCK"
  | "STOCK_VALUE"
  // Sales
  | "SALES_TODAY"
  | "SALES_YESTERDAY"
  | "SALES_WEEK"
  | "SALES_MONTH"
  | "SALES_CUSTOM_RANGE"
  | "SALES_COMPARISON"
  | "TOP_SELLING_PRODUCTS"
  | "TOP_CUSTOMERS"
  // Billing
  | "INVOICE_SEARCH"
  | "INVOICE_DETAILS"
  | "DRAFT_INVOICE_CREATE"
  | "BILL_STATUS"
  // Expense
  | "EXPENSE_READ"
  | "EXPENSE_CREATE"
  | "EXPENSE_UPDATE"
  | "EXPENSE_DELETE"
  | "EXPENSE_SUMMARY"
  // Supplier
  | "SUPPLIER_SEARCH"
  | "SUPPLIER_DETAILS"
  | "SUPPLIER_HISTORY"
  | "SUPPLIER_DUES"
  // Reports
  | "SALES_REPORT"
  | "PROFIT_REPORT"
  | "INVENTORY_REPORT"
  | "BUSINESS_SUMMARY"
  | "PURCHASE_REPORT"
  // System / Conversation
  | "HELP"
  | "GREETING"
  | "CONFIRM"
  | "CANCEL"
  | "CLARIFICATION"
  | "GENERAL_CHAT"
  | "UNKNOWN";

// ─── Action Classification ──────────────────────────────────────────────────

/** Classification of every user request into an action type. */
export type AIAction =
  | "READ"
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "ARCHIVE"
  | "SEARCH"
  | "ANALYZE"
  | "SUGGEST"
  | "CONFIRM"
  | "CANCEL"
  | "CLARIFY";

// ─── Entity Types ───────────────────────────────────────────────────────────

/** The type of business entity being referenced. */
export type AIEntityType =
  | "product"
  | "customer"
  | "invoice"
  | "supplier"
  | "expense"
  | "payment"
  | "ledger"
  | "date"
  | "unknown";

// ─── Stock Operation ────────────────────────────────────────────────────────

export type StockOperation = "ADD" | "REMOVE" | "SET";

// ─── Date Range ─────────────────────────────────────────────────────────────

export interface AIDateRange {
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  label: string; // Human-readable label (e.g. "Aaj", "Last 7 days")
}

// ─── Structured Output from Understanding ───────────────────────────────────

/**
 * The structured representation of a user's request.
 * Produced by either the fast-path or LLM understanding.
 */
export interface AIStructuredOutput {
  intent: AIIntent;
  action: AIAction;
  entityType: AIEntityType;
  /** The cleaned entity search term (e.g. "Servo Oil", not "bhai servo oil ka price") */
  entityQuery: string | null;
  /** Resolved entity ID (set after DB resolution) */
  entityId: string | null;
  /** Action-specific parameters */
  parameters: Record<string, unknown>;
  /** Parsed date/time range */
  dateRange: AIDateRange | null;
  /** 0-1, composite confidence */
  confidence: number;
  /** Whether clarification is needed before proceeding */
  needsClarification: boolean;
  /** Whether user confirmation is needed before execution */
  needsConfirmation: boolean;
  /** Secondary intent for multi-intent requests */
  secondaryIntent: AIIntent | null;
}

// ─── Entity Resolution ──────────────────────────────────────────────────────

export type EntityResolutionStatus = "RESOLVED" | "AMBIGUOUS" | "NOT_FOUND";

export interface ResolvedEntity {
  id: string;
  name: string;
  type: AIEntityType;
  data: Record<string, unknown>;
}

export interface EntityResolutionResult {
  status: EntityResolutionStatus;
  entity: ResolvedEntity | null;
  candidates: ResolvedEntity[];
  clarificationMessage: string | null;
}

// ─── Pending Action ─────────────────────────────────────────────────────────

export interface AIPendingAction {
  id: string;
  status: "PENDING_CONFIRMATION" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
  action: AIAction;
  intent: AIIntent;
  entityType: AIEntityType;
  entityId: string | null;
  entityName: string | null;
  parameters: Record<string, unknown>;
  description: string;
  createdAt: number; // epoch ms
  expiresAt: number; // epoch ms
}

// ─── Response Types ─────────────────────────────────────────────────────────

/** Response types for frontend rendering. */
export type AIResponseType =
  "TEXT" | "DATA" | "LIST" | "AMBIGUITY" | "ACTION_FORM" | "CONFIRMATION" | "SUCCESS" | "ERROR";

/** Structured action form for future interactive cards. */
export interface AIActionForm {
  action: AIIntent;
  entityType: AIEntityType;
  entityId: string | null;
  prefill: Record<string, unknown>;
  currentValues?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  requiredFields?: string[];
}

/** The unified response shape from the AI engine. */
export interface AIResponse {
  type: AIResponseType;
  text: string;
  data?: unknown;
  pendingAction?: AIPendingAction;
  actionForm?: AIActionForm;
  /** Which path was taken */
  pathType: "fast" | "llm";
  /** Original structured output for debugging */
  structuredOutput?: AIStructuredOutput;
}

// ─── Telemetry Extensions ───────────────────────────────────────────────────

export type AIPathType = "fast" | "llm";
export type AIErrorType =
  | "PRODUCT_NOT_FOUND"
  | "CUSTOMER_NOT_FOUND"
  | "AMBIGUOUS_PRODUCT"
  | "AMBIGUOUS_CUSTOMER"
  | "INVALID_PRICE"
  | "INVALID_QUANTITY"
  | "PERMISSION_DENIED"
  | "DATABASE_ERROR"
  | "TOOL_TIMEOUT"
  | "MISSING_PARAMETER"
  | "STALE_CONTEXT"
  | "PENDING_ACTION_EXPIRED"
  | "AI_TIMEOUT"
  | "AI_RATE_LIMIT"
  | "UNKNOWN";

// ─── Conversation Context ───────────────────────────────────────────────────

export interface AIConversationContext {
  activeProductId: string | null;
  activeProductName: string | null;
  activeCustomerId: string | null;
  activeCustomerName: string | null;
  activeTopic: "product" | "customer" | "invoice" | "sales" | "expense" | null;
  activeDateRange: AIDateRange | null;
  pendingAction: AIPendingAction | null;
  lastIntent: AIIntent | null;
  lastMessageTimestamp: number;
}
