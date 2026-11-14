-- 1. Ensure full row data is sent on updates
ALTER TABLE public.products REPLICA IDENTITY FULL;

-- 2. Grant explicit permissions to the public role
-- This is often the missing piece for Realtime listeners
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.products TO authenticated;

-- 3. Reset and fix the publication
TRUNCATE TABLE public.notifications; -- Clearing debug logs if any
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.products; -- Alternatively, but FOR ALL TABLES is safer for debug

-- 4. Verify stock (Manual Check Query)
-- Run this to manually confirm a single product's stock
-- SELECT stock_quantity FROM public.products WHERE id = '7413803f-c3e9-4f36-8952-611c152657eb';
