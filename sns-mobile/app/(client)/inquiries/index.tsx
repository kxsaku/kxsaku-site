// Client Inquiries List Screen
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { ScreenWrapper, Header } from '../../../src/components/layout';
import { Card, Pill, StatusDot, LoadingSpinner } from '../../../src/components/ui';
import { clientInquiries } from '../../../src/lib/api';
import { colors, spacing } from '../../../src/theme';
import type { Inquiry } from '../../../src/types';

export default function InquiriesListScreen() {
  const router = useRouter();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchInquiries = useCallback(async () => {
    try {
      const response = await clientInquiries.list();
      if (!response.error && (response as any).inquiries) {
        setInquiries((response as any).inquiries);
      }
    } catch (error) {
      console.error('Inquiries fetch error:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchInquiries();
  }, [fetchInquiries]);

  const getStatusColor = (status: string): 'green' | 'yellow' | 'red' | 'info' | 'none' => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'working':
        return 'info';
      case 'assigned':
        return 'yellow';
      case 'new':
        return 'none';
      default:
        return 'none';
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderInquiry = ({ item, index }: { item: Inquiry; index: number }) => (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ delay: index * 50 }}
    >
      <TouchableOpacity
        onPress={() => router.push(`/(client)/inquiries/${item.id}`)}
        activeOpacity={0.8}
      >
        <Card style={styles.inquiryCard}>
          <View style={styles.inquiryHeader}>
            <View style={styles.inquiryType}>
              <StatusDot color={getStatusColor(item.status)} />
              <Text style={styles.inquiryTypeText}>
                {item.inquiry_type || 'General'}
              </Text>
            </View>
            <Pill variant="default" size="sm">
              {item.status.toUpperCase()}
            </Pill>
          </View>

          <Text style={styles.inquiryText} numberOfLines={2}>
            {item.inquiry_text}
          </Text>

          <View style={styles.inquiryFooter}>
            <Text style={styles.inquiryDate}>{formatDate(item.created_at)}</Text>
            {item.priority && item.priority !== 'normal' && (
              <Pill
                variant={item.priority === 'urgent' || item.priority === 'high' ? 'error' : 'warning'}
                size="sm"
              >
                {item.priority.toUpperCase()}
              </Pill>
            )}
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
      <Text style={styles.emptyTitle}>No inquiries</Text>
      <Text style={styles.emptySubtitle}>
        You haven't submitted any inquiries yet
      </Text>
    </MotiView>
  );

  if (isLoading) {
    return (
      <ScreenWrapper>
        <Header title="Inquiries" />
        <LoadingSpinner fullScreen text="Loading inquiries..." />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header title="Inquiries" />

      <FlatList
        data={inquiries}
        keyExtractor={(item) => item.id}
        renderItem={renderInquiry}
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
  inquiryCard: {
    marginBottom: spacing.md,
  },
  inquiryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inquiryType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inquiryTypeText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textLabel,
  },
  inquiryText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 21,
    marginBottom: 8,
  },
  inquiryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inquiryDate: {
    fontSize: 12,
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
  },
});
