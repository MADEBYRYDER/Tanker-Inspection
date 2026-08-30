import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { GatewayNotConfiguredError, extractDocument, isGatewayConfigured } from '../../src/ai/client';
import type { DocumentExtraction } from '../../src/ai/schemas';
import { isISODate, today } from '../../src/core/dates';
import { buildGroundingContext } from '../../src/core/engine/query';
import { formatMoneyExact } from '../../src/core/money';
import type { TimelineEventType } from '../../src/core/types';
import { usePlan } from '../../src/state/plan';
import { useHomeRecord, useStore } from '../../src/state/store';
import { PhotoTray, canSubmit } from '../../src/ui/PhotoTray';
import { toPayload, type CapturedImage } from '../../src/ui/capture';
import {
  Body,
  BodyStrong,
  Button,
  Card,
  Chip,
  Divider,
  Tertiary,
  Field,
  Heading,
  KeyValue,
  Loading,
  Small,
  Label,
  Notice,
  StatusPill,
  Row,
  Screen,
  SectionTitle,
  Title,
} from '../../src/ui/components';
import { AllowanceRow, AllowanceSpent } from '../../src/ui/plus';
import { spacing, useTheme } from '../../src/ui/theme';

/**
 * Document capture.
 *
 * Photograph an invoice; the app reads the vendor, the date the work was done, the
 * amount, and what was actually performed, then files it against the right piece of
 * equipment. The review step is not optional — a misfiled invoice silently corrupts
 * a component's history, so the extracted component match is always shown and always
 * editable before anything is written.
 */
