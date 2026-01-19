// Client Inquiry Detail Screen
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MotiView } from 'moti';
import { ScreenWrapper, Header } from '../../../src/components/layout';
import { Card, Pill, StatusDot, LoadingSpinner, Divider } from '../../../src/components/ui';
import { supabase } from '../../../src/lib/supabase';
import { colors, spacing } from '../../../src/theme';
import type { Inquiry } from '../../../src/types';

export default function InquiryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchInquiry();
  }, [id]);

  const fetchInquiry = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from('inquiries')
        .select('*')
        .eq('id', id)
        .single();

      if (!error && data) {
        setInquiry(data);
      }
    } catch (error) {
      console.error('Inquiry fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

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
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <ScreenWrapper>
        <Header title="Inquiry" showBack />
        <LoadingSpinner fullScreen text="Loading inquiry..." />
      </ScreenWrapper>
    );
  }

  if (!inquiry) {
    return (
      <ScreenWrapper>
        <Header title="Inquiry" showBack />
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Inquiry not found</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header title="Inquiry Detail" showBack />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Card */}
        <Card variant="glass" delay={100}>
          <View style={styles.statusHeader}>
            <View style={styles.statusRow}>
              <StatusDot color={getStatusColor(inquiry.status)} pulse />
              <Text style={styles.statusText}>{inquiry.status.toUpperCase()}</Text>
            </View>
            {inquiry.priority && inquiry.priority !== 'normal' && (
              <Pill
                variant={
                  inquiry.priority === 'urgent' || inquiry.priority === 'high'
                    ? 'error'
                    : 'warning'
                }
                size="sm"
              >
                {inquiry.priority.toUpperCase()} PRIORITY
              </Pill>
            )}
          </View>
        </Card>

        {/* Details Card */}
        <Card variant="glass" delay={200}>
          <Text style={styles.cardTitle}>DETAILS</Text>
          <Divider />

          <View style={styles.detailsGrid}>
            <MotiView
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ delay: 250 }}
              style={styles.detailItem}
            >
              <Text style={styles.detailLabel}>TYPE</Text>
              <Text style={styles.detailValue}>
                {inquiry.inquiry_type || 'General'}
              </Text>
            </MotiView>

            <MotiView
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ delay: 300 }}
              style={styles.detailItem}
            >
              <Text style={styles.detailLabel}>SUBMITTED</Text>
              <Text style={styles.detailValue}>{formatDate(inquiry.created_at)}</Text>
            </MotiView>

            {inquiry.updated_at && inquiry.updated_at !== inquiry.created_at && (
              <MotiView
                from={{ opacity: 0, translateY: 10 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ delay: 350 }}
                style={styles.detailItem}
              >
                <Text style={styles.detailLabel}>LAST UPDATED</Text>
                <Text style={styles.detailValue}>{formatDate(inquiry.updated_at)}</Text>
              </MotiView>
            )}
          </View>
        </Card>

        {/* Inquiry Text Card */}
        <Card variant="glass" delay={300}>
          <Text style={styles.cardTitle}>YOUR INQUIRY</Text>
          <Divider />
          <Text style={styles.inquiryText}>{inquiry.inquiry_text}</Text>
        </Card>

        {/* Contact Info */}
        <Card variant="glass" delay={400}>
          <Text style={styles.cardTitle}>CONTACT INFORMATION</Text>
          <Divider />

          <View style={styles.contactGrid}>
            {inquiry.name && (
              <View style={styles.contactItem}>
                <Text style={styles.contactLabel}>Name</Text>
                <Text style={styles.contactValue}>{inquiry.name}</Text>
              </View>
            )}
            <View style={styles.contactItem}>
              <Text style={styles.contactLabel}>Email</Text>
              <Text style={styles.contactValue}>{inquiry.email}</Text>
            </View>
            {inquiry.phone && (
              <View style={styles.contactItem}>
                <Text style={styles.contactLabel}>Phone</Text>
                <Text style={styles.contactValue}>{inquiry.phone}</Text>
              </View>
            )}
            {inquiry.business_name && (
              <View style={styles.contactItem}>
                <Text style={styles.contactLabel}>Business</Text>
                <Text style={styles.contactValue}>{inquiry.business_name}</Text>
              </View>
            )}
          </View>
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
  notFound: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notFoundText: {
    fontSize: 16,
    color: colors.textMuted,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.textPrimary,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.textMuted2,
  },
  detailsGrid: {
    gap: 16,
  },
  detailItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    padding: 12,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.textMuted2,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  inquiryText: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  contactGrid: {
    gap: 12,
  },
  contactItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },
  contactValue: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
});
