-- 20260829000000_analytics_rpcs.sql

-- 1. Get Top Selling Products (Replaces JS aggregation)
CREATE OR REPLACE FUNCTION get_top_selling_products(
    p_shop_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    product_name VARCHAR,
    total_quantity BIGINT,
    total_revenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ii.product_name,
        SUM(ii.quantity)::BIGINT AS total_quantity,
        SUM(ii.line_total) AS total_revenue
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.shop_id = p_shop_id
      AND i.created_at >= p_start_date
      AND i.created_at <= p_end_date
      AND i.payment_status != 'reversed'
    GROUP BY ii.product_name
    ORDER BY total_quantity DESC
    LIMIT p_limit;
END;
$$;

-- 2. Get Top Customers (Replaces JS aggregation)
CREATE OR REPLACE FUNCTION get_top_customers(
    p_shop_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    customer_name VARCHAR,
    total_spent NUMERIC,
    invoice_count BIGINT,
    outstanding_due NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(i.customer_name, 'Walk-in') AS customer_name,
        SUM(i.total) AS total_spent,
        COUNT(i.id)::BIGINT AS invoice_count,
        SUM(i.due) AS outstanding_due
    FROM invoices i
    WHERE i.shop_id = p_shop_id
      AND i.created_at >= p_start_date
      AND i.created_at <= p_end_date
      AND i.payment_status != 'reversed'
    GROUP BY COALESCE(i.customer_name, 'Walk-in')
    ORDER BY total_spent DESC
    LIMIT p_limit;
END;
$$;

-- 3. Get Profit Loss Summary
CREATE OR REPLACE FUNCTION get_profit_loss_summary(
    p_shop_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
    total_sales NUMERIC,
    total_profit NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(i.total), 0) AS total_sales,
        COALESCE(SUM(i.profit), 0) AS total_profit
    FROM invoices i
    WHERE i.shop_id = p_shop_id
      AND i.created_at >= p_start_date
      AND i.created_at <= p_end_date
      AND i.payment_status != 'reversed';
END;
$$;
