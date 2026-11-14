/**
 * LUSTRAX JEWELRIES - COMPLETE BACKEND INFRASTRUCTURE
 * 
 * This script performs a full upgrade of the Lustrax backend, including:
 * 1. Custom Types (Enums)
 * 2. Optimized Tables with updated_at tracking
 * 3. Robust Triggers for profile creation and timestamping
 * 4. Production-grade RLS Policies
 * 5. Performance Indexes
 */

-- ---------------------------------------------------------
-- 0. CLEANUP (Optional - Use with caution in production)
-- ---------------------------------------------------------
-- DROP SCHEMA public CASCADE;
-- CREATE SCHEMA public;
-- GRANT ALL ON SCHEMA public TO postgres;
-- GRANT ALL ON SCHEMA public TO anon;
-- GRANT ALL ON SCHEMA public TO authenticated;
-- GRANT ALL ON SCHEMA public TO service_role;

-- ---------------------------------------------------------
-- 1. EXTENSIONS & TYPES
-- ---------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Define order status enum for type-safety
DO $$ BEGIN
    CREATE TYPE public.order_status AS ENUM ('pending', 'paid', 'failed', 'shipped', 'delivered', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN 
        -- Add missing values if type already exists
        IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'order_status' AND e.enumlabel = 'delivered') THEN
            ALTER TYPE public.order_status ADD VALUE 'delivered' AFTER 'shipped';
        END IF;
END $$;


-- ---------------------------------------------------------
-- 2. UTILITY FUNCTIONS
-- ---------------------------------------------------------
-- Automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Automatically create a profile row for new auth users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id, 
        NEW.email, 
        NEW.raw_user_meta_data->>'full_name',
        'user'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run the function on every new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------
-- 3. TABLES DEFINITION
-- ---------------------------------------------------------

-- PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'Uncategorized',
    price DECIMAL(12, 2) NOT NULL,
    image_url TEXT,
    additional_images TEXT[] DEFAULT '{}',
    material TEXT,
    weight TEXT,
    stock_quantity INTEGER DEFAULT 1,
    is_featured BOOLEAN DEFAULT false,

    is_new_release BOOLEAN DEFAULT false,
    is_best_seller BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    status public.order_status NOT NULL DEFAULT 'pending',
    payment_reference TEXT UNIQUE,
    shipping_address TEXT,
    shipping_city TEXT,
    shipping_phone TEXT,
    recipient_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ORDER ITEMS (Denormalized to preserve historical pricing/names)
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL, -- Snapshot at time of purchase
    price DECIMAL(12, 2) NOT NULL, -- Snapshot at time of purchase
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- WISHLIST
CREATE TABLE IF NOT EXISTS public.wishlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, product_id)
);

-- TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payment_reference TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- NOTIFICATIONS (Admin Alerts)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'system', -- 'order', 'system', 'inventory'
    is_read BOOLEAN DEFAULT false,
    link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);



-- ---------------------------------------------------------
-- 4. AUTOMATION (TRIGGERS)
-- ---------------------------------------------------------

