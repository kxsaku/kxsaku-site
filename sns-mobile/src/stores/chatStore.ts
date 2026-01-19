// Chat Store using Zustand
import { create } from 'zustand';
import { clientChat } from '../lib/api';
import type { ChatMessage, ChatThread, ChatAttachment } from '../types';

interface ChatState {
  messages: ChatMessage[];
  threadId: string | null;
  isLoading: boolean;
  isSending: boolean;
  error: string | null;
  unreadCount: number;

  // Actions
  fetchHistory: () => Promise<void>;
  sendMessage: (body: string, attachmentIds?: string[]) => Promise<{ error?: string }>;
  editMessage: (messageId: string, body: string) => Promise<{ error?: string }>;
  deleteMessage: (messageId: string) => Promise<{ error?: string }>;
  markAsRead: () => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (messageId: string, updates: Partial<ChatMessage>) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  threadId: null,
  isLoading: false,
  isSending: false,
  error: null,
  unreadCount: 0,

  fetchHistory: async () => {
    try {
      set({ isLoading: true, error: null });
      const response = await clientChat.getHistory();

      if (response.error) {
        set({ error: response.error });
        return;
      }

      if (response.ok) {
        set({
          messages: (response as any).messages || [],
          threadId: (response as any).thread_id || null,
        });
      }
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ isLoading: false });
    }
  },

  sendMessage: async (body: string, attachmentIds?: string[]) => {
    try {
      set({ isSending: true, error: null });
      const response = await clientChat.sendMessage(body, attachmentIds);

      if (response.error) {
        set({ error: response.error });
        return { error: response.error };
      }

      if (response.ok && (response as any).message) {
        const message = (response as any).message as ChatMessage;
        const newThreadId = (response as any).thread_id || get().threadId;

        set((state) => ({
          messages: [...state.messages, message],
          threadId: newThreadId,
        }));

        // If message had attachments, re-fetch history to get signed URLs
        // This ensures images display immediately after sending
        if (attachmentIds && attachmentIds.length > 0) {
          // Small delay to ensure DB has updated
          setTimeout(async () => {
            const historyResponse = await clientChat.getHistory();
            if (historyResponse.ok && (historyResponse as any).messages) {
              set({ messages: (historyResponse as any).messages });
            }
          }, 200);
        }
      }

      return {};
    } catch (error) {
      const errorMsg = String(error);
      set({ error: errorMsg });
      return { error: errorMsg };
    } finally {
      set({ isSending: false });
    }
  },

  editMessage: async (messageId: string, body: string) => {
    try {
      const response = await clientChat.editMessage(messageId, body);

      if (response.error) {
        return { error: response.error };
      }

      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === messageId
            ? { ...m, body, edited_at: new Date().toISOString() }
            : m
        ),
      }));

      return {};
    } catch (error) {
      return { error: String(error) };
    }
  },

  deleteMessage: async (messageId: string) => {
    try {
      const response = await clientChat.deleteMessage(messageId);

      if (response.error) {
        return { error: response.error };
      }

      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === messageId
            ? { ...m, deleted_at: new Date().toISOString(), body: 'Deleted Message' }
            : m
        ),
      }));

      return {};
    } catch (error) {
      return { error: String(error) };
    }
  },

  markAsRead: async () => {
    try {
      const { threadId } = get();
      if (!threadId) return;
      await clientChat.markRead(threadId);
      set({ unreadCount: 0 });
    } catch (error) {
      console.error('Mark read error:', error);
    }
  },

  addMessage: (message: ChatMessage) => {
    set((state) => {
      // Avoid duplicates
      if (state.messages.some((m) => m.id === message.id)) {
        return state;
      }
      return { messages: [...state.messages, message] };
    });
  },

  updateMessage: (messageId: string, updates: Partial<ChatMessage>) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, ...updates } : m
      ),
    }));
  },

  reset: () => {
    set({
      messages: [],
      threadId: null,
      isLoading: false,
      isSending: false,
      error: null,
      unreadCount: 0,
    });
  },
}));
