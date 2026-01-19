// Pill/Badge Component
import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { MotiView } from 'moti';
import { colors, spacing, radius } from '../../theme';

interface PillProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  animate?: boolean;
  delay?: number;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Pill({
  children,
  variant = 'default',
  size = 'md',
  icon,
  animate = true,
  delay = 0,
  style,
  textStyle,
}: PillProps) {
  const variantStyles = getVariantStyles(variant);
  const sizeStyles = getSizeStyles(size);

  const Container = animate ? MotiView : View;
  const animationProps = animate
    ? {
        from: { opacity: 0, translateY: 8 },
        animate: { opacity: 1, translateY: 0 },
        transition: { type: 'timing' as const, duration: 300, delay },
      }
    : {};

  return (
    <Container
      style={[styles.pill, variantStyles.pill, sizeStyles.pill, style]}
      {...animationProps}
    >
      {icon}
      <Text style={[styles.text, sizeStyles.text, textStyle]}>{children}</Text>
    </Container>
  );
}

function getVariantStyles(variant: PillProps['variant']) {
  const variants: Record<NonNullable<PillProps['variant']>, { pill: ViewStyle }> = {
    default: {
      pill: {
        backgroundColor: 'rgba(9, 6, 34, 0.65)',
        borderColor: colors.border,
      },
    },
    success: {
      pill: {
        backgroundColor: 'rgba(108, 255, 176, 0.12)',
        borderColor: 'rgba(108, 255, 176, 0.25)',
      },
    },
    warning: {
      pill: {
        backgroundColor: 'rgba(255, 212, 90, 0.12)',
        borderColor: 'rgba(255, 212, 90, 0.25)',
      },
    },
    error: {
      pill: {
        backgroundColor: 'rgba(255, 98, 98, 0.12)',
        borderColor: 'rgba(255, 98, 98, 0.3)',
      },
    },
    info: {
      pill: {
        backgroundColor: 'rgba(123, 184, 255, 0.12)',
        borderColor: 'rgba(123, 184, 255, 0.25)',
      },
    },
    accent: {
      pill: {
        backgroundColor: colors.accentSoft,
        borderColor: colors.accentBorder,
      },
    },
  };
  return variants[variant!];
}

function getSizeStyles(size: PillProps['size']) {
  const sizes: Record<NonNullable<PillProps['size']>, { pill: ViewStyle; text: TextStyle }> = {
    sm: {
      pill: { paddingVertical: 6, paddingHorizontal: 10 },
      text: { fontSize: 11 },
    },
    md: {
      pill: { paddingVertical: 10, paddingHorizontal: 16 },
      text: { fontSize: 14 },
    },
  };
  return sizes[size!];
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  text: {
    color: '#d9d3ff',
  },
});
