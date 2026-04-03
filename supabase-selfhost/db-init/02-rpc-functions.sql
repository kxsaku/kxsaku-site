-- RPC Functions for kxsaku.com

-- is_sns_admin(): Check if current user is admin
CREATE OR REPLACE FUNCTION public.is_sns_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE user_id = auth.uid()
    AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- refresh_chat_thread(p_thread_id): Refresh thread metadata from messages
CREATE OR REPLACE FUNCTION public.refresh_chat_thread(p_thread_id UUID)
RETURNS VOID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- reset_work_orders(): Reset work order numbering
CREATE OR REPLACE FUNCTION public.reset_work_orders()
RETURNS VOID AS $$
BEGIN
  UPDATE public.inquiries SET work_order = NULL, wo_number = NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
