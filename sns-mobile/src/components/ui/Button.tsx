// Button Component with Moti animations
import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { MotiView } from 'moti';
import { colors, spacing, radius, typography } from '../../theme';

type ButtonVariant = 'default' | 'primary' | 'soft' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export function Button({
  children,
  onPress,
  variant = 'default',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  const variantStyles = getVariantStyles(variant);
  const sizeStyles = getSizeStyles(size);

  return (
    <MotiView
      from={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 18 }}
    >
      <TouchableOpacity
        onPress={() => {
          console.log('Button pressed, disabled:', disabled, 'loading:', loading);
          if (onPress) onPress();
        }}
        disabled={disabled || loading}
        activeOpacity={0.8}
        style={[
          styles.button,
          variantStyles.button,
          sizeStyles.button,
          fullWidth && styles.fullWidth,
          disabled && styles.disabled,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.textPrimary} />
        ) : (
          <>
            {icon}
            <Text style={[styles.text, sizeStyles.text, textStyle]}>
              {children}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </MotiView>
  );
}

function getVariantStyles(variant: ButtonVariant) {
  const variants: Record<ButtonVariant, { button: ViewStyle }> = {
    default: {
      button: {
        backgroundColor: colors.surfaceBtn,
        borderColor: colors.border,
      },
    },
    primary: {
      button: {
        backgroundColor: colors.accentSoft,
        borderColor: colors.accentBorder,
      },
    },
    soft: {
      button: {
        backgroundColor: colors.surfaceBtnSoft,
        borderColor: 'rgba(129, 118, 255, 0.28)',
      },
    },
    danger: {
      button: {
        backgroundColor: colors.surfaceBtn,
        borderColor: 'rgba(255, 98, 98, 0.45)',
      },
    },
    ghost: {
      button: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderColor: 'rgba(255, 255, 255, 0.14)',
      },
    },
  };
  return variants[variant];
}

function getSizeStyles(size: ButtonSize) {
  const sizes: Record<ButtonSize, { button: ViewStyle; text: TextStyle }> = {
    sm: {
      button: { paddingVertical: 8, paddingHorizontal: 14 },
      text: { fontSize: 12 },
    },
    md: {
      button: { paddingVertical: 12, paddingHorizontal: 18 },
      text: { fontSize: 13 },
    },
    lg: {
      button: { paddingVertical: 14, paddingHorizontal: 22 },
      text: { fontSize: 14 },
    },
  };
  return sizes[size];
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  text: {
    color: colors.textPrimary,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.55,
  },
});
