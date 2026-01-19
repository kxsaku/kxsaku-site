// API Wrapper for Supabase Edge Functions
import { supabase, SUPABASE_URL } from './supabase';
import type {
  ApiResponse,
  ChatHistoryResponse,
  SendMessageResponse,
  ChatMessage,
  Inquiry,
  AdminClient,
  InternalNote,
  Invite,
} from '../types';

type FunctionName =
  | 'client-chat-history'
  | 'client-chat-send'
  | 'client-chat-edit'
  | 'client-chat-delete'
  | 'client-chat-mark-read'
  | 'client-presence'
  | 'get-billing-status'
  | 'create-checkout-session'
  | 'create-portal-session'
  | 'admin-client-list'
  | 'admin-chat-client-list'
  | 'admin-chat-history'
  | 'admin-chat-send'
  | 'admin-broadcast'
  | 'admin-notes'
  | 'admin-invite'
  | 'system-status-get'
  | 'chat-attachment-upload-url';

async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export async function invokeFunction<T = unknown>(
  functionName: FunctionName,
  body?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  try {
    const token = await getAuthToken();
    console.log(`=== API CALL: ${functionName} ===`);
    console.log('Token present:', !!token);

    if (!token) {
      console.log('No token - not authenticated');
      return { error: 'Not authenticated' };
    }

    const url = `${SUPABASE_URL}/functions/v1/${functionName}`;
    console.log('Calling URL:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', JSON.stringify(data).substring(0, 200));

    if (!response.ok) {
      return { error: data.error || 'Request failed', details: data.details };
    }

    return data as ApiResponse<T>;
  } catch (error) {
    console.error(`API Error (${functionName}):`, error);
    return { error: String(error) };
  }
}

// Client Chat API
export const clientChat = {
  getHistory: () => invokeFunction<ChatHistoryResponse>('client-chat-history'),

  sendMessage: (body: string, attachmentIds?: string[]) =>
    invokeFunction<SendMessageResponse>('client-chat-send', {
      body,
      attachment_ids: attachmentIds,
    }),

  editMessage: (messageId: string, body: string) =>
    invokeFunction<ChatMessage>('client-chat-edit', { message_id: messageId, body }),

  deleteMessage: (messageId: string) =>
    invokeFunction('client-chat-delete', { message_id: messageId }),

  markRead: (threadId: string) => invokeFunction('client-chat-mark-read', { thread_id: threadId }),
};

// Client Presence API - for online status tracking
export const clientPresence = {
  heartbeat: () => invokeFunction('client-presence', { action: 'heartbeat' }),
  offline: () => invokeFunction('client-presence', { action: 'offline' }),
};

// Client Dashboard API (uses billing status)
export const clientDashboard = {
  get: () => invokeFunction('get-billing-status'),
};

// Client Subscription API
export const clientSubscription = {
  getCheckoutUrl: (priceId?: string) =>
    invokeFunction<{ url: string }>('create-checkout-session', { price_id: priceId }),

  getPortalUrl: () =>
    invokeFunction<{ url: string }>('create-portal-session'),
};

// Admin Clients API
export const adminClients = {
  list: () => invokeFunction<{ clients: AdminClient[] }>('admin-client-list'),

  // List with online status - fetches from both endpoints and merges
  listWithPresence: async () => {
    const [clientsRes, chatRes] = await Promise.all([
      invokeFunction<{ clients: any[] }>('admin-client-list'),
      invokeFunction<{ clients: any[] }>('admin-chat-client-list'),
    ]);

    if (clientsRes.error) return clientsRes;

    // Build a map of chat data (online status) by user_id
    const chatByUser = new Map<string, any>();
    if (!chatRes.error && (chatRes as any).clients) {
      for (const c of (chatRes as any).clients) {
        chatByUser.set(c.user_id, c);
      }
    }

    // Merge online status into client data
    const clients = ((clientsRes as any).clients || []).map((c: any) => {
      const chat = chatByUser.get(c.profile?.user_id || c.user_id);
      return {
        ...c,
        is_online: chat?.is_online ?? false,
        last_seen: chat?.last_seen ?? null,
        thread: chat ? {
          last_message_at: chat.last_message_at,
          unread_for_admin: chat.has_unread,
        } : undefined,
      };
    });

    return { clients, error: undefined };
  },

  // Get detail uses the same list endpoint and filters client-side, or uses chat-client-list
  getDetail: (userId: string) =>
    invokeFunction<AdminClient>('admin-chat-client-list', { user_id: userId }),
};

