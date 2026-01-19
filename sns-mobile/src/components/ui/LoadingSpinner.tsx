// Loading Spinner Component
import React from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { MotiView } from 'moti';
import { colors } from '../../theme';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  text?: string;
  fullScreen?: boolean;
}

export function LoadingSpinner({
  size = 'large',
  text,
  fullScreen = false,
}: LoadingSpinnerProps) {
  const content = (
    <MotiView
      from={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'timing', duration: 300 }}
      style={styles.container}
    >
      <ActivityIndicator size={size} color={colors.accent} />
      {text && <Text style={styles.text}>{text}</Text>}
    </MotiView>
  );

  if (fullScreen) {
    return <View style={styles.fullScreen}>{content}</View>;
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 12,
  },
});
