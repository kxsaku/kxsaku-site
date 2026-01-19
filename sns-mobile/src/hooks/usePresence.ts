// Presence hook for tracking online status
import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { clientPresence } from '../lib/api';

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export function usePresence(enabled: boolean = true) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const sendHeartbeat = useCallback(async () => {
    if (!enabled) return;
    try {
      await clientPresence.heartbeat();
      console.log('Presence heartbeat sent');
    } catch (error) {
      console.error('Heartbeat error:', error);
    }
  }, [enabled]);

  const sendOffline = useCallback(async () => {
    try {
      await clientPresence.offline();
      console.log('Presence offline sent');
    } catch (error) {
      console.error('Offline error:', error);
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    if (intervalRef.current) return;

    // Send immediate heartbeat
    sendHeartbeat();

    // Set up interval for subsequent heartbeats
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    console.log('Presence heartbeat started');
  }, [sendHeartbeat]);

  const stopHeartbeat = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log('Presence heartbeat stopped');
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopHeartbeat();
      return;
    }

    // Start heartbeat when component mounts
    startHeartbeat();

    // Handle app state changes
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/active/) && nextAppState.match(/inactive|background/)) {
        // App going to background - send offline and stop heartbeat
        console.log('App going to background, sending offline');
        stopHeartbeat();
        sendOffline();
      } else if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        // App coming to foreground - restart heartbeat
        console.log('App coming to foreground, restarting heartbeat');
        startHeartbeat();
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Cleanup on unmount
    return () => {
      subscription.remove();
      stopHeartbeat();
      sendOffline();
    };
  }, [enabled, startHeartbeat, stopHeartbeat, sendOffline]);

  return {
    sendHeartbeat,
    sendOffline,
  };
}
