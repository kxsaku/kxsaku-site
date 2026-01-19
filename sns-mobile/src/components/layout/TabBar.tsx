// Custom Tab Bar Component
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { MotiView } from 'moti';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, spacing, radius } from '../../theme';

interface TabBarIconProps {
  name: string;
  focused: boolean;
}

function TabBarIcon({ name, focused }: TabBarIconProps) {
  const icons: Record<string, string> = {
    dashboard: '◈',
    chat: '◇',
    subscription: '☆',
    inquiries: '◎',
    clients: '◈',
    broadcast: '◆',
    notes: '◇',
    settings: '⚙',
  };

  return (
    <Text style={[styles.icon, focused && styles.iconFocused]}>
      {icons[name] || '●'}
    </Text>
  );
}

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.container}>
      <BlurView intensity={40} tint="dark" style={styles.blur}>
        <View style={styles.content}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const label =
              options.tabBarLabel !== undefined
                ? String(options.tabBarLabel)
                : options.title !== undefined
                ? options.title
                : route.name;

            const isFocused = state.index === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            return (
              <TouchableOpacity
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                onPress={onPress}
                style={styles.tab}
              >
                <MotiView
                  animate={{
                    scale: isFocused ? 1 : 0.9,
                    opacity: isFocused ? 1 : 0.7,
                  }}
                  transition={{ type: 'spring', damping: 15 }}
                  style={styles.tabContent}
                >
                  <TabBarIcon name={route.name} focused={isFocused} />
                  <Text
                    style={[styles.label, isFocused && styles.labelFocused]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                  {isFocused && (
                    <MotiView
                      from={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      style={styles.indicator}
                    />
                  )}
                </MotiView>
              </TouchableOpacity>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    paddingHorizontal: spacing.md,
  },
  blur: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderCard,
  },
  content: {
    flexDirection: 'row',
    backgroundColor: 'rgba(9, 6, 34, 0.85)',
    paddingVertical: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabContent: {
    alignItems: 'center',
    gap: 4,
  },
  icon: {
    fontSize: 20,
    color: colors.textMuted,
  },
  iconFocused: {
    color: colors.accent,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textMuted2,
  },
  labelFocused: {
    color: colors.textPrimary,
  },
  indicator: {
    position: 'absolute',
    bottom: -8,
    width: 20,
    height: 2,
    backgroundColor: colors.accent,
    borderRadius: 1,
  },
});
