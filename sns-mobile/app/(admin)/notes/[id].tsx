// Admin Note Editor Screen
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { ScreenWrapper, Header } from '../../../src/components/layout';
import { Button, LoadingSpinner } from '../../../src/components/ui';
import { adminNotes } from '../../../src/lib/api';
import { supabase } from '../../../src/lib/supabase';
import { colors, spacing, radius } from '../../../src/theme';
import type { InternalNote } from '../../../src/types';

export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === 'new';

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isNew && id) {
      fetchNote();
    }
  }, [id, isNew]);

  const fetchNote = async () => {
    try {
      const { data, error } = await supabase
        .from('sns_internal_notes')
        .select('*')
        .eq('id', id)
        .single();

      if (!error && data) {
        setTitle(data.title);
        setContent(data.body || '');
      }
    } catch (error) {
      console.error('Note fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }

    setIsSaving(true);

    try {
      const noteData = {
        ...(isNew ? {} : { id }),
        title: title.trim(),
        body: content.trim(),
      };

      const response = await adminNotes.save(noteData);

      if (response.error) {
        Alert.alert('Error', response.error);
      } else {
        router.back();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <ScreenWrapper>
        <Header title="Note" showBack />
        <LoadingSpinner fullScreen text="Loading note..." />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header
        title={isNew ? 'New Note' : 'Edit Note'}
        showBack
        rightAction={
          <Button
            variant="primary"
            size="sm"
            onPress={handleSave}
            loading={isSaving}
            disabled={!title.trim()}
          >
            Save
          </Button>
        }
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <MotiView
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ delay: 100 }}
          >
            <Text style={styles.label}>TITLE</Text>
            <TextInput
              style={styles.titleInput}
              placeholder="Note title"
              placeholderTextColor={colors.textMuted2}
              value={title}
              onChangeText={setTitle}
              autoFocus={isNew}
            />
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ delay: 200 }}
          >
            <Text style={styles.label}>CONTENT</Text>
            <TextInput
              style={styles.contentInput}
              placeholder="Write your note..."
              placeholderTextColor={colors.textMuted2}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
            />
          </MotiView>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: colors.textMuted2,
    marginBottom: 8,
    marginTop: spacing.md,
  },
  titleInput: {
    backgroundColor: colors.surfaceInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderInput,
    padding: 14,
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
  contentInput: {
    backgroundColor: colors.surfaceInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderInput,
    padding: 14,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 24,
    minHeight: 300,
  },
});
