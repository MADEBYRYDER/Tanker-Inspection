import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { GatewayNotConfiguredError, identifyComponents, isGatewayConfigured } from '../../src/ai/client';
import type { ComponentCategory } from '../../src/core/types';
import { useScanDraft } from '../../src/state/scanDraft';
import { useHomeRecord } from '../../src/state/store';
import { PhotoTray, canSubmit } from '../../src/ui/PhotoTray';
import { toPayload } from '../../src/ui/capture';
import {
  Body,
  Button,
  Card,
  Chip,
  Enter,
  Field,
  Heading,
  Label,
  Loading,
  Notice,
  Row,
  Screen,
  Small,
  Tertiary,
} from '../../src/ui/components';
import { CATEGORY_LABEL, spacing, useTheme } from '../../src/ui/theme';

const CATEGORIES: ComponentCategory[] = [
  'hvac',
  'water_heater',
  'electrical',
  'plumbing',
  'appliance',
  'roof',
  'windows',
  'exterior',
  'safety',
  'flooring',
];

/**
 * Add Equipment.
 *
 * The single most important instruction here is "photograph the data plate". A wide
 * shot of a water heater tells the model it is a water heater, which the owner
 * already knew. The rating label carries the model, serial, capacity, and the date
 * code that drives the entire age calculation — and therefore the health score,
 * the warranty status, and every cost projection downstream of it.
 */
export default function ScanEquipment() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const draft = useScanDraft();
  const params = useLocalSearchParams<{ category?: string; area?: string }>();
  const seeded = useRef(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // The guided walkthrough hands over which area it sent you to scan.
  useEffect(() => {
    if (params.category && !seeded.current) {
      seeded.current = true;
      draft.setHints({ categoryHint: params.category, locationHint: params.area });
    }
  }, [params.category, params.area, draft]);

  const analyze = async () => {
    if (!canSubmit(draft.images)) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await identifyComponents({
        images: draft.images.map(toPayload),
        categoryHint: draft.categoryHint ? CATEGORY_LABEL[draft.categoryHint] : undefined,
        locationHint: draft.locationHint,
        homeContext: record
          ? [
              record.home.yearBuilt ? `Built ${record.home.yearBuilt}` : undefined,
              record.home.squareFeet ? `${record.home.squareFeet} sq ft` : undefined,
              `${record.home.climate} climate`,
            ]
              .filter(Boolean)
              .join(', ')
          : undefined,
      });
      draft.setResults({
        results: result.components,
        guidance: result.guidance,
        unreadable: result.unreadable,
      });
      router.push('/scan/review');
    } catch (err) {
      setError(
        err instanceof GatewayNotConfiguredError
          ? 'No AI gateway is configured on this build, so photos cannot be read automatically. You can still add this by hand.'
          : err instanceof Error
            ? err.message
            : 'Could not identify the equipment.',
      );
    } finally {
      setBusy(false);
    }
  };

  const enterManually = () => {
    draft.setResults({ results: [blankIdentification(draft.categoryHint)], guidance: '', unreadable: false });
    router.push('/scan/review');
  };

  return (
    <Screen gap={spacing.lg}>
      <Enter>
        <View style={{ gap: spacing.sm }}>
          <Heading>Photograph the label</Heading>
          <Body>
            Get the rating plate or model sticker in frame. That's where the model number, serial,
            and the date code that determines its age actually are. A wider shot helps for context.
          </Body>
        </View>
      </Enter>

      <Enter index={1}>
        <Card>
          <Label>Photos</Label>
          <PhotoTray
            images={draft.images}
            onChange={(next) => draft.setImages(next)}
            role="nameplate / rating label"
            captureLabel="Photograph label"
            emptyHint="Nothing captured yet."
          />
        </Card>
      </Enter>

      <Enter index={2}>
        <Card>
          <Label>What is it? (optional)</Label>
          <Row wrap gap={spacing.sm}>
            {CATEGORIES.map((category) => (
              <Chip
                key={category}
                label={CATEGORY_LABEL[category] ?? category}
                selected={draft.categoryHint === category}
                onPress={() =>
                  draft.setHints({
                    categoryHint: draft.categoryHint === category ? undefined : category,
                  })
                }
              />
            ))}
          </Row>
          <Field
            label="Where is it?"
            value={draft.locationHint ?? ''}
            onChangeText={(value) => draft.setHints({ locationHint: value })}
            placeholder="Garage, attic, side yard…"
          />
          <Tertiary>
            Both are hints, not requirements. They help disambiguate a label that could belong to
            more than one kind of equipment.
          </Tertiary>
        </Card>
      </Enter>

      {error ? (
        <Card tone={theme.redSoft}>
          <Row gap={spacing.md} align="flex-start">
            <Ionicons name="alert-circle-outline" size={18} color={theme.red} style={{ marginTop: 1 }} />
            <Small style={{ flex: 1, color: theme.red }}>{error}</Small>
          </Row>
          <Row gap={spacing.sm}>
            <Button label="Try again" size="sm" onPress={() => void analyze()} />
            <Button label="Enter by hand" size="sm" variant="secondary" onPress={enterManually} />
          </Row>
          <Tertiary>Your photos are still here — nothing was lost.</Tertiary>
        </Card>
      ) : null}

      {busy ? (
        <Loading label="Reading the label…" />
      ) : (
        <Row gap={spacing.sm} wrap>
          <Button
            label="Identify it"
            icon="sparkles-outline"
            size="lg"
            onPress={() => void analyze()}
            disabled={!canSubmit(draft.images) || !isGatewayConfigured()}
          />
          <Button label="By hand" variant="secondary" size="lg" onPress={enterManually} />
        </Row>
      )}

      {!isGatewayConfigured() ? (
        <Notice tone="neutral" icon="cloud-offline-outline">
          Automatic identification needs an AI gateway, which isn't configured on this build. Adding
          equipment by hand works identically for everything downstream — scheduling, health, and
          forecasting.
        </Notice>
      ) : null}

      <Card tone={theme.surfaceSunken} raised={0}>
        <Label>Getting a good read</Label>
        <View style={{ gap: spacing.sm }}>
          {[
            'Fill the frame with the label — distance costs more accuracy than blur does.',
            'Kill the glare. A metal plate under a flash reads as a white rectangle.',
            'If the model and serial are on separate stickers, photograph both.',
            'Serials matter most: many manufacturers encode the build date in them, and that date drives the age, the warranty, and every cost projection.',
          ].map((tip) => (
            <Row key={tip} gap={spacing.sm} align="flex-start">
              <Ionicons name="ellipse" size={5} color={theme.textTertiary} style={{ marginTop: 8 }} />
              <Small style={{ flex: 1 }}>{tip}</Small>
            </Row>
          ))}
        </View>
      </Card>

      <Tertiary>
        Photos sent for identification go to the AI gateway configured for this build and aren't
        stored there. Everything else stays on this device.
      </Tertiary>

      {draft.images.length > 0 ? (
        <Button label="Discard these photos" variant="ghost" tone={theme.red} onPress={() => draft.reset()} />
      ) : null}
    </Screen>
  );
}

function blankIdentification(category?: string) {
  return {
    category: (category ?? 'other') as ComponentCategory,
    type: '',
    name: '',
    manufacturer: null,
    modelNumber: null,
    serialNumber: null,
    manufacturedYear: null,
    manufacturedYearBasis: null,
    specs: [],
    warrantyNote: null,
    recommendedMaintenance: [],
    confidence: 1,
    openQuestions: [],
    notes: '',
  };
}
