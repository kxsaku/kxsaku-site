// Entry point - Auth check and redirect
import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { MotiView } from 'moti';
import { useAuthStore } from '../src/stores/authStore';
import { LoadingSpinner } from '../src/components/ui';
import { colors } from '../src/theme';

export default function Index() {
  const { isLoading, isAuthenticated, isAdmin } = useAuthStore();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <MotiView
          from={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 500 }}
          style={styles.logoContainer}
        >
          <MotiView
            from={{ opacity: 0.5 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'timing', duration: 1000, loop: true }}
          >
            <View style={styles.logo}>
              <View style={styles.logoInner} />
            </View>
          </MotiView>
        </MotiView>
        <LoadingSpinner text="Loading..." />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  // Redirect to appropriate dashboard based on user role
  if (isAdmin) {
    return <Redirect href="/(admin)/clients" />;
  }

  return <Redirect href="/(client)/dashboard" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 40,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    borderWidth: 2,
    borderColor: colors.accentBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoInner: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
});
