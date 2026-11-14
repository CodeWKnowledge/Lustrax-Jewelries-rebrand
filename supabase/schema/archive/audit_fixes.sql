-- =============================================================================
-- LUSTRAX JEWELRIES — AUDIT FIXES SQL
-- Run this in your Supabase SQL Editor after the complete_setup.sql
-- =============================================================================


-- ---------------------------------------------------------
-- 1. ALLOW UNCONFIRMED EMAIL USERS TO VIEW THEIR OWN DATA
-- ---------------------------------------------------------
-- Supabase blocks sign-in for unconfirmed emails by default at the AUTH layer.
-- To allow users to log in WITHOUT confirming their email:
--   Go to: Supabase Dashboard → Authentication → Settings → Email Auth
--   → Disable "Confirm email" toggle
--
-- The RLS policies below already work correctly for any authenticated user
-- (confirmed or not), since they only check auth.uid() which is set on JWT login.

-- Verify the policies are correct (no changes needed here, for documentation):
-- Orders: Users view own  → USING (auth.uid() = user_id)   ✅ works for unconfirmed
-- Order Items: Users view → EXISTS (orders.user_id = uid()) ✅ works for unconfirmed
-- Profiles: Users view    → USING (auth.uid() = id)         ✅ works for unconfirmed
-- Transactions: Users     → USING (auth.uid() = user_id)    ✅ works for unconfirmed


-- ---------------------------------------------------------
-- 2. ADD FULL-TEXT SEARCH INDEX FOR ADMIN PRODUCT SEARCH
-- Improves performance of the ilike-based server-side search
-- ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category);

-- Note: The gin_trgm_ops index requires the pg_trgm extension:
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ---------------------------------------------------------
-- 3. WISHLIST & TRANSACTIONS RLS (explicit INSERT/DELETE where missing)
-- ---------------------------------------------------------
DROP POLICY IF EXISTS "Wishlist: Users insert own" ON public.wishlist;
CREATE POLICY "Wishlist: Users insert own" ON public.wishlist
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Wishlist: Users delete own" ON public.wishlist;
CREATE POLICY "Wishlist: Users delete own" ON public.wishlist
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Transactions: Users insert own" ON public.transactions;
CREATE POLICY "Transactions: Users insert own" ON public.transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ---------------------------------------------------------
-- 4. PRODUCT_VARIANTS RLS (in case missing from initial setup)
-- ---------------------------------------------------------
ALTER TABLE IF EXISTS public.product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Variants: Public select" ON public.product_variants;
CREATE POLICY "Variants: Public select" ON public.product_variants
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Variants: Admins full access" ON public.product_variants;
CREATE POLICY "Variants: Admins full access" ON public.product_variants
  USING (public.is_admin());


-- ---------------------------------------------------------
-- 5. NORMALIZE EXISTING VARIANT ATTRIBUTE KEYS TO LOWERCASE
-- Fixes case-sensitivity mismatches from legacy data
-- ---------------------------------------------------------
UPDATE public.product_variants
SET attributes = (
  SELECT jsonb_object_agg(LOWER(k), v)
  FROM jsonb_each(attributes) AS j(k, v)
)
WHERE attributes IS NOT NULL
  AND attributes::text ~ '[A-Z]';
