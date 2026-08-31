import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { suggestAddresses, type AddressSuggestion } from '../../src/core/address';
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
import { useSetupDraft } from '../../src/state/setupDraft';

/**
 * Where the house is.
 *
 * The first thing asked after the account, and deliberately the *only* thing:
 * year built, size and climate all follow from an address or can be filled in
 * later, and asking for them here is what turns a sixty-second setup into a
 * form. The address is what identifies the building, which is the one fact the
 * property record cannot be created without.
 *
 * Confirming it as a card rather than trusting the typed string is not
 * ceremony. This is the moment a permanent property record gets created, and a
 * typo here is a record attached to the wrong building — recoverable, but only
 * by someone who notices.
 */
export default function SetupAddress() {
  const theme = useTheme();
  const router = useRouter();
  const draft = useSetupDraft();

  const [query, setQuery] = useState(draft.addressLine1 ?? '');
  const [chosen, setChosen] = useState<AddressSuggestion | undefined>();

  const suggestions = useMemo(() => (chosen ? [] : suggestAddresses(query)), [query, chosen]);
  const typedIsUsable = query.trim().length >= 4;

  const confirm = (suggestion: AddressSuggestion) => {
    draft.setAddress(suggestion);
    router.push('/setup/relationship');
  };

  if (chosen) {
    return (
      <Screen gap={spacing.lg}>
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Title>Is this your home?</Title>
          <Small>Dwella creates one permanent record for this building.</Small>
        </View>

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
              <Ionicons name="home" size={21} color={theme.sage} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.subheading, { color: theme.text }]}>{chosen.line1}</Text>
              <Body style={{ color: theme.textSecondary }}>
                {[chosen.city, chosen.state, chosen.postalCode].filter(Boolean).join(', ')}
              </Body>
            </View>
          </Row>
        </Card>

        <Button label="Yes, this is my home" onPress={() => confirm(chosen)} full />
        <Button label="Change the address" variant="ghost" onPress={() => setChosen(undefined)} />
      </Screen>
    );
  }

  return (
    <Screen gap={spacing.lg}>
      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Title>Let's set up your home.</Title>
        <Small>What's the address?</Small>
      </View>

      <Field
        label="Address"
        value={query}
        onChangeText={(next) => {
          setQuery(next);
          setChosen(undefined);
        }}
        placeholder="123 Main Street"
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
        Suggestions come from a small built-in list on this build. A real address service —
        Places, Mapbox or Smarty — plugs into the same call, and none of the rest of setup changes
        when it does.
      </Notice>
    </Screen>
  );
}
