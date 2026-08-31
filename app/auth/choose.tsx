import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import {
  PROVIDER_UNAVAILABLE,
  providerAvailable,
  type IdentityProvider,
} from '../../src/auth/client';
import { useSetupDraft } from '../../src/state/setupDraft';
import { Body, Row, Screen, Small, Tertiary, Title, Touchable } from '../../src/ui/components';
import { useDialog } from '../../src/ui/dialog';
import { fonts, radius, spacing, type, useTheme } from '../../src/ui/theme';

/**
 * Making the account, once the house is known to be covered.
 *
 * Second, not first. Everything on this screen is administration, and asking
 * somebody to do administration before telling them whether the product is even
 * available where they live is how you collect abandoned registrations instead
 * of homeowners.
 *
 * Whichever way somebody comes in, Dwella needs a verified email in the end: it
 * is how a launch notice, a transfer, and a household invitation all reach a
 * person, and an account that cannot be reached is an account that cannot be
 * handed a house. Apple and Google both carry one; the email route verifies its
 * own with a six-digit code.
 */
export default function ChooseAccount() {
  const theme = useTheme();
  const router = useRouter();
  const { alert } = useDialog();
  const draft = useSetupDraft();

  const withProvider = (provider: IdentityProvider) => {
    if (!providerAvailable(provider)) {
      void alert(
        provider === 'apple' ? 'Sign in with Apple' : 'Continue with Google',
        PROVIDER_UNAVAILABLE[provider],
      );
      return;
    }
    router.push('/setup/relationship');
  };

  return (
    <Screen gap={spacing.lg}>
      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Title>Create your Dwella account</Title>
        <Small>
          {draft.addressLine1
            ? `So your record for ${draft.addressLine1} has somewhere to live.`
            : 'So your Home Record has somewhere to live.'}
        </Small>
      </View>

      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <ProviderButton
          label="Continue with Apple"
          icon="logo-apple"
          onPress={() => withProvider('apple')}
          filled
        />
        <ProviderButton
          label="Continue with Google"
          icon="logo-google"
          onPress={() => withProvider('google')}
        />

        <Row gap={spacing.md} style={{ marginVertical: spacing.sm }}>
          <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
          <Tertiary>or</Tertiary>
          <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
        </Row>

        <ProviderButton
          label="Continue with email"
          icon="mail-outline"
          onPress={() => router.push('/auth/email')}
        />
      </View>

      <Touchable onPress={() => router.push('/auth/email')} scaleTo={0.98}>
        <Row gap={5} justify="center">
          <Small>Already have an account?</Small>
          <Text style={[type.smallStrong, { color: theme.blue }]}>Sign in</Text>
        </Row>
      </Touchable>

      <View style={{ flex: 1 }} />

      <Body style={{ textAlign: 'center', color: theme.textTertiary, fontSize: 12.5 }}>
        No card, no password. Dwella asks for payment only once it has shown you something worth
        paying for.
      </Body>
    </Screen>
  );
}

function ProviderButton({
  label,
  icon,
  onPress,
  filled = false,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  filled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Touchable
      onPress={onPress}
      accessibilityLabel={label}
      scaleTo={0.985}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        height: 52,
        borderRadius: radius.md,
        backgroundColor: filled ? theme.ink : theme.surface,
        borderWidth: filled ? 0 : 1,
        borderColor: theme.border,
      }}
    >
      <Ionicons name={icon} size={19} color={filled ? theme.onInk : theme.text} />
      <Text
        style={{
          fontSize: 15.5,
          fontFamily: fonts.sans[600],
          color: filled ? theme.onInk : theme.text,
        }}
      >
        {label}
      </Text>
    </Touchable>
  );
}
