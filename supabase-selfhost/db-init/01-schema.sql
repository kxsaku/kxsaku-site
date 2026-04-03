-- kxsaku.com Supabase Self-Hosted Schema
-- 13 tables + custom types + triggers

-- Custom types
CREATE TYPE inquiry_priority AS ENUM ('green', 'yellow', 'red');
CREATE TYPE inquiry_status AS ENUM ('open', 'in_progress', 'walkaway', 'closed', 'archived');

-- 1. user_profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email VARCHAR NOT NULL,
  full_name VARCHAR,
  business_name VARCHAR,
  phone VARCHAR,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX idx_user_profiles_user_id ON public.user_profiles(user_id);

-- 2. client_profiles
CREATE TABLE IF NOT EXISTS public.client_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR NOT NULL,
  contact_name VARCHAR,
  business_name VARCHAR,
  phone VARCHAR,
  business_location VARCHAR,
  mailing_address VARCHAR,
  billing_address VARCHAR,
  billing_same_as_mailing BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_profiles_email ON public.client_profiles(email);

-- 3. billing_subscriptions
CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR NOT NULL,
  stripe_customer_id VARCHAR,
  stripe_subscription_id VARCHAR,
  status VARCHAR NOT NULL DEFAULT 'inactive',
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  current_period_end TIMESTAMPTZ,
  last_payment_status VARCHAR,
  last_payment_amount NUMERIC,
  last_payment_currency VARCHAR,
  last_payment_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. chat_threads
CREATE TABLE IF NOT EXISTS public.chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_sender_role VARCHAR,
  unread_for_admin BOOLEAN NOT NULL DEFAULT false,
  unread_for_client BOOLEAN NOT NULL DEFAULT false,
  last_client_msg_at TIMESTAMPTZ,
  last_admin_msg_at TIMESTAMPTZ,
  last_admin_email_sent_at TIMESTAMPTZ,
  last_client_email_sent_at TIMESTAMPTZ,
  admin_email_muted BOOLEAN NOT NULL DEFAULT false,
  client_email_muted BOOLEAN NOT NULL DEFAULT false,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMPTZ
);
CREATE INDEX idx_chat_threads_user_id ON public.chat_threads(user_id);

-- 5. chat_messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  sender_role VARCHAR NOT NULL,
  body TEXT NOT NULL,
  edited_at TIMESTAMPTZ,
  original_body TEXT,
  deleted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_by_client_at TIMESTAMPTZ,
  reply_to_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_messages_thread_id ON public.chat_messages(thread_id);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at);

-- 6. chat_attachments
CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  uploader_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  uploader_role VARCHAR NOT NULL,
  storage_bucket VARCHAR NOT NULL DEFAULT 'chat-attachments',
  storage_path VARCHAR NOT NULL,
  original_name VARCHAR NOT NULL,
  mime_type VARCHAR NOT NULL,
  size_bytes BIGINT,
  filename VARCHAR NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_attachments_thread_id ON public.chat_attachments(thread_id);
CREATE INDEX idx_chat_attachments_message_id ON public.chat_attachments(message_id);

-- 7. chat_notification_prefs
CREATE TABLE IF NOT EXISTS public.chat_notification_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. chat_notification_state
CREATE TABLE IF NOT EXISTS public.chat_notification_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. chat_presence
CREATE TABLE IF NOT EXISTS public.chat_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. inquiries
CREATE TABLE IF NOT EXISTS public.inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contact_name VARCHAR NOT NULL,
  business_name VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  phone VARCHAR NOT NULL,
  location VARCHAR NOT NULL,
  company_size VARCHAR NOT NULL,
  services JSONB,
  current_setup TEXT,
  goals TEXT,
  budget VARCHAR,
  timeline VARCHAR,
  extra_notes TEXT,
  status VARCHAR NOT NULL DEFAULT 'open',
  priority VARCHAR NOT NULL DEFAULT 'green',
  owner_email VARCHAR,
  priority_flag VARCHAR,
  notes TEXT,
  work_order BIGINT,
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  phone_display VARCHAR,
  wo_number BIGINT
);
CREATE INDEX idx_inquiries_status ON public.inquiries(status);
CREATE INDEX idx_inquiries_email ON public.inquiries(email);

-- 11. sns_internal_notes
CREATE TABLE IF NOT EXISTS public.sns_internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR NOT NULL,
  body TEXT NOT NULL,
  client_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_label VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. sns_system_status
CREATE TABLE IF NOT EXISTS public.sns_system_status (
  id SMALLINT PRIMARY KEY,
  mode VARCHAR NOT NULL DEFAULT 'normal',
  message TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  target_table VARCHAR,
  target_id VARCHAR,
  details JSONB,
  ip_address VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to all tables with updated_at column
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
    AND table_name != 'audit_logs'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()',
      tbl
    );
  END LOOP;
END;
$$;

-- Enable Realtime for chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
