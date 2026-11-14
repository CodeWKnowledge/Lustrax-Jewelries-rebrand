/**
 * LUSTRAX JEWELRIES - SUPABASE EDGE FUNCTIONS
 * 
 * paystack-webhook: Secure server-to-server listener for payment 
 * confirmations, guaranteeing fulfillment even if user drops connection.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  // Method MUST be POST
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  try {
    const signature = req.headers.get('x-paystack-signature');
    if (!signature || !PAYSTACK_SECRET_KEY) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Read full raw body for HMAC verification
    const bodyText = await req.text();
    
    // Validate Signature
    const hash = createHmac('sha512', PAYSTACK_SECRET_KEY).update(bodyText).digest('hex');
    if (hash !== signature) {
      console.warn('LUSTRAX SECURITY: Invalid Webhook Signature Detected');
      return new Response('Invalid Signature', { status: 400 });
    }

    const event = JSON.parse(bodyText);
    
    // We only care about charge.success
    if (event.event === 'charge.success') {
      const data = event.data;
      const reference = data.reference;

      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

      // Check Idempotency via Reconciliation ledger
      const { data: reconData, error: reconError } = await supabase
        .from('payment_reconciliation')
        .select('*')
        .eq('reference', reference)
        .single();

      if (reconError && reconError.code !== 'PGRST116') {
        throw reconError;
      }

      // If it's already verified or refunded, just return 200 OK
      if (reconData && (reconData.status === 'verified' || reconData.status === 'refunded')) {
        console.log(`LUSTRAX WEBHOOK: Reference ${reference} already ${reconData.status}. Skipping.`);
        return new Response('Already processed', { status: 200 });
      }

      // If missing from reconciliation ledger entirely, it means frontend completely crashed before it could even log it.
      // But we can't fulfill it if we don't have the cart items. Wait, if we don't have cart items, we must refund because we don't know what they bought!
      if (!reconData || !reconData.metadata || !reconData.metadata.items) {
         console.error(`LUSTRAX CRITICAL: Received payment ${reference} but missing cart manifest. Initiating emergency refund.`);
         await fetch('https://api.paystack.co/refund', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction: reference })
         });
         return new Response('Manifest missing, refunded', { status: 200 });
      }

      const cartItems = reconData.metadata.items;
      const shippingDetails = reconData.metadata.shipping;
      const userId = reconData.user_id;
      const paidAmount = data.amount / 100;

      // Repeat the same verification flow as verify-payment conceptually
      // We skip detailed calculation logs here to save edge function execution time, assuming trust via payment_reconciliation.
      // But to be secure, recalculate from DB natively.
      const productIds = cartItems.map((item: any) => item.id)
      const variantIds = cartItems.filter((item: any) => item.variant_id).map((item: any) => item.variant_id)

      const { data: products } = await supabase.from('products').select('id, price, name').in('id', productIds)
      
      let variants: any[] = []
      if (variantIds.length > 0) {
        const { data: variantData } = await supabase.from('product_variants').select('id, price_override, product_id').in('id', variantIds)
        variants = variantData || []
      }

      let calculatedTotal = 0;
      cartItems.forEach((item: any) => {
         const dbProduct = products?.find(p => p.id === item.id);
         if (!dbProduct) throw new Error("Product vanished during fulfillment");
         let price = Number(dbProduct.price);
         if (item.variant_id) {
            const dbVariant = variants.find(v => v.id === item.variant_id);
            if (dbVariant) price = Number(dbVariant.price_override ?? dbProduct.price);
         }
         calculatedTotal += Math.round(price) * item.qty;
      });

      if (Math.abs(paidAmount - calculatedTotal) >= 1.0) {
         throw new Error(`Financial discrepancy in webhook: Paid ${paidAmount}, Expected ${calculatedTotal}`);
      }

      // Execute Atomic Shipment
      const { data: rpcResult, error: rpcError } = await supabase.rpc('create_order_secure', {
        p_user_id: userId,
        p_total_amount: calculatedTotal,
        p_payment_ref: reference,
        p_shipping_details: shippingDetails,
        p_order_items: cartItems.map((item: any) => {
          const dbProduct = products?.find(p => p.id === item.id)
          let itemPrice = Number(dbProduct?.price)
          if (item.variant_id) {
            const dbVariant = variants.find(v => v.id === item.variant_id)
            const vPrice = dbVariant?.price_override ?? dbProduct?.price
            itemPrice = Number(vPrice)
          }
          return {
            id: item.id,
            variant_id: item.variant_id || null,
            name: dbProduct?.name || 'Unknown Item',
            price: itemPrice,
            quantity: item.qty,
            attributes: item.attributes || {}
          }
        })
      });

      if (rpcError) {
         if (rpcError.message && rpcError.message.includes('Insufficient stock')) {
            // Webhook triggered auto-refund
            console.error(`LUSTRAX WEBHOOK: Stock out for ${reference}. Initiating background refund.`);
            await fetch('https://api.paystack.co/refund', {
               method: 'POST',
               headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
               body: JSON.stringify({ transaction: reference })
            });

            await supabase.from('payment_reconciliation')
              .update({ status: 'refunded', metadata: { reason: 'stock_out_webhook', timestamp: new Date().toISOString() } })
              .eq('reference', reference);
            
            return new Response('Refunded due to stock out', { status: 200 });
         }
         throw rpcError;
      }

      const orderId = rpcResult.order_id;

      // Update Reconciliation
      await supabase.from('payment_reconciliation')
        .update({ status: 'verified', metadata: { order_id: orderId, verified_at: new Date().toISOString(), by: 'webhook' } })
        .eq('reference', reference);

      // Async Receipt Dispatch
      const { data: userData } = await supabase.from('profiles').select('email').eq('id', userId).single();
      if (userData?.email) {
        fetch(`${SUPABASE_URL}/functions/v1/send-receipt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({
            order: { id: orderId, total_amount: calculatedTotal, payment_reference: reference },
            items: cartItems.map((i: any) => ({ product_name: products?.find(p=>p.id===i.id)?.name, quantity: i.qty, price: calculatedTotal / i.qty })),
            userEmail: userData.email
          })
        }).catch(err => console.error('Receipt Dispatch Failed (Webhook):', err));
      }

      console.log(`LUSTRAX WEBHOOK: Success fulfillment for ${reference}`);
      return new Response('Success', { status: 200 });
    }

    return new Response('Event ignored', { status: 200 });

  } catch (err: any) {
    console.error('LUSTRAX WEBHOOK ERROR:', err);
    return new Response(err.message || 'Internal Server Error', { status: 500 });
  }
})
