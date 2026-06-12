import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

// The auto-generated Database type is empty; cast to generic client.
export const sb = typedSupabase as unknown as SupabaseClient;

export type Profile = {
  id: string;
  shop_id: string;
  full_name: string;
  phone: string;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  shop_id: string;
  name: string;
  part_number: string | null;
  category: string;
  brand: string | null;
  variant: string | null;
  purchase_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  image_url: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: string;
  shop_id: string;
  name: string;
  mobile: string | null;
  vehicle_number: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Invoice = {
  id: string;
  shop_id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_mobile: string | null;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  due: number;
  payment_status: string;
  payment_method: string | null;
  notes: string | null;
  cost_total: number;
  profit: number;
  created_by: string | null;
  created_at: string;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  shop_id: string;
  product_id: string | null;
  product_name: string;
  part_number: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  line_total: number;
  created_at: string;
};

export type LedgerEntry = {
  id: string;
  shop_id: string;
  customer_id: string;
  entry_type: "credit" | "payment";
  amount: number;
  entry_date: string;
  note: string | null;
  payment_method: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const PRODUCT_CATEGORIES = [
  "Engine Parts",
  "Brake Parts",
  "Electrical Parts",
  "Body Parts",
  "Accessories",
  "Oils",
  "Other",
] as const;

export const PAYMENT_METHODS = ["cash", "upi", "card", "bank", "cheque", "credit"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type Supplier = {
  id: string;
  shop_id: string;
  name: string;
  mobile: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Purchase = {
  id: string;
  shop_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  bill_number: string | null;
  bill_date: string;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  due: number;
  payment_method: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseItem = {
  id: string;
  purchase_id: string;
  shop_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  created_at: string;
};
