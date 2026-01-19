// Client Tab Navigator Layout
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius, spacing } from '../../src/theme';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    dashboard: '◈',
    chat: '◇',
    subscription: '☆',
    inquiries: '◎',
  };

  return (
    <View style={styles.tabIconContainer}>
      <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>
        {icons[name] || '●'}
      </Text>
      {focused && <View style={styles.indicator} />}
    </View>
  );
}

export default function ClientLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => (
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
            <View style={styles.tabBarBg} />
          </BlurView>
        ),
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.textMuted2,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused }) => <TabIcon name="dashboard" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ focused }) => <TabIcon name="chat" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="subscription"
        options={{
          title: 'Plan',
          tabBarIcon: ({ focused }) => <TabIcon name="subscription" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="inquiries"
        options={{
          title: 'Inquiries',
          tabBarIcon: ({ focused }) => <TabIcon name="inquiries" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 25 : 15,
    left: 16,
    right: 16,
    height: 65,
    borderRadius: radius.xl,
    borderTopWidth: 0,
    backgroundColor: 'transparent',
    elevation: 0,
    borderWidth: 1,
    borderColor: colors.borderCard,
    overflow: 'hidden',
  },
  tabBarBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 6, 34, 0.85)',
  },
  tabIconContainer: {
    alignItems: 'center',
    marginTop: 4,
  },
  tabIcon: {
    fontSize: 22,
    color: colors.textMuted,
  },
  tabIconFocused: {
    color: colors.accent,
  },
  indicator: {
    position: 'absolute',
    bottom: -12,
    width: 20,
    height: 2,
    backgroundColor: colors.accent,
    borderRadius: 1,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
});
