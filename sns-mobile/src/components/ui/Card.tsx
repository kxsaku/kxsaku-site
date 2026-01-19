// Card Component with glass morphism effect
import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'glass';
  animate?: boolean;
  delay?: number;
}

export function Card({
  children,
  style,
  variant = 'default',
  animate = true,
  delay = 0,
}: CardProps) {
  const Container = animate ? MotiView : View;

  const animationProps = animate
    ? {
        from: { opacity: 0, translateY: 14, scale: 0.985 },
        animate: { opacity: 1, translateY: 0, scale: 1 },
        transition: {
          type: 'timing' as const,
          duration: 450,
          delay,
        },
      }
    : {};

  if (variant === 'glass') {
    return (
      <Container style={[styles.glassCard, style]} {...animationProps}>
        <LinearGradient
          colors={['rgba(12, 8, 36, 0.70)', 'rgba(8, 5, 28, 0.50)']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
        <View style={styles.content}>{children}</View>
      </Container>
    );
  }

  return (
    <Container style={[styles.card, style]} {...animationProps}>
      {children}
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderCard,
    borderRadius: radius.xl,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 25 },
    shadowOpacity: 0.55,
    shadowRadius: 40,
    elevation: 10,
  },
  glassCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.38,
    shadowRadius: 25,
    elevation: 8,
  },
  content: {
    padding: spacing.lg,
  },
});
