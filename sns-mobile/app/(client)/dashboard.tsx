// Client Dashboard Screen
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { ScreenWrapper, Header } from '../../src/components/layout';
import { Card, Pill, StatusDot, Button, LoadingSpinner, Divider } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { clientDashboard, clientChat } from '../../src/lib/api';
import { usePresence } from '../../src/hooks';
import { colors, spacing } from '../../src/theme';

interface DashboardData {
  subscription?: {
    status: string | null;
    plan: string | null;
    current_period_end: string | null;
  };
  recent_inquiry?: {
    id: string;
    inquiry_type: string;
    status: string;
    created_at: string;
  };
  unread_messages: number;
  profile?: {
    contact_name: string;
    business_name: string | null;
  };
}

export default function DashboardScreen() {
  const router = useRouter();
  const { signOut, isSigningOut, profile, user } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Track presence - sends heartbeat every 30s while on dashboard
  usePresence(true);

  const handleLogout = async () => {
    if (isSigningOut) return; // Prevent double-tap
    await signOut();
    router.replace('/(auth)/login');
  };

  const fetchData = useCallback(async () => {
    try {
      const response = await clientDashboard.get();
      if (!response.error) {
        setData(response as unknown as DashboardData);
      }
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchData();
  }, [fetchData]);

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

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <ScreenWrapper>
        <LoadingSpinner fullScreen text="Loading dashboard..." />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header
        title="Dashboard"
        rightAction={
          <TouchableOpacity
            onPress={handleLogout}
            style={[styles.logoutBtn, isSigningOut && styles.logoutBtnDisabled]}
            disabled={isSigningOut}
          >
            <Text style={styles.logoutText}>{isSigningOut ? 'Logging out...' : 'Logout'}</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {/* Welcome */}
        <MotiView
          from={{ opacity: 0, translateY: 10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ delay: 100 }}
          style={styles.welcome}
        >
          <Text style={styles.welcomeText}>
            Welcome back, {data?.profile?.contact_name || user?.email?.split('@')[0]}
          </Text>
          {data?.profile?.business_name && (
            <Text style={styles.businessName}>{data.profile.business_name}</Text>
          )}
        </MotiView>

        {/* Subscription Card */}
        <Card variant="glass" delay={200}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>SUBSCRIPTION</Text>
            <View style={styles.statusRow}>
              <StatusDot
                color={getStatusColor(data?.subscription?.status || null)}
                pulse={data?.subscription?.status === 'active'}
              />
              <Text style={styles.statusText}>
                {data?.subscription?.status?.toUpperCase() || 'NO PLAN'}
              </Text>
            </View>
          </View>
          <Divider />
          <View style={styles.pillRow}>
            <Pill
              variant={data?.subscription?.status === 'active' ? 'success' : 'default'}
              size="sm"
              delay={300}
            >
              {data?.subscription?.plan || 'No active plan'}
            </Pill>
            {data?.subscription?.current_period_end && (
              <Pill variant="default" size="sm" delay={400}>
                Renews {formatDate(data.subscription.current_period_end)}
              </Pill>
            )}
          </View>
          <Button
            variant="soft"
            size="sm"
            style={styles.cardBtn}
            onPress={() => router.push('/(client)/subscription')}
          >
            Manage Plan
          </Button>
        </Card>

        {/* Quick Chat */}
        <Card variant="glass" delay={300}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>MESSAGES</Text>
            {(data?.unread_messages || 0) > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{data?.unread_messages}</Text>
              </View>
            )}
          </View>
          <Divider />
          <Text style={styles.cardDescription}>
            {(data?.unread_messages || 0) > 0
              ? `You have ${data?.unread_messages} unread message${
                  data?.unread_messages === 1 ? '' : 's'
                }`
              : 'No new messages'}
          </Text>
          <Button
            variant="primary"
            size="sm"
            style={styles.cardBtn}
            onPress={() => router.push('/(client)/chat')}
          >
            Open Chat
          </Button>
        </Card>

        {/* Recent Inquiry */}
        {data?.recent_inquiry && (
          <Card variant="glass" delay={400}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>RECENT INQUIRY</Text>
              <Pill variant="info" size="sm">
                {data.recent_inquiry.status.toUpperCase()}
              </Pill>
            </View>
            <Divider />
            <View style={styles.inquiryInfo}>
              <Text style={styles.inquiryType}>
                {data.recent_inquiry.inquiry_type || 'General Inquiry'}
              </Text>
              <Text style={styles.inquiryDate}>
                {formatDate(data.recent_inquiry.created_at)}
              </Text>
            </View>
            <Button
              variant="soft"
              size="sm"
              style={styles.cardBtn}
              onPress={() => router.push('/(client)/inquiries')}
            >
              View All Inquiries
            </Button>
          </Card>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  welcome: {
    marginBottom: spacing.lg,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  businessName: {
    fontSize: 14,
    color: colors.textSub,
    marginTop: 4,
  },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceBtnSoft,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  logoutBtnDisabled: {
    opacity: 0.5,
  },
  logoutText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.textMuted2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    color: colors.textLabel,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  cardBtn: {
    marginTop: spacing.md,
  },
  cardDescription: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 21,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
  },
  inquiryInfo: {
    marginVertical: 4,
  },
  inquiryType: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  inquiryDate: {
    fontSize: 12,
    color: colors.textMuted2,
    marginTop: 2,
  },
});
