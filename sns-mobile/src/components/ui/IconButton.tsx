// Icon Button Component
import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { MotiView } from 'moti';
import { colors, radius } from '../../theme';

interface IconButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  size?: number;
  variant?: 'default' | 'soft' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
}

export function IconButton({
  children,
  onPress,
  size = 40,
  variant = 'default',
  disabled = false,
  style,
}: IconButtonProps) {
  const variantStyles = getVariantStyles(variant);

  return (
    <MotiView
      from={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', damping: 15 }}
    >
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.7}
        style={[
          styles.button,
          variantStyles,
          { width: size, height: size },
          disabled && styles.disabled,
          style,
        ]}
      >
        {children}
      </TouchableOpacity>
    </MotiView>
  );
}

function getVariantStyles(variant: IconButtonProps['variant']): ViewStyle {
  switch (variant) {
    case 'soft':
      return {
        backgroundColor: colors.surfaceBtnSoft,
        borderColor: 'rgba(129, 118, 255, 0.25)',
      };
    case 'danger':
      return {
        backgroundColor: colors.surfaceBtn,
        borderColor: 'rgba(255, 98, 98, 0.35)',
      };
    default:
      return {
        backgroundColor: 'rgba(15, 10, 55, 0.70)',
        borderColor: colors.border,
      };
  }
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.5,
  },
});