// Admin Chat API
export const adminChat = {
  getHistory: (userId: string) =>
    invokeFunction<ChatHistoryResponse>('admin-chat-history', { user_id: userId }),

  sendMessage: (userId: string, body: string, attachmentIds?: string[]) =>
    invokeFunction<SendMessageResponse>('admin-chat-send', {
      user_id: userId,
      body,
      // Edge function expects array of objects with attachment_id
      attachments: attachmentIds?.map(id => ({ attachment_id: id })),
    }),

  broadcast: (body: string) =>
    invokeFunction('admin-broadcast', { content: body }),
};

// Admin Notes API (uses action-based single endpoint)
export const adminNotes = {
  list: () => invokeFunction<{ notes: InternalNote[] }>('admin-notes', { action: 'list' }),

  save: (note: { id?: string; title: string; body: string; client_user_id?: string; client_label?: string }) =>
    invokeFunction<InternalNote>('admin-notes', { action: 'upsert', note }),

  delete: (noteId: string) =>
    invokeFunction('admin-notes', { action: 'delete', id: noteId }),
};

// Admin Invites API
export const adminInvites = {
  // Note: list and revoke are not implemented in the backend yet
  list: async () => ({ invites: [] as Invite[], error: undefined as string | undefined }),

  create: (email: string) =>
    invokeFunction<{ ok: boolean; invited_user_id: string }>('admin-invite', { email }),

  revoke: async (_inviteId: string) => ({ ok: true, error: undefined as string | undefined }),
};

// Admin Inquiries API (queries database directly like website)
export const adminInquiries = {
  list: async () => {
    try {
      const { data, error } = await supabase
        .from('inquiries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Inquiries fetch error:', error);
        return { inquiries: [] as Inquiry[], error: error.message };
      }

      return { inquiries: (data || []) as Inquiry[], error: undefined };
    } catch (error) {
      console.error('Inquiries fetch error:', error);
      return { inquiries: [] as Inquiry[], error: String(error) };
    }
  },

  update: async (inquiryId: string, updates: Partial<Inquiry>) => {
    try {
      const { error } = await supabase
        .from('inquiries')
        .update(updates)
        .eq('id', inquiryId);

      if (error) {
        return { error: error.message };
      }

      return { error: undefined };
    } catch (error) {
      return { error: String(error) };
    }
  },
};

// Client Inquiries API (stub - no backend function exists)
export const clientInquiries = {
  list: async () => ({ inquiries: [] as Inquiry[], error: undefined as string | undefined }),
};

// Admin System API
export const adminSystem = {
  getStatus: () => invokeFunction('system-status-get'),
};

// File Upload using presigned URL flow
export async function uploadAttachment(
  threadId: string,
  uri: string,
  mimeType: string,
  fileName: string
): Promise<ApiResponse<{ attachment_id: string; storage_path: string }>> {
  try {
    if (!threadId) {
      return { error: 'No thread ID - send a text message first to start a conversation' };
    }

    const token = await getAuthToken();
    if (!token) {
      return { error: 'Not authenticated' };
    }

    console.log('=== UPLOAD ATTACHMENT ===');
    console.log('Thread ID:', threadId);
    console.log('File:', fileName, mimeType);

    // First, fetch the file to get its size
    const fileResponse = await fetch(uri);
    const blob = await fileResponse.blob();
    const sizeBytes = blob.size;

    console.log('File size:', sizeBytes, 'bytes');

    // Step 1: Get presigned upload URL from edge function
    const uploadUrlResponse = await invokeFunction<{
      ok: boolean;
      upload: {
        attachment_id: string;
        path: string;
        token: string;
        signed_upload_url: string;
      };
    }>('chat-attachment-upload-url', {
      thread_id: threadId,
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
    });

    if (uploadUrlResponse.error || !(uploadUrlResponse as any).upload) {
      console.error('Failed to get upload URL:', uploadUrlResponse.error);
      return { error: uploadUrlResponse.error || 'Failed to get upload URL' };
    }

    const { attachment_id, signed_upload_url, path } = (uploadUrlResponse as any).upload;
    console.log('Got upload URL, attachment_id:', attachment_id);

    // Step 2: Upload file to the signed URL (reuse blob from earlier)
    console.log('Uploading blob, size:', blob.size);

    const uploadResponse = await fetch(signed_upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
      },
      body: blob,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Upload to storage failed:', uploadResponse.status, errorText);
      return { error: `Upload failed: ${uploadResponse.status}` };
    }

    console.log('Upload successful, attachment_id:', attachment_id);

    return {
      attachment_id,
      storage_path: path,
    } as ApiResponse<{ attachment_id: string; storage_path: string }>;
  } catch (error) {
    console.error('Upload error:', error);
    return { error: String(error) };
  }
}
