export class MetaWhatsAppAPI {
  private accessToken: string;
  private phoneNumberId: string;
  private baseUrl: string;

  constructor() {
    this.accessToken = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN') || '';
    this.phoneNumberId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID') || '';
    // Use Graph API v19.0 as a safe default
    this.baseUrl = `https://graph.facebook.com/v19.0/${this.phoneNumberId}`;
  }

  private async send(payload: any) {
    if (!this.accessToken || !this.phoneNumberId) {
      console.error('Meta API not properly configured with tokens.');
      return { success: false, error: 'Missing Meta Configuration' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        // Safe logging - omit access token details
        console.error('Meta API Error:', {
           status: response.status,
           error: data.error?.message,
           code: data.error?.code
        });
        return { success: false, error: data.error };
      }

      return { success: true, data };
    } catch (error: any) {
      console.error('Meta API Network Error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendTextMessage(to: string, text: string) {
    return this.send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      text: {
        body: text,
      }
    });
  }

  async sendInteractiveMenu(to: string, text: string, options: { id: string, title: string, description?: string }[]) {
    // WhatsApp restricts interactive lists to max 10 items
    const rows = options.slice(0, 10).map(opt => ({
      id: opt.id,
      title: opt.title,
      description: opt.description
    }));

    return this.send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: 'Lustrax Jewelries'
        },
        body: {
          text: text
        },
        footer: {
          text: 'Select an option'
        },
        action: {
          button: 'Options',
          sections: [
            {
              title: 'Menu',
              rows: rows
            }
          ]
        }
      }
    });
  }

  async sendProductImage(to: string, imageUrl: string, caption: string) {
    return this.send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'image',
      image: {
        link: imageUrl,
        caption: caption
      }
    });
  }

  async sendInteractiveButtons(to: string, text: string, buttons: { id: string, title: string }[]) {
    const actionButtons = buttons.slice(0, 3).map(btn => ({
      type: 'reply',
      reply: {
        id: btn.id,
        title: btn.title
      }
    }));

    return this.send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: text
        },
        action: {
          buttons: actionButtons
        }
      }
    });
  }
}
