import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { suggestAddresses, type AddressSuggestion } from '../../src/core/address';
import { checkEligibility } from '../../src/core/serviceArea';
import { useSetupDraft } from '../../src/state/setupDraft';
import { useStore } from '../../src/state/store';
import {
  Body,
  Button,
  Card,
  Field,
  Notice,
  Row,
  Screen,
  Small,
  Tertiary,
  Title,
  Touchable,
} from '../../src/ui/components';
import { fonts, radius, spacing, type, useTheme } from '../../src/ui/theme';

/**
 * Where the house is — and whether Dwella can reach it.
 *
 * The address comes before the account, which is the whole argument for this
 * screen existing in this position. Somebody in California who spends two
 * minutes creating an account and is then told Dwella does not serve them has
 * been wasted, and so has the only useful thing they could have given us: where
 * their house is. Asking first costs them one field and turns every visitor,
 * including the ones outside the launch area, into a data point about where to
 * open next.
 *
 * It is also the only thing asked for here. Year built, size and climate all
 * follow from an address or can be filled in later; the address is the one fact
 * a property record cannot exist without.
 *
 * Confirming the building as a card rather than trusting the typed string is not
 * ceremony. This is the moment a permanent record gets created, and a typo here
 * is a record attached to the wrong house — recoverable, but only by somebody
 * who notices.
 */
