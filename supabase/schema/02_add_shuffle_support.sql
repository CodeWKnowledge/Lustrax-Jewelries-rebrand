-- Add display_order column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_products_display_order ON public.products(display_order);

-- Create RPC to shuffle products
CREATE OR REPLACE FUNCTION public.shuffle_products()
RETURNS VOID AS $$
BEGIN
  -- Update each product with a random display_order
  UPDATE public.products
  SET display_order = floor(random() * 1000000)::int
  WHERE id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
