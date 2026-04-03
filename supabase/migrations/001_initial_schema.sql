--
-- PostgreSQL database dump
--

-- Dumped from database version 15.8
-- Dumped by pg_dump version 15.8

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: inquiry_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inquiry_priority AS ENUM (
    'green',
    'yellow',
    'red'
);


--
-- Name: inquiry_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inquiry_status AS ENUM (
    'open',
    'in_progress',
    'walkaway',
    'closed',
    'archived'
);


--
-- Name: is_sns_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_sns_admin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_id = auth.uid()
    AND is_admin = true
  );
END;
$$;


--
-- Name: refresh_chat_thread(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_chat_thread(p_thread_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_last_msg RECORD;
  v_admin_unread INT;
  v_client_unread INT;
BEGIN
  -- Get last message
  SELECT * INTO v_last_msg
  FROM public.chat_messages
  WHERE thread_id = p_thread_id AND deleted_at IS NULL
  ORDER BY created_at DESC LIMIT 1;

  -- Count unread
  SELECT COUNT(*) INTO v_admin_unread
  FROM public.chat_messages
  WHERE thread_id = p_thread_id
    AND sender_role = 'client'
    AND deleted_at IS NULL
    AND read_by_client_at IS NULL;

  SELECT COUNT(*) INTO v_client_unread
  FROM public.chat_messages
  WHERE thread_id = p_thread_id
    AND sender_role = 'admin'
    AND deleted_at IS NULL
    AND read_by_client_at IS NULL;

  -- Update thread
  UPDATE public.chat_threads SET
    last_message_at = v_last_msg.created_at,
    last_message_preview = LEFT(v_last_msg.body, 100),
    last_sender_role = v_last_msg.sender_role,
    unread_for_admin = (v_admin_unread > 0),
    unread_for_client = (v_client_unread > 0),
    updated_at = now()
  WHERE id = p_thread_id;
END;
$$;


--
-- Name: reset_work_orders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_work_orders() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.inquiries SET work_order = NULL, wo_number = NULL;
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_email character varying NOT NULL,
    action character varying NOT NULL,
    target_table character varying,
    target_id character varying,
    details jsonb,
    ip_address character varying,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_subscriptions (
    user_id uuid NOT NULL,
    email character varying NOT NULL,
    stripe_customer_id character varying,
    stripe_subscription_id character varying,
    status character varying DEFAULT 'inactive'::character varying NOT NULL,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    current_period_end timestamp with time zone,
    last_payment_status character varying,
    last_payment_amount numeric,
    last_payment_currency character varying,
    last_payment_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    message_id uuid,
    uploader_user_id uuid NOT NULL,
    uploader_role character varying NOT NULL,
    storage_bucket character varying DEFAULT 'chat-attachments'::character varying NOT NULL,
    storage_path character varying NOT NULL,
    original_name character varying NOT NULL,
    mime_type character varying NOT NULL,
    size_bytes bigint,
    filename character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    sender_role character varying NOT NULL,
    body text NOT NULL,
    edited_at timestamp with time zone,
    original_body text,
    deleted_at timestamp with time zone,
    delivered_at timestamp with time zone DEFAULT now() NOT NULL,
    read_by_client_at timestamp with time zone,
    reply_to_message_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


-- REMOVED: chat_notification_prefs, chat_notification_state, chat_presence
-- These tables were unused — presence is tracked on chat_threads directly (is_online, last_seen).


--
-- Name: chat_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_message_at timestamp with time zone,
    last_message_preview text,
    last_sender_role character varying,
    unread_for_admin boolean DEFAULT false NOT NULL,
    unread_for_client boolean DEFAULT false NOT NULL,
    last_client_msg_at timestamp with time zone,
    last_admin_msg_at timestamp with time zone,
    last_admin_email_sent_at timestamp with time zone,
    last_client_email_sent_at timestamp with time zone,
    admin_email_muted boolean DEFAULT false NOT NULL,
    client_email_muted boolean DEFAULT false NOT NULL,
    is_online boolean DEFAULT false NOT NULL,
    last_seen timestamp with time zone
);


--
-- Name: client_profiles; Type: TABLE; Schema: public; Owner: -
--
-- TODO: client_profiles overlaps with user_profiles on email, business_name, and phone.
-- user_profiles tracks admin status; client_profiles tracks client-specific fields (addresses, billing).
-- Consider merging into a unified profile table in a future migration to eliminate ambiguity
-- about which table is the source of truth for shared fields.
--

CREATE TABLE public.client_profiles (
    user_id uuid NOT NULL,
    email character varying NOT NULL,
    contact_name character varying,
    business_name character varying,
    phone character varying,
    business_location character varying,
    mailing_address character varying,
    billing_address character varying,
    billing_same_as_mailing boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    contact_name character varying NOT NULL,
    business_name character varying NOT NULL,
    email character varying NOT NULL,
    phone character varying NOT NULL,
    location character varying NOT NULL,
    company_size character varying NOT NULL,
    services jsonb,
    current_setup text,
    goals text,
    budget character varying,
    timeline character varying,
    extra_notes text,
    status character varying DEFAULT 'open'::character varying NOT NULL,
    priority character varying DEFAULT 'green'::character varying NOT NULL,
    owner_email character varying,
    priority_flag character varying,
    notes text,
    work_order bigint,
    phone_verified boolean DEFAULT false NOT NULL,
    phone_display character varying,
    wo_number bigint
);


--
-- Name: sns_internal_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sns_internal_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying NOT NULL,
    body text NOT NULL,
    client_user_id uuid,
    client_label character varying,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sns_system_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sns_system_status (
    id smallint NOT NULL,
    mode character varying DEFAULT 'normal'::character varying NOT NULL,
    message text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    email character varying NOT NULL,
    full_name character varying,
    business_name character varying,
    phone character varying,
    is_admin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: billing_subscriptions billing_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_pkey PRIMARY KEY (user_id);


--
-- Name: chat_attachments chat_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachments
    ADD CONSTRAINT chat_attachments_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


-- REMOVED: chat_notification_prefs_pkey, chat_notification_state_pkey, chat_presence_pkey (tables removed)


--
-- Name: chat_threads chat_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_pkey PRIMARY KEY (id);


--
-- Name: client_profiles client_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_profiles
    ADD CONSTRAINT client_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: inquiries inquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inquiries
    ADD CONSTRAINT inquiries_pkey PRIMARY KEY (id);


--
-- Name: sns_internal_notes sns_internal_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sns_internal_notes
    ADD CONSTRAINT sns_internal_notes_pkey PRIMARY KEY (id);


--
-- Name: sns_system_status sns_system_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sns_system_status
    ADD CONSTRAINT sns_system_status_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at);


--
-- Name: idx_chat_attachments_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_attachments_message_id ON public.chat_attachments USING btree (message_id);


--
-- Name: idx_chat_attachments_thread_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_attachments_thread_id ON public.chat_attachments USING btree (thread_id);


--
-- Name: idx_chat_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_created_at ON public.chat_messages USING btree (created_at);


--
-- Name: idx_chat_messages_thread_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_thread_id ON public.chat_messages USING btree (thread_id);


--
-- Name: idx_chat_threads_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_threads_user_id ON public.chat_threads USING btree (user_id);


--
-- Name: idx_client_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_profiles_email ON public.client_profiles USING btree (email);


--
-- Name: idx_inquiries_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inquiries_email ON public.inquiries USING btree (email);


--
-- Name: idx_inquiries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inquiries_status ON public.inquiries USING btree (status);


--
-- Name: idx_user_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_email ON public.user_profiles USING btree (email);


--
-- Name: idx_user_profiles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_user_id ON public.user_profiles USING btree (user_id);


--
-- Name: billing_subscriptions set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.billing_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: chat_messages set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- REMOVED: set_updated_at triggers for chat_notification_prefs, chat_notification_state, chat_presence (tables removed)


--
-- Name: chat_threads set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.chat_threads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: client_profiles set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.client_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: inquiries set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.inquiries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: sns_internal_notes set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sns_internal_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: sns_system_status set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sns_system_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: user_profiles set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: billing_subscriptions billing_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chat_attachments chat_attachments_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachments
    ADD CONSTRAINT chat_attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;


--
-- Name: chat_attachments chat_attachments_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachments
    ADD CONSTRAINT chat_attachments_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.chat_threads(id) ON DELETE CASCADE;


--
-- Name: chat_attachments chat_attachments_uploader_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachments
    ADD CONSTRAINT chat_attachments_uploader_user_id_fkey FOREIGN KEY (uploader_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_reply_to_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;


--
-- Name: chat_messages chat_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.chat_threads(id) ON DELETE CASCADE;


-- REMOVED: FK constraints for chat_notification_prefs, chat_notification_state, chat_presence (tables removed)


--
-- Name: chat_threads chat_threads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: client_profiles client_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_profiles
    ADD CONSTRAINT client_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sns_internal_notes sns_internal_notes_client_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sns_internal_notes
    ADD CONSTRAINT sns_internal_notes_client_user_id_fkey FOREIGN KEY (client_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inquiries Admins can manage inquiries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage inquiries" ON public.inquiries USING (public.is_sns_admin());


--
-- Name: sns_internal_notes Admins can manage notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage notes" ON public.sns_internal_notes USING (public.is_sns_admin());


--
-- Name: audit_logs Admins can view audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT USING (public.is_sns_admin());


--
-- Name: sns_system_status Anyone can read system status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read system status" ON public.sns_system_status FOR SELECT USING (true);


--
-- Name: client_profiles Clients can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can update own profile" ON public.client_profiles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: client_profiles Clients can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can view own profile" ON public.client_profiles FOR SELECT USING (((auth.uid() = user_id) OR public.is_sns_admin()));


--
-- Name: audit_logs Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.audit_logs USING ((auth.role() = 'service_role'::text));


--
-- Name: billing_subscriptions Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.billing_subscriptions USING ((auth.role() = 'service_role'::text));


--
-- Name: chat_attachments Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.chat_attachments USING ((auth.role() = 'service_role'::text));


--
-- Name: chat_messages Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.chat_messages USING ((auth.role() = 'service_role'::text));


-- REMOVED: Service role policies for chat_notification_prefs, chat_notification_state, chat_presence (tables removed)


--
-- Name: chat_threads Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.chat_threads USING ((auth.role() = 'service_role'::text));


--
-- Name: client_profiles Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.client_profiles USING ((auth.role() = 'service_role'::text));


--
-- Name: inquiries Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.inquiries USING ((auth.role() = 'service_role'::text));


--
-- Name: sns_internal_notes Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.sns_internal_notes USING ((auth.role() = 'service_role'::text));


--
-- Name: sns_system_status Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.sns_system_status USING ((auth.role() = 'service_role'::text));


--
-- Name: user_profiles Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.user_profiles USING ((auth.role() = 'service_role'::text));


-- REMOVED: User policies for chat_notification_prefs, chat_notification_state, chat_presence (tables removed)


--
-- Name: user_profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT USING (((auth.uid() = user_id) OR public.is_sns_admin()));


--
-- Name: billing_subscriptions Users can view own subscription; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own subscription" ON public.billing_subscriptions FOR SELECT USING (((auth.uid() = user_id) OR public.is_sns_admin()));


--
-- Name: chat_attachments Users can view own thread attachments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own thread attachments" ON public.chat_attachments FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.chat_threads
  WHERE ((chat_threads.id = chat_attachments.thread_id) AND (chat_threads.user_id = auth.uid())))) OR public.is_sns_admin()));


--
-- Name: chat_messages Users can view own thread messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own thread messages" ON public.chat_messages FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.chat_threads
  WHERE ((chat_threads.id = chat_messages.thread_id) AND (chat_threads.user_id = auth.uid())))) OR public.is_sns_admin()));


--
-- Name: chat_threads Users can view own threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own threads" ON public.chat_threads FOR SELECT USING (((auth.uid() = user_id) OR public.is_sns_admin()));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- REMOVED: RLS for chat_notification_prefs, chat_notification_state, chat_presence (tables removed)

--
-- Name: chat_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: client_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: inquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

--
-- Name: sns_internal_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sns_internal_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: sns_system_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sns_system_status ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

