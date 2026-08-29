import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { Touchable } from '../../src/ui/motion';
import { elevation, radius, useTheme } from '../../src/ui/theme';

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
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600', letterSpacing: -0.1 },
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
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={21} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title: 'Timeline',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'time' : 'time-outline'} size={21} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: '',
          tabBarButton: (props) => <ScanButton onPress={() => props.onPress?.({} as never)} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'checkmark-circle' : 'checkmark-circle-outline'}
              size={21}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={21} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

function GlassBar() {
  const theme = useTheme();
  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={Platform.OS === 'android' ? 40 : 70}
        tint={theme.dark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      {/* Blur alone is too transparent over busy content; a wash restores contrast. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.glass }]} />
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: StyleSheet.hairlineWidth,
          backgroundColor: theme.border,
        }}
      />
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
            backgroundColor: theme.ink,
            alignItems: 'center',
            justifyContent: 'center',
            // Lifted above the bar so it reads as the primary action, not a tab.
            marginTop: -24,
            borderWidth: 4,
            borderColor: theme.bg,
          },
          elevation(theme, 3),
        ]}
      >
        <Ionicons name="scan-outline" size={26} color={theme.onInk} />
      </Touchable>
    </View>
  );
}
