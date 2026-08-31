import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { Touchable } from '../../src/ui/motion';
import { fonts, elevation, radius, useTheme } from '../../src/ui/theme';

/** The scan chooser's ground. Shared with the screen itself so they meet cleanly. */
export const SCAN_GROUND = '#071624';

/**
 * Five destinations, and the middle one is a camera.
 *
 * The whole product rests on one behaviour — see something, scan it — so scanning
 * gets the most reachable point on the screen and the only piece of chrome that
 * lifts off the surface. The bar itself is glass: content scrolls under it rather
 * than stopping at an opaque edge, which is what makes the screen feel like it
 * continues past the fold.
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        // Each screen renders its own heading with the context that belongs beside
        // it. A nav bar on top of that prints the word twice and costs a strip of
        // phone screen.
        headerShown: false,
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.5)',
        tabBarLabelStyle: { fontSize: 10.5, fontFamily: fonts.sans[600], letterSpacing: -0.1 },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          height: Platform.OS === 'ios' ? 88 : 74,
          paddingTop: 10,
          paddingBottom: Platform.OS === 'ios' ? 30 : 16,
        },
        tabBarBackground: () => <GlassBar />,
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title: 'Timeline',
          tabBarIcon: ({ color }) => <Ionicons name="time-outline" size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: '',
          tabBarButton: (props) => <ScanButton onPress={() => props.onPress?.({} as never)} />,
          // The chooser's ground, so the screen and the bar meet without a seam.
          sceneStyle: { backgroundColor: SCAN_GROUND },
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color }) => <Ionicons name="clipboard-outline" size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={21} color={color} />,
        }}
      />
    </Tabs>
  );
}

/**
 * The bar is navy in both themes.
 *
 * It is brand furniture rather than page chrome — the same navy as the hero at
 * the top of the dashboard, so the screen is bracketed by the brand and the
 * content sits on paper between them. A bar that went light in light mode would
 * read as part of the last card rather than as the app's frame.
 *
 * The blur stays for the translucency over scrolling content; the wash on top
 * is what makes it navy rather than whatever is behind it.
 */
function GlassBar() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={Platform.OS === 'android' ? 40 : 70}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(7,22,36,0.94)' }]} />
    </View>
  );
}

function ScanButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Touchable
        onPress={onPress}
        haptic="medium"
        scaleTo={0.9}
        accessibilityLabel="Scan"
        style={[
          {
            width: 60,
            height: 60,
            borderRadius: radius.pill,
            // The one place the sage leads rather than accents: the scan button
            // is the app's single primary action and the mark's own green makes
            // it read as Dwella's, not as a generic FAB.
            backgroundColor: theme.scanGreen,
            alignItems: 'center',
            justifyContent: 'center',
            // Lifted above the bar so it reads as the primary action, not a tab.
            marginTop: -24,
            borderWidth: 4,
            borderColor: SCAN_GROUND,
          },
          elevation(theme, 3),
        ]}
      >
        <Ionicons name="scan-outline" size={24} color="#FFFFFF" />
      </Touchable>
    </View>
  );
}