export default function DocumentCapture() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const params = useLocalSearchParams<{ componentId?: string }>();
  const addEvent = useStore((s) => s.addEvent);
  const addDocument = useStore((s) => s.addDocument);
  const updateComponent = useStore((s) => s.updateComponent);
  const { usage } = usePlan();

  const [images, setImages] = useState<CapturedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [draft, setDraft] = useState<DocumentExtraction | undefined>();
  const [componentId, setComponentId] = useState<string | undefined>(params.componentId);
  const [includeCost, setIncludeCost] = useState(true);

  const extract = async () => {
    if (!record || images.length === 0) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await extractDocument({
        images: images.map(toPayload),
        recordContext: buildGroundingContext(record, { asOf: today() }),
      });
      setDraft(result);
      setComponentId(result.suggestedComponentId ?? params.componentId ?? undefined);
    } catch (err) {
      setError(
        err instanceof GatewayNotConfiguredError
          ? 'No AI gateway is configured on this build, so documents cannot be read automatically. You can still add the entry by hand.'
          : err instanceof Error
            ? err.message
            : 'Could not read the document.',
      );
    } finally {
      setBusy(false);
    }
  };

  const startBlank = () => {
    setDraft({
      documentKind: 'invoice',
      vendor: null,
      serviceDate: today(),
      totalCents: null,
      title: '',
      summary: '',
      eventType: 'service',
      relatesTo: null,
      suggestedComponentId: params.componentId ?? null,
      warranty: null,
      lineItems: [],
      confidence: 1,
      uncertainFields: [],
    });
  };

  const save = () => {
    if (!draft || !record) return;
    const date = draft.serviceDate && isISODate(draft.serviceDate) ? draft.serviceDate : today();

    const document = addDocument({
      title: draft.title || `${draft.documentKind} — ${draft.vendor ?? 'unknown vendor'}`,
      kind: draft.documentKind,
      uri: images[0]?.uri,
      // The document itself moves with the house; whether the amount does is decided below.
      visibility: 'transferable',
      extracted: {
        ...(draft.vendor ? { vendor: draft.vendor } : {}),
        ...(draft.totalCents !== null ? { total: formatMoneyExact(draft.totalCents) } : {}),
        ...(draft.serviceDate ? { date: draft.serviceDate } : {}),
      },
    });

    addEvent({
      componentId,
      date,
      type: draft.eventType,
      title: draft.title || 'Work recorded',
      description: draft.summary || undefined,
      costCents: includeCost && draft.totalCents !== null ? draft.totalCents : undefined,
      vendor: draft.vendor ?? undefined,
      documentIds: [document.id],
      photoIds: [],
      source: 'ai_document',
      visibility: 'transferable',
    });

    // A warranty established by the document attaches to the equipment it covers.
    if (draft.warranty && componentId) {
      const component = record.components.find((c) => c.id === componentId);
      if (component) {
        updateComponent(componentId, {
          warranties: [
            ...component.warranties,
            {
              provider: draft.warranty.provider,
              kind: draft.warranty.kind,
              termYears: draft.warranty.termYears ?? undefined,
              startDate:
                draft.warranty.startDate && isISODate(draft.warranty.startDate)
                  ? draft.warranty.startDate
                  : undefined,
              expiresOn:
                draft.warranty.expiresOn && isISODate(draft.warranty.expiresOn)
                  ? draft.warranty.expiresOn
                  : undefined,
              covers: draft.warranty.covers ?? undefined,
              provenance: 'documented',
              documentId: document.id,
            },
          ],
          documentIds: [...component.documentIds, document.id],
        });
      }
    }

    router.replace('/(tabs)/timeline');
  };

  if (!record) return <Screen><Small>Set up your home first.</Small></Screen>;

  if (draft) {
    const dateValid = !draft.serviceDate || isISODate(draft.serviceDate);
    return (
      <Screen>
        <Title>Check before filing</Title>

        {draft.uncertainFields.length > 0 ? (
          <Notice tone="attention" icon="eye-outline">
            Worth checking: {draft.uncertainFields.join(', ')}.
          </Notice>
        ) : null}

        <Card>
          <Row justify="space-between">
            <Heading>Entry</Heading>
            <StatusPill
              status={draft.confidence >= 0.7 ? 'good' : 'attention'}
              label={`${Math.round(draft.confidence * 100)}% sure`}
            />
          </Row>
          <Field label="Title" value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} placeholder="HVAC serviced" />
          <Field label="Company" value={draft.vendor ?? ''} onChangeText={(v) => setDraft({ ...draft, vendor: v || null })} placeholder="Not read from the document" />
          <Field
            label="Date the work was done"
            value={draft.serviceDate ?? ''}
            onChangeText={(v) => setDraft({ ...draft, serviceDate: v || null })}
            placeholder="YYYY-MM-DD"
            hint={dateValid ? 'Not the invoice date — the date the work happened.' : 'Use YYYY-MM-DD'}
          />
          <Field
            label="Amount"
            value={draft.totalCents !== null ? (draft.totalCents / 100).toFixed(2) : ''}
            onChangeText={(v) => {
              const parsed = Number(v.replace(/[^0-9.]/g, ''));
              setDraft({ ...draft, totalCents: v && Number.isFinite(parsed) ? Math.round(parsed * 100) : null });
            }}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
          <Field label="What was done" value={draft.summary} onChangeText={(summary) => setDraft({ ...draft, summary })} multiline />
        </Card>

        <Card>
          <SectionTitle title="File it against" />
          <Tertiary>
            {draft.suggestedComponentId
              ? 'The document matched a piece of equipment. Change it if that is wrong.'
              : draft.relatesTo
                ? `The document mentions "${draft.relatesTo}" but did not clearly match one item. Pick the right one.`
                : 'Optional. Linking it puts the work in that equipment’s history.'}
          </Tertiary>
          <Row wrap gap={spacing.xs}>
            <Chip label="Not linked" selected={!componentId} onPress={() => setComponentId(undefined)} />
            {record.components.map((component) => (
              <Chip
                key={component.id}
                label={component.name}
                selected={componentId === component.id}
                onPress={() => setComponentId(component.id)}
              />
            ))}
          </Row>
        </Card>

        <Card>
          <SectionTitle title="Type of entry" />
          <Row wrap gap={spacing.xs}>
            {(['service', 'repair', 'replacement', 'installation', 'inspection', 'improvement'] as TimelineEventType[]).map(
              (type) => (
                <Chip
                  key={type}
                  label={type}
                  selected={draft.eventType === type}
                  onPress={() => setDraft({ ...draft, eventType: type })}
                />
              ),
            )}
          </Row>
        </Card>

        {draft.warranty ? (
          <Card>
            <SectionTitle title="Warranty found" />
            <KeyValue label="Provider" value={draft.warranty.provider} />
            <KeyValue label="Type" value={draft.warranty.kind.replace('_', ' ')} />
            {draft.warranty.termYears ? <KeyValue label="Term" value={`${draft.warranty.termYears} years`} /> : null}
            {draft.warranty.covers ? <Small>{draft.warranty.covers}</Small> : null}
            <Tertiary>
              {componentId
                ? 'This will be attached to the equipment selected above.'
                : 'Link this to a piece of equipment above and the warranty will be attached to it.'}
            </Tertiary>
          </Card>
        ) : null}

        {draft.lineItems.length > 0 ? (
          <Card>
            <SectionTitle title="Line items" />
            {draft.lineItems.map((item, index) => (
              <Row key={index} justify="space-between" gap={spacing.md}>
                <Small style={{ flex: 1 }}>{item.description}</Small>
                <Body>{item.amountCents !== null ? formatMoneyExact(item.amountCents) : '—'}</Body>
              </Row>
            ))}
          </Card>
        ) : null}

        <Card>
          <Row justify="space-between">
            <View style={{ flex: 1 }}>
              <BodyStrong>Record the amount</BodyStrong>
              <Tertiary>
                Costs stay private by default when the record transfers to a new owner. Leaving this
                on only affects your own totals.
              </Tertiary>
            </View>
            <Chip label={includeCost ? 'On' : 'Off'} selected={includeCost} onPress={() => setIncludeCost(!includeCost)} />
          </Row>
        </Card>

        <Button label="File it" icon="checkmark-circle-outline" onPress={save} disabled={!draft.title.trim()} full />
        <Button label="Discard" variant="ghost" onPress={() => setDraft(undefined)} />
      </Screen>
    );
  }

  const storage = usage('documents');

  /*
   * The document cap is a standing one on what is stored, not a monthly rate, so
   * hitting it blocks the whole screen rather than one action. Blocking early
   * matters here: letting someone photograph and extract a five-page invoice
   * before telling them there is nowhere to file it wastes their time and their
   * goodwill.
   */
  if (!storage.allowed && !draft) {
    return (
      <Screen>
        <Title>Add a document</Title>
        <AllowanceSpent
          what={`${storage.limit}th stored document`}
          period="total"
          alternative="You can still log the work itself on your timeline with its date, cost, and who did it — that costs nothing and is what the schedule and forecast actually read. It is only the photographed paperwork that is capped."
        />
        <Button
          label="Log the work without the paperwork"
          icon="create-outline"
          variant="secondary"
          onPress={startBlank}
          full
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: spacing.sm }}>
        <Title>Add a document</Title>
        <Body>
          Photograph an invoice, receipt, warranty, permit, or inspection report. The app reads the
          company, the date, the amount, and what was done, then files it against the right equipment.
        </Body>
        <AllowanceRow verdict={storage} noun={{ one: 'document', many: 'documents' }} />
      </View>

      <Card>
        <Label>Pages</Label>
        <PhotoTray
          images={images}
          onChange={setImages}
          role="document page"
          captureLabel="Photograph it"
          aspect="page"
          emptyHint="Get the whole page in frame, flat and well lit. Multi-page documents can be added as several photos, in order."
        />
      </Card>

      {error ? (
        <Card tone={theme.redSoft}>
          <Small style={{ color: theme.red }}>{error}</Small>
          <Row gap={spacing.sm}>
            <Button label="Try again" size="sm" onPress={() => void extract()} />
            <Button label="Enter by hand" size="sm" variant="secondary" onPress={startBlank} />
          </Row>
          <Tertiary>Your photos are still here — nothing was lost.</Tertiary>
        </Card>
      ) : null}

      {busy ? (
        <Loading label="Reading the document…" />
      ) : (
        <Row gap={spacing.sm} wrap>
          <Button
            label="Read it"
            icon="sparkles-outline"
            size="lg"
            onPress={() => void extract()}
            disabled={!canSubmit(images) || !isGatewayConfigured()}
          />
          <Button label="By hand" size="lg" variant="secondary" onPress={startBlank} />
        </Row>
      )}

      {!isGatewayConfigured() ? (
        <Notice tone="neutral" icon="cloud-offline-outline">
          Reading documents needs an AI gateway, which isn't configured on this build. Entering an
          entry by hand files it identically.
        </Notice>
      ) : null}
    </Screen>
  );
}
