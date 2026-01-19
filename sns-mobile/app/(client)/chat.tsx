// Client Chat Screen
import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { MotiView } from 'moti';
import { ScreenWrapper, Header } from '../../src/components/layout';
import { ChatBubble, ChatInput } from '../../src/components/chat';
import { LoadingSpinner } from '../../src/components/ui';
import { useChatStore } from '../../src/stores/chatStore';
import { useChatRealtime, usePresence } from '../../src/hooks';
import { uploadAttachment } from '../../src/lib/api';
import { colors, spacing } from '../../src/theme';
import type { ChatMessage, ChatAttachment } from '../../src/types';

export default function ChatScreen() {
  const flatListRef = useRef<FlatList>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const {
    messages,
    threadId,
    isLoading,
    isSending,
    error,
    fetchHistory,
    sendMessage,
    editMessage,
    deleteMessage,
    markAsRead,
    addMessage,
  } = useChatStore();

  // Track presence - sends heartbeat every 30s while in chat
  usePresence(true);

  // Track keyboard visibility
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Real-time subscription
  useChatRealtime(threadId, (newMessage) => {
    // Only add if it's from admin (client messages are added immediately)
    const msg = newMessage as unknown as ChatMessage;
    if (msg.sender_role === 'admin') {
      addMessage(msg);
      markAsRead();
    }
  });

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    // Mark messages as read when viewing chat
    if (messages.length > 0) {
      markAsRead();
    }
  }, [messages.length, markAsRead]);

  const scrollToBottom = useCallback(() => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    const timeout = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timeout);
  }, [messages.length, scrollToBottom]);

  const handleSend = async (body: string, attachmentIds?: string[]) => {
    await sendMessage(body, attachmentIds);
    scrollToBottom();
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

  const handleLongPress = (message: ChatMessage) => {
    if (message.sender_role !== 'client' || message.deleted_at) return;

    Alert.alert('Message Options', 'What would you like to do?', [
      {
        text: 'Edit',
        onPress: () => handleEdit(message),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => handleDelete(message),
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  };

  const handleEdit = (message: ChatMessage) => {
    Alert.prompt(
      'Edit Message',
      'Enter new message text:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (newText?: string) => {
            if (newText && newText.trim()) {
              const result = await editMessage(message.id, newText.trim());
              if (result.error) {
                Alert.alert('Error', result.error);
              }
            }
          },
        },
      ],
      'plain-text',
      message.body
    );
  };

  const handleDelete = (message: ChatMessage) => {
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteMessage(message.id);
            if (result.error) {
              Alert.alert('Error', result.error);
            }
          },
        },
      ]
    );
  };

  const handleAttachmentPress = (attachment: ChatAttachment) => {
    if (attachment.signed_url) {
      Linking.openURL(attachment.signed_url);
    }
  };

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => (
    <ChatBubble
      message={item}
      isOwnMessage={item.sender_role === 'client'}
      onLongPress={() => handleLongPress(item)}
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
        Start a conversation with your account manager
      </Text>
    </MotiView>
  );

  if (isLoading) {
    return (
      <ScreenWrapper>
        <Header title="Chat" />
        <LoadingSpinner fullScreen text="Loading messages..." />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper edges={['top']}>
      <Header title="Chat" subtitle="Your account manager" />

      <KeyboardAvoidingView
        style={styles.container}
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
            placeholder="Type your message..."
          />
        </View>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
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
});
