import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { RELATIONSHIPS, type Relationship } from '../../src/core/account';
import { nicknameFor } from '../../src/core/address';
import { useSetupDraft } from '../../src/state/setupDraft';
import { useStore } from '../../src/state/store';
import {
  Body,
  Button,
  Card,
  Row,
  Screen,
  Small,
  Tertiary,
  Title,
  Touchable,
} from '../../src/ui/components';
import { fonts, radius, spacing, useTheme } from '../../src/ui/theme';

/**
 * What you are to this building.
 *
 * The last question before the camera, and the one that decides how the rest of
 * the app behaves for this person. It is not a role picker in disguise: all four
 * answers can administer the record they are about to create, because nobody
 * should build an inventory they cannot then edit. What it decides is whether an
 * ownership period opens on the building and whether transferring it is ever
 * offered — see `core/account.ts`.
 *
 * Asked rather than assumed because the assumption is wrong often enough to
 * matter. A letting agent setting up six properties does not own any of them.
 */
export default function SetupRelationship() {
  const theme = useTheme();
  const router = useRouter();
  const draft = useSetupDraft();
  const addProperty = useStore((s) => s.addProperty);

  const [choice, setChoice] = useState<Relationship>('owner');

  const create = () => {
    const address = draft.address;
    if (!address) {
      router.replace('/setup/address');
      return;
    }
    addProperty({
      nickname: nicknameFor(address),
      addressLine1: address.line1,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      // Climate and property type are guesses the owner can correct, and neither
      // is worth a screen before they have seen the app do anything.
      climate: 'temperate',
      propertyType: choice === 'manager' ? 'rental' : 'primary',
      relationship: choice,
    });
    draft.reset();
    router.replace('/setup/first-scan');
  };

  return (
    <Screen gap={spacing.lg}>
      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Title>What's your relationship to this home?</Title>
        <Small>
          It decides what Dwella offers you. Only an owner is ever asked about selling or
          transferring the record.
        </Small>
      </View>

      <View style={{ gap: spacing.sm }}>
        {RELATIONSHIPS.map((option) => {
          const selected = option.key === choice;
          return (
            <Touchable
              key={option.key}
              onPress={() => setChoice(option.key)}
              accessibilityLabel={option.label}
              scaleTo={0.99}
            >
              <Card
                padding={spacing.lg}
                tone={selected ? theme.sageSoft : undefined}
                style={{
                  borderWidth: 1,
                  borderColor: selected ? theme.sage : theme.border,
                }}
              >
                <Row gap={spacing.md} align="center">
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: radius.sm,
                      backgroundColor: selected ? theme.sage : theme.surfaceSunken,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather
                      name={option.icon as never}
                      size={18}
                      color={selected ? '#FFFFFF' : theme.textSecondary}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text
                      style={{
                        fontSize: 15.5,
                        fontFamily: fonts.sans[600],
                        color: selected ? theme.sageDeep : theme.text,
                      }}
                    >
                      {option.label}
                    </Text>
                    <Tertiary>{option.blurb}</Tertiary>
                  </View>
                  {selected ? <Feather name="check" size={18} color={theme.sage} /> : null}
                </Row>
              </Card>
            </Touchable>
          );
        })}
      </View>

      {choice === 'household' ? (
        <Body style={{ color: theme.textSecondary, fontSize: 14 }}>
          If the owner already keeps this home in Dwella, ask them to invite you instead — you will
          join their record rather than starting a second one for the same building.
        </Body>
      ) : null}

      <Button label="Continue" onPress={create} full />
    </Screen>
  );
}
