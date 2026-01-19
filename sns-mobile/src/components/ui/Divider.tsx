// Divider Component
import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface DividerProps {
  style?: ViewStyle;
}

export function Divider({ style }: DividerProps) {
  return (
    <View style={[styles.container, style]}>
      <LinearGradient
        colors={['transparent', 'rgba(255, 255, 255, 0.10)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 1,
    marginVertical: 12,
  },
  gradient: {
    flex: 1,
  },
});
