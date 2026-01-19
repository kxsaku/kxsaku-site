// Chat Input Component
import React, { useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { MotiView } from 'moti';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, radius } from '../../theme';
import { IconButton } from '../ui/IconButton';

interface AttachmentPreview {
  uri: string;
  type: string;
  name: string;
}

interface ChatInputProps {
  onSend: (message: string, attachmentIds?: string[]) => Promise<void>;
  onUploadAttachment?: (uri: string, type: string, name: string) => Promise<string | null>;
  placeholder?: string;
  disabled?: boolean;
  isSending?: boolean;
}

export function ChatInput({
  onSend,
  onUploadAttachment,
  placeholder = 'Type a message...',
  disabled = false,
  isSending = false,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleSend = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage && attachments.length === 0) return;

    // Upload attachments first
    const attachmentIds: string[] = [];
    if (attachments.length > 0 && onUploadAttachment) {
      setIsUploading(true);
      for (const att of attachments) {
        const id = await onUploadAttachment(att.uri, att.type, att.name);
        if (id) attachmentIds.push(id);
      }
      setIsUploading(false);
    }

    await onSend(trimmedMessage, attachmentIds.length > 0 ? attachmentIds : undefined);
    setMessage('');
    setAttachments([]);
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const newAttachments = result.assets.map((asset) => ({
          uri: asset.uri,
          type: asset.mimeType || 'image/jpeg',
          name: asset.fileName || `attachment_${Date.now()}`,
        }));
        setAttachments((prev) => [...prev, ...newAttachments]);
      }
    } catch (error) {
      console.error('Image picker error:', error);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const canSend = (message.trim() || attachments.length > 0) && !disabled && !isSending && !isUploading;

  return (
    <View style={styles.container}>
      {/* Attachment Previews */}
      {attachments.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.attachmentPreview}
          contentContainerStyle={styles.attachmentPreviewContent}
        >
          {attachments.map((att, index) => (
            <MotiView
              key={index}
              from={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 15 }}
            >
              <View style={styles.previewItem}>
                {att.type.startsWith('image/') ? (
                  <Image source={{ uri: att.uri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.previewFile}>
                    <Text style={styles.previewFileName} numberOfLines={1}>
                      {att.name}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeAttachment(index)}
                >
                  <Text style={styles.removeButtonText}>×</Text>
                </TouchableOpacity>
              </View>
            </MotiView>
          ))}
        </ScrollView>
      )}

      {/* Input Row */}
      <View style={styles.inputRow}>
        <IconButton onPress={handlePickImage} size={36} variant="soft">
          <Text style={styles.attachIcon}>+</Text>
        </IconButton>

        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted2}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={2000}
          editable={!disabled && !isSending}
        />

        <TouchableOpacity
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!canSend}
        >
          <Text style={styles.sendButtonText}>
            {isSending || isUploading ? '...' : '→'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  attachmentPreview: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  attachmentPreviewContent: {
    padding: 12,
    gap: 10,
  },
  previewItem: {
    position: 'relative',
    marginRight: 10,
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  previewFile: {
    width: 80,
    height: 60,
    borderRadius: 8,
    backgroundColor: colors.surfaceGlass,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  previewFileName: {
    color: colors.textMuted,
    fontSize: 10,
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: colors.surfaceInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderInput,
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: colors.textPrimary,
    fontSize: 15,
  },
  attachIcon: {
    color: colors.textLabel,
    fontSize: 20,
    fontWeight: '600',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.surfaceBtnSoft,
  },
  sendButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '600',
  },
});
