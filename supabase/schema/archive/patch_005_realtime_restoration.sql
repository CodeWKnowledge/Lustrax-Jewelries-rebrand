-- PATCH 005: REALTIME HARDENING & STOCK RESTORATION
-- ---------------------------------------------------------

-- 1. Ensure rich data payloads for Realtime listeners
-- This ensures that even partial updates trigger consistent state-merging in the frontend
ALTER TABLE public.products REPLICA IDENTITY FULL;

-- 2. Explicitly grant permissions for Realtime access
-- Some environments require explicit grants on the schema and table for 'anon' users to receive messages
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.products TO authenticated;

-- 3. Stock Restoration Logic
-- This function iterates through order items and returns them to inventory when an order is cancelled
CREATE OR REPLACE FUNCTION public.handle_order_cancellation()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
BEGIN
    -- Check if status transitioned to 'cancelled'
    IF (OLD.status != 'cancelled' AND NEW.status = 'cancelled') THEN
        FOR item IN SELECT product_id, quantity FROM public.order_items WHERE order_id = NEW.id
        LOOP
            IF item.product_id IS NOT NULL THEN
                UPDATE public.products 
                SET stock_quantity = stock_quantity + item.quantity
                WHERE id = item.product_id;
            END IF;
        END LOOP;
        
        -- Logic to notify admin of the inventory recovery (Optional but helpful)
        INSERT INTO public.notifications (title, message, type, link)
        VALUES (
            'Inventory Restored',
            'Order ' || NEW.id || ' was cancelled. Items have been returned to the vault.',
            'inventory',
            '/admin/products'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Restore stock on cancellation
DROP TRIGGER IF EXISTS on_order_cancelled_restore_stock ON public.orders;
CREATE TRIGGER on_order_cancelled_restore_stock
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE PROCEDURE public.handle_order_cancellation();
