-- 20260716000000_ai_agent_schema.sql

-- 1. Enable pg_trgm for fuzzy searching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Create AI Conversations Table
CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL,
    user_id UUID NOT NULL,
    context_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_ai_conversations_shop_user;
ALTER TABLE public.ai_conversations DROP CONSTRAINT IF EXISTS ai_conversations_shop_user_key;
ALTER TABLE public.ai_conversations ADD CONSTRAINT ai_conversations_shop_user_key UNIQUE (shop_id, user_id);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own AI conversations" ON public.ai_conversations;
CREATE POLICY "Users can manage their own AI conversations" 
    ON public.ai_conversations FOR ALL 
    USING (user_id = auth.uid());

-- 3. Create AI Telemetry Logs Table
CREATE TABLE IF NOT EXISTS public.ai_telemetry_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL,
    user_id UUID NOT NULL,
    module VARCHAR(50) NOT NULL,
    intent VARCHAR(50) NOT NULL,
    search_entity VARCHAR(255),
    total_latency_ms INT NOT NULL DEFAULT 0,
    db_latency_ms INT NOT NULL DEFAULT 0,
    ai_latency_ms INT NOT NULL DEFAULT 0,
    success BOOLEAN NOT NULL DEFAULT true,
    cache_hit BOOLEAN NOT NULL DEFAULT false,
    error_type VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_telemetry_shop ON public.ai_telemetry_logs(shop_id, created_at);

ALTER TABLE public.ai_telemetry_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can insert telemetry for their shop" ON public.ai_telemetry_logs;
CREATE POLICY "Users can insert telemetry for their shop" 
    ON public.ai_telemetry_logs FOR INSERT 
    WITH CHECK (user_id = auth.uid());

-- 4. Create Product Aliases Table
CREATE TABLE IF NOT EXISTS public.product_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL,
    product_id UUID NOT NULL,
    alias VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_aliases_trgm ON public.product_aliases USING GIN (alias gin_trgm_ops);

ALTER TABLE public.product_aliases ENABLE ROW LEVEL SECURITY;

-- 5. Add trigram indexes to products and customers for fast fuzzy search
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_brand_trgm ON public.products USING GIN (brand gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_part_number_trgm ON public.products USING GIN (part_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON public.customers USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_mobile_trgm ON public.customers USING GIN (mobile gin_trgm_ops);

-- 6. RPC: search_products_fuzzy
DROP FUNCTION IF EXISTS public.search_products_fuzzy(UUID, TEXT, INT);
CREATE OR REPLACE FUNCTION public.search_products_fuzzy(
    p_shop_id UUID,
    p_query TEXT,
    p_limit INT DEFAULT 10
) RETURNS TABLE (
    id UUID,
    name TEXT,
    brand TEXT,
    category TEXT,
    variant TEXT,
    part_number TEXT,
    selling_price NUMERIC,
    purchase_price NUMERIC,
    stock_quantity INT,
    low_stock_threshold INT,
    similarity_score REAL,
    match_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH matches AS (
        SELECT 
            p.id, p.name, p.brand, p.category, p.variant, p.part_number, 
            p.selling_price, p.purchase_price, p.stock_quantity, p.low_stock_threshold,
            GREATEST(
                similarity(COALESCE(p.name, ''), p_query),
                similarity(COALESCE(p.brand, ''), p_query),
                similarity(COALESCE(p.part_number, ''), p_query),
                COALESCE((
                    SELECT MAX(similarity(a.alias, p_query))
                    FROM product_aliases a 
                    WHERE a.product_id = p.id
                ), 0)
            ) AS sim_score
        FROM products p
        WHERE p.shop_id = p_shop_id
          AND p.is_active = true
          AND p.deleted_at IS NULL
    )
    SELECT 
        m.id, m.name, m.brand, m.category, m.variant, m.part_number,
        m.selling_price, m.purchase_price, m.stock_quantity, m.low_stock_threshold,
        m.sim_score::REAL as similarity_score,
        CASE 
            WHEN m.sim_score > 0.9 THEN 'exact'::TEXT
            WHEN m.sim_score > 0.5 THEN 'contains'::TEXT
            ELSE 'fuzzy'::TEXT
        END as match_type
    FROM matches m
    WHERE m.sim_score > 0.1
    ORDER BY m.sim_score DESC
    LIMIT p_limit;
END;
$$;

-- 7. RPC: search_customers_fuzzy
DROP FUNCTION IF EXISTS public.search_customers_fuzzy(UUID, TEXT, INT);
CREATE OR REPLACE FUNCTION public.search_customers_fuzzy(
    p_shop_id UUID,
    p_query TEXT,
    p_limit INT DEFAULT 5
) RETURNS TABLE (
    id UUID,
    name TEXT,
    mobile TEXT,
    vehicle_number TEXT,
    balance_cache NUMERIC,
    similarity_score REAL,
    match_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH matches AS (
        SELECT 
            c.id, c.name, c.mobile, c.vehicle_number, c.balance_cache,
            GREATEST(
                similarity(COALESCE(c.name, ''), p_query),
                similarity(COALESCE(c.mobile, ''), p_query),
                similarity(REPLACE(COALESCE(c.vehicle_number, ''), ' ', ''), REPLACE(p_query, ' ', ''))
            ) AS sim_score
        FROM customers c
        WHERE c.shop_id = p_shop_id
          AND c.deleted_at IS NULL
    )
    SELECT 
        m.id, m.name, m.mobile, m.vehicle_number, m.balance_cache,
        m.sim_score::REAL as similarity_score,
        CASE 
            WHEN m.sim_score > 0.9 THEN 'exact'::TEXT
            WHEN m.sim_score > 0.5 THEN 'contains'::TEXT
            ELSE 'fuzzy'::TEXT
        END as match_type
    FROM matches m
    WHERE m.sim_score > 0.1
    ORDER BY m.sim_score DESC
    LIMIT p_limit;
END;
$$;
