CREATE OR REPLACE FUNCTION public.reset_system_data(target_tables TEXT[])
RETURNS VOID AS $$
BEGIN
    -- Security Check: Only allow admins to run this
    IF NOT (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')) THEN
        RAISE EXCEPTION 'Unauthorized: Admin privileges required';
    END IF;

    -- Reset logic based on array
    IF 'orders' = ANY(target_tables) OR 'all' = ANY(target_tables) THEN
        DELETE FROM public.order_items WHERE true;
        DELETE FROM public.orders WHERE true;
        DELETE FROM public.transactions WHERE true;
        DELETE FROM public.payment_reconciliation WHERE true;
        RAISE NOTICE 'Orders, Items, Transactions, and Reconciliation reset.';
    END IF;

    IF 'notifications' = ANY(target_tables) OR 'all' = ANY(target_tables) THEN
        DELETE FROM public.notifications WHERE true;
        RAISE NOTICE 'Notifications reset.';
    END IF;

    IF 'wishlist' = ANY(target_tables) OR 'all' = ANY(target_tables) THEN
        DELETE FROM public.wishlist WHERE true;
        RAISE NOTICE 'Wishlist reset.';
    END IF;

    IF 'profiles' = ANY(target_tables) OR 'all' = ANY(target_tables) THEN
        -- Be extremely careful here. Do not delete the calling admin.
        DELETE FROM public.profiles WHERE role != 'admin';
        RAISE NOTICE 'Non-admin profiles reset.';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
