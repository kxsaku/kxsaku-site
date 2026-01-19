// Admin Client Detail Screen with Chat
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  Linking,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { ScreenWrapper, Header } from '../../../src/components/layout';
import { ChatBubble, ChatInput } from '../../../src/components/chat';
import { Card, Pill, StatusDot, LoadingSpinner, Button, Divider } from '../../../src/components/ui';
import { adminClients, adminChat, uploadAttachment } from '../../../src/lib/api';
import { useChatRealtime } from '../../../src/hooks/useRealtime';
import { colors, spacing } from '../../../src/theme';
import type { AdminClient, ChatMessage, ChatAttachment } from '../../../src/types';

type ViewMode = 'info' | 'chat';

export default function AdminClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [client, setClient] = useState<AdminClient | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Track keyboard visibility
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Get the user_id - ensure it's a valid string
  const userId = typeof id === 'string' && id !== 'undefined' ? id : null;

  // Real-time subscription
  useChatRealtime(threadId, (newMessage) => {
    const msg = newMessage as unknown as ChatMessage;
    if (msg.sender_role === 'client') {
      setMessages((prev) => [...prev, msg]);
    }
  });

  const fetchData = useCallback(async () => {
    if (!userId) {
      console.log('No valid userId, skipping fetch');
      setIsLoading(false);
      return;
    }
    console.log('Fetching data for userId:', userId);

    try {
      // Fetch client details
      const clientResponse = await adminClients.getDetail(userId);
      if (!clientResponse.error) {
        // Transform nested response to flat AdminClient
        const c = clientResponse as any;
        if (c.clients && c.clients.length > 0) {
          const raw = c.clients[0];
          setClient({
            id: raw.user_id,
            user_id: raw.user_id,
            contact_name: raw.full_name || raw.email,
            business_name: raw.business_name || null,
            email: raw.email,
            phone: raw.phone || null,
            created_at: '',
          });
        }
      }

      // Fetch chat history
      const chatResponse = await adminChat.getHistory(userId);
      console.log('Chat response:', chatResponse);
      if (!chatResponse.error && (chatResponse as any).messages) {
        setMessages((chatResponse as any).messages);
        setThreadId((chatResponse as any).thread_id || null);
      }
    } catch (error) {
      console.error('Client detail fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const scrollToBottom = useCallback(() => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  useEffect(() => {
    const timeout = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timeout);
  }, [messages.length, scrollToBottom]);

  const handleSend = async (body: string, attachmentIds?: string[]) => {
    if (!userId) return;
    setIsSending(true);

    try {
      const response = await adminChat.sendMessage(userId, body, attachmentIds);
      if (!response.error && (response as any).message) {
        setMessages((prev) => [...prev, (response as any).message]);
        const newThreadId = (response as any).thread_id || threadId;
        setThreadId(newThreadId);
        scrollToBottom();

        // If message had attachments, re-fetch history to get signed URLs
        // This ensures images display immediately after sending
        if (attachmentIds && attachmentIds.length > 0) {
          setTimeout(async () => {
            const historyResponse = await adminChat.getHistory(userId);
            if (!historyResponse.error && (historyResponse as any).messages) {
              setMessages((historyResponse as any).messages);
            }
          }, 200);
        }
      } else if (response.error) {
        Alert.alert('Error', response.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleUploadAttachment = async (
    uri: string,
    type: string,
    name: string
  ): Promise<string | null> => {
    if (!threadId) {
      Alert.alert('Upload Failed', 'Send a text message first to start a conversation');
      return null;
    }
    const result = await uploadAttachment(threadId, uri, type, name);
    if (result.error) {
      Alert.alert('Upload Failed', result.error);
      return null;
    }
    return (result as any).attachment_id || null;
  };

  const handleAttachmentPress = (attachment: ChatAttachment) => {
    if (attachment.signed_url) {
      Linking.openURL(attachment.signed_url);
    }
  };

  const getStatusColor = (status: string | null): 'green' | 'yellow' | 'red' | 'none' => {
    switch (status) {
      case 'active':
      case 'trialing':
        return 'green';
      case 'past_due':
        return 'yellow';
      case 'canceled':
        return 'red';
      default:
        return 'none';
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <ChatBubble
      message={item}
      isOwnMessage={item.sender_role === 'admin'}
      onAttachmentPress={handleAttachmentPress}
    />
  );

  const renderEmpty = () => (
    <MotiView
      from={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      style={styles.emptyContainer}
    >
      <Text style={styles.emptyTitle}>No messages yet</Text>
      <Text style={styles.emptySubtitle}>
        Start a conversation with this client
      </Text>
    </MotiView>
  );

  if (isLoading) {
    return (
      <ScreenWrapper>
        <Header title="Client" showBack />
        <LoadingSpinner fullScreen text="Loading client..." />
      </ScreenWrapper>
    );
  }

  if (!client) {
    return (
      <ScreenWrapper>
        <Header title="Client" showBack />
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Client not found</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper edges={['top']}>
      <Header
        title={client.contact_name}
        subtitle={client.business_name || undefined}
        showBack
      />

      {/* View Mode Toggle */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, viewMode === 'chat' && styles.tabActive]}
          onPress={() => setViewMode('chat')}
        >
          <Text style={[styles.tabText, viewMode === 'chat' && styles.tabTextActive]}>
            CHAT
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, viewMode === 'info' && styles.tabActive]}
          onPress={() => setViewMode('info')}
        >
          <Text style={[styles.tabText, viewMode === 'info' && styles.tabTextActive]}>
            INFO
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'info' ? (
        // Client Info View
        <View style={styles.infoContainer}>
          <Card variant="glass">
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{client.email}</Text>
            </View>
            {client.phone && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue}>{client.phone}</Text>
              </View>
            )}
            <Divider />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Subscription</Text>
              <View style={styles.statusRow}>
                <StatusDot color={getStatusColor(client.subscription?.status || null)} />
                <Pill
                  variant={client.subscription?.status === 'active' ? 'success' : 'default'}
                  size="sm"
                  animate={false}
                >
                  {client.subscription?.status?.toUpperCase() || 'NO PLAN'}
                </Pill>
              </View>
            </View>
            {client.subscription?.plan && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Plan</Text>
                <Text style={styles.infoValue}>{client.subscription.plan}</Text>
              </View>
            )}
            {client.subscription?.current_period_end && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Renews</Text>
                <Text style={styles.infoValue}>
                  {new Date(client.subscription.current_period_end).toLocaleDateString()}
                </Text>
              </View>
            )}
          </Card>
        </View>
      ) : (
        // Chat View
        <KeyboardAvoidingView
          style={styles.chatContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={renderEmpty}
            onContentSizeChange={scrollToBottom}
            keyboardShouldPersistTaps="handled"
          />

          <View style={[styles.inputWrapper, keyboardVisible && styles.inputWrapperKeyboard]}>
            <ChatInput
              onSend={handleSend}
              onUploadAttachment={handleUploadAttachment}
              isSending={isSending}
              placeholder="Message this client..."
            />
          </View>
        </KeyboardAvoidingView>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceCard,
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderCard,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 999,
  },
  tabActive: {
    backgroundColor: colors.accentSoft,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.textPrimary,
  },
  chatContainer: {
    flex: 1,
  },
  inputWrapper: {
    marginBottom: 95, // Push above floating tab bar (65px height + 25px from bottom + 5px buffer)
  },
  inputWrapperKeyboard: {
    marginBottom: 0, // No margin needed when keyboard is open
  },
  messageList: {
    paddingVertical: spacing.md,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  infoContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notFound: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notFoundText: {
    fontSize: 16,
    color: colors.textMuted,
  },
});
