import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { buildSampleRecord } from '../src/data/sampleHome';
import { PROPERTY_TYPES, type PropertyType } from '../src/core/account';
import { newId } from '../src/state/ids';
import { useStore } from '../src/state/store';
import type { Home } from '../src/core/types';
import {
  Body,
  Tertiary,
  Button,
  Card,
  Chip,
  Display,
  Field,
  Small,
  Notice,
  Row,
  Screen,
  SectionTitle,
} from '../src/ui/components';
import { spacing } from '../src/ui/theme';

const CLIMATES: { value: Home['climate']; label: string; hint: string }[] = [
  { value: 'coastal', label: 'Coastal', hint: 'Salt air shortens outdoor equipment life' },
  { value: 'humid_subtropical', label: 'Hot & humid', hint: 'Heavy cooling load, high moisture' },
  { value: 'temperate', label: 'Temperate', hint: 'Moderate seasons' },
  { value: 'cold', label: 'Cold', hint: 'Long heating season, freeze risk' },
  { value: 'arid', label: 'Dry', hint: 'High UV, hard water common' },
];

export default function Onboarding() {
  const router = useRouter();
  const signIn = useStore((s) => s.signIn);
  const addProperty = useStore((s) => s.addProperty);
  const loadRecord = useStore((s) => s.loadRecord);

  const [ownerName, setOwnerName] = useState('');
  const [nickname, setNickname] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  const [squareFeet, setSquareFeet] = useState('');
  const [climate, setClimate] = useState<Home['climate']>('temperate');
  const [propertyType, setPropertyType] = useState<PropertyType>('primary');

  const parsedYear = Number(yearBuilt);
  const yearValid =
    yearBuilt.length === 0 ||
    (Number.isInteger(parsedYear) && parsedYear >= 1700 && parsedYear <= new Date().getFullYear());
  const canContinue = nickname.trim().length > 0 && yearValid;

  const start = () => {
    /*
     * Two objects, not one. The account is the person and travels with them
     * across every property they ever add; the property is the building and
     * stays with the building when it is sold. Creating them together here is
     * the only place the two are ever conflated, and even then only in time.
     */
    signIn({
      id: newId('acct'),
      displayName: ownerName.trim() || 'You',
      createdAt: new Date().toISOString(),
    });
    addProperty({
      nickname: nickname.trim(),
      propertyType,
      addressLine1: address.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      yearBuilt: yearBuilt ? parsedYear : undefined,
      squareFeet: squareFeet ? Number(squareFeet) : undefined,
      climate,
      ownedSince: new Date().toISOString().slice(0, 10),
    });
    router.replace('/scan');
  };

  const loadSample = () => {
    const { record, media } = buildSampleRecord();
    loadRecord(record, media);
    router.replace('/(tabs)');
  };

  return (
    <Screen>
      <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
        <Display>Dwella</Display>
        <Body>
          A permanent record for your house — what it is made of, what has been done to it, what it
          needs next, and what that is likely to cost.
        </Body>
      </View>

      <Card>
        <SectionTitle title="About the property" />
        <Field
          label="What should we call you?"
          value={ownerName}
          onChangeText={setOwnerName}
          placeholder="Optional"
          autoCapitalize="words"
        />
        <Field
          label="What do you call the place?"
          value={nickname}
          onChangeText={setNickname}
          placeholder="Home"
          autoCapitalize="words"
        />
        <Field label="Street address" value={address} onChangeText={setAddress} placeholder="Optional" />
        <Row gap={spacing.md}>
          <View style={{ flex: 2 }}>
            <Field label="City" value={city} onChangeText={setCity} placeholder="Optional" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="State" value={state} onChangeText={setState} autoCapitalize="characters" />
          </View>
        </Row>
        <Row gap={spacing.md}>
          <View style={{ flex: 1 }}>
            <Field
              label="Year built"
              value={yearBuilt}
              onChangeText={setYearBuilt}
              keyboardType="numeric"
              placeholder="1998"
              hint={yearValid ? undefined : 'Enter a four-digit year'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Square feet"
              value={squareFeet}
              onChangeText={setSquareFeet}
              keyboardType="numeric"
              placeholder="2400"
            />
          </View>
        </Row>
        <Small>
          Build year and size are optional, but they let the app estimate ages and scale replacement
          costs before you have scanned anything.
        </Small>
      </Card>

      <Card>
        <SectionTitle title="Climate" />
        <Small>
          Salt air, humidity, and sun all change how long equipment lasts. This adjusts the estimates.
        </Small>
        <Row wrap gap={spacing.sm}>
          {CLIMATES.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={climate === option.value}
              onPress={() => setClimate(option.value)}
            />
          ))}
        </Row>
      </Card>

      {/*
       * Asked now because the answer is cheap to collect and expensive to
       * backfill. A rental and a primary residence want different defaults
       * eventually; the data model carries the distinction from day one either
       * way, so nobody has to be re-interviewed later.
       */}
      <Card>
        <SectionTitle title="What kind of property?" />
        <Row wrap gap={spacing.sm}>
          {PROPERTY_TYPES.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              selected={propertyType === option.key}
              onPress={() => setPropertyType(option.key)}
            />
          ))}
        </Row>
        <Tertiary>
          {PROPERTY_TYPES.find((t) => t.key === propertyType)?.blurb}
        </Tertiary>
        <Small>{CLIMATES.find((c) => c.value === climate)?.hint}</Small>
      </Card>

      <Notice icon="lock-closed-outline">
        Your record is stored on this device. Nothing is uploaded unless you send a photo to be
        identified or share a service request with a contractor.
      </Notice>

      <Button label="Start — Scan My Home" onPress={start} disabled={!canContinue} icon="camera-outline" full />

      <Card>
        <SectionTitle title="Just looking?" />
        <Small>
          Load a fully worked example — a 1998 coastal home with a new roof, an aging AC condenser,
          and twelve years of service history — and every screen fills in with real computed numbers.
        </Small>
        <Button label="Explore a sample home" onPress={loadSample} variant="secondary" icon="albums-outline" />
      </Card>
    </Screen>
  );
}
