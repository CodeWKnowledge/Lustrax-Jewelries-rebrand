-- LUSTRAX REPAIR: NORMALIZE VARIANT ATTRIBUTE KEYS
-- This script ensures all attribute keys (e.g. "Color" vs "color") 
-- are lowercased to match the frontend configuration.

UPDATE public.product_variants
SET attributes = (
  SELECT jsonb_object_agg(lower(key), value)
  FROM jsonb_each(attributes)
)
WHERE attributes != '{}';

-- Optional: Verify the update
-- SELECT attributes FROM public.product_variants;
