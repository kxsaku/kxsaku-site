// Login Screen
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Keyboard } from 'react-native';
import { useRouter, Redirect } from 'expo-router';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenWrapper, Header } from '../../src/components/layout';
import { Card, Input, Button } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, spacing, radius } from '../../src/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, isLoading, isAuthenticated, isAdmin } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  // Redirect if already authenticated
  if (isAuthenticated) {
    console.log('User authenticated, redirecting... isAdmin:', isAdmin);
    if (isAdmin) {
      return <Redirect href="/(admin)/clients" />;
    }
    return <Redirect href="/(client)/dashboard" />;
  }

  const handleLogin = async () => {
    console.log('=== LOGIN ATTEMPT ===');
    console.log('Email:', email);
    console.log('isLoading:', isLoading);

    Keyboard.dismiss();
    setError('');

    if (!email.trim() || !password) {
      setError('Please enter your email and password');
      return;
    }

    console.log('Calling signIn...');
    const result = await signIn(email.trim(), password);
    console.log('signIn result:', result);

    if (result.error) {
      setError(result.error);
    }
    // Navigation handled by index.tsx redirect
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {/* Logo */}
        <MotiView
          from={{ opacity: 0, translateY: -20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 500 }}
          style={styles.logoSection}
        >
          <View style={styles.logo}>
            <LinearGradient
              colors={[colors.accentSoft, colors.surfaceCard]}
              style={styles.logoGradient}
            >
              <Text style={styles.logoText}>SNS</Text>
            </LinearGradient>
          </View>
          <Text style={styles.title}>SNS PORTAL</Text>
          <Text style={styles.subtitle}>Client Dashboard</Text>
        </MotiView>

        {/* Login Card */}
        <Card style={styles.card} variant="glass" delay={200}>
          <Text style={styles.cardTitle}>SIGN IN</Text>
          <Text style={styles.cardSubtitle}>
            Enter your credentials to access your account
          </Text>

          <Input
            label="Email"
            placeholder="Enter your email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            containerStyle={styles.input}
          />

          <Input
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            containerStyle={styles.input}
            rightIcon={
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Text style={styles.showPassword}>
                  {showPassword ? 'HIDE' : 'SHOW'}
                </Text>
              </TouchableOpacity>
            }
          />

          {error ? (
            <MotiView
              from={{ opacity: 0, translateY: -10 }}
              animate={{ opacity: 1, translateY: 0 }}
            >
              <Text style={styles.error}>{error}</Text>
            </MotiView>
          ) : null}

          <View style={styles.actions}>
            <Button
              onPress={handleLogin}
              variant="primary"
              loading={isLoading}
              fullWidth
            >
              Sign In
            </Button>
          </View>
        </Card>

        {/* Footer */}
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 500 }}
          style={styles.footer}
        >
          <Text style={styles.footerText}>
            Don't have an account? Contact your administrator
          </Text>
        </MotiView>
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
  logoSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  logoGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 20,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 4,
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
  showPassword: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    color: colors.textLabel,
  },
  error: {
    color: colors.error,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  actions: {
    marginTop: spacing.md,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    fontSize: 13,
    color: colors.textMuted2,
  },
});
