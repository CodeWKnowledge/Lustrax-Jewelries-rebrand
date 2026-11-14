-- ============================================================
-- Lustrax Jewelries - Inventory Sync Patch
-- Run this ONCE in the Supabase SQL Editor.
-- Safe to re-run (idempotent).
-- ============================================================

-- 1. Enable Realtime on products table so the UI receives live stock updates
DO $$
BEGIN
  -- Ensure full row data is sent on updates (required for payload.new to be complete)
  ALTER TABLE public.products REPLICA IDENTITY FULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Realtime products setup: %', SQLERRM;
END $$;

-- 2. Replace create_order_secure with strict atomic stock deduction
--    - Stock only reduced AFTER confirmed payment (called by verify-payment Edge Function)
--    - Raises an exception and rolls back the ENTIRE transaction if stock is insufficient
--    - Uses WHERE stock_quantity >= quantity to prevent concurrent race conditions
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
    -- Idempotency: return existing order if payment ref already processed
    IF EXISTS (SELECT 1 FROM public.orders WHERE payment_reference = p_payment_ref) THEN
        RETURN jsonb_build_object('success', true, 'order_id', 
            (SELECT id FROM public.orders WHERE payment_reference = p_payment_ref));
    END IF;

    -- Create the master order record
    INSERT INTO public.orders (
        user_id, total_amount, status, payment_reference,
        shipping_address, shipping_city, shipping_phone, recipient_name
    ) VALUES (
        p_user_id, p_total_amount, 'paid', p_payment_ref,
        p_shipping_details->>'address', p_shipping_details->>'city',
        p_shipping_details->>'phone', p_shipping_details->>'name'
    ) RETURNING id INTO v_order_id;

    -- Insert each line item and atomically deduct from stock
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_order_items) AS x(id UUID, name TEXT, price DECIMAL, quantity INTEGER)
    LOOP
        INSERT INTO public.order_items (order_id, product_id, product_name, price, quantity)
        VALUES (v_order_id, v_item.id, v_item.name, v_item.price, v_item.quantity);

        -- Conditional update: only succeeds if enough stock exists (prevents negatives + race conditions)
        UPDATE public.products
        SET stock_quantity = stock_quantity - v_item.quantity
        WHERE id = v_item.id AND stock_quantity >= v_item.quantity;

        -- If 0 rows updated, stock was insufficient — rollback the entire transaction
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Insufficient stock for %', v_item.name;
        END IF;
    END LOOP;

    -- Log the financial transaction
    INSERT INTO public.transactions (user_id, order_id, amount, status, payment_reference)
    VALUES (p_user_id, v_order_id, p_total_amount, 'success', p_payment_ref);

    RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Protocol Failure: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
