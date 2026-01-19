// Admin Inquiry Detail Screen
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { ScreenWrapper, Header } from '../../../src/components/layout';
import { Card, Pill, StatusDot, LoadingSpinner, Button, Divider } from '../../../src/components/ui';
import { adminInquiries } from '../../../src/lib/api';
import { supabase } from '../../../src/lib/supabase';
import { colors, spacing, radius } from '../../../src/theme';
import type { Inquiry } from '../../../src/types';

const STATUSES = ['new', 'assigned', 'working', 'completed', 'walkaway'] as const;
const PRIORITIES = ['red', 'yellow', 'green', 'none'] as const;

export default function AdminInquiryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [internalNotes, setInternalNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

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
        setInternalNotes(data.notes || '');
      }
    } catch (error) {
      console.error('Inquiry fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateInquiry = async (updates: Partial<Inquiry>) => {
    if (!id) return;
    setIsUpdating(true);

    try {
      const response = await adminInquiries.update(id, updates);
      if (response.error) {
        Alert.alert('Error', response.error);
      } else {
        setInquiry((prev) => (prev ? { ...prev, ...updates } : null));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update inquiry');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStatusChange = (newStatus: typeof STATUSES[number]) => {
    Alert.alert(
      'Update Status',
      `Change status to "${newStatus.toUpperCase()}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: () => updateInquiry({ status: newStatus }),
        },
      ]
    );
  };

  const handlePriorityChange = (newPriority: typeof PRIORITIES[number]) => {
    Alert.alert(
      'Update Priority',
      `Change priority to "${newPriority.toUpperCase()}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: () => updateInquiry({ priority_flag: newPriority }),
        },
      ]
    );
  };

  const handleSaveNotes = async () => {
    if (!id) return;
    setIsSavingNotes(true);

    try {
      const { error } = await supabase
        .from('inquiries')
        .update({ notes: internalNotes })
        .eq('id', id);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Success', 'Notes saved');
        setInquiry((prev) => (prev ? { ...prev, notes: internalNotes } : null));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save notes');
    } finally {
      setIsSavingNotes(false);
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
      case 'walkaway':
        return 'red';
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
        return colors.textMuted;
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

  const formatWorkOrder = (wo: number | null) => {
    if (wo == null) return '-';
    return `WO-${String(wo).padStart(6, '0')}`;
  };

  const formatServices = (services: string[] | string | null) => {
    if (!services) return '-';
    if (Array.isArray(services)) return services.join(', ');
    return services;
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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Status & Priority Controls */}
          <Card variant="glass" delay={100}>
            <View style={styles.controlSection}>
              <Text style={styles.controlLabel}>STATUS</Text>
              <View style={styles.optionsRow}>
                {STATUSES.map((status) => (
                  <Button
                    key={status}
                    variant={inquiry.status === status ? 'primary' : 'ghost'}
                    size="sm"
                    onPress={() => handleStatusChange(status)}
                    disabled={isUpdating || inquiry.status === status}
                  >
                    {status.toUpperCase()}
                  </Button>
                ))}
              </View>
            </View>

            <Divider />

            <View style={styles.controlSection}>
              <Text style={styles.controlLabel}>PRIORITY FLAG</Text>
              <View style={styles.optionsRow}>
                {PRIORITIES.map((priority) => (
                  <Button
                    key={priority}
                    variant={inquiry.priority_flag === priority ? 'primary' : 'ghost'}
                    size="sm"
                    onPress={() => handlePriorityChange(priority)}
                    disabled={isUpdating || inquiry.priority_flag === priority}
                  >
                    <View style={styles.priorityBtnContent}>
                      <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(priority) }]} />
                      <Text style={styles.priorityBtnText}>{priority.toUpperCase()}</Text>
                    </View>
                  </Button>
                ))}
              </View>
            </View>
          </Card>

          {/* Basic Info */}
          <Card variant="glass" delay={200}>
            <Text style={styles.cardTitle}>INQUIRY INFO</Text>
            <Divider />

            <MotiView
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ delay: 250 }}
            >
              <View style={styles.infoGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>WORK ORDER</Text>
                  <Text style={styles.detailValue}>{formatWorkOrder(inquiry.work_order)}</Text>
                </View>

                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>CREATED</Text>
                  <Text style={styles.detailValue}>{formatDate(inquiry.created_at)}</Text>
                </View>

                {inquiry.inquiry_type && (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>TYPE</Text>
                    <Text style={styles.detailValue}>{inquiry.inquiry_type}</Text>
                  </View>
                )}

                {inquiry.updated_at && inquiry.updated_at !== inquiry.created_at && (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>LAST UPDATED</Text>
                    <Text style={styles.detailValue}>{formatDate(inquiry.updated_at)}</Text>
                  </View>
                )}
              </View>
            </MotiView>
          </Card>

          {/* Contact Info */}
          <Card variant="glass" delay={300}>
            <Text style={styles.cardTitle}>CONTACT INFORMATION</Text>
            <Divider />

            <View style={styles.contactGrid}>
              {inquiry.contact_name && (
                <View style={styles.contactItem}>
                  <Text style={styles.contactLabel}>Name</Text>
                  <Text style={styles.contactValue}>{inquiry.contact_name}</Text>
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
              {inquiry.location && (
                <View style={styles.contactItem}>
                  <Text style={styles.contactLabel}>Location</Text>
                  <Text style={styles.contactValue}>{inquiry.location}</Text>
                </View>
              )}
              {inquiry.company_size && (
                <View style={styles.contactItem}>
                  <Text style={styles.contactLabel}>Team Size</Text>
                  <Text style={styles.contactValue}>{inquiry.company_size}</Text>
                </View>
              )}
            </View>
          </Card>

          {/* Services */}
          {inquiry.services && (
            <Card variant="glass" delay={350}>
              <Text style={styles.cardTitle}>SERVICES REQUESTED</Text>
              <Divider />
              <Text style={styles.contentText}>{formatServices(inquiry.services)}</Text>
            </Card>
          )}

          {/* Inquiry Text */}
          {inquiry.inquiry_text && (
            <Card variant="glass" delay={400}>
              <Text style={styles.cardTitle}>INQUIRY MESSAGE</Text>
              <Divider />
              <Text style={styles.contentText}>{inquiry.inquiry_text}</Text>
            </Card>
          )}

          {/* Current Setup */}
          {inquiry.current_setup && (
            <Card variant="glass" delay={450}>
              <Text style={styles.cardTitle}>CURRENT SETUP</Text>
              <Divider />
              <Text style={styles.contentText}>{inquiry.current_setup}</Text>
            </Card>
          )}

          {/* Goals */}
          {inquiry.goals && (
            <Card variant="glass" delay={500}>
              <Text style={styles.cardTitle}>GOALS</Text>
              <Divider />
              <Text style={styles.contentText}>{inquiry.goals}</Text>
            </Card>
          )}

          {/* Budget & Timeline */}
          {(inquiry.budget || inquiry.timeline) && (
            <Card variant="glass" delay={550}>
              <Text style={styles.cardTitle}>BUDGET & TIMELINE</Text>
              <Divider />
              <View style={styles.contactGrid}>
                {inquiry.budget && (
                  <View style={styles.contactItem}>
                    <Text style={styles.contactLabel}>Budget</Text>
                    <Text style={styles.contactValue}>{inquiry.budget}</Text>
                  </View>
                )}
                {inquiry.timeline && (
                  <View style={styles.contactItem}>
                    <Text style={styles.contactLabel}>Timeline</Text>
                    <Text style={styles.contactValue}>{inquiry.timeline}</Text>
                  </View>
                )}
              </View>
            </Card>
          )}

          {/* Extra Notes from Client */}
          {inquiry.extra_notes && (
            <Card variant="glass" delay={600}>
              <Text style={styles.cardTitle}>EXTRA NOTES (FROM CLIENT)</Text>
              <Divider />
              <Text style={styles.contentText}>{inquiry.extra_notes}</Text>
            </Card>
          )}

          {/* Internal Notes (Editable) */}
          <Card variant="glass" delay={650}>
            <Text style={styles.cardTitle}>INTERNAL NOTES</Text>
            <Text style={styles.cardSubtitle}>Private notes for this inquiry</Text>
            <Divider />

            <TextInput
              style={styles.notesInput}
              placeholder="Write notes for this inquiry..."
              placeholderTextColor={colors.textMuted2}
              value={internalNotes}
              onChangeText={setInternalNotes}
              multiline
              textAlignVertical="top"
            />

            <Button
              variant="primary"
              onPress={handleSaveNotes}
              loading={isSavingNotes}
              style={styles.saveBtn}
            >
              Save Notes
            </Button>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
  controlSection: {
    marginBottom: spacing.sm,
  },
  controlLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: colors.textMuted2,
    marginBottom: 10,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  priorityBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  priorityBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.textMuted2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  infoGrid: {
    gap: 10,
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
  contentText: {
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
    flex: 1,
    textAlign: 'right',
    marginLeft: 10,
  },
  notesInput: {
    backgroundColor: colors.surfaceInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderInput,
    padding: 14,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 24,
    minHeight: 150,
  },
  saveBtn: {
    marginTop: spacing.md,
  },
});
