import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { NO_CONSENTS, type MarketingConsents } from '../src/core/waitlist';
import { placeLabel } from '../src/core/serviceArea';
import { useSetupDraft } from '../src/state/setupDraft';
import { useStore, useWaitlist } from '../src/state/store';
import {
  Body,
  Button,
  Card,
  Divider,
  Field,
  Notice,
  Row,
  Screen,
  Small,
  Tertiary,
  Title,
  Touchable,
} from '../src/ui/components';
import { spacing, tabular, type, useTheme } from '../src/ui/theme';

/**
 * For homes Dwella cannot reach yet.
 *
 * Framed as an expansion rather than a refusal. "Dwella isn't available" ends
 * the relationship with the one person who could tell us where to open next;
 * "Dwella is coming your way" keeps it, and costs nothing to say truthfully as
 * long as no date is invented.
 *
 * The three permissions are three checkboxes, and two of them start off. Being
 * told when Dwella opens where you live is what joining a waitlist *is*, so it
 * needs no box. Hearing about the product every month is a different ask. And
 * post is a different ask again — somebody typed their address in to find out
 * whether a service covered it, which is not an invitation to send them things.
 */
export default function Waitlist() {
  const theme = useTheme();
  const router = useRouter();
  const draft = useSetupDraft();
  const joinWaitlist = useStore((s) => s.joinWaitlist);
  const entries = useWaitlist();

  const [email, setEmail] = useState('');
  const [consents, setConsents] = useState<MarketingConsents>(NO_CONSENTS);
  const [joinedId, setJoinedId] = useState<string | undefined>();

  const address = draft.address;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const where = address ? placeLabel(address) : undefined;
  const joined = joinedId ? entries.find((e) => e.id === joinedId) : undefined;

  if (!address) {
    return (
      <Screen>
        <Title>Check your address first</Title>
        <Small>The waitlist is by area, so it needs to know where your home is.</Small>
        <Button label="Check your address" onPress={() => router.replace('/setup/address')} full />
      </Screen>
    );
  }

  /* --- After joining ----------------------------------------------------- */
  if (joined) {
    return (
      <Screen gap={spacing.lg}>
        <View style={{ alignItems: 'center', gap: spacing.md, marginTop: spacing.xxl }}>
          <View
            style={{
              width: 66,
              height: 66,
              borderRadius: 33,
              backgroundColor: theme.sageSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="checkmark" size={32} color={theme.sage} />
          </View>
          <Title>You're on the list.</Title>
          <Body style={{ textAlign: 'center', color: theme.textSecondary }}>
            We'll let you know as soon as Dwella opens in your area.
          </Body>
        </View>

        <Card>
          <Row justify="space-between">
            <Small>Your home</Small>
            <Text style={[type.smallStrong, { color: theme.text }]}>{where}</Text>
          </Row>
          <Divider />
          <Row justify="space-between">
            <Small>We'll write to</Small>
            <Text style={[type.smallStrong, { color: theme.text }]}>{joined.email}</Text>
          </Row>
        </Card>

        {/*
          The count is of what this device knows about, and says so. A number
          presented as national demand when it is one phone's storage is the
          kind of small invention that makes everything around it untrustworthy.
        */}
        {!joined.delivered ? (
          <Notice tone="attention" icon="cloud-offline-outline">
            This build has no Dwella server configured, so your place on the list is saved on this
            device and has not reached us. Nothing was sent anywhere. On a real build this goes to
            the waitlist and your area's count goes up by one.
          </Notice>
        ) : (
          <Row gap={6} justify="center">
            <Text style={[type.heading, { color: theme.text }, tabular]}>
              {entries.length.toLocaleString()}
            </Text>
            <Small>homes waiting for Dwella</Small>
          </Row>
        )}

        <View style={{ flex: 1 }} />
        <Body style={{ textAlign: 'center', color: theme.textTertiary, fontSize: 12.5 }}>
          Your home deserves a memory too.
        </Body>
        <Button label="Back" variant="ghost" onPress={() => router.replace('/welcome')} />
      </Screen>
    );
  }

  /* --- Joining ----------------------------------------------------------- */
  return (
    <Screen gap={spacing.lg}>
      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Title>Join the Dwella waitlist</Title>
        <Small>
          We're starting close to home in Charleston, South Carolina, before opening Dwella to more
          cities. Where you are helps decide which one is next.
        </Small>
      </View>

      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="name@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Card tone={theme.surfaceSunken} raised={0}>
        <Row gap={spacing.sm}>
          <Ionicons name="location-outline" size={15} color={theme.sage} />
          <Small style={{ flex: 1 }}>Your home: {where}</Small>
        </Row>
      </Card>

      <View style={{ gap: spacing.sm }}>
        <ConsentRow
          label="Email me when Dwella opens in my area"
          detail="The reason you're here. One message, when it happens."
          checked
          locked
        />
        <ConsentRow
          label="Send me Dwella news and product updates"
          detail="Occasional email about what Dwella is building."
          checked={consents.productEmail}
          onToggle={() => setConsents((c) => ({ ...c, productEmail: !c.productEmail }))}
        />
        <ConsentRow
          label="Send me post at this address"
          detail="Off unless you ask. You gave us this address to check coverage, not to receive mail."
          checked={consents.postalMail}
          onToggle={() => setConsents((c) => ({ ...c, postalMail: !c.postalMail }))}
        />
      </View>

      <Button
        label="Notify me when Dwella arrives"
        disabled={!emailValid}
        onPress={() => {
          const entry = joinWaitlist({ email: email.trim(), address, consents });
          if (entry) setJoinedId(entry.id);
        }}
        full
      />

      <Tertiary style={{ textAlign: 'center' }}>
        We keep your ZIP so we know where to open next. You can ask us to remove it at any time.
      </Tertiary>
    </Screen>
  );
}

/**
 * One permission, stated as what will happen rather than as a policy reference.
 *
 * The launch notice is shown ticked and unpressable rather than hidden: seeing
 * exactly one thing you have agreed to, and two you have not, is what makes the
 * two you have not believable.
 */
function ConsentRow({
  label,
  detail,
  checked,
  onToggle,
  locked = false,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onToggle?: () => void;
  locked?: boolean;
}) {
  const theme = useTheme();
  const body = (
    <Row gap={spacing.md} align="flex-start" style={{ paddingVertical: spacing.xs }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: checked ? 0 : 1.5,
          borderColor: theme.border,
          backgroundColor: checked ? (locked ? theme.sage : theme.ink) : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {checked ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[type.smallStrong, { color: theme.text }]}>{label}</Text>
        <Tertiary>{detail}</Tertiary>
      </View>
    </Row>
  );
  return locked ? body : <Touchable onPress={onToggle} scaleTo={0.995}>{body}</Touchable>;
}