-- Profile Creation on Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, phone)
    VALUES (
        new.id, 
        new.email, 
        new.raw_user_meta_data->>'full_name', 
        'user',
        new.raw_user_meta_data->>'phone'
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone;
    RETURN new;
EXCEPTION WHEN OTHERS THEN
    -- Prevent signup failure if profile insertion fails
    RAISE WARNING 'Failed to create profile for user %: %', new.id, SQLERRM;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: New User Profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger: Timestamps
DO $$ 
DECLARE 
    t text;
BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('profiles', 'products', 'orders', 'order_items', 'wishlist')
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
        EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at()', t);
    END LOOP;
END $$;

-- ---------------------------------------------------------
-- 5. PERFORMANCE (INDEXES)
-- ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON public.wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON public.products(is_featured);
CREATE INDEX IF NOT EXISTS idx_products_is_new_release ON public.products(is_new_release);
CREATE INDEX IF NOT EXISTS idx_products_is_best_seller ON public.products(is_best_seller);
CREATE INDEX IF NOT EXISTS idx_orders_payment_reference ON public.orders(payment_reference);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON public.transactions(order_id);


-- ---------------------------------------------------------
-- 6. SECURITY (PRODUCTION-HARDENED RLS)
-- ---------------------------------------------------------

-- Enable RLS for all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;

-- Security Helper: Is Admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Order Notification Trigger
CREATE OR REPLACE FUNCTION public.handle_new_order_notification()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notifications (title, message, type, link)
    VALUES (
        'New Acquisition Authorization',
        'A new order (Ref: ' || COALESCE(NEW.payment_reference, NEW.id::text) || ') has been placed for ' || 
        (SELECT full_name FROM public.profiles WHERE id = NEW.user_id) || '.',
        'order',
        '/admin/orders'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- PROFILES: Users can only view/edit their own data. Admins have full access.
DROP POLICY IF EXISTS "Profiles: Users view own" ON public.profiles;
CREATE POLICY "Profiles: Users view own" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles: Users update own" ON public.profiles;
CREATE POLICY "Profiles: Users update own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles: Admins full access" ON public.profiles;
CREATE POLICY "Profiles: Admins full access" ON public.profiles USING (public.is_admin());

-- PRODUCTS: Public can view, only Admins can modify.
DROP POLICY IF EXISTS "Products: Public select" ON public.products;
CREATE POLICY "Products: Public select" ON public.products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Products: Admins full access" ON public.products;
CREATE POLICY "Products: Admins full access" ON public.products USING (public.is_admin());

-- ORDERS: Users can view and create their own orders. Admins manage all.
DROP POLICY IF EXISTS "Orders: Users view own" ON public.orders;
CREATE POLICY "Orders: Users view own" ON public.orders FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Orders: Users insert own" ON public.orders;
CREATE POLICY "Orders: Users insert own" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Orders: Admins full access" ON public.orders;
CREATE POLICY "Orders: Admins full access" ON public.orders USING (public.is_admin());

-- ORDER ITEMS: Users can view items belonging to their validated orders.
DROP POLICY IF EXISTS "Order Items: Users view own" ON public.order_items;
CREATE POLICY "Order Items: Users view own" ON public.order_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders WHERE id = order_items.order_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS "Order Items: Admins full access" ON public.order_items;
CREATE POLICY "Order Items: Admins full access" ON public.order_items USING (public.is_admin());

-- WISHLIST: Users manage their own lists.
DROP POLICY IF EXISTS "Wishlist: Users manage own" ON public.wishlist;
CREATE POLICY "Wishlist: Users manage own" ON public.wishlist USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Wishlist: Admins full access" ON public.wishlist;
CREATE POLICY "Wishlist: Admins full access" ON public.wishlist USING (public.is_admin());

-- TRANSACTIONS: Users view own, Admin full.
DROP POLICY IF EXISTS "Transactions: Users view own" ON public.transactions;
CREATE POLICY "Transactions: Users view own" ON public.transactions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Transactions: Admins full access" ON public.transactions;
CREATE POLICY "Transactions: Admins full access" ON public.transactions USING (public.is_admin());


-- NOTIFICATIONS: Only Admins can view and update.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notifications: Admins full access" ON public.notifications;
CREATE POLICY "Notifications: Admins full access" ON public.notifications USING (public.is_admin());

-- ---------------------------------------------------------
-- 7. STORAGE (ASSET MANAGEMENT)

-- ---------------------------------------------------------

-- Create products bucket for jewelry assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('products', 'products', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access for jewelry images
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'products' );

-- Restricted write access to authenticated admins
-- HARDENED STORAGE POLICY
DROP POLICY IF EXISTS "Admin Write Access" ON storage.objects;
DROP POLICY IF EXISTS "Admin Product Asset Control" ON storage.objects;
CREATE POLICY "Admin Product Asset Control"
ON storage.objects FOR ALL
TO authenticated
USING ( bucket_id = 'products' AND public.is_admin() )
WITH CHECK ( bucket_id = 'products' AND public.is_admin() );


-- ---------------------------------------------------------
-- 8. MAINTENANCE & AUDIT
-- ---------------------------------------------------------

-- Trigger for products timestamp
DROP TRIGGER IF EXISTS set_products_updated_at ON public.products;
CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

-- Trigger for new order notifications
DROP TRIGGER IF EXISTS on_order_created_notify ON public.orders;
CREATE TRIGGER on_order_created_notify AFTER INSERT ON public.orders FOR EACH ROW EXECUTE PROCEDURE public.handle_new_order_notification();

-- ---------------------------------------------------------
-- 9. REALTIME ENABLEMENT
-- ---------------------------------------------------------

-- Enable Realtime for notifications table idempotently
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- Enable Realtime for products table (required for live stock sync across all clients)
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  END IF;
END $$;


-- ---------------------------------------------------------
-- 10. ADVANCED SECURITY & INTELLIGENCE (RPCs)
-- ---------------------------------------------------------

/**
 * SECURE ORDER ATOMICIY
 * Ensures order, items, and transactions are created in a single DB transaction.
 * Prevents "ghost orders" and missing items.
 */
CREATE OR REPLACE FUNCTION public.create_order_secure(
    p_user_id UUID,
    p_total_amount DECIMAL,
    p_payment_ref TEXT,
    p_shipping_details JSONB,
    p_order_items JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_order_id UUID;
    v_item RECORD;
BEGIN
    -- 1. Preventive Check: Avoid duplicates
    IF EXISTS (SELECT 1 FROM public.orders WHERE payment_reference = p_payment_ref) THEN
        RETURN jsonb_build_object('success', true, 'order_id', (SELECT id FROM public.orders WHERE payment_reference = p_payment_ref));
    END IF;

    -- 2. Create Master Order
    INSERT INTO public.orders (
        user_id, total_amount, status, payment_reference,
        shipping_address, shipping_city, shipping_phone, recipient_name
    ) VALUES (
        p_user_id, p_total_amount, 'paid', p_payment_ref,
        p_shipping_details->>'address', p_shipping_details->>'city', 
        p_shipping_details->>'phone', p_shipping_details->>'name'
    ) RETURNING id INTO v_order_id;

    -- 3. Ingest Order Items (Denormalized) and Deduct Stock
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_order_items) AS x(id UUID, name TEXT, price DECIMAL, quantity INTEGER)
    LOOP
        -- Insert the item
        INSERT INTO public.order_items (
            order_id, product_id, product_name, price, quantity
        ) VALUES (
            v_order_id, v_item.id, v_item.name, v_item.price, v_item.quantity
        );

        -- Deduct from available inventory atomically
        UPDATE public.products 
        SET stock_quantity = stock_quantity - v_item.quantity
        WHERE id = v_item.id AND stock_quantity >= v_item.quantity;

        -- If no rows were updated, it means stock was insufficient
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Insufficient stock for product %', v_item.name;
        END IF;
    END LOOP;

    -- 4. Log Financial Transaction
    INSERT INTO public.transactions (
        user_id, order_id, amount, status, payment_reference
    ) VALUES (
        p_user_id, v_order_id, p_total_amount, 'success', p_payment_ref
    );

    RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Protocol Failure: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 11. PRODUCT VARIANTS INFRASTRUCTURE
-- ---------------------------------------------------------

-- Create Variant Table
CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}', -- e.g. {"size": "20 inch", "color": "Gold"}
    stock_quantity INTEGER DEFAULT 0,
    price_override DECIMAL(12, 2), -- NULL means use product's base price
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Performance Tracking
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON public.product_variants(product_id);

-- Security (RLS)
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Variants: Public select" ON public.product_variants;
CREATE POLICY "Variants: Public select" ON public.product_variants FOR SELECT USING (true);

DROP POLICY IF EXISTS "Variants: Admins full access" ON public.product_variants;
CREATE POLICY "Variants: Admins full access" ON public.product_variants USING (public.is_admin());

-- Enable Realtime
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

-- Automate Timestamps
DROP TRIGGER IF EXISTS set_variants_updated_at ON public.product_variants;
CREATE TRIGGER set_variants_updated_at 
    BEFORE UPDATE ON public.product_variants 
    FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();


/**
 * BUSINESS INTELLIGENCE AGGREGATOR
 * High-performance revenue aggregation for the admin dashboard.
 */
CREATE OR REPLACE FUNCTION public.get_revenue_metrics(days_limit INTEGER DEFAULT 7)
RETURNS TABLE (day DATE, revenue DECIMAL) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d::date as day,
        COALESCE(SUM(o.total_amount), 0) as revenue
    FROM 
        generate_series(CURRENT_DATE - (days_limit - 1) * INTERVAL '1 day', CURRENT_DATE, '1 day') d
    LEFT JOIN 
        public.orders o ON o.created_at::date = d::date AND o.status IN ('paid', 'shipped', 'delivered')
    GROUP BY 
        d::date
    ORDER BY 
        d::date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;




