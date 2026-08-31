/*
 * Imported per weight, not from the package index.
 *
 * Each family's index `require`s every cut it ships — twelve faces for Playfair,
 * fourteen for Jakarta, italics included — so importing from it bundles all of
 * them whether or not a single glyph is drawn. That was 4.6 MB of fonts in the
 * web build for the seven faces actually used. The per-weight entry points pull
 * in exactly what is named here.
 */
import { PlayfairDisplay_600SemiBold } from '@expo-google-fonts/playfair-display/600SemiBold';
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display/700Bold';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DialogProvider } from '../src/ui/dialog';
import { fonts, useTheme } from '../src/ui/theme';

export default function RootLayout() {
  const theme = useTheme();

  /*
   * Only the weights the type scale actually names.
   *
   * Every face is a file the app ships and the browser downloads, and an unused
   * cut costs the same as a used one. Playfair carries the headings, Plus
   * Jakarta everything else — including all figures, because the serif's
   * numerals are proportional and a column of prices has to line up.
   */
  const [fontsReady] = useFonts({
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  // A ground-coloured hold rather than a spinner: the fonts resolve in a frame
  // or two from cache, and a flashed spinner is worse than a beat of nothing.
  if (!fontsReady) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <DialogProvider>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.text,
          headerTitleStyle: { fontSize: 17, fontFamily: fonts.sans[600] },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />

        {/*
          Setup. No headers and no titles: every one of these screens leads with
          its own question, and a nav bar repeating it costs a strip of phone for
          nothing. Back is still available by gesture.
        */}
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="auth/choose" options={{ title: '' }} />
        <Stack.Screen name="auth/email" options={{ title: '' }} />
        <Stack.Screen name="waitlist" options={{ title: '' }} />
        <Stack.Screen name="setup/address" options={{ title: '' }} />
        <Stack.Screen name="setup/relationship" options={{ title: '' }} />
        <Stack.Screen name="setup/first-scan" options={{ headerShown: false }} />
        <Stack.Screen name="claim" options={{ title: '' }} />
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
        <Stack.Screen name="home/mailing" options={{ title: '' }} />
        <Stack.Screen name="household" options={{ title: 'Household & Access' }} />
        <Stack.Screen name="billing/index" options={{ title: 'Billing & Membership' }} />
        <Stack.Screen name="billing/[propertyId]" options={{ title: 'Membership' }} />
      </Stack>
      </DialogProvider>
    </SafeAreaProvider>
  );
}
