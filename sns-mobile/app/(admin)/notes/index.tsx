// Admin Notes List Screen
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { ScreenWrapper, Header } from '../../../src/components/layout';
import { Card, Button, LoadingSpinner, IconButton } from '../../../src/components/ui';
import { adminNotes } from '../../../src/lib/api';
import { colors, spacing } from '../../../src/theme';
import type { InternalNote } from '../../../src/types';

export default function AdminNotesScreen() {
  const router = useRouter();
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchNotes = useCallback(async () => {
    try {
      const response = await adminNotes.list();
      if (!response.error && (response as any).notes) {
        setNotes((response as any).notes);
      }
    } catch (error) {
      console.error('Notes fetch error:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchNotes();
  }, [fetchNotes]);

  const handleDelete = (note: InternalNote) => {
    Alert.alert(
      'Delete Note',
      `Are you sure you want to delete "${note.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await adminNotes.delete(note.id);
              if (!response.error) {
                setNotes((prev) => prev.filter((n) => n.id !== note.id));
              } else {
                Alert.alert('Error', response.error);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete note');
            }
          },
        },
      ]
    );
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderNote = ({ item, index }: { item: InternalNote; index: number }) => (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ delay: index * 50 }}
    >
      <TouchableOpacity
        onPress={() => router.push(`/(admin)/notes/${item.id}`)}
        activeOpacity={0.8}
      >
        <Card style={styles.noteCard}>
          <View style={styles.noteHeader}>
            <Text style={styles.noteTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <TouchableOpacity
              onPress={() => handleDelete(item)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.deleteBtn}>×</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.noteContent} numberOfLines={3}>
            {item.body}
          </Text>

          <View style={styles.noteFooter}>
            <Text style={styles.noteDate}>
              {item.updated_at && item.updated_at !== item.created_at
                ? `Updated ${formatDate(item.updated_at)}`
                : `Created ${formatDate(item.created_at)}`}
            </Text>
          </View>
        </Card>
      </TouchableOpacity>
    </MotiView>
  );

  const renderEmpty = () => (
    <MotiView
      from={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      style={styles.emptyContainer}
    >
      <Text style={styles.emptyTitle}>No notes yet</Text>
      <Text style={styles.emptySubtitle}>
        Create internal notes to keep track of important information
      </Text>
      <Button
        variant="primary"
        style={styles.createBtn}
        onPress={() => router.push('/(admin)/notes/new')}
      >
        Create First Note
      </Button>
    </MotiView>
  );

  if (isLoading) {
    return (
      <ScreenWrapper>
        <Header title="Notes" />
        <LoadingSpinner fullScreen text="Loading notes..." />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header
        title="Notes"
        subtitle={`${notes.length} notes`}
        rightAction={
          <Button
            variant="primary"
            size="sm"
            onPress={() => router.push('/(admin)/notes/new')}
          >
            + New
          </Button>
        }
      />

      <FlatList
        data={notes}
        keyExtractor={(item) => item.id}
        renderItem={renderNote}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  noteCard: {
    marginBottom: spacing.md,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 10,
  },
  deleteBtn: {
    fontSize: 24,
    color: colors.textMuted,
    paddingHorizontal: 8,
  },
  noteContent: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 21,
    marginBottom: 8,
  },
  noteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteDate: {
    fontSize: 11,
    color: colors.textMuted2,
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
    marginBottom: spacing.lg,
  },
  createBtn: {
    marginTop: spacing.md,
  },
});
