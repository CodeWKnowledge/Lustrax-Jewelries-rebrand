-- ---------------------------------------------------------
-- PRODUCT VARIANTS INFRASTRUCTURE
-- ---------------------------------------------------------

-- 1. Create Variant Table
CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}', -- e.g. {"size": "20 inch", "color": "Gold"}
    stock_quantity INTEGER DEFAULT 0,
    price_override DECIMAL(12, 2), -- NULL means use product's base price
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Performance Tracking
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON public.product_variants(product_id);

-- 3. Security (RLS)
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Variants: Public select" ON public.product_variants;
CREATE POLICY "Variants: Public select" ON public.product_variants FOR SELECT USING (true);

DROP POLICY IF EXISTS "Variants: Admins full access" ON public.product_variants;
CREATE POLICY "Variants: Admins full access" ON public.product_variants USING (public.is_admin());

-- 4. Enable Realtime
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'product_variants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_variants;
  END IF;
END $$;

-- 5. Automate Timestamps
DROP TRIGGER IF EXISTS set_variants_updated_at ON public.product_variants;
CREATE TRIGGER set_variants_updated_at 
    BEFORE UPDATE ON public.product_variants 
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
