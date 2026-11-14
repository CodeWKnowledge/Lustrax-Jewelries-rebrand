-- ---------------------------------------------------------
-- ADVANCED VARIANT PRICING INFRASTRUCTURE
-- ---------------------------------------------------------

-- 1. Update product_variants with override tracker
ALTER TABLE IF EXISTS public.product_variants 
ADD COLUMN IF NOT EXISTS is_overridden BOOLEAN DEFAULT FALSE;

-- 2. Create Price Rules table for hybrid pricing
CREATE TABLE IF NOT EXISTS public.product_price_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    variant_name TEXT NOT NULL, -- e.g. 'Length'
    value TEXT NOT NULL,        -- e.g. '20 inch'
    price_adjustment DECIMAL(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Security (RLS)
ALTER TABLE public.product_price_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Price Rules: Public select" ON public.product_price_rules;
CREATE POLICY "Price Rules: Public select" ON public.product_price_rules FOR SELECT USING (true);

DROP POLICY IF EXISTS "Price Rules: Admins full access" ON public.product_price_rules;
CREATE POLICY "Price Rules: Admins full access" ON public.product_price_rules USING (public.is_admin());

-- 4. Indices
CREATE INDEX IF NOT EXISTS idx_price_rules_product_id ON public.product_price_rules(product_id);

-- 5. Enable Realtime
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'product_price_rules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_price_rules;
  END IF;
END $$;
