import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { GatewayNotConfiguredError, isGatewayConfigured, triageProblem } from '../../src/ai/client';
import type { ProblemTriage } from '../../src/ai/schemas';
import { today } from '../../src/core/dates';
import { buildGroundingContext } from '../../src/core/engine/query';
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
  Enter,
  Field,
  Heading,
  IconTile,
  Label,
  Loading,
  Row,
  Screen,
  Small,
  StatusPill,
  Tertiary,
  Title,
  Touchable,
} from '../../src/ui/components';
import { callNumber, canPlaceCalls } from '../../src/ui/platform';
import { AllowanceRow, AllowanceSpent } from '../../src/ui/plus';
import { fonts, radius, spacing, toneFor, type, useTheme, type StatusKey } from '../../src/ui/theme';

const URGENCY: Record<
  ProblemTriage['urgency'],
  { label: string; status: StatusKey; icon: keyof typeof Ionicons.glyphMap; blurb: string }
> = {
  emergency: {
    label: 'Emergency',
    status: 'urgent',
    icon: 'alert-circle',
    blurb: 'Act now, before anything else',
  },
  urgent: {
    label: 'Urgent',
    status: 'urgent',
    icon: 'alert-circle-outline',
    blurb: 'Days, not weeks',
  },
  soon: { label: 'Soon', status: 'attention', icon: 'time-outline', blurb: 'Schedule in a few weeks' },
  routine: {
    label: 'Routine',
    status: 'good',
    icon: 'checkmark-circle-outline',
    blurb: 'Monitor, or handle at leisure',
  },
};

/**
 * The problem scanner.
 *
 * Framed as triage throughout, in the copy as much as the prompt. A photograph
 * cannot establish what is behind a wall or what a component measures under load,
 * and an app that implies otherwise will eventually talk somebody out of a call
 * they needed to make.
 *
 * The emergency guidance sits at the *top* of the input screen, not the bottom.
 * Someone who can smell gas should not have to scroll past a photo picker and a
 * text field to be told to leave the house — and they certainly should not wait
 * for a model round-trip. That placement is a safety decision, not a layout one.
 */
