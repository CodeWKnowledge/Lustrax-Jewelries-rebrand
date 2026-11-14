/**
 * LUSTRAX JEWELRIES - SUPABASE EDGE FUNCTIONS
 * 
 * send-receipt: Dispatch high-fidelity HTML receipts via Resend
 * after successful payment verification.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Resend } from "https://esm.sh/resend@3.2.0"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const resend = new Resend(RESEND_API_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { order, items, userEmail } = await req.json()

    if (!order || !items || !userEmail) {
      throw new Error('Manifest missing for dispatch')
    }

    const htmlContent = `
      <div style="font-family: 'Times New Roman', serif; max-width: 600px; margin: 0 auto; padding: 40px; border: 1px solid #f0f0f0;">
        <div style="text-align: center; margin-bottom: 40px;">
          <h1 style="letter-spacing: 0.5em; text-transform: uppercase; font-size: 24px; color: #1a1a1a;">Lustrax</h1>
          <p style="letter-spacing: 0.2em; text-transform: uppercase; font-size: 10px; color: #D4AF37;">Official Acquisition Manifest</p>
        </div>

        <div style="margin-bottom: 40px; border-bottom: 1px solid #f9f9f9; padding-bottom: 20px;">
          <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #999;">Reference: #${order.payment_reference.toUpperCase()}</p>
          <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #999;">Date: ${new Date(order.created_at).toLocaleDateString()}</p>
        </div>

        <div style="margin-bottom: 40px;">
          <h3 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.2em; border-bottom: 1px solid #1a1a1a; padding-bottom: 10px;">Curated Items</h3>
          <table style="width: 100%; border-collapse: collapse;">
            ${items.map((item: any) => `
              <tr>
                <td style="padding: 15px 0; font-size: 12px; color: #1a1a1a; text-transform: uppercase; letter-spacing: 0.1em;">
                  ${item.product_name} <span style="color: #999; font-size: 10px;">x${item.quantity}</span>
                </td>
                <td style="text-align: right; padding: 15px 0; font-size: 12px; font-weight: bold; color: #1a1a1a;">
                  ₦${(item.price * item.quantity).toLocaleString()}
                </td>
              </tr>
            `).join('')}
          </table>
        </div>

        <div style="background: #fafafa; padding: 30px; text-align: right;">
          <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #999; margin-bottom: 5px;">Total Value Acquired</p>
          <p style="font-size: 28px; color: #1a1a1a; margin: 0;">₦${order.total_amount.toLocaleString()}</p>
        </div>

        <div style="margin-top: 60px; text-align: center; font-size: 10px; color: #ccc; letter-spacing: 0.1em; text-transform: uppercase;">
          <p>This is a verified acquisition report from Lustrax Jewelries.</p>
          <p>Thank you for your patronage.</p>
        </div>
      </div>
    `

    const { data, error } = await resend.emails.send({
      from: 'Lustrax Jewelries <oracle@lustrax.luxury>',
      to: [userEmail],
      subject: `Acquisition Manifest: ${order.payment_reference.toUpperCase()}`,
      html: htmlContent,
    })

    if (error) throw error

    return new Response(JSON.stringify({ success: true, data }), { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Email Dispatch Error:', error)
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
