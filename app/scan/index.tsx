import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { GatewayNotConfiguredError, identifyComponents, isGatewayConfigured } from '../../src/ai/client';
import type { ComponentCategory } from '../../src/core/types';
import { useHomeRecord } from '../../src/state/store';
import { useScanDraft } from '../../src/state/scanDraft';
import { capturePhoto, pickPhotos } from '../../src/ui/capture';
import {
  Body,
  BodyStrong,
  Button,
  Card,
  Chip,
  Faint,
  Field,
  Heading,
  Loading,
  Muted,
  Notice,
  Row,
  Screen,
  SectionHeader,
} from '../../src/ui/components';
import { CATEGORY_LABEL, radius, spacing, useTheme } from '../../src/ui/theme';

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
 * Scan My Home.
 *
 * The single most important instruction on this screen is "photograph the data
 * plate". A wide shot of a water heater tells the model it is a water heater —
 * which the owner already knew. The rating label is where the model number, serial,
 * capacity, and the date code that drives the entire age calculation actually live.
 */
export default function Scan() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const draft = useScanDraft();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const add = async (fn: () => Promise<void>) => {
    setError(undefined);
    await fn();
  };

  const analyze = async () => {
    if (draft.images.length === 0) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await identifyComponents({
        images: draft.images.map(({ data, mediaType, role }) => ({ data, mediaType, role })),
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
          ? 'No AI gateway is configured on this build, so photos cannot be read automatically.'
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
    <Screen>
      <View style={{ gap: spacing.sm }}>
        <Heading>Photograph one piece of equipment</Heading>
        <Body>
          Get the rating plate or model sticker in frame — that is where the model number, serial,
          capacity, and the date code that determines its age actually are. Add a wider shot for
          context if it helps.
        </Body>
      </View>

      <Card>
        <SectionHeader title="What are you looking at?" />
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
          label="Where is it? (optional)"
          value={draft.locationHint ?? ''}
          onChangeText={(value) => draft.setHints({ locationHint: value })}
          placeholder="Garage, attic, side yard…"
        />
        <Faint>
          Both are optional hints. They help disambiguate a label that could belong to more than one
          kind of equipment.
        </Faint>
      </Card>

      <Card>
        <SectionHeader title={`Photos (${draft.images.length}/6)`} />
        {draft.images.length === 0 ? (
          <Muted>Nothing captured yet.</Muted>
        ) : (
          <Row wrap gap={spacing.sm}>
            {draft.images.map((image) => (
              <View key={image.uri}>
                <Image
                  source={{ uri: image.uri }}
                  style={{ width: 88, height: 88, borderRadius: radius.md, backgroundColor: theme.surfaceAlt }}
                  contentFit="cover"
                />
                <Pressable
                  onPress={() => draft.removeImage(image.uri)}
                  accessibilityLabel="Remove photo"
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    backgroundColor: theme.surface,
                    borderRadius: radius.pill,
                  }}
                >
                  <Ionicons name="close-circle" size={22} color={theme.danger} />
                </Pressable>
                {image.role ? (
                  <Faint style={{ textAlign: 'center', marginTop: 2 }}>{image.role}</Faint>
                ) : null}
              </View>
            ))}
          </Row>
        )}

        <Row wrap gap={spacing.sm}>
          <Button
            label="Nameplate"
            icon="camera-outline"
            onPress={() =>
              add(async () => {
                const photo = await capturePhoto('nameplate / rating label');
                if (photo) draft.addImages([photo]);
              })
            }
          />
          <Button
            label="Wider shot"
            icon="expand-outline"
            variant="secondary"
            onPress={() =>
              add(async () => {
                const photo = await capturePhoto('the equipment in context');
                if (photo) draft.addImages([photo]);
              })
            }
          />
          <Button
            label="From library"
            icon="images-outline"
            variant="secondary"
            onPress={() =>
              add(async () => {
                const photos = await pickPhotos('existing photo', 4);
                if (photos.length > 0) draft.addImages(photos);
              })
            }
          />
        </Row>
      </Card>

      {error ? <Notice tone="danger" icon="alert-circle-outline">{error}</Notice> : null}

      {busy ? (
        <Loading label="Reading the label…" />
      ) : (
        <Row gap={spacing.sm} wrap>
          <Button
            label="Identify it"
            icon="sparkles-outline"
            onPress={() => void analyze()}
            disabled={draft.images.length === 0 || !isGatewayConfigured()}
          />
          <Button label="Enter it by hand" variant="secondary" icon="create-outline" onPress={enterManually} />
        </Row>
      )}

      {!isGatewayConfigured() ? (
        <Notice icon="cloud-offline-outline">
          Automatic identification needs an AI gateway, which is not configured on this build. You can
          still add equipment by hand — everything downstream (scheduling, health, forecasting) works
          identically either way.
        </Notice>
      ) : null}

      <Card>
        <Heading>Getting a good read</Heading>
        <View style={{ gap: spacing.sm }}>
          {[
            'Fill the frame with the label. Distance costs more accuracy than blur does.',
            'Kill the glare — a metal plate under a flash reads as a white rectangle.',
            'If the model and serial are on separate stickers, photograph both.',
            'Serial numbers matter most: many manufacturers encode the build date in them, and that date drives the age, the warranty, and every cost projection that follows.',
          ].map((tip) => (
            <Row key={tip} gap={spacing.sm} align="flex-start">
              <Ionicons name="ellipse" size={6} color={theme.textFaint} style={{ marginTop: 7 }} />
              <Muted style={{ flex: 1 }}>{tip}</Muted>
            </Row>
          ))}
        </View>
      </Card>

      <Notice icon="lock-closed-outline">
        Photos you send for identification go to the AI gateway configured for this build and are not
        stored there. Everything else stays on this device.
      </Notice>

      {draft.images.length > 0 ? (
        <Button label="Discard these photos" variant="ghost" onPress={() => draft.reset()} />
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
