-- Row Level Security Policies for kxsaku.com

-- Enable RLS on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_notification_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sns_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sns_system_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- user_profiles: Users can read their own profile; admins can read all
CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = user_id OR public.is_sns_admin());
CREATE POLICY "Service role full access" ON public.user_profiles
  FOR ALL USING (auth.role() = 'service_role');

-- client_profiles: Clients can read/update their own; admins can read all
CREATE POLICY "Clients can view own profile" ON public.client_profiles
  FOR SELECT USING (auth.uid() = user_id OR public.is_sns_admin());
CREATE POLICY "Clients can update own profile" ON public.client_profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access" ON public.client_profiles
  FOR ALL USING (auth.role() = 'service_role');

-- billing_subscriptions: Users can read their own; admins can read all
CREATE POLICY "Users can view own subscription" ON public.billing_subscriptions
  FOR SELECT USING (auth.uid() = user_id OR public.is_sns_admin());
CREATE POLICY "Service role full access" ON public.billing_subscriptions
  FOR ALL USING (auth.role() = 'service_role');

-- chat_threads: Users can see their own threads; admins can see all
CREATE POLICY "Users can view own threads" ON public.chat_threads
  FOR SELECT USING (auth.uid() = user_id OR public.is_sns_admin());
CREATE POLICY "Service role full access" ON public.chat_threads
  FOR ALL USING (auth.role() = 'service_role');

-- chat_messages: Users can see messages in their threads; admins can see all
CREATE POLICY "Users can view own thread messages" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.chat_threads WHERE id = chat_messages.thread_id AND user_id = auth.uid())
    OR public.is_sns_admin()
  );
CREATE POLICY "Service role full access" ON public.chat_messages
  FOR ALL USING (auth.role() = 'service_role');

-- chat_attachments: Same as messages
CREATE POLICY "Users can view own thread attachments" ON public.chat_attachments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.chat_threads WHERE id = chat_attachments.thread_id AND user_id = auth.uid())
    OR public.is_sns_admin()
  );
CREATE POLICY "Service role full access" ON public.chat_attachments
  FOR ALL USING (auth.role() = 'service_role');

-- chat_notification_prefs/state/presence: Own data only
CREATE POLICY "Users can manage own prefs" ON public.chat_notification_prefs
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access" ON public.chat_notification_prefs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can manage own notification state" ON public.chat_notification_state
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access" ON public.chat_notification_state
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can manage own presence" ON public.chat_presence
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role full access" ON public.chat_presence
  FOR ALL USING (auth.role() = 'service_role');

-- inquiries: Admins can do everything; public can insert (for form submission)
CREATE POLICY "Admins can manage inquiries" ON public.inquiries
  FOR ALL USING (public.is_sns_admin());
CREATE POLICY "Service role full access" ON public.inquiries
  FOR ALL USING (auth.role() = 'service_role');

-- sns_internal_notes: Admin only
CREATE POLICY "Admins can manage notes" ON public.sns_internal_notes
  FOR ALL USING (public.is_sns_admin());
CREATE POLICY "Service role full access" ON public.sns_internal_notes
  FOR ALL USING (auth.role() = 'service_role');

-- sns_system_status: Anyone can read; admins can write
CREATE POLICY "Anyone can read system status" ON public.sns_system_status
  FOR SELECT USING (true);
CREATE POLICY "Service role full access" ON public.sns_system_status
  FOR ALL USING (auth.role() = 'service_role');

-- audit_logs: Admin read only; service role writes
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
  FOR SELECT USING (public.is_sns_admin());
CREATE POLICY "Service role full access" ON public.audit_logs
  FOR ALL USING (auth.role() = 'service_role');

-- Storage bucket policy
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;
