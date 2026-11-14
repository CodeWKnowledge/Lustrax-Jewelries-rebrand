import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { MetaWhatsAppAPI } from "./meta-api.ts"

const WHATSAPP_BOT_ENABLED = Deno.env.get('WHATSAPP_BOT_ENABLED') !== 'false';
const META_VERIFY_TOKEN = Deno.env.get('META_WHATSAPP_VERIFY_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const metaApi = new MetaWhatsAppAPI();

serve(async (req) => {
  // 1. KILL SWITCH: If disabled, ignore gracefully
  if (!WHATSAPP_BOT_ENABLED) {
    return new Response('WhatsApp Bot is disabled.', { status: 200 });
  }

  const url = new URL(req.url);

  // 2. META WEBHOOK VERIFICATION (GET)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
      console.log('LUSTRAX WHATSAPP: Webhook Verified.');
      return new Response(challenge, { status: 200 });
    } else {
      console.error('LUSTRAX WHATSAPP: Webhook Verification Failed.');
      return new Response('Forbidden', { status: 403 });
    }
  }

  // 3. INCOMING WEBHOOK EVENTS (POST)
  if (req.method === 'POST') {
    try {
      const body = await req.json();

      // Check if this is a WhatsApp API event
      if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry) {
          for (const change of entry.changes) {
            if (change.value && change.value.messages) {
              const message = change.value.messages[0];
              const contact = change.value.contacts?.[0];
              
              if (message && contact) {
                await handleIncomingMessage(message, contact);
              }
            }
            // Ignore status updates for now (read/delivered)
          }
        }
      }

      // Always return 200 OK to Meta to acknowledge receipt, otherwise they retry
      return new Response('EVENT_RECEIVED', { status: 200 });
    } catch (error: any) {
      console.error('LUSTRAX WHATSAPP ERROR:', error.message);
      // Still return 200 so Meta doesn't retry infinitely on a bad payload
      return new Response('EVENT_ERROR_LOGGED', { status: 200 });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
});

async function handleIncomingMessage(message: any, contact: any) {
  const fromNumber = message.from; // Phone number
  const senderName = contact.profile?.name || 'Customer';

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  // 1. Get or Create Session
  let { data: session, error: sessionError } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('phone_number', fromNumber)
    .single();

  if (!session && (sessionError?.code === 'PGRST116')) {
    // Session doesn't exist, create it
    const { data: newSession } = await supabase
      .from('whatsapp_sessions')
      .insert({
        phone_number: fromNumber,
        current_state: 'MAIN_MENU',
        context: {}
      })
      .select('*')
      .single();
    
    session = newSession;
  } else if (sessionError && sessionError.code !== 'PGRST116') {
     console.error('Session retrieval error:', sessionError);
     return;
  }

  // 2. Determine Intent (Basic parsing)
  let textBody = '';
  if (message.type === 'text') {
    textBody = message.text.body.trim().toLowerCase();
  } else if (message.type === 'interactive') {
    if (message.interactive.type === 'button_reply') {
      textBody = message.interactive.button_reply.id;
    } else if (message.interactive.type === 'list_reply') {
      textBody = message.interactive.list_reply.id;
    }
  }

  // Handle Greetings
  if (['hi', 'hello', 'hey', 'menu', 'start'].includes(textBody)) {
    await sendMainMenu(fromNumber);
    await updateSessionState(supabase, fromNumber, 'MAIN_MENU');
    return;
  }

  // Handle Main Menu Actions
  if (textBody === 'browse_products') {
     const { data: products, error } = await supabase
        .from('products')
        .select('id, name, price, stock_quantity, image_url')
        .eq('is_featured', true)
        .limit(3);

     if (error || !products || products.length === 0) {
        await metaApi.sendTextMessage(fromNumber, 'No products available at the moment.');
        return;
     }

     await metaApi.sendTextMessage(fromNumber, 'Here are our featured products:');
     for (const product of products) {
        const isAvailable = product.stock_quantity > 0 ? 'Available' : 'Out of Stock';
        const caption = `*${product.name}*\n₦${product.price.toLocaleString()}\n\nAvailability: ${isAvailable}`;
        if (product.image_url) {
           await metaApi.sendProductImage(fromNumber, product.image_url, caption);
        } else {
           await metaApi.sendTextMessage(fromNumber, caption);
        }
     }
     return;
  } else if (textBody === 'find_product') {
     await metaApi.sendTextMessage(fromNumber, 'Please type the name of the product you are looking for (e.g., "necklace" or "gold bracelet").');
     await updateSessionState(supabase, fromNumber, 'SEARCHING_PRODUCT');
     return;
  } else if (textBody === 'my_cart') {
     await metaApi.sendTextMessage(fromNumber, 'Your cart is currently empty.');
     return;
  } else if (textBody === 'my_orders') {
     await metaApi.sendTextMessage(fromNumber, 'Order history coming soon!');
     return;
  } else if (textBody === 'contact_support') {
     await metaApi.sendTextMessage(fromNumber, 'A support representative will be with you shortly. You can leave your message here.');
     await updateSessionState(supabase, fromNumber, 'SUPPORT');
     return;
  }

  // Handle Searching
  if (session?.current_state === 'SEARCHING_PRODUCT') {
     await handleProductSearch(supabase, fromNumber, textBody);
     return;
  }

  // Fallback
  await sendMainMenu(fromNumber, "I didn't quite catch that. How can I help?");
}

async function sendMainMenu(to: string, customHeader?: string) {
  const headerText = customHeader || 'Welcome to Lustrax Jewelries. How may we help you today?';
  await metaApi.sendInteractiveMenu(to, headerText, [
    { id: 'browse_products', title: 'Browse Products' },
    { id: 'find_product', title: 'Find a Product' },
    { id: 'my_cart', title: 'My Cart' },
    { id: 'my_orders', title: 'My Orders' },
    { id: 'contact_support', title: 'Contact Support' }
  ]);
}

async function updateSessionState(supabase: any, phone: string, state: string, contextUpdate = {}) {
  await supabase
    .from('whatsapp_sessions')
    .update({ 
       current_state: state, 
       updated_at: new Date().toISOString() 
    })
    .eq('phone_number', phone);
}

async function handleProductSearch(supabase: any, to: string, query: string) {
   // Basic search using ilike
   const { data: products, error } = await supabase
      .from('products')
      .select('id, name, price, stock_quantity, image_url')
      .ilike('name', `%${query}%`)
      .limit(3);

   if (error || !products || products.length === 0) {
      await metaApi.sendTextMessage(to, `I couldn't find any products matching "${query}". Did you mean something else?`);
      return;
   }

   await metaApi.sendTextMessage(to, `Here are some products that match '${query}':`);

   for (const product of products) {
      const isAvailable = product.stock_quantity > 0 ? 'Available' : 'Out of Stock';
      const caption = `*${product.name}*\n₦${product.price.toLocaleString()}\n\nAvailability: ${isAvailable}`;
      
      if (product.image_url) {
         await metaApi.sendProductImage(to, product.image_url, caption);
      } else {
         await metaApi.sendTextMessage(to, caption);
      }
   }
   
   // End search state
   await updateSessionState(supabase, to, 'MAIN_MENU');
}
