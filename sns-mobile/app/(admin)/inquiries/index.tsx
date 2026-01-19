// Admin Inquiries List Screen
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { ScreenWrapper, Header } from '../../../src/components/layout';
import { Card, Pill, StatusDot, LoadingSpinner } from '../../../src/components/ui';
import { adminInquiries } from '../../../src/lib/api';
import { colors, spacing, radius } from '../../../src/theme';
import type { Inquiry } from '../../../src/types';

export default function AdminInquiriesScreen() {
  const router = useRouter();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [filteredInquiries, setFilteredInquiries] = useState<Inquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);

  const fetchInquiries = useCallback(async () => {
    try {
      const response = await adminInquiries.list();
      if (!response.error && (response as any).inquiries) {
        setInquiries((response as any).inquiries);
        setFilteredInquiries((response as any).inquiries);
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

  useEffect(() => {
    let filtered = inquiries;

    if (statusFilter) {
      filtered = filtered.filter((i) => i.status === statusFilter);
    }

    if (priorityFilter) {
      filtered = filtered.filter((i) => i.priority_flag === priorityFilter);
    }

    setFilteredInquiries(filtered);
  }, [statusFilter, priorityFilter, inquiries]);

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
      case 'walkaway':
        return 'red';
      case 'new':
        return 'none';
      default:
        return 'none';
    }
  };

  const getPriorityColor = (priority: string | null): string => {
    switch (priority) {
      case 'red':
        return colors.error;
      case 'yellow':
        return colors.warning;
      case 'green':
        return colors.success;
      default:
        return colors.textMuted2;
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatWorkOrder = (wo: number | null) => {
    if (wo == null) return '';
    return `WO-${String(wo).padStart(6, '0')}`;
  };

  const formatServices = (services: string[] | string | null) => {
    if (!services) return '';
    if (Array.isArray(services)) return services.join(', ');
    return services;
  };

  const renderInquiry = ({ item, index }: { item: Inquiry; index: number }) => (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ delay: index * 30 }}
    >
      <TouchableOpacity
        onPress={() => router.push(`/(admin)/inquiries/${item.id}`)}
        activeOpacity={0.8}
      >
        <Card style={styles.inquiryCard}>
          <View style={styles.inquiryHeader}>
            <View style={styles.statusRow}>
              <StatusDot color={getStatusColor(item.status)} />
              <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
            </View>
            <View style={styles.badges}>
              {item.priority_flag && item.priority_flag !== 'none' && (
                <View style={styles.priorityBadge}>
                  <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(item.priority_flag) }]} />
                  <Text style={styles.priorityText}>{item.priority_flag.toUpperCase()}</Text>
                </View>
              )}
            </View>
          </View>

          {item.work_order && (
            <Text style={styles.workOrder}>{formatWorkOrder(item.work_order)}</Text>
          )}

          <Text style={styles.inquiryType}>
            {item.contact_name || item.business_name || 'Unknown Contact'}
          </Text>

          {item.services && (
            <Text style={styles.servicesText} numberOfLines={1}>
              {formatServices(item.services)}
            </Text>
          )}

          {item.inquiry_text && (
            <Text style={styles.inquiryText} numberOfLines={2}>
              {item.inquiry_text}
            </Text>
          )}

          <View style={styles.inquiryFooter}>
            <Text style={styles.inquiryEmail}>{item.email}</Text>
            <Text style={styles.inquiryDate}>{formatDate(item.created_at)}</Text>
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
      <Text style={styles.emptyTitle}>No inquiries found</Text>
      <Text style={styles.emptySubtitle}>
        {statusFilter || priorityFilter
          ? 'Try adjusting your filters'
          : 'New inquiries will appear here'}
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
      <Header title="Inquiries" subtitle={`${inquiries.length} total`} />

      {/* Filters */}
      <View style={styles.toolbar}>
        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>STATUS</Text>
          <View style={styles.filterRow}>
            {['new', 'assigned', 'working', 'completed', 'walkaway', null].map((status) => (
              <TouchableOpacity
                key={status || 'all'}
                onPress={() => setStatusFilter(status)}
                style={[
                  styles.filterChip,
                  statusFilter === status && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    statusFilter === status && styles.filterTextActive,
                  ]}
                >
                  {status?.toUpperCase() || 'ALL'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>PRIORITY</Text>
          <View style={styles.filterRow}>
            {['red', 'yellow', 'green', 'none', null].map((priority) => (
              <TouchableOpacity
                key={priority || 'all'}
                onPress={() => setPriorityFilter(priority)}
                style={[
                  styles.filterChip,
                  priorityFilter === priority && styles.filterChipActive,
                ]}
              >
                {priority && priority !== 'none' && (
                  <View style={[styles.filterDot, { backgroundColor: getPriorityColor(priority) }]} />
                )}
                <Text
                  style={[
                    styles.filterText,
                    priorityFilter === priority && styles.filterTextActive,
                  ]}
                >
                  {priority?.toUpperCase() || 'ALL'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <FlatList
        data={filteredInquiries}
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
  toolbar: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  filterSection: {
    gap: 6,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: colors.textMuted2,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceBtnSoft,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  filterChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  filterText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  filterTextActive: {
    color: colors.textPrimary,
  },
  list: {
    padding: spacing.lg,
    paddingTop: 0,
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    color: colors.textLabel,
  },
  badges: {
    flexDirection: 'row',
    gap: 6,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  workOrder: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.textMuted,
    marginBottom: 4,
  },
  inquiryType: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  servicesText: {
    fontSize: 12,
    color: colors.accent,
    marginBottom: 4,
  },
  inquiryText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 8,
  },
  inquiryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inquiryEmail: {
    fontSize: 12,
    color: colors.textSub,
  },
  inquiryDate: {
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
  },
});
