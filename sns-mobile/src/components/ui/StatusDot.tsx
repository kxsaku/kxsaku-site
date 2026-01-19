// Status Dot Component
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import { colors } from '../../theme';

type StatusColor = 'green' | 'yellow' | 'red' | 'none' | 'info';

interface StatusDotProps {
  color: StatusColor;
  size?: number;
  pulse?: boolean;
}

export function StatusDot({ color, size = 10, pulse = false }: StatusDotProps) {
  const dotColor = getColor(color);

  if (pulse) {
    return (
      <MotiView
        from={{ scale: 1, opacity: 1 }}
        animate={{ scale: 1.15, opacity: 0.7 }}
        transition={{
          type: 'timing',
          duration: 1000,
          loop: true,
        }}
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            backgroundColor: dotColor,
            shadowColor: dotColor,
            shadowOpacity: 0.5,
            shadowRadius: 8,
          },
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          backgroundColor: dotColor,
        },
      ]}
    />
  );
}

function getColor(color: StatusColor): string {
  const colorMap: Record<StatusColor, string> = {
    green: colors.success,
    yellow: colors.warning,
    red: colors.error,
    info: colors.info,
    none: 'rgba(255, 255, 255, 0.18)',
  };
  return colorMap[color];
}

const styles = StyleSheet.create({
  dot: {
    borderRadius: 999,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 2,
    shadowOpacity: 0.06,
  },
});
