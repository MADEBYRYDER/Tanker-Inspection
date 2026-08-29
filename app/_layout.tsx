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
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        <Stack.Screen name="scan/guided" options={{ title: 'Scan My Home' }} />
        <Stack.Screen name="scan/equipment" options={{ title: 'Add Equipment' }} />
        <Stack.Screen name="scan/review" options={{ title: 'Confirm' }} />

        <Stack.Screen name="component/[id]" options={{ title: '' }} />
        <Stack.Screen name="task/[key]" options={{ title: '' }} />
        <Stack.Screen name="problem/index" options={{ title: "Something's Wrong" }} />
        <Stack.Screen name="document/index" options={{ title: 'Add Receipt' }} />
        <Stack.Screen name="service/[id]" options={{ title: 'Service' }} />

        <Stack.Screen name="health" options={{ title: 'Home Health' }} />
        <Stack.Screen name="costs" options={{ title: 'Costs' }} />
        <Stack.Screen name="record/index" options={{ title: 'Home Record' }} />
        <Stack.Screen name="assistant" options={{ title: 'Ask Your Home' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
