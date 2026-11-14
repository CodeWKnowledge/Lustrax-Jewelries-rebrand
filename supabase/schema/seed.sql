/**
 * LUSTRAX JEWELRIES - SEED DATA
 * 
 * Initial products to populate the store during setup.
 * All prices are in USD. Images are curated from Unsplash for aesthetic demonstration.
 */

-- Clear existing data (use cautiously in development)
-- TRUNCATE public.products RESTART IDENTITY CASCADE;

-- 1. SEED PRODUCTS (LOCALIZED DATA)
INSERT INTO public.products (name, description, price, category, image_url, is_featured, is_new_release, is_best_seller) VALUES
-- Featured Masterpieces
(
    'Eternal Lotus Ring', 
    'A symbol of purity and rebirth, crafted in 18k solid gold with a central VVS clarity diamond.', 
    1800000.00, 
    'Rings',
    'https://images.unsplash.com/photo-1605100804763-247f67b3f416?q=80&w=1000',
    true, false, true
),
(
    'Royal Sapphire Earrings', 
    'Deep blue ethically sourced sapphires set in a halo of brilliant-cut diamonds. Timeless elegance.', 
    5100000.00, 
    'Earrings',
    'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?q=80&w=1000',
    true, true, false
),
-- New Releases
(
    'Celestial Gold Necklace', 
    'A masterpiece of minimalism, featuring a hand-carved celestial pendant on a delicate gold chain.', 
    1275000.00, 
    'Necklaces',
    'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=1000',
    false, true, false
),
(
    'Art Deco Pearl Drops', 
    'Inspired by the 1920s architecture. Akoya pearls suspended from geometric gold settings.', 
    1425000.00, 
    'Earrings',
    'https://images.unsplash.com/photo-1588444839799-eb0c79ecbc11?q=80&w=1000',
    false, true, false
),
-- Best Sellers
(
    'Midnight Diamond Cuff', 
    'A bold expression of modern luxury. Blackened gold with pavé-set white diamonds.', 
    3150000.00, 
    'Watches',
    'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=1000',
    false, false, true
),
(
    'Serpent Essence Band', 
    'Wrap yourself in sophistication. A fluid, serpentine design that moves with your hand.', 
    1650000.00, 
    'Rings',
    'https://images.unsplash.com/photo-1603561591411-0e7320b9795d?q=80&w=1000',
    false, false, true
);

