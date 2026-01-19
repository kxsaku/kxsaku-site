// Invite Accept Screen
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Keyboard } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { ScreenWrapper } from '../../src/components/layout';
import { Card, Input, Button, LoadingSpinner } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing } from '../../src/theme';

export default function InviteAcceptScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [isValidating, setIsValidating] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
    if (!token) {
      setError('Invalid invite link');
      setIsValidating(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('invites')
        .select('email, expires_at, accepted')
        .eq('token', token)
        .maybeSingle();

      if (fetchError || !data) {
        setError('Invalid or expired invite');
        setIsValidating(false);
        return;
      }

      if (data.accepted) {
        setError('This invite has already been used');
        setIsValidating(false);
        return;
      }

      if (new Date(data.expires_at) < new Date()) {
        setError('This invite has expired');
        setIsValidating(false);
        return;
      }

      setInviteEmail(data.email);
    } catch (err) {
      setError('Failed to validate invite');
    } finally {
      setIsValidating(false);
    }
  };

  const handleAccept = async () => {
    Keyboard.dismiss();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);

    try {
      // Create the user account
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: inviteEmail,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
        setIsSubmitting(false);
        return;
      }

      // Mark invite as accepted
      await supabase
        .from('invites')
        .update({ accepted: true })
        .eq('token', token);

      // Navigate to login
      router.replace('/(auth)/login');
    } catch (err) {
      setError('Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <ScreenWrapper>
        <LoadingSpinner fullScreen text="Validating invite..." />
      </ScreenWrapper>
    );
  }

  if (error && !inviteEmail) {
    return (
      <ScreenWrapper>
        <View style={styles.container}>
          <Card style={styles.card} variant="glass">
            <Text style={styles.cardTitle}>INVALID INVITE</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Button
              onPress={() => router.replace('/(auth)/login')}
              variant="soft"
              style={styles.button}
            >
              Go to Login
            </Button>
          </Card>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <MotiView
          from={{ opacity: 0, translateY: -20 }}
          animate={{ opacity: 1, translateY: 0 }}
          style={styles.header}
        >
          <Text style={styles.title}>WELCOME</Text>
          <Text style={styles.subtitle}>Set up your account</Text>
        </MotiView>

        <Card style={styles.card} variant="glass" delay={200}>
          <Text style={styles.cardTitle}>CREATE PASSWORD</Text>
          <Text style={styles.cardSubtitle}>
            Create a password for your account: {inviteEmail}
          </Text>

          <Input
            label="Password"
            placeholder="Create a password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            containerStyle={styles.input}
          />

          <Input
            label="Confirm Password"
            placeholder="Confirm your password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            containerStyle={styles.input}
          />

          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : null}

          <Button
            onPress={handleAccept}
            variant="primary"
            loading={isSubmitting}
            fullWidth
          >
            Create Account
          </Button>
        </Card>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 4,
    color: colors.textPrimary,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSub,
    marginTop: 4,
  },
  card: {
    marginHorizontal: 0,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 14,
    color: colors.textSub,
    marginBottom: spacing.lg,
    lineHeight: 21,
  },
  input: {
    marginBottom: spacing.md,
  },
  error: {
    color: colors.error,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  button: {
    marginTop: spacing.md,
  },
});
