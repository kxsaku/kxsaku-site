// Real-time subscription hook for Supabase
import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

type PostgresChangesFilter = {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema?: string;
  table: string;
  filter?: string;
};

interface UseRealtimeOptions {
  channel: string;
  filter: PostgresChangesFilter;
  onInsert?: (payload: Record<string, unknown>) => void;
  onUpdate?: (payload: Record<string, unknown>) => void;
  onDelete?: (payload: Record<string, unknown>) => void;
  enabled?: boolean;
}

export function useRealtime({
  channel: channelName,
  filter,
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: UseRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  const handleChanges = useCallback(
    (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
      switch (payload.eventType) {
        case 'INSERT':
          onInsert?.(payload.new);
          break;
        case 'UPDATE':
          onUpdate?.(payload.new);
          break;
        case 'DELETE':
          onDelete?.(payload.old);
          break;
      }
    },
    [onInsert, onUpdate, onDelete]
  );

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as any,
        {
          event: filter.event,
          schema: filter.schema || 'public',
          table: filter.table,
          filter: filter.filter,
        },
        handleChanges as any
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [channelName, filter.event, filter.schema, filter.table, filter.filter, handleChanges, enabled]);

  return {
    channel: channelRef.current,
  };
}

// Hook specifically for chat messages
export function useChatRealtime(
  threadId: string | null,
  onNewMessage: (message: Record<string, unknown>) => void
) {
  return useRealtime({
    channel: `chat-${threadId}`,
    filter: {
      event: 'INSERT',
      table: 'chat_messages',
      filter: threadId ? `thread_id=eq.${threadId}` : undefined,
    },
    onInsert: onNewMessage,
    enabled: !!threadId,
  });
}
