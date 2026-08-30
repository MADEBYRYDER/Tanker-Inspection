import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { PROPERTY_TYPES, type PropertyType } from '../../src/core/account';
import type { Home } from '../../src/core/types';
import { usePlan } from '../../src/state/plan';
import { useStore } from '../../src/state/store';
import {
  Body,
  Button,
  Card,
  Chip,
  Field,
  Notice,
  Row,
  Screen,
  SectionTitle,
  Small,
  Tertiary,
  Title,
} from '../../src/ui/components';
import { spacing } from '../../src/ui/theme';

const CLIMATES: { value: Home['climate']; label: string }[] = [
  { value: 'coastal', label: 'Coastal' },
  { value: 'humid_subtropical', label: 'Humid subtropical' },
  { value: 'temperate', label: 'Temperate' },
  { value: 'cold', label: 'Cold' },
  { value: 'arid', label: 'Dry' },
];

/**
 * Adding a property to an existing account.
 *
 * Deliberately the same shape as onboarding minus the account: the person
 * already exists, so this creates a property, a membership, and an ownership
 * period, and nothing else. That is the whole difference between "sign up" and
 * "add a home", and it only reads as a small difference because the data model
 * separated the two up front.
 */
export default function NewHome() {
  const router = useRouter();
  const addProperty = useStore((s) => s.addProperty);
  const { homes } = usePlan();

  const [nickname, setNickname] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType>('secondary');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  const [squareFeet, setSquareFeet] = useState('');
  const [climate, setClimate] = useState<Home['climate']>('temperate');

  const parsedYear = Number(yearBuilt);
  const yearValid =
    yearBuilt.length === 0 ||
    (Number.isInteger(parsedYear) && parsedYear >= 1700 && parsedYear <= new Date().getFullYear());

  const create = () => {
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
    router.replace('/scan/guided');
  };

  return (
    <Screen>
      <View style={{ gap: spacing.sm }}>
        <Title>Add a home</Title>
        <Body>
          This gets its own record — separate equipment, history, schedule, and costs. Nothing is
          shared with your other properties.
        </Body>
      </View>

      {/* What it costs, before any of the form is filled in. */}
      {homes.count + 1 > homes.included ? (
        <Notice icon="card-outline">
          This is home {homes.count + 1}. Your plan includes {homes.included}, so this one adds{' '}
          {homes.extraPriceLabel} a month. Billing is not wired up in this build, so nothing will be
          charged.
        </Notice>
      ) : null}

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
        <Tertiary>{PROPERTY_TYPES.find((t) => t.key === propertyType)?.blurb}</Tertiary>
      </Card>

      <Card>
        <Field
          label="What do you call it?"
          value={nickname}
          onChangeText={setNickname}
          placeholder="Beach House"
        />
        <Field label="Street address" value={address} onChangeText={setAddress} placeholder="119 Folly Road" />
        <Row gap={spacing.md}>
          <View style={{ flex: 2 }}>
            <Field label="City" value={city} onChangeText={setCity} placeholder="Folly Beach" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="State" value={state} onChangeText={setState} placeholder="SC" />
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
              hint={yearValid ? undefined : 'Check that year'}
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
      </Card>

      <Card>
        <SectionTitle title="Climate" />
        <Small>Salt air, humidity, and sun all change how long equipment lasts.</Small>
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

      <Button
        label="Add this home"
        icon="add-circle-outline"
        size="lg"
        full
        onPress={create}
        disabled={nickname.trim().length === 0 || !yearValid}
      />
      <Tertiary style={{ textAlign: 'center' }}>
        You can switch between homes any time from My Homes.
      </Tertiary>
    </Screen>
  );
}
