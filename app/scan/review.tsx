import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { DraftIdentification } from '../../src/state/scanDraft';
import { isISODate, today } from '../../src/core/dates';
import type { ComponentCategory, HomeComponent, Spec } from '../../src/core/types';
import { useScanDraft } from '../../src/state/scanDraft';
import { useStore } from '../../src/state/store';
import {
  Badge,
  Body,
  BodyStrong,
  Button,
  Card,
  Chip,
  Divider,
  Tertiary,
  Field,
  Heading,
  Small,
  Notice,
  ProvenanceTag,
  Row,
  Screen,
  SectionTitle,
} from '../../src/ui/components';
import { useDialog } from '../../src/ui/dialog';
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
  'structure',
  'other',
];

/**
 * Review before saving.
 *
 * Nothing the model produced reaches the permanent record without passing through
 * here. The screen is built around confidence: low-confidence identifications and
 * anything the model flagged as unresolved are surfaced at the top of each card
 * rather than buried, so the owner checks the two fields that are actually doubtful
 * instead of proofreading twelve that are fine.
 */
export default function ScanReview() {
  const theme = useTheme();
  const router = useRouter();
  const draft = useScanDraft();
  const addComponent = useStore((s) => s.addComponent);
  const addEvent = useStore((s) => s.addEvent);
  const { alert } = useDialog();
  const [saving, setSaving] = useState(false);

  const save = () => {
    const incomplete = draft.results.filter((r) => !r.name.trim() || !r.type.trim());
    if (incomplete.length > 0) {
      void alert('Add a name and type', 'Every item needs at least a name and an equipment type before it can be saved.');
      return;
    }
    setSaving(true);
    try {
      for (const result of draft.results) {
        const component = addComponent(toComponent(result, draft.locationHint));
        // Record the identification itself, so the record shows how the entry got there.
        addEvent({
          componentId: component.id,
          date: today(),
          type: 'inspection',
          title: `${component.name} added to the record`,
          description:
            result.confidence >= 0.6
              ? `Identified from photographs${result.manufacturedYearBasis ? `. ${result.manufacturedYearBasis}` : ''}`
              : 'Added by hand.',
          documentIds: [],
          photoIds: [],
          source: result.confidence >= 0.6 ? 'ai_document' : 'owner',
          visibility: 'transferable',
        });
      }
      draft.reset();
      router.replace('/(tabs)');
    } finally {
      setSaving(false);
    }
  };

  if (draft.results.length === 0) {
    return (
      <Screen>
        <Notice tone="attention" icon="alert-circle-outline">
          Nothing to review. Go back and capture a photo of the equipment.
        </Notice>
        <Button label="Back to scanning" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      {draft.unreadable ? (
        <Notice tone="attention" icon="camera-reverse-outline">
          The photos did not show a readable label. {draft.guidance}
        </Notice>
      ) : draft.guidance ? (
        <Notice icon="bulb-outline">{draft.guidance}</Notice>
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <Heading>
          {draft.results.length} {draft.results.length === 1 ? 'item' : 'items'} to add
        </Heading>
        <Small>
          Check anything marked as uncertain before saving. Fields left blank stay blank — the app
          will not fill them with a guess.
        </Small>
      </View>

      {draft.results.map((result, index) => (
        <ResultCard
          key={index}
          result={result}
          onChange={(patch) => draft.updateResult(index, patch)}
          onRemove={() => draft.removeResult(index)}
        />
      ))}

      <Button
        label={`Save to my home record`}
        icon="checkmark-circle-outline"
        onPress={save}
        loading={saving}
        full
      />
      <Button label="Discard" variant="ghost" onPress={() => { draft.reset(); router.replace('/(tabs)'); }} />
    </Screen>
  );
}

function ResultCard({
  result,
  onChange,
  onRemove,
}: {
  result: DraftIdentification;
  onChange: (patch: Partial<DraftIdentification>) => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const lowConfidence = result.confidence < 0.6;
  const installDate = result.installedOn ?? '';
  const dateValid = installDate.length === 0 || isISODate(installDate);

  return (
    <Card>
      <Row justify="space-between" align="flex-start">
        <BodyStrong style={{ flex: 1 }}>{result.name || 'Unnamed equipment'}</BodyStrong>
        <Row gap={spacing.xs}>
          <Badge
            label={`${Math.round(result.confidence * 100)}% sure`}
            fg={lowConfidence ? theme.amber : theme.sage}
            bg={lowConfidence ? theme.amberSoft : theme.sageSoft}
          />
        </Row>
      </Row>

      {result.openQuestions.length > 0 ? (
        <Notice tone="attention" icon="help-circle-outline">
          {result.openQuestions.join('\n')}
        </Notice>
      ) : null}

      {lowConfidence ? (
        <Notice tone="attention" icon="eye-outline">
          This is a low-confidence read. Check the model and serial against the label before saving —
          the age, warranty status, and every cost projection are derived from them.
        </Notice>
      ) : null}

      <Field label="Name" value={result.name} onChangeText={(name) => onChange({ name })} placeholder="Upstairs furnace" />
      <Field
        label="Equipment type"
        value={result.type}
        onChangeText={(type) => onChange({ type })}
        placeholder="Gas furnace"
        hint="This decides which maintenance tasks and lifespan estimates apply."
      />

      <View style={{ gap: spacing.xs }}>
        <Tertiary>CATEGORY</Tertiary>
        <Row wrap gap={spacing.xs}>
          {CATEGORIES.map((category) => (
            <Chip
              key={category}
              label={CATEGORY_LABEL[category] ?? category}
              selected={result.category === category}
              onPress={() => onChange({ category })}
            />
          ))}
        </Row>
      </View>

      <Divider />

      <Field
        label="Manufacturer"
        value={result.manufacturer ?? ''}
        onChangeText={(v) => onChange({ manufacturer: v || null })}
        placeholder="Not read from the label"
      />
      <Field
        label="Model number"
        value={result.modelNumber ?? ''}
        onChangeText={(v) => onChange({ modelNumber: v || null })}
        placeholder="Not read from the label"
        autoCapitalize="characters"
      />
      <Field
        label="Serial number"
        value={result.serialNumber ?? ''}
        onChangeText={(v) => onChange({ serialNumber: v || null })}
        placeholder="Not read from the label"
        autoCapitalize="characters"
      />

      <Row gap={spacing.md}>
        <View style={{ flex: 1 }}>
          <Field
            label="Year built"
            value={result.manufacturedYear ? String(result.manufacturedYear) : ''}
            onChangeText={(v) => onChange({ manufacturedYear: v ? Number(v) : null })}
            keyboardType="numeric"
            placeholder="—"
          />
        </View>
        <View style={{ flex: 1.4 }}>
          <Field
            label="Install date"
            value={installDate}
            onChangeText={(v) => onChange({ installedOn: v || undefined })}
            placeholder="YYYY-MM-DD"
            hint={dateValid ? 'Optional, but it makes every estimate exact.' : 'Use YYYY-MM-DD'}
          />
        </View>
      </Row>
      {result.manufacturedYearBasis ? <Tertiary>How the year was determined: {result.manufacturedYearBasis}</Tertiary> : null}

      {result.specs.length > 0 ? (
        <>
          <Divider />
          <SectionTitle title="Specifications" />
          {result.specs.map((spec, index) => (
            <Row key={`${spec.key}-${index}`} justify="space-between" gap={spacing.md}>
              <Small style={{ flex: 1 }}>{spec.label}</Small>
              <Row gap={spacing.xs}>
                <BodyStrong>{spec.value}</BodyStrong>
                <ProvenanceTag provenance={spec.provenance} />
              </Row>
            </Row>
          ))}
        </>
      ) : null}

      {result.warrantyNote ? (
        <>
          <Divider />
          <Tertiary>WARRANTY</Tertiary>
          <Body>{result.warrantyNote}</Body>
        </>
      ) : null}

      {result.recommendedMaintenance.length > 0 ? (
        <>
          <Divider />
          <Tertiary>RECOMMENDED MAINTENANCE</Tertiary>
          {result.recommendedMaintenance.map((item) => (
            <Small key={item}>• {item}</Small>
          ))}
        </>
      ) : null}

      {result.notes ? <Tertiary>{result.notes}</Tertiary> : null}

      <Button label="Don't add this one" variant="ghost" tone={theme.red} onPress={onRemove} />
    </Card>
  );
}

function toComponent(
  result: DraftIdentification,
  locationHint?: string,
): Omit<HomeComponent, 'id' | 'homeId' | 'createdAt' | 'updatedAt'> {
  const specs: Spec[] = result.specs.map((spec) => ({
    key: spec.key,
    label: spec.label,
    value: spec.value,
    provenance: spec.provenance,
  }));

  return {
    category: result.category,
    type: result.type.trim(),
    name: result.name.trim(),
    location: locationHint,
    manufacturer: result.manufacturer ?? undefined,
    modelNumber: result.modelNumber ?? undefined,
    serialNumber: result.serialNumber ?? undefined,
    installedOn: result.installedOn && isISODate(result.installedOn) ? result.installedOn : undefined,
    manufacturedYear: result.manufacturedYear ?? undefined,
    // An install date the owner typed is documented; a year decoded from a serial is
    // evidence of manufacture, not of installation, so it stays an estimate.
    ageProvenance:
      result.installedOn && isISODate(result.installedOn)
        ? 'documented'
        : result.manufacturedYear
          ? 'estimated'
          : 'unknown',
    specs,
    warranties: [],
    photos: [],
    documentIds: [],
    identificationConfidence: result.confidence,
    identificationSource: result.confidence >= 0.6 ? 'ai_scan' : 'manual',
    openQuestions: result.openQuestions,
    notes: result.notes || undefined,
  };
}
