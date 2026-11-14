-- LUSTRAX JEWELRIES - PATCH 4.0: INVENTORY HARDENING
-- Purpose: Add data integrity constraints and secure RPCs against injection.

-- 1. ADD TABLE-LEVEL CONSTRAINT
-- Prevents stock from becoming negative through any direct table update (Admin/Manual).
ALTER TABLE public.products 
ADD CONSTRAINT stock_not_negative CHECK (stock_quantity >= 0);

-- 2. HARDEN RPC: create_order_secure
-- Ensures quantities are positive and prevents stock-recharging via negative injection.
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
        -- NEW: Security Validation
        IF v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'Protocol Deviation: Invalid quantity detected (% units for %)', v_item.quantity, v_item.name;
        END IF;

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
    RAISE EXCEPTION 'Acquisition Protocol Failure: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
