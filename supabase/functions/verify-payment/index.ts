/**
 * LUSTRAX JEWELRIES - SUPABASE EDGE FUNCTIONS
 * 
 * verify-payment: Securely verifies Paystack transaction references
 * and creates orders server-side to ensure data integrity.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // PRE-FLIGHT: Ensure system coordinates are initialized
  if (!PAYSTACK_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('CRITICAL: Server configuration is incomplete')
    return new Response(JSON.stringify({ error: 'Acquisition server misconfigured' }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const { reference, userId, cartItems, shippingDetails, totalAmount } = await req.json()

    if (!reference || !userId || !cartItems || !totalAmount) {
      return new Response(JSON.stringify({ error: 'Incomplete transaction coordinates' }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 1. BASIC AUTH & REFERENCE CHECK (Already performed by Paystack callback)
    const paystackResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
    }).then(res => res.json())

    if (paystackResponse.status !== true || !paystackResponse.data) {
      console.warn(`LUSTRAX WARNING: Merchant Verification Denied for ${reference}. Message: ${paystackResponse.message}`);
      return new Response(JSON.stringify({ 
        error: `Paystack rejected this reference: ${paystackResponse.message || 'Verification failure'}` 
      }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data } = paystackResponse;

    if (data.status === 'success') {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      
      // 2. DATA INTEGRITY: VERIFY PRICES & TOTAL AMOUNT
      const paidAmount = data.amount / 100 // Convert from kobo to Naira
      const productIds = cartItems.map((item: any) => item.id)
      const variantIds = cartItems.filter((item: any) => item.variant_id).map((item: any) => item.variant_id)
      
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, price')
        .in('id', productIds)

      if (productsError) throw productsError

      // Fetch variants if applicable
      let variants: any[] = []
      if (variantIds.length > 0) {
        const { data: variantData, error: variantError } = await supabase
          .from('product_variants')
          .select('id, price_override, product_id')
          .in('id', variantIds)
        if (variantError) throw variantError
        variants = variantData || []
      }

      // Recalculate total based on DB prices and validate quantities
      let auditLog = ""
      const calculatedTotal = cartItems.reduce((acc: number, item: any) => {
        if (item.quantity <= 0) throw new Error(`Invalid quantity detected for product ${item.id}`);
        
        const dbProduct = products.find(p => p.id === item.id)
        if (!dbProduct) throw new Error(`Product ${item.id} not found in inventory`)
        
        let price = Number(dbProduct.price)
        let type = "Base"
        if (item.variant_id) {
          const dbVariant = variants.find(v => v.id === item.variant_id)
          if (!dbVariant) throw new Error(`Variant ${item.variant_id} not found in inventory`)
          const vPrice = dbVariant.price_override ?? dbProduct.price
          price = Number(vPrice)
          type = "Variant"
        }

        const itemTotal = Math.round(price) * item.quantity
        auditLog += `[${type}] ${item.name} x${item.quantity}: ${Math.round(price)} NGN (Item Total: ${itemTotal})\n`
        return acc + itemTotal
      }, 0)

      console.log(`LUSTRAX AUDIT INITIATED:\n${auditLog}------------------\nTOTAL EXPECTED: ${calculatedTotal} NGN\nTOTAL CAPTURED: ${paidAmount} NGN`)

      // Verify that the amount paid matches the calculated inventory value
      const auditPassed = Math.abs(paidAmount - calculatedTotal) < 1.0; 

      if (!auditPassed) {
        return new Response(JSON.stringify({ 
          error: 'Financial discrepancy detected and blocked.',
          details: `Vault Audit mismatch: Our record says ${calculatedTotal} NGN, but Paystack authorized ${paidAmount} NGN. Please refresh your cart to synchronize prices.`
        }), { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // 3. ATOMIC SHIPMENT: Create order, items, and transaction in one DB transaction
      const { data: rpcResult, error: rpcError } = await supabase.rpc('create_order_secure', {
        p_user_id: userId,
        p_total_amount: calculatedTotal,
        p_payment_ref: reference,
        p_shipping_details: shippingDetails,
        p_order_items: cartItems.map((item: any) => {
          const dbProduct = products.find(p => p.id === item.id)
          let itemPrice = Number(dbProduct.price)
          if (item.variant_id) {
            const dbVariant = variants.find(v => v.id === item.variant_id)
            const vPrice = dbVariant?.price_override ?? dbProduct.price
            itemPrice = Number(vPrice)
          }
          return {
            id: item.id,
            variant_id: item.variant_id || null,
            name: item.name,
            price: itemPrice,
            quantity: item.quantity,
            attributes: item.selected_attributes || {}
          }
        })
      })

      if (rpcError) {
        if (rpcError.message && rpcError.message.includes('Insufficient stock')) {
          console.error(`LUSTRAX WARNING: Stock out during checkout for ${reference}. Initiating auto-refund...`);
          try {
            // Initiate full refund
            const refundRes = await fetch('https://api.paystack.co/refund', {
              method: 'POST',
              headers: { 
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`, 
                'Content-Type': 'application/json' 
              },
              body: JSON.stringify({ transaction: reference })
            }).then(res => res.json());
            
            console.log('LUSTRAX REFUND LOG:', refundRes);

            // Update reconciliation to refunded
            await supabase.from('payment_reconciliation')
              .update({ status: 'refunded', metadata: { reason: 'stock_out', refund_res: refundRes, timestamp: new Date().toISOString() } })
              .eq('reference', reference);

            return new Response(JSON.stringify({ 
              error: 'Oops! The item sold out while you were paying. We have automatically reversed your payment.',
              refunded: true
            }), { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });

          } catch (refundErr) {
            console.error('CRITICAL: Auto-refund API Failed:', refundErr);
            throw new Error(`Checkout failed due to stock out, and auto-refund failed. Manual refund required. Ref: ${reference}`);
          }
        }
        throw rpcError
      }
      if (!rpcResult || !rpcResult.order_id) throw new Error('Order identification failure during archival.');
      const orderId = rpcResult.order_id

      // 4. ATOMIC RECONCILIATION: Mark reference as verified
      await supabase.from('payment_reconciliation')
        .update({ status: 'verified', metadata: { order_id: orderId, verified_at: new Date().toISOString() } })
        .eq('reference', reference)

      // 5. DISPATCH AUTOMATED RECEIPT (Async)
      const { data: userData } = await supabase.from('profiles').select('email').eq('id', userId).single()
      if (userData?.email) {
        fetch(`${SUPABASE_URL}/functions/v1/send-receipt`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            order: { id: orderId, total_amount: calculatedTotal, payment_reference: reference },
            items: cartItems,
            userEmail: userData.email
          })
        }).catch(err => console.error('Receipt Dispatch Failed:', err))
      }

      return new Response(JSON.stringify({ success: true, orderId }), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

    } else {

      return new Response(JSON.stringify({ error: 'Merchant verification failed' }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  } catch (error) {
    console.error('Edge Function Error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal logic error' }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
