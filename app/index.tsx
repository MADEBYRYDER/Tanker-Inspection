import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useStore } from '../src/state/store';
import { Loading } from '../src/ui/components';
import { useTheme } from '../src/ui/theme';

/**
 * Entry point. Waits for the persisted record to rehydrate before deciding where to
 * go — routing on an un-hydrated store would bounce an existing owner through
 * onboarding every cold start.
 */
export default function Index() {
  const theme = useTheme();
  const hydrated = useStore((s) => s.hydrated);
  const home = useStore((s) => s.home);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center', padding: 24 }}>
        <Loading label="Opening your home record…" />
      </View>
    );
  }

  return <Redirect href={home ? '/(tabs)' : '/onboarding'} />;
}
