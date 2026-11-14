/**
 * 01_harden_profiles_and_stock.sql
 * LUSTRAX JEWELRIES - PRODUCTION HARDENING SCRIPT
 */

-- 1. FIX: Privilege Escalation Vulnerability
-- Prevent any user from updating their own 'role' to 'admin' maliciously
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
    -- If the executing user is NOT already an admin via our security helper function
    -- then we forcefully revert the role back to whatever it was before the update attempt.
    IF NOT public.is_admin() THEN
        NEW.role = OLD.role;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_role_security ON public.profiles;
CREATE TRIGGER enforce_role_security
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE PROCEDURE public.prevent_role_escalation();


-- 2. FIX: Out of Stock Notifications
-- Detect when stock hits 0 and immediately notify the Admin Dashboard

-- Trigger for Base Products
CREATE OR REPLACE FUNCTION public.handle_out_of_stock_products()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.stock_quantity <= 0 AND OLD.stock_quantity > 0 THEN
        INSERT INTO public.notifications (title, message, type, link)
        VALUES (
            'Inventory Depleted',
            'A piece has sold out: ' || COALESCE(NEW.name, 'Unknown Product'),
            'inventory',
            '/admin/products'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_out_of_stock_products ON public.products;
CREATE TRIGGER trigger_out_of_stock_products
    AFTER UPDATE OF stock_quantity ON public.products
    FOR EACH ROW EXECUTE PROCEDURE public.handle_out_of_stock_products();

-- Trigger for Product Variants
CREATE OR REPLACE FUNCTION public.handle_out_of_stock_variants()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.stock_quantity <= 0 AND OLD.stock_quantity > 0 THEN
        INSERT INTO public.notifications (title, message, type, link)
        VALUES (
            'Inventory Depleted',
            'A piece variant has sold out. Product ID: ' || NEW.product_id,
            'inventory',
            '/admin/products'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_out_of_stock_variants ON public.product_variants;
CREATE TRIGGER trigger_out_of_stock_variants
    AFTER UPDATE OF stock_quantity ON public.product_variants
    FOR EACH ROW EXECUTE PROCEDURE public.handle_out_of_stock_variants();
