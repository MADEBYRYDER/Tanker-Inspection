import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { elevation, radius, useTheme } from '../../src/ui/theme';

/**
 * Five destinations, and the middle one is a camera.
 *
 * The whole product rests on one behaviour — see something, scan it — so scanning
 * gets the most reachable point on the screen and the only piece of chrome in the
 * app that lifts off the surface. Everything else in the tab bar is a thin line
 * icon that stays out of the way.
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        // Each screen renders its own heading with the context that belongs beside
        // it — the address under the greeting, the count under "Tasks". A nav bar
        // on top of that prints the word twice and costs a strip of phone screen.
        headerShown: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          // Tall enough that the labels are never clipped by the home indicator on
          // iOS or by a gesture bar on Android.
          height: Platform.OS === 'ios' ? 88 : 72,
          paddingTop: 10,
          paddingBottom: Platform.OS === 'ios' ? 30 : 14,
        },
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title: 'Timeline',
          tabBarIcon: ({ color }) => <Ionicons name="time-outline" size={22} color={color} />,
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
          tabBarIcon: ({ color }) => (
            <Ionicons name="checkmark-circle-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}

function ScanButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan"
        onPress={onPress}
        style={({ pressed }) => [
          {
            width: 58,
            height: 58,
            borderRadius: radius.pill,
            backgroundColor: theme.ink,
            alignItems: 'center',
            justifyContent: 'center',
            // Lifted above the bar so it reads as the primary action, not a tab.
            marginTop: -22,
            borderWidth: 4,
            borderColor: theme.surface,
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          },
          elevation(theme, 2),
        ]}
      >
        <Ionicons name="scan-outline" size={25} color={theme.onInk} />
      </Pressable>
    </View>
  );
}
