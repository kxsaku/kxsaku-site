// Admin Client List Screen
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { ScreenWrapper, Header } from '../../../src/components/layout';
import { Card, Pill, StatusDot, LoadingSpinner, IconButton } from '../../../src/components/ui';
import { adminClients } from '../../../src/lib/api';
import { useAuthStore } from '../../../src/stores/authStore';
import { colors, spacing, radius } from '../../../src/theme';
import type { AdminClient } from '../../../src/types';

export default function AdminClientsScreen() {
  const router = useRouter();
  const { signOut, isSigningOut } = useAuthStore();
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [filteredClients, setFilteredClients] = useState<AdminClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const handleLogout = async () => {
    if (isSigningOut) return; // Prevent double-tap
    console.log('Logout button pressed');
    await signOut();
    console.log('SignOut complete, navigating to login...');
    router.replace('/(auth)/login');
  };

  const fetchClients = useCallback(async () => {
    try {
      // Use listWithPresence to get online status
      const response = await adminClients.listWithPresence();
      if (!response.error && (response as any).clients) {
        // Transform nested {profile, subscription} into flat AdminClient structure
        const transformedClients = (response as any).clients.map((c: any) => ({
          id: c.profile?.user_id || c.user_id,
          user_id: c.profile?.user_id || c.user_id,
          contact_name: c.profile?.contact_name || c.profile?.full_name || 'Unknown',
          business_name: c.profile?.business_name || null,
          email: c.profile?.email || c.email,
          phone: c.profile?.phone || null,
          created_at: c.profile?.created_at || '',
          subscription: c.subscription ? {
            status: c.subscription.status || c.subscription.stripe_status || null,
            plan: c.subscription.plan || null,
            current_period_end: c.subscription.current_period_end || null,
          } : undefined,
          thread: c.thread,
          is_online: c.is_online || false,
          last_seen: c.last_seen || null,
        }));
        setClients(transformedClients);
        setFilteredClients(transformedClients);
      }
    } catch (error) {
      console.error('Clients fetch error:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    let filtered = clients;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.contact_name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query) ||
          (c.business_name && c.business_name.toLowerCase().includes(query))
      );
    }

    // Status filter
    if (statusFilter) {
      filtered = filtered.filter((c) => c.subscription?.status === statusFilter);
    }

    setFilteredClients(filtered);
  }, [searchQuery, statusFilter, clients]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchClients();
  }, [fetchClients]);

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

  const renderClient = ({ item, index }: { item: AdminClient; index: number }) => (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ delay: index * 30 }}
    >
      <TouchableOpacity
        onPress={() => router.push(`/(admin)/clients/${item.user_id}`)}
        activeOpacity={0.8}
      >
        <Card style={styles.clientCard}>
          <View style={styles.clientHeader}>
            <View style={styles.clientInfo}>
              <View style={styles.nameRow}>
                <StatusDot color={getStatusColor(item.subscription?.status || null)} />
                <Text style={styles.clientName}>{item.contact_name}</Text>
                {item.is_online && (
                  <View style={styles.onlineBadge}>
                    <Text style={styles.onlineText}>ONLINE</Text>
                  </View>
                )}
              </View>
              {item.business_name && (
                <Text style={styles.businessName}>{item.business_name}</Text>
              )}
            </View>
            {item.thread?.unread_for_admin && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>NEW</Text>
              </View>
            )}
          </View>

          <Text style={styles.clientEmail}>{item.email}</Text>

          <View style={styles.clientFooter}>
            <Pill
              variant={item.subscription?.status === 'active' ? 'success' : 'default'}
              size="sm"
              animate={false}
            >
              {item.subscription?.plan || 'No Plan'}
            </Pill>
            {item.thread?.last_message_at && (
              <Text style={styles.lastMessage}>
                Last msg: {new Date(item.thread.last_message_at).toLocaleDateString()}
              </Text>
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
      <Text style={styles.emptyTitle}>No clients found</Text>
      <Text style={styles.emptySubtitle}>
        {searchQuery || statusFilter
          ? 'Try adjusting your filters'
          : 'Clients will appear here once they sign up'}
      </Text>
    </MotiView>
  );

  if (isLoading) {
    return (
      <ScreenWrapper>
        <Header title="Clients" />
        <LoadingSpinner fullScreen text="Loading clients..." />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header
        title="Clients"
        subtitle={`${clients.length} total`}
        rightAction={
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        }
      />

      {/* Search and Filter */}
      <View style={styles.toolbar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search clients..."
          placeholderTextColor={colors.textMuted2}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <View style={styles.filterRow}>
          {['active', 'past_due', 'canceled', null].map((status) => (
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

      <FlatList
        data={filteredClients}
        keyExtractor={(item) => item.id}
        renderItem={renderClient}
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
  },
  searchInput: {
    backgroundColor: colors.surfaceInput,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderInput,
    paddingVertical: 12,
    paddingHorizontal: 18,
    color: colors.textPrimary,
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceBtnSoft,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  filterChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  filterText: {
    fontSize: 11,
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
  clientCard: {
    marginBottom: spacing.md,
  },
  clientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  clientInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  businessName: {
    fontSize: 13,
    color: colors.textSub,
    marginTop: 2,
    marginLeft: 18,
  },
  unreadBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  unreadText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.5,
  },
  onlineBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    marginLeft: 6,
  },
  onlineText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.bgPrimary,
    letterSpacing: 0.5,
  },
  clientEmail: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 8,
  },
  clientFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 11,
    color: colors.textMuted2,
  },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceBtnSoft,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  logoutText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMuted,
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