export default function SetupAddress() {
  const theme = useTheme();
  const router = useRouter();
  const draft = useSetupDraft();
  const hasAccount = useStore((s) => s.account !== undefined);

  const [query, setQuery] = useState(draft.addressLine1 ?? '');
  const [chosen, setChosen] = useState<AddressSuggestion | undefined>();
  const [postalCode, setPostalCode] = useState('');
  const [checked, setChecked] = useState(false);

  const suggestions = useMemo(() => (chosen ? [] : suggestAddresses(query)), [query, chosen]);
  const typedIsUsable = query.trim().length >= 4;

  /*
   * The postal code typed on this screen wins over the one that came with the
   * suggestion, because it is only ever asked for when the suggestion had none.
   */
  const candidate: AddressSuggestion | undefined = chosen
    ? { ...chosen, postalCode: postalCode.trim() || chosen.postalCode }
    : undefined;
  const eligibility = candidate ? checkEligibility(candidate) : undefined;

  const proceed = (address: AddressSuggestion) => {
    draft.setAddress(address);
    /*
     * An account holder adding a second home does not sign in again. Everybody
     * else goes and makes an account now that they know Dwella covers them.
     */
    router.push(hasAccount ? '/setup/relationship' : '/auth/choose');
  };

  /* --- The answer -------------------------------------------------------- */
  if (checked && candidate && eligibility) {
    if (eligibility.kind === 'live') {
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
            <Title>Dwella is available for your home.</Title>
            <Small style={{ textAlign: 'center' }}>
              We're welcoming homeowners in {eligibility.market.name}, {eligibility.market.state}.
            </Small>
          </View>

          <AddressCard address={candidate} />
          <Button label="Continue" onPress={() => proceed(candidate)} full />
          <Button label="Use a different address" variant="ghost" onPress={() => reset()} />
        </Screen>
      );
    }

    /*
     * Outside the launch area. Framed as an expansion rather than a refusal —
     * "not available" ends the relationship, and the person reading it is the
     * one whose postal code decides which city opens next.
     */
    return (
      <Screen gap={spacing.lg}>
        <View style={{ gap: spacing.sm, marginTop: spacing.xxl }}>
          <Title>Dwella is coming your way.</Title>
          <Body style={{ color: theme.textSecondary }}>
            We're starting close to home in Charleston, South Carolina, before opening Dwella to
            more cities.
          </Body>
        </View>

        <AddressCard address={candidate} icon="navigate-outline" />

        <Button
          label="Join the Dwella waitlist"
          onPress={() => {
            draft.setAddress(candidate);
            router.push('/waitlist');
          }}
          full
        />
        <Button label="Check a different address" variant="ghost" onPress={() => reset()} />

        {/*
          Somebody outside the area can still see the product. Turning them away
          entirely at the one moment they are curious is a strange thing to do
          to the person who just told you where to expand.
        */}
        <View style={{ flex: 1 }} />
        <Button
          label="Look around a sample home first"
          variant="ghost"
          onPress={() => router.replace('/welcome')}
        />
      </Screen>
    );
  }

  function reset() {
    setChosen(undefined);
    setChecked(false);
    setPostalCode('');
  }

  /* --- Confirm the building, then check it ------------------------------- */
  if (chosen) {
    const needsPostalCode = eligibility?.kind === 'unknown';
    return (
      <Screen gap={spacing.lg}>
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Title>Is this your home?</Title>
          <Small>Dwella creates one permanent record for this building.</Small>
        </View>

        <AddressCard address={candidate ?? chosen} />

        {/*
          Only asked for when the address arrived without one. Eligibility is
          decided on the postal code, and guessing it from a city name is how a
          service area quietly grows to include places nobody agreed to serve.
        */}
        {needsPostalCode ? (
          <>
            <Field
              label="ZIP code"
              value={postalCode}
              onChangeText={setPostalCode}
              placeholder="29401"
              keyboardType="numeric"
              hint="Dwella checks availability by ZIP, so we need this one to answer."
            />
            <Button
              label="Check availability"
              onPress={() => setChecked(true)}
              disabled={postalCode.replace(/\D/g, '').length < 5}
              full
            />
          </>
        ) : (
          <Button label="Check availability" onPress={() => setChecked(true)} full />
        )}
        <Button label="Change the address" variant="ghost" onPress={() => reset()} />
      </Screen>
    );
  }

  /* --- The address ------------------------------------------------------- */
  return (
    <Screen gap={spacing.lg}>
      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Title>Is Dwella available for your home?</Title>
        <Small>
          We're launching with a limited group of homeowners in the Charleston, SC area.
        </Small>
      </View>

      <Field
        label="Home address"
        value={query}
        onChangeText={(next) => {
          setQuery(next);
          reset();
        }}
        placeholder="Start typing your address…"
      />

      {suggestions.length > 0 ? (
        <Card padding={spacing.sm}>
          {suggestions.map((suggestion, index) => (
            <View key={`${suggestion.line1}-${index}`}>
              {index > 0 ? (
                <View style={{ height: 1, backgroundColor: theme.hairline, marginLeft: 40 }} />
              ) : null}
              <Touchable onPress={() => setChosen(suggestion)} scaleTo={0.99}>
                <Row gap={spacing.md} align="center" style={{ padding: spacing.md }}>
                  <Ionicons name="location-outline" size={17} color={theme.textTertiary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fonts.sans[600], fontSize: 15, color: theme.text }}>
                      {suggestion.line1}
                    </Text>
                    <Tertiary>
                      {[suggestion.city, suggestion.state, suggestion.postalCode]
                        .filter(Boolean)
                        .join(', ')}
                    </Tertiary>
                  </View>
                </Row>
              </Touchable>
            </View>
          ))}
        </Card>
      ) : null}

      {typedIsUsable && suggestions.length === 0 ? (
        <Button
          label="Use what I typed"
          variant="secondary"
          onPress={() => setChosen({ line1: query.trim() })}
          full
        />
      ) : null}

      <Notice icon="information-circle-outline">
        Suggestions come from a small built-in list on this build, and the address is not validated
        against a postal database. A real service — Places, Mapbox, Smarty, or Google's Address
        Validation API — plugs into the same call, and nothing else in setup changes when it does.
      </Notice>
    </Screen>
  );
}

/** The building, shown back before anything permanent is created from it. */
function AddressCard({
  address,
  icon = 'home',
}: {
  address: AddressSuggestion;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();
  return (
    <Card raised={2}>
      <Row gap={spacing.md} align="flex-start">
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.sm,
            backgroundColor: theme.sageSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={21} color={theme.sage} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.subheading, { color: theme.text }]}>{address.line1}</Text>
          <Body style={{ color: theme.textSecondary }}>
            {[address.city, address.state, address.postalCode].filter(Boolean).join(', ')}
          </Body>
        </View>
      </Row>
    </Card>
  );
}
