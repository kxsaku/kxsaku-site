// Admin Settings Screen
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native';
import { MotiView } from 'moti';
import { ScreenWrapper, Header } from '../../src/components/layout';
import { Card, Button, Pill, StatusDot, LoadingSpinner, Divider, Input } from '../../src/components/ui';
import { adminSystem, adminInvites, adminChat } from '../../src/lib/api';
import { colors, spacing, radius } from '../../src/theme';
import type { Invite } from '../../src/types';

interface SystemStatus {
  id: number;
  mode: 'normal' | 'maintenance';
  message: string;
  updated_at: string;
}

export default function AdminSettingsScreen() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // Fetch system status
      const statusResponse = await adminSystem.getStatus();
      if (!statusResponse.error) {
        setSystemStatus(statusResponse as unknown as SystemStatus);
      }

      // Fetch invites
      const invitesResponse = await adminInvites.list();
      if (!invitesResponse.error && (invitesResponse as any).invites) {
        setInvites((invitesResponse as any).invites);
      }
    } catch (error) {
      console.error('Settings fetch error:', error);
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

  const handleSendInvite = async () => {
    if (!newInviteEmail.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }

    setIsSendingInvite(true);

    try {
      const response = await adminInvites.create(newInviteEmail.trim());
      if (response.error) {
        Alert.alert('Error', response.error);
      } else {
        setNewInviteEmail('');
        Alert.alert('Success', 'Invite sent successfully');
        fetchData();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to send invite');
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleRevokeInvite = (invite: Invite) => {
    Alert.alert(
      'Revoke Invite',
      `Revoke invite for ${invite.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await adminInvites.revoke(invite.id);
              if (!response.error) {
                setInvites((prev) => prev.filter((i) => i.id !== invite.id));
              } else {
                Alert.alert('Error', response.error);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to revoke invite');
            }
          },
        },
      ]
    );
  };

  const handleBroadcast = () => {
    if (!broadcastMessage.trim()) {
      Alert.alert('Error', 'Please enter a message');
      return;
    }

    Alert.alert(
      'Broadcast Message',
      'This will send a message to all clients. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setIsBroadcasting(true);
            try {
              const response = await adminChat.broadcast(broadcastMessage.trim());
              if (response.error) {
                Alert.alert('Error', response.error);
              } else {
                setBroadcastMessage('');
                Alert.alert('Success', 'Broadcast sent successfully');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to send broadcast');
            } finally {
              setIsBroadcasting(false);
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

  if (isLoading) {
    return (
      <ScreenWrapper>
        <Header title="Settings" />
        <LoadingSpinner fullScreen text="Loading settings..." />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <Header title="Settings" />

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
        {/* System Status */}
        <Card variant="glass" delay={100}>
          <Text style={styles.cardTitle}>SYSTEM STATUS</Text>
          <Divider />

          <View style={styles.statusGrid}>
            <View style={styles.statusItem}>
              <StatusDot
                color={systemStatus?.mode === 'normal' ? 'green' : 'yellow'}
                pulse={systemStatus?.mode === 'normal'}
              />
              <Text style={styles.statusLabel}>SYSTEM MODE</Text>
              <Pill
                variant={systemStatus?.mode === 'normal' ? 'success' : 'warning'}
                size="sm"
                animate={false}
              >
                {systemStatus?.mode?.toUpperCase() || 'UNKNOWN'}
              </Pill>
            </View>
            {systemStatus?.message ? (
              <View style={styles.statusMessage}>
                <Text style={styles.statusMessageText}>{systemStatus.message}</Text>
              </View>
            ) : null}
            {systemStatus?.updated_at && (
              <Text style={styles.statusUpdated}>
                Last updated: {formatDate(systemStatus.updated_at)}
              </Text>
            )}
          </View>
        </Card>

        {/* Broadcast */}
        <Card variant="glass" delay={200}>
          <Text style={styles.cardTitle}>BROADCAST MESSAGE</Text>
          <Text style={styles.cardSubtitle}>
            Send a message to all clients at once
          </Text>
          <Divider />

          <TextInput
            style={styles.broadcastInput}
            placeholder="Enter broadcast message..."
            placeholderTextColor={colors.textMuted2}
            value={broadcastMessage}
            onChangeText={setBroadcastMessage}
            multiline
            numberOfLines={3}
          />

          <Button
            variant="primary"
            onPress={handleBroadcast}
            loading={isBroadcasting}
            disabled={!broadcastMessage.trim()}
            style={styles.actionBtn}
          >
            Send Broadcast
          </Button>
        </Card>

        {/* Invites */}
        <Card variant="glass" delay={300}>
          <Text style={styles.cardTitle}>CLIENT INVITES</Text>
          <Text style={styles.cardSubtitle}>
            Invite new clients to join the platform
          </Text>
          <Divider />

          <View style={styles.inviteForm}>
            <TextInput
              style={styles.inviteInput}
              placeholder="Email address"
              placeholderTextColor={colors.textMuted2}
              value={newInviteEmail}
              onChangeText={setNewInviteEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Button
              variant="primary"
              size="sm"
              onPress={handleSendInvite}
              loading={isSendingInvite}
              disabled={!newInviteEmail.trim()}
            >
              Invite
            </Button>
          </View>

          {invites.length > 0 && (
            <>
              <Divider />
              <Text style={styles.sectionLabel}>PENDING INVITES</Text>
              {invites.filter((i) => !i.accepted).map((invite, index) => (
                <MotiView
                  key={invite.id}
                  from={{ opacity: 0, translateX: -10 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  transition={{ delay: 350 + index * 50 }}
                  style={styles.inviteItem}
                >
                  <View style={styles.inviteInfo}>
                    <Text style={styles.inviteEmail}>{invite.email}</Text>
                    <Text style={styles.inviteDate}>
                      Expires {formatDate(invite.expires_at)}
                    </Text>
                  </View>
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => handleRevokeInvite(invite)}
                  >
                    Revoke
                  </Button>
                </MotiView>
              ))}
            </>
          )}
        </Card>

        {/* App Info */}
        <Card variant="glass" delay={400}>
          <Text style={styles.cardTitle}>APP INFO</Text>
          <Divider />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Platform</Text>
            <Text style={styles.infoValue}>React Native + Expo</Text>
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
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.textMuted2,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  statusGrid: {
    gap: 12,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  statusMessage: {
    backgroundColor: colors.surfaceBtnSoft,
    borderRadius: radius.sm,
    padding: 10,
    marginTop: 8,
  },
  statusMessageText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  statusUpdated: {
    fontSize: 11,
    color: colors.textMuted2,
    marginTop: 8,
  },
  broadcastInput: {
    backgroundColor: colors.surfaceInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderInput,
    padding: 14,
    color: colors.textPrimary,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actionBtn: {
    marginTop: spacing.md,
  },
  inviteForm: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  inviteInput: {
    flex: 1,
    backgroundColor: colors.surfaceInput,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderInput,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: colors.textPrimary,
    fontSize: 14,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: colors.textMuted2,
    marginBottom: 10,
  },
  inviteItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  inviteInfo: {
    flex: 1,
  },
  inviteEmail: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  inviteDate: {
    fontSize: 11,
    color: colors.textMuted2,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
});
