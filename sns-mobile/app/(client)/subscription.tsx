// Client Subscription Screen
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { MotiView } from 'moti';
import { ScreenWrapper, Header } from '../../src/components/layout';
import { Card, Button, Pill, StatusDot, LoadingSpinner, Divider } from '../../src/components/ui';
import { clientSubscription } from '../../src/lib/api';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing } from '../../src/theme';

interface SubscriptionData {
  status: string | null;
  plan: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
}

export default function SubscriptionScreen() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchSubscription = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('billing_subscriptions')
        .select('status, plan, current_period_start, current_period_end, stripe_subscription_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data) {
        setSubscription(data);
      }
    } catch (error) {
      console.error('Subscription fetch error:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchSubscription();
  }, [fetchSubscription]);

  const handleSubscribe = async () => {
    setIsProcessing(true);
    try {
      const response = await clientSubscription.getCheckoutUrl();
      if (response.error) {
        Alert.alert('Error', response.error);
        return;
      }

      const url = (response as any).url;
      if (url) {
        await WebBrowser.openBrowserAsync(url);
        // Refresh subscription after returning
        fetchSubscription();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to start checkout');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManage = async () => {
    setIsProcessing(true);
    try {
      const response = await clientSubscription.getPortalUrl();
      if (response.error) {
        Alert.alert('Error', response.error);
        return;
      }

      const url = (response as any).url;
      if (url) {
        await WebBrowser.openBrowserAsync(url);
        // Refresh subscription after returning
        fetchSubscription();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open portal');
    } finally {
      setIsProcessing(false);
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

  const getStatusVariant = (status: string | null) => {
    switch (status) {
      case 'active':
      case 'trialing':
        return 'success' as const;
      case 'past_due':
        return 'warning' as const;
      case 'canceled':
        return 'error' as const;
      default:
        return 'default' as const;
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <ScreenWrapper>
        <Header title="Subscription" />
        <LoadingSpinner fullScreen text="Loading subscription..." />
      </ScreenWrapper>
    );
  }

  const hasSubscription = subscription?.status && subscription.status !== 'canceled';

  return (
    <ScreenWrapper>
      <Header title="Subscription" />

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
        {/* Status Card */}
        <Card variant="glass" delay={100}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>CURRENT PLAN</Text>
            {subscription?.status && (
              <View style={styles.statusRow}>
                <StatusDot
                  color={getStatusColor(subscription.status)}
                  pulse={subscription.status === 'active'}
                />
                <Pill variant={getStatusVariant(subscription.status)} size="sm">
                  {subscription.status.toUpperCase()}
                </Pill>
              </View>
            )}
          </View>
          <Divider />

          {hasSubscription ? (
            <MotiView
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
            >
              <Text style={styles.planName}>{subscription?.plan || 'Standard Plan'}</Text>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Started</Text>
                <Text style={styles.detailValue}>
                  {formatDate(subscription?.current_period_start || null)}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  {subscription?.status === 'canceled' ? 'Ends' : 'Renews'}
                </Text>
                <Text style={styles.detailValue}>
                  {formatDate(subscription?.current_period_end || null)}
                </Text>
              </View>

              <Button
                variant="soft"
                onPress={handleManage}
                loading={isProcessing}
                style={styles.actionBtn}
              >
                Manage Subscription
              </Button>
            </MotiView>
          ) : (
            <MotiView
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              style={styles.noPlan}
            >
              <Text style={styles.noPlanTitle}>No Active Plan</Text>
              <Text style={styles.noPlanText}>
                Subscribe to access all features and dedicated support
              </Text>

              <Button
                variant="primary"
                onPress={handleSubscribe}
                loading={isProcessing}
                style={styles.actionBtn}
              >
                Subscribe Now
              </Button>
            </MotiView>
          )}
        </Card>

        {/* Features Card */}
        <Card variant="glass" delay={200}>
          <Text style={styles.cardTitle}>INCLUDED FEATURES</Text>
          <Divider />

          <View style={styles.features}>
            {[
              'Direct chat with account manager',
              'Priority support response',
              'Service tracking dashboard',
              'Inquiry management',
              'Attachment sharing',
            ].map((feature, index) => (
              <MotiView
                key={feature}
                from={{ opacity: 0, translateX: -10 }}
                animate={{ opacity: 1, translateX: 0 }}
                transition={{ delay: 300 + index * 50 }}
                style={styles.featureRow}
              >
                <Text style={styles.featureCheck}>✓</Text>
                <Text style={styles.featureText}>{feature}</Text>
              </MotiView>
            ))}
          </View>
        </Card>

        {/* Help Card */}
        <Card variant="glass" delay={300}>
          <Text style={styles.cardTitle}>NEED HELP?</Text>
          <Divider />
          <Text style={styles.helpText}>
            If you have questions about your subscription or need assistance,
            please reach out through the chat or contact support.
          </Text>
        </Card>
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
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
  planName: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  actionBtn: {
    marginTop: spacing.md,
  },
  noPlan: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  noPlanTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  noPlanText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  features: {
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureCheck: {
    fontSize: 14,
    color: colors.success,
    fontWeight: '600',
  },
  featureText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  helpText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 21,
  },
});