export default function ProblemScanner() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const { usage } = usePlan();
  const countUsage = useStore((s) => s.countUsage);
  const params = useLocalSearchParams<{ componentId?: string }>();

  const [images, setImages] = useState<CapturedImage[]>([]);
  const [description, setDescription] = useState('');
  const [componentId, setComponentId] = useState<string | undefined>(params.componentId);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProblemTriage | undefined>();
  const [error, setError] = useState<string | undefined>();
  // Whether "tap to call" is a promise this platform can keep. See ui/platform.
  const dialable = canPlaceCalls();

  const scans = usage('problem_scan');

  const submit = async () => {
    if (!record || description.trim().length < 8) return;
    // Checked here as well as on the button, so a stale screen left open
    // overnight cannot spend an allowance the month has already reset away from.
    if (!scans.allowed) return;
    setBusy(true);
    setError(undefined);
    try {
      const component = record.components.find((c) => c.id === componentId);
      const triage = await triageProblem({
        images: images.map(toPayload),
        description: component
          ? `Regarding the ${component.name} (${component.type}): ${description.trim()}`
          : description.trim(),
        recordContext: buildGroundingContext(record, { asOf: today() }),
      });
      // Counted on success only: a gateway timeout should not cost someone one
      // of two scans a month.
      countUsage('problem_scan');
      setResult(triage);
    } catch (err) {
      setError(
        err instanceof GatewayNotConfiguredError
          ? 'No AI gateway is configured on this build, so problems cannot be triaged automatically.'
          : err instanceof Error
            ? err.message
            : 'Could not analyse the problem.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (!record) return <Screen><Small>Set up your home first.</Small></Screen>;

  /* ------------------------------ Result ------------------------------- */
  if (result) {
    const urgency = URGENCY[result.urgency];
    const tone = toneFor(theme, urgency.status);
    return (
      <Screen gap={spacing.lg}>
        <Enter>
          <Card tone={tone.bg} raised={2} bordered={false}>
            <Row gap={spacing.md}>
              <IconTile icon={urgency.icon} status={urgency.status} size={46} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.label, { color: tone.fg }]}>{urgency.label.toUpperCase()}</Text>
                <Text style={[type.subheading, { color: tone.fg }]}>{urgency.blurb}</Text>
              </View>
            </Row>
            <Text style={[type.small, { color: tone.fg }]}>{result.urgencyReason}</Text>
            {result.urgency === 'emergency' ? (
              <Button
                label={dialable ? 'Call emergency services' : 'Call emergency services — 911'}
                icon="call-outline"
                tone={theme.red}
                full
                onPress={() => void callNumber('911')}
              />
            ) : null}
          </Card>
        </Enter>

        <Enter index={1}>
          <Title>{result.headline}</Title>
        </Enter>

        {result.safeSteps.length > 0 ? (
          <Enter index={2}>
            <Card>
              <Label>Do this now</Label>
              {result.safeSteps.map((step, index) => (
                <Row key={index} gap={spacing.md} align="flex-start">
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: radius.pill,
                      backgroundColor: theme.surfaceSunken,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 12.5, fontFamily: fonts.sans[700], color: theme.textSecondary }}>
                      {index + 1}
                    </Text>
                  </View>
                  <Body style={{ flex: 1 }}>{step}</Body>
                </Row>
              ))}
            </Card>
          </Enter>
        ) : null}

        {result.doNotDo.length > 0 ? (
          <Enter index={3}>
            <Card tone={theme.redSoft} bordered={false}>
              <Label color={theme.red}>Do not</Label>
              {result.doNotDo.map((item, index) => (
                <Row key={index} gap={spacing.sm} align="flex-start">
                  <Ionicons name="close-circle" size={16} color={theme.red} style={{ marginTop: 2 }} />
                  <Text style={[type.small, { flex: 1, color: theme.red }]}>{item}</Text>
                </Row>
              ))}
            </Card>
          </Enter>
        ) : null}

        {result.recordContext ? (
          <Enter index={4}>
            <Card>
              <Label>From your home's record</Label>
              <Body>{result.recordContext}</Body>
            </Card>
          </Enter>
        ) : null}

        <Enter index={5}>
          <Card>
            <Label>What it might be</Label>
            <Tertiary>Ranked by what the photos and your record support. None is a diagnosis.</Tertiary>
            {result.possibleCauses.map((cause, index) => (
              <View key={index} style={{ gap: spacing.sm }}>
                {index > 0 ? <Divider /> : null}
                <Row justify="space-between" gap={spacing.sm} align="flex-start">
                  <BodyStrong style={{ flex: 1 }}>{cause.cause}</BodyStrong>
                  <StatusPill
                    status={cause.likelihood === 'likely' ? 'attention' : 'neutral'}
                    label={cause.likelihood.replace('_', ' ')}
                  />
                </Row>
                <Small>{cause.reasoning}</Small>
              </View>
            ))}
          </Card>
        </Enter>

        <Enter index={6}>
          <Card tone={theme.surfaceSunken} raised={0}>
            <Label>What a photo can't tell you</Label>
            <Small>{result.limitations}</Small>
          </Card>
        </Enter>

        {result.professionalNeeded ? (
          <Enter index={7}>
            <Card raised={2}>
              <Label>This needs a professional</Label>
              <Body>
                {result.professionalTrade
                  ? `Get a ${result.professionalTrade} to look at it in person.`
                  : 'Get a qualified trade to look at it in person.'}
              </Body>
              <Button
                label="Create a service request"
                icon="paper-plane-outline"
                full
                onPress={() =>
                  router.push({
                    pathname: '/service/new',
                    params: {
                      componentId: result.relatedComponentIds[0] ?? componentId ?? '',
                      title: result.headline,
                      problem: description,
                      urgency:
                        result.urgency === 'emergency' || result.urgency === 'urgent'
                          ? 'emergency'
                          : 'soon',
                    },
                  })
                }
              />
            </Card>
          </Enter>
        ) : null}

        <Row gap={spacing.sm} wrap>
          <Button
            label="Start over"
            variant="secondary"
            icon="refresh-outline"
            onPress={() => {
              setResult(undefined);
              setImages([]);
              setDescription('');
            }}
          />
          <Button label="Back home" variant="ghost" onPress={() => router.replace('/(tabs)')} />
        </Row>
      </Screen>
    );
  }

  /* ------------------------------- Input -------------------------------- */
  return (
    <Screen gap={spacing.lg}>
      {/* First thing on the screen, before any input. Someone who can smell gas
          should not have to scroll to be told to leave. */}
      <Enter>
        <Touchable
          onPress={() => void callNumber('911')}
          haptic="medium"
          style={{
            backgroundColor: theme.redSoft,
            borderRadius: radius.lg,
            padding: spacing.lg,
            gap: spacing.sm,
          }}
        >
          <Row gap={spacing.md} align="flex-start">
            <Ionicons name="warning" size={20} color={theme.red} style={{ marginTop: 1 }} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[type.bodyStrong, { color: theme.red }]}>Don't use this in an emergency</Text>
              <Text style={[type.small, { color: theme.red }]}>
                Gas smell, smoke or fire, water you can't shut off, arcing or exposed wiring, or a
                carbon monoxide alarm — leave, then call emergency services or your utility. Don't
                wait for an analysis.
              </Text>
              {/*
                On a phone this dials. On a desktop browser a `tel:` navigation
                is accepted and silently discarded, so the label there is the
                number itself rather than a promise to dial it — on this screen
                of all screens, a control that quietly does nothing is the one
                failure that must not happen.
              */}
              <Row gap={4}>
                <Text style={[type.smallStrong, { color: theme.red }]}>
                  {dialable ? 'Tap to call 911' : 'Call 911'}
                </Text>
                <Ionicons name="call-outline" size={13} color={theme.red} />
              </Row>
            </View>
          </Row>
        </Touchable>
      </Enter>

      <Enter index={1}>
        <View style={{ gap: spacing.sm }}>
          <Heading>What's happening?</Heading>
          <Body>
            Describe what you're seeing or hearing. The app checks it against your home's actual
            equipment and history to work out how urgent it is and what to do next.
          </Body>
        </View>
      </Enter>

      <Enter index={2}>
        <Card>
          <Field
            label="Describe the problem"
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="Water pooling under the water heater since this morning. No hot water. There's a hissing sound."
            hint="More detail gives a better read — when it started, what changed, any sounds or smells."
          />
        </Card>
      </Enter>

      <Enter index={3}>
        <Card>
          <Label>Photos</Label>
          <PhotoTray
            images={images}
            onChange={setImages}
            role="the problem"
            captureLabel="Photograph it"
            emptyHint="Photos help a lot, but a description alone still works."
          />
        </Card>
      </Enter>

      {record.components.length > 0 ? (
        <Enter index={4}>
          <Card>
            <Label>Which equipment? (optional)</Label>
            <Row wrap gap={spacing.sm}>
              {record.components.map((component) => (
                <Chip
                  key={component.id}
                  label={component.name}
                  selected={componentId === component.id}
                  onPress={() => setComponentId(componentId === component.id ? undefined : component.id)}
                />
              ))}
            </Row>
            <Tertiary>
              Linking it pulls that item's age, model, and service history into the analysis.
            </Tertiary>
          </Card>
        </Enter>
      ) : null}

      {error ? (
        <Card tone={theme.redSoft}>
          <Small style={{ color: theme.red }}>{error}</Small>
          <Button label="Try again" size="sm" onPress={() => void submit()} />
        </Card>
      ) : null}

      {scans.allowed ? (
        <AllowanceRow verdict={scans} noun={{ one: 'scan', many: 'scans' }} />
      ) : (
        <AllowanceSpent
          what="last problem scan"
          alternative="You can still describe the problem and send it straight to a contractor with your equipment details attached — that path is always free."
        />
      )}

      {busy ? (
        <Loading label="Checking this against your home's record…" />
      ) : (
        <Button
          label="Analyse"
          icon="sparkles-outline"
          size="lg"
          full
          onPress={() => void submit()}
          disabled={
            description.trim().length < 8 ||
            !isGatewayConfigured() ||
            !scans.allowed ||
            (images.length > 0 && !canSubmit(images))
          }
        />
      )}

      {!scans.allowed ? (
        <Button
          label="Request service instead"
          icon="construct-outline"
          variant="secondary"
          size="lg"
          full
          onPress={() =>
            router.push(
              `/service/new?problem=${encodeURIComponent(description.trim())}${componentId ? `&componentId=${componentId}` : ''}`,
            )
          }
        />
      ) : null}

      <Tertiary>
        This is triage, not a diagnosis. It helps you decide how worried to be and what to do in the
        next hour — it can't see inside walls or measure anything.
      </Tertiary>
    </Screen>
  );
}
