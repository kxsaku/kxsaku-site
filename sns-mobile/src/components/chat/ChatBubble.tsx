// Chat Message Bubble Component
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { MotiView } from 'moti';
import { colors, spacing, radius } from '../../theme';
import type { ChatMessage, ChatAttachment } from '../../types';

interface ChatBubbleProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  onLongPress?: () => void;
  onAttachmentPress?: (attachment: ChatAttachment) => void;
  showTimestamp?: boolean;
}

export function ChatBubble({
  message,
  isOwnMessage,
  onLongPress,
  onAttachmentPress,
  showTimestamp = true,
}: ChatBubbleProps) {
  const isDeleted = !!message.deleted_at;
  const isEdited = !!message.edited_at && !isDeleted;

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <MotiView
      from={{ opacity: 0, translateY: 10, scale: 0.95 }}
      animate={{ opacity: 1, translateY: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 18 }}
      style={[styles.container, isOwnMessage ? styles.ownContainer : styles.otherContainer]}
    >
      <TouchableOpacity
        onLongPress={onLongPress}
        activeOpacity={0.8}
        style={[
          styles.bubble,
          isOwnMessage ? styles.ownBubble : styles.otherBubble,
          isDeleted && styles.deletedBubble,
        ]}
      >
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <View style={styles.attachments}>
            {message.attachments.map((att) => (
              <TouchableOpacity
                key={att.id}
                onPress={() => onAttachmentPress?.(att)}
                style={styles.attachment}
              >
                {att.mime_type?.startsWith('image/') && att.signed_url ? (
                  <Image
                    source={{ uri: att.signed_url }}
                    style={styles.attachmentImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.fileAttachment}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {att.file_name}
                    </Text>
                    {att.size_bytes && (
                      <Text style={styles.fileSize}>
                        {formatFileSize(att.size_bytes)}
                      </Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Message body */}
        <Text style={[styles.body, isDeleted && styles.deletedBody]}>
          {message.body}
        </Text>

        {/* Timestamp and edited indicator */}
        {showTimestamp && (
          <View style={styles.meta}>
            {isEdited && <Text style={styles.edited}>edited</Text>}
            <Text style={styles.timestamp}>{formatTime(message.created_at)}</Text>
          </View>
        )}
      </TouchableOpacity>
    </MotiView>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: spacing.md,
  },
  ownContainer: {
    alignItems: 'flex-end',
  },
  otherContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    minWidth: 80,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  ownBubble: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: colors.surfaceGlass,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderBottomLeftRadius: 4,
  },
  deletedBubble: {
    opacity: 0.6,
  },
  body: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 21,
  },
  deletedBody: {
    fontStyle: 'italic',
    color: colors.textMuted,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 4,
  },
  timestamp: {
    color: colors.textMuted2,
    fontSize: 11,
  },
  edited: {
    color: colors.textMuted2,
    fontSize: 10,
    fontStyle: 'italic',
  },
  attachments: {
    marginBottom: 8,
    gap: 8,
  },
  attachment: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  attachmentImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
  },
  fileAttachment: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  fileName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
  fileSize: {
    color: colors.textMuted2,
    fontSize: 11,
    marginTop: 2,
  },
});
