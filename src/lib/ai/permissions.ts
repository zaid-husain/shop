/**
 * AI Permission Layer
 *
 * Secure middleware for the AI Assistant.
 * Validates authentication, authorization, and business rules
 * before allowing any AI action to execute.
 *
 * Supports Role-Based Access Control (RBAC): Owner, Manager, Staff.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type UserRole = "owner" | "manager" | "staff" | "unknown";

export type AIAction =
  | "READ_INVENTORY"
  | "READ_CUSTOMER"
  | "READ_BILLING"
  | "READ_REPORTS"
  | "READ_SUPPLIER"
  | "UPDATE_STOCK"
  | "UPDATE_PRICE"
  | "CREATE_PRODUCT"
  | "DELETE_PRODUCT"
  | "CREATE_BILL"
  | "CREATE_CUSTOMER"
  | "UPDATE_CUSTOMER"
  | "DELETE_CUSTOMER"
  | "WRITE_LEDGER"
  | "WRITE_EXPENSE"
  | "DELETE_EXPENSE"
  | "GENERAL_AI";

export interface PermissionContext {
  userId: string;
  role: UserRole;
  shopId: string;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

// ─── RBAC Rules ─────────────────────────────────────────────────────────────

/**
 * Role-Based Access Control matrix.
 * Defines which roles can perform which actions.
 */
const ROLE_PERMISSIONS: Record<UserRole, Set<AIAction>> = {
  owner: new Set([
    "READ_INVENTORY",
    "READ_CUSTOMER",
    "READ_BILLING",
    "READ_REPORTS",
    "READ_SUPPLIER",
    "UPDATE_STOCK",
    "UPDATE_PRICE",
    "CREATE_PRODUCT",
    "DELETE_PRODUCT",
    "CREATE_BILL",
    "CREATE_CUSTOMER",
    "UPDATE_CUSTOMER",
    "DELETE_CUSTOMER",
    "WRITE_LEDGER",
    "WRITE_EXPENSE",
    "DELETE_EXPENSE",
    "GENERAL_AI",
  ]),
  manager: new Set([
    "READ_INVENTORY",
    "READ_CUSTOMER",
    "READ_BILLING",
    "READ_REPORTS",
    "READ_SUPPLIER",
    "UPDATE_STOCK",
    "UPDATE_PRICE", // Added for manager with limits
    "CREATE_PRODUCT",
    "CREATE_BILL",
    "CREATE_CUSTOMER",
    "UPDATE_CUSTOMER",
    "WRITE_LEDGER",
    "WRITE_EXPENSE",
    "GENERAL_AI",
  ]),
  staff: new Set([
    "READ_INVENTORY",
    "READ_CUSTOMER",
    "READ_BILLING",
    "CREATE_BILL",
    "CREATE_CUSTOMER",
    "GENERAL_AI",
  ]),
  unknown: new Set(["GENERAL_AI"]),
};

// ─── Policy Definitions ─────────────────────────────────────────────────────

function checkRolePermission(role: UserRole, action: AIAction): boolean {
  return ROLE_PERMISSIONS[role]?.has(action) ?? false;
}

function validatePriceUpdate(
  context: PermissionContext,
  currentPrice: number,
  newPrice: number,
): PermissionResult {
  if (context.role === "owner") return { allowed: true };

  if (context.role === "manager") {
    const minPrice = currentPrice * 0.8;
    if (newPrice < minPrice) {
      return {
        allowed: false,
        reason: "Managers cannot reduce prices by more than 20%. Please ask the Owner.",
      };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: "Staff cannot update prices." };
}

// ─── Main Guard Function ────────────────────────────────────────────────────

/**
 * Primary security guard. Must be called before executing any action.
 */
export function authorizeAction(
  context: PermissionContext | null,
  action: AIAction,
  payload?: Record<string, unknown>,
): PermissionResult {
  if (!context) {
    return { allowed: false, reason: "Authentication required." };
  }

  // 1. Check Role Permission
  if (!checkRolePermission(context.role, action)) {
    return {
      allowed: false,
      reason: `Permission denied: ${context.role} role cannot perform ${action}.`,
    };
  }

  // 2. Check Business Rules
  switch (action) {
    case "UPDATE_PRICE":
      if (
        payload &&
        typeof payload.currentPrice === "number" &&
        typeof payload.newPrice === "number"
      ) {
        return validatePriceUpdate(context, payload.currentPrice, payload.newPrice);
      }
      break;
    case "DELETE_PRODUCT":
      if (context.role !== "owner") {
        return { allowed: false, reason: "Only Owners can delete records." };
      }
      break;
  }

  return { allowed: true };
}

/**
 * Helper to get user-friendly error messages for the AI to return.
 */
export function getGracefulError(reason?: string): string {
  if (reason) {
    return `Access denied: ${reason}`;
  }
  return "Aapke paas yeh action karne ki permission nahi hai. Owner se contact karein.";
}
