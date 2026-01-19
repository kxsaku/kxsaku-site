// API Response Types

export interface ApiResponse<T = unknown> {
  ok?: boolean;
  error?: string;
  details?: string;
  data?: T;
}

// User & Auth Types
export interface UserProfile {
  id: string;
  email: string;
  is_admin: boolean;
  created_at: string;
}

export interface ClientProfile {
  id: string;
  user_id: string;
  contact_name: string;
  business_name: string | null;
  email: string;
  phone: string | null;
  created_at: string;
}

// Chat Types
export interface ChatThread {
  id: string;
  user_id: string;
  created_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_role: 'client' | 'admin' | null;
  unread_for_admin: boolean;
  unread_for_client: boolean;
  last_client_msg_at: string | null;
}

export interface ChatAttachment {
  id: string;
  storage_path: string;
  mime_type: string;
  file_name: string;
  size_bytes: number | null;
  uploaded_at: string | null;
  url: string | null;
  signed_url: string | null;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  sender_role: 'client' | 'admin';
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  delivered_at: string | null;
  reply_to_message_id: string | null;
  attachments?: ChatAttachment[];
}

export interface ChatHistoryResponse {
  ok: boolean;
  thread_id: string | null;
  messages: ChatMessage[];
  profile?: ClientProfile;
}

export interface SendMessageResponse {
  ok: boolean;
  thread_id: string;
  message: ChatMessage;
}

// Inquiry Types
export interface Inquiry {
  id: string;
  user_id: string | null;
  work_order: number | null;
  email: string;
  contact_name: string | null;
  business_name: string | null;
  phone: string | null;
  location: string | null;
  company_size: string | null;
  services: string[] | string | null;
  inquiry_type: string | null;
  inquiry_text: string | null;
  current_setup: string | null;
  goals: string | null;
  budget: string | null;
  timeline: string | null;
  extra_notes: string | null;
  notes: string | null;
  status: 'new' | 'assigned' | 'working' | 'completed' | 'walkaway';
  priority_flag: 'red' | 'yellow' | 'green' | 'none' | null;
  created_at: string;
  updated_at: string | null;
}

// Subscription Types
export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete' | null;
  plan: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
}

// Internal Notes Types
export interface InternalNote {
  id: string;
  title: string;
  body: string;
  client_user_id: string | null;
  client_label: string | null;
  created_at: string;
  updated_at: string | null;
}

// Admin Client List Types
export interface AdminClient {
  id: string;
  user_id: string;
  contact_name: string;
  business_name: string | null;
  email: string;
  phone: string | null;
  created_at: string;
  subscription?: {
    status: string | null;
    plan: string | null;
    current_period_end: string | null;
  };
  thread?: {
    id: string;
    unread_for_admin: boolean;
    last_message_at: string | null;
  };
  // Online status
  is_online?: boolean;
  last_seen?: string | null;
}

// Invite Types
export interface Invite {
  id: string;
  email: string;
  token: string;
  expires_at: string;
  accepted: boolean;
  created_at: string;
}
