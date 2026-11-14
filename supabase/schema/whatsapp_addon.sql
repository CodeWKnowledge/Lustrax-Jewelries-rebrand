-- Additive schema for WhatsApp Bot

CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
    phone_number TEXT PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    current_state TEXT NOT NULL DEFAULT 'MAIN_MENU',
    context JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
-- No public policies; only accessed via service_role key in the Edge Function.
