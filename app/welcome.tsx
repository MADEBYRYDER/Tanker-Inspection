import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import {
  PROVIDER_UNAVAILABLE,
  providerAvailable,
  type IdentityProvider,
} from '../src/auth/client';
import { buildSampleRecord } from '../src/data/sampleHome';
import { useStore } from '../src/state/store';
import { Body, Row, Screen, Small, Tertiary, Touchable } from '../src/ui/components';
import { useDialog } from '../src/ui/dialog';
import { DwellaLockup } from '../src/ui/logo';
import { fonts, radius, spacing, type, useTheme } from '../src/ui/theme';

/**
 * The way in.
 *
 * The real onboarding is building the Home Record, not filling out an account
 * form, so this screen's job is to be got past. Three ways in, no password, no
 * name, no payment — nothing is asked for here that the app cannot ask for later
 * once it has shown it is worth answering.
 *
 * The two paths that attach to a property somebody else already created sit at
 * the bottom rather than being hidden behind the email flow. A buyer holding a
 * transfer link and a partner holding an invitation must not end up typing their
 * address into the new-property flow and creating a duplicate of a record that
 * already exists — that duplicate is the one mistake this product cannot
 * tolerate, because the whole premise is that the building has one record.
 */
export default function Welcome() {
  const theme = useTheme();
  const router = useRouter();
  const { alert } = useDialog();
  const loadRecord = useStore((s) => s.loadRecord);

  const loadSample = () => {
    const { record, media, billing } = buildSampleRecord();
    loadRecord(record, media, billing);
    router.replace('/(tabs)');
  };

  const withProvider = (provider: IdentityProvider) => {
    if (!providerAvailable(provider)) {
      void alert(
        provider === 'apple' ? 'Sign in with Apple' : 'Continue with Google',
        PROVIDER_UNAVAILABLE[provider],
      );
      return;
    }
    router.push('/setup/address');
  };

  return (
    <Screen gap={spacing.xl}>
      <View style={{ alignItems: 'center', gap: spacing.lg, marginTop: spacing.xxl }}>
        <DwellaLockup size="lg" tagline={false} />
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={[type.title, { color: theme.text, textAlign: 'center' }]}>
            Welcome to Dwella
          </Text>
          <Small style={{ textAlign: 'center' }}>Your home, remembered.</Small>
        </View>
      </View>

      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
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

      <View style={{ alignItems: 'center', gap: spacing.lg, marginTop: spacing.md }}>
        <Touchable onPress={() => router.push('/auth/email')} scaleTo={0.98}>
          <Row gap={5}>
            <Small>Already have an account?</Small>
            <Text style={[type.smallStrong, { color: theme.blue }]}>Sign in</Text>
          </Row>
        </Touchable>

        {/*
          The two ways to reach a property that already exists. Phrased as the
          situation somebody is in rather than as a feature name — nobody arrives
          thinking "I need the invitation acceptance flow".
        */}
        <View style={{ gap: spacing.sm, alignItems: 'center' }}>
          <Touchable onPress={() => router.push('/claim')} scaleTo={0.98}>
            <Row gap={5}>
              <Ionicons name="home-outline" size={13} color={theme.textTertiary} />
              <Tertiary>Moving into a home that already has a Dwella Record?</Tertiary>
            </Row>
          </Touchable>
          <Touchable onPress={() => router.push('/claim')} scaleTo={0.98}>
            <Row gap={5}>
              <Ionicons name="people-outline" size={13} color={theme.textTertiary} />
              <Tertiary>Invited to someone's household?</Tertiary>
            </Row>
          </Touchable>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      {/*
        A way to see the product without an account at all. Kept here rather than
        behind sign-in because the question somebody has at this screen is "is
        this worth an account", and the honest way to answer it is to show them.
      */}
      <Touchable onPress={loadSample} accessibilityLabel="Explore a sample home" scaleTo={0.98}>
        <Row gap={6} justify="center">
          <Ionicons name="albums-outline" size={15} color={theme.textSecondary} />
          <Text style={[type.smallStrong, { color: theme.textSecondary }]}>
            Explore a sample home
          </Text>
        </Row>
      </Touchable>

      <Body style={{ textAlign: 'center', color: theme.textTertiary, fontSize: 12.5 }}>
        No card, no password. Dwella asks for payment only once it has shown you
        something worth paying for.
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
