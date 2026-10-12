import '../src/global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/auth.store';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useThemeColors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const t = useThemeColors();

  useEffect(() => {
    if (hasHydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hasHydrated]);

  // Keep the native splash screen up until the persisted token has been read
  // from SecureStore — otherwise the login screen flashes before redirecting.
  if (!hasHydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={t.isDark ? 'light' : 'dark'} />
          <ErrorBoundary>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.background } }}>
              <Stack.Screen name="login" />
              <Stack.Screen name="pin" />
              <Stack.Screen name="(app)" />
            </Stack>
          </ErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
