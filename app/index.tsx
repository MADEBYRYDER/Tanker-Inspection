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
  const hasProperty = useStore((s) => s.activePropertyId !== undefined);
  const hasAccount = useStore((s) => s.account !== undefined);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center', padding: 24 }}>
        <Loading label="Opening your home record…" />
      </View>
    );
  }

  /*
   * Three states, in the order they happen: no account, an account with no
   * property, and a home to open. Somebody who signed in and then abandoned
   * setup lands back on the address step rather than at the welcome screen —
   * being asked to sign in again for an account you already have reads as the
   * app having lost you.
   */
  if (!hasAccount) return <Redirect href="/welcome" />;
  return <Redirect href={hasProperty ? '/(tabs)' : '/setup/address'} />;
}
