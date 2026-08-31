import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { isAccountsServerConfigured } from '../src/auth/client';
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
} from '../src/ui/components';
import { fonts, radius, spacing, type, useTheme } from '../src/ui/theme';

/**
 * Arriving at a property that already exists.
 *
 * Two situations, one rule: neither may create a property. A buyer moving into a
 * documented house and a partner joining a household are both attaching an
 * account to a building that already has a record, and the failure mode this
 * screen exists to prevent is either of them typing their address into the
 * new-home flow instead. That produces a second record for one building — which
 * breaks the single promise the product is built on, and breaks it silently,
 * because both records look fine on their own.
 *
 * The transfer and invitation endpoints are already built and tested in
 * `server/` (`/transfers/accept`, `/invitations/accept`). What is missing is the
 * app authenticating against them, so this screen shows what the codes do and
 * says plainly that it cannot redeem one yet rather than pretending to.
 */
export default function Claim() {
  const theme = useTheme();
  const router = useRouter();
  const hasServer = isAccountsServerConfigured();
  const [code, setCode] = useState('');

  return (
    <Screen gap={spacing.lg}>
      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Title>Join a home that already exists</Title>
        <Small>
          Paste the code from your transfer link or invitation. You will join the record this
          building already has, rather than starting a second one for it.
        </Small>
      </View>

      <Field
        label="Transfer or invitation code"
        value={code}
        onChangeText={setCode}
        placeholder="DW-XXXXXX"
        autoCapitalize="characters"
      />

      <Notice tone="attention" icon="construct-outline">
        {hasServer
          ? 'Redeeming a code needs the app to sign in to the accounts server, which is not wired up in this build. The server accepts these codes today — the app cannot yet hand it one.'
          : 'No accounts server is configured on this build, so there is nowhere to redeem a code. Both flows below are built and tested server-side.'}
      </Notice>

      <Button label="Redeem code" onPress={() => {}} disabled full />

      <Divider />

      {/*
        What each path would do, shown rather than described. Somebody deciding
        whether they are in the first situation or the second needs to recognise
        their own case, and the numbers are what make a claimed record feel like
        something worth claiming.
      */}
      <Tertiary>WHAT A CODE DOES</Tertiary>

      <Card>
        <Row gap={spacing.md} align="flex-start">
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: radius.sm,
              backgroundColor: theme.sageSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="home-outline" size={18} color={theme.sage} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 15.5, fontFamily: fonts.sans[600], color: theme.text }}>
              Claiming a Home Record
            </Text>
            <Body style={{ color: theme.textSecondary, fontSize: 14 }}>
              You bought a house the previous owner kept in Dwella. Their ownership period closes,
              yours opens, and everything marked transferable is already there — the equipment, the
              work, the warranties. Their costs and private notes are not.
            </Body>
            <Tertiary>The property keeps its Dwella Record ID. Nothing is copied.</Tertiary>
          </View>
        </Row>
      </Card>

      <Card>
        <Row gap={spacing.md} align="flex-start">
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: radius.sm,
              backgroundColor: theme.blueSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="people-outline" size={18} color={theme.blue} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 15.5, fontFamily: fonts.sans[600], color: theme.text }}>
              Joining a household
            </Text>
            <Body style={{ color: theme.textSecondary, fontSize: 14 }}>
              Somebody invited you to a home they already keep here. Your account is attached to
              their property with the role they chose — no new record, and no address to type.
            </Body>
            <Tertiary>Ownership does not change. You are added to it, not given it.</Tertiary>
          </View>
        </Row>
      </Card>

      <Button
        label="I'm setting up a new home instead"
        variant="ghost"
        onPress={() => router.replace('/welcome')}
      />
    </Screen>
  );
}
