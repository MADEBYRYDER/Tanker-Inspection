import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DialogProvider } from '../src/ui/dialog';
import { useTheme } from '../src/ui/theme';

export default function RootLayout() {
  const theme = useTheme();
  return (
    <SafeAreaProvider>
      <DialogProvider>
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

        <Stack.Screen
          name="health"
          options={{
            // The hero runs under the header, so the back control floats on it in
            // white. A light header bar above a dark panel is a hard seam.
            title: '',
            headerTransparent: true,
            headerTintColor: '#FFFFFF',
          }}
        />
        <Stack.Screen name="costs" options={{ title: 'Money' }} />
        {/* The paid tier gets no header title of its own — the screen leads with
            its own mark, and "Dwella+ · Dwella+" reads as a mistake. */}
        <Stack.Screen name="plus" options={{ title: '' }} />
        <Stack.Screen name="record/index" options={{ title: 'Home Record' }} />
        <Stack.Screen name="assistant" options={{ title: 'Ask Dwella' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="homes" options={{ title: 'My Homes' }} />
        <Stack.Screen name="home/new" options={{ title: 'Add a Home' }} />
        <Stack.Screen name="household" options={{ title: 'Household & Access' }} />
        <Stack.Screen name="billing/index" options={{ title: 'Billing & Membership' }} />
        <Stack.Screen name="billing/[propertyId]" options={{ title: 'Membership' }} />
      </Stack>
      </DialogProvider>
    </SafeAreaProvider>
  );
}
