import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { PostalAddress } from '../../src/core/types';
import { useHomeRecord, useStore } from '../../src/state/store';
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
} from '../../src/ui/components';
import { spacing, useTheme } from '../../src/ui/theme';
import { Chip } from '../../src/ui/components';

/**
 * Where post about this home should go.
 *
 * Separate from the property address, and the same by default — the checkbox is
 * ticked when you arrive and most people will never untick it. The screen exists
 * for the ones who must: a landlord whose rental's post goes to their office, an
 * owner who is at the beach house six weeks a year, anybody on a PO box. Every
 * one of them is a customer Dwella wants, and every one of them gets the welcome
 * kit posted to their tenant if the two addresses are the same field.
 *
 * Nothing is posted from this build. The address is recorded so a fulfilment
 * queue has something correct to read when there is one — and confirming an
 * address before anything ships is what stops a five-dollar package going to a
 * house nobody in the account lives at.
 */
export default function MailingAddress() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const updateHome = useStore((s) => s.updateHome);

  const existing = record?.home.mailingAddress;
  const [sameAsHome, setSameAsHome] = useState(existing === undefined);
  const [draft, setDraft] = useState<PostalAddress>(
    existing ?? { line1: '', city: '', state: '', postalCode: '' },
  );

  if (!record) {
    return (
      <Screen>
        <Small>Set up your home first.</Small>
      </Screen>
    );
  }

  const { home } = record;
  const propertyLines = [
    home.addressLine1 ?? home.nickname,
    [home.city, home.state, home.postalCode].filter(Boolean).join(', '),
  ].filter(Boolean);

  const usable = sameAsHome || draft.line1.trim().length >= 4;

  const save = () => {
    updateHome({
      // Absent means "the building itself", which is what the tick box says.
      // Storing a copy of the property address instead would make the two drift
      // the first time somebody corrects one of them.
      mailingAddress: sameAsHome
        ? undefined
        : {
            line1: draft.line1.trim(),
            line2: draft.line2?.trim() || undefined,
            city: draft.city?.trim() || undefined,
            state: draft.state?.trim() || undefined,
            postalCode: draft.postalCode?.trim() || undefined,
          },
    });
    router.back();
  };

  return (
    <Screen gap={spacing.lg}>
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <Title>Mailing address</Title>
        <Small>Where post about {home.nickname} should go.</Small>
      </View>

      <Card>
        <Row justify="space-between" gap={spacing.md}>
          <View style={{ flex: 1 }}>
            <Body>My mailing address is the same as this home</Body>
            {propertyLines.map((line) => (
              <Tertiary key={line}>{line}</Tertiary>
            ))}
          </View>
          <Chip
            label={sameAsHome ? 'Same' : 'Different'}
            selected={sameAsHome}
            onPress={() => setSameAsHome(!sameAsHome)}
          />
        </Row>
      </Card>

      {!sameAsHome ? (
        <View style={{ gap: spacing.md }}>
          <Field
            label="Street address"
            value={draft.line1}
            onChangeText={(line1) => setDraft((d) => ({ ...d, line1 }))}
            placeholder="123 Main Street, or PO Box 40"
          />
          <Field
            label="Apartment, suite (optional)"
            value={draft.line2 ?? ''}
            onChangeText={(line2) => setDraft((d) => ({ ...d, line2 }))}
            placeholder="Suite 200"
          />
          <Field
            label="City"
            value={draft.city ?? ''}
            onChangeText={(city) => setDraft((d) => ({ ...d, city }))}
            placeholder="Charleston"
          />
          <Row gap={spacing.md}>
            <View style={{ flex: 1 }}>
              <Field
                label="State"
                value={draft.state ?? ''}
                onChangeText={(state) => setDraft((d) => ({ ...d, state }))}
                placeholder="SC"
                autoCapitalize="characters"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="ZIP"
                value={draft.postalCode ?? ''}
                onChangeText={(postalCode) => setDraft((d) => ({ ...d, postalCode }))}
                placeholder="29401"
                keyboardType="numeric"
              />
            </View>
          </Row>
        </View>
      ) : null}

      <Notice icon="information-circle-outline">
        Dwella does not post anything on this build. This is kept so that when a welcome kit does
        go out, it goes to an address you confirmed rather than one the app assumed. Eligibility for
        Dwella Care is still decided by where the {sameAsHome ? 'home' : 'property'} is, not by
        where post goes.
      </Notice>

      <Button label="Save" onPress={save} disabled={!usable} full />
      <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
