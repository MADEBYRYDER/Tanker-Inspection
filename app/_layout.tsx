import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '../src/ui/theme';

export default function RootLayout() {
  const theme = useTheme();
  return (
    <SafeAreaProvider>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.text,
          headerTitleStyle: { fontSize: 17, fontWeight: '600' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="scan/index" options={{ title: 'Scan My Home' }} />
        <Stack.Screen name="scan/review" options={{ title: 'Review what was found' }} />
        <Stack.Screen name="component/[id]" options={{ title: 'Equipment' }} />
        <Stack.Screen name="task/[key]" options={{ title: 'Maintenance task' }} />
        <Stack.Screen name="problem/index" options={{ title: 'Problem scanner' }} />
        <Stack.Screen name="document/index" options={{ title: 'Add a document' }} />
        <Stack.Screen name="service/[id]" options={{ title: 'Service request' }} />
        <Stack.Screen name="record/index" options={{ title: 'Home Record' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
