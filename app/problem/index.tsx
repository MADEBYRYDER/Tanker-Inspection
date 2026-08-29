import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { GatewayNotConfiguredError, isGatewayConfigured, triageProblem } from '../../src/ai/client';
import type { ProblemTriage } from '../../src/ai/schemas';
import { today } from '../../src/core/dates';
import { buildGroundingContext } from '../../src/core/engine/query';
import { useHomeRecord } from '../../src/state/store';
import { capturePhoto, pickPhotos, type CapturedImage } from '../../src/ui/capture';
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
  Loading,
  Small,
  Notice,
  Row,
  Screen,
  SectionTitle,
  Title,
} from '../../src/ui/components';
import { radius, spacing, useTheme } from '../../src/ui/theme';

const URGENCY_STYLE = {
  emergency: { label: 'Emergency', tone: 'urgent' as const, icon: 'alert-circle' as const },
  urgent: { label: 'Urgent — days, not weeks', tone: 'urgent' as const, icon: 'alert-circle-outline' as const },
  soon: { label: 'Schedule soon', tone: 'attention' as const, icon: 'time-outline' as const },
  routine: { label: 'Routine', tone: 'good' as const, icon: 'checkmark-circle-outline' as const },
};

/**
 * The problem scanner.
 *
 * Framed as triage throughout, in the copy as well as the prompt. A photograph
 * cannot establish what is behind a wall or what a component measures under load,
 * and an app that implies otherwise will eventually talk somebody out of a call
 * they needed to make. The screen leads with urgency and closes with an explicit
 * statement of what could not be determined.
 */
export default function ProblemScanner() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const params = useLocalSearchParams<{ componentId?: string }>();

  const [images, setImages] = useState<CapturedImage[]>([]);
  const [description, setDescription] = useState('');
  const [componentId, setComponentId] = useState<string | undefined>(params.componentId);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProblemTriage | undefined>();
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    if (!record || description.trim().length < 8) return;
    setBusy(true);
    setError(undefined);
    try {
      const component = record.components.find((c) => c.id === componentId);
      const triage = await triageProblem({
        images: images.map(({ data, mediaType, role }) => ({ data, mediaType, role })),
        description: component
          ? `Regarding the ${component.name} (${component.type}): ${description.trim()}`
          : description.trim(),
        recordContext: buildGroundingContext(record, { asOf: today() }),
      });
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

  if (result) {
    const style = URGENCY_STYLE[result.urgency];
    return (
      <Screen>
        <Notice tone={style.tone} icon={style.icon}>
          {style.label} — {result.urgencyReason}
        </Notice>

        <Title>{result.headline}</Title>

        {result.recordContext ? (
          <Card>
            <SectionTitle title="From your home's record" />
            <Body>{result.recordContext}</Body>
          </Card>
        ) : null}

        {result.safeSteps.length > 0 ? (
          <Card>
            <SectionTitle title="What you can do right now" />
            {result.safeSteps.map((step, index) => (
              <Row key={index} gap={spacing.md} align="flex-start">
                <BodyStrong style={{ color: theme.blue }}>{index + 1}</BodyStrong>
                <Body style={{ flex: 1 }}>{step}</Body>
              </Row>
            ))}
          </Card>
        ) : null}

        {result.doNotDo.length > 0 ? (
          <Card tone={theme.redSoft}>
            <SectionTitle title="Do not" />
            {result.doNotDo.map((item, index) => (
              <Row key={index} gap={spacing.sm} align="flex-start">
                <Ionicons name="close-circle" size={16} color={theme.red} style={{ marginTop: 2 }} />
                <Body style={{ flex: 1, color: theme.red }}>{item}</Body>
              </Row>
            ))}
          </Card>
        ) : null}

        <Card>
          <SectionTitle title="What it might be" />
          <Tertiary>Ranked by what the photos and your record support. None of these is a diagnosis.</Tertiary>
          {result.possibleCauses.map((cause, index) => (
            <View key={index} style={{ gap: spacing.xs }}>
              {index > 0 ? <Divider /> : null}
              <Row justify="space-between" gap={spacing.sm}>
                <BodyStrong style={{ flex: 1 }}>{cause.cause}</BodyStrong>
                <Badge
                  label={cause.likelihood.replace('_', ' ')}
                  fg={cause.likelihood === 'likely' ? theme.amber : theme.textSecondary}
                  bg={cause.likelihood === 'likely' ? theme.amberSoft : theme.surfaceSunken}
                />
              </Row>
              <Small>{cause.reasoning}</Small>
            </View>
          ))}
        </Card>

        <Card>
          <SectionTitle title="What a photo can't tell you" />
          <Body>{result.limitations}</Body>
        </Card>

        {result.professionalNeeded ? (
          <Card>
            <SectionTitle title="This needs a professional" />
            <Body>
              {result.professionalTrade
                ? `Get a ${result.professionalTrade} to look at it.`
                : 'Get a qualified trade to look at it in person.'}
            </Body>
            <Button
              label="Create a service request"
              icon="paper-plane-outline"
              onPress={() =>
                router.push({
                  pathname: '/service/new',
                  params: {
                    componentId: result.relatedComponentIds[0] ?? componentId ?? '',
                    title: result.headline,
                    problem: description,
                    urgency: result.urgency === 'emergency' || result.urgency === 'urgent' ? 'emergency' : 'soon',
                  },
                })
              }
            />
          </Card>
        ) : null}

        <Row gap={spacing.sm} wrap>
          <Button label="Start over" variant="secondary" icon="refresh-outline" onPress={() => { setResult(undefined); setImages([]); setDescription(''); }} />
          <Button label="Back home" variant="ghost" onPress={() => router.replace('/(tabs)')} />
        </Row>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: spacing.sm }}>
        <Title>Something's wrong</Title>
        <Body>
          Describe what you are seeing or hearing and add photos. The app checks it against your
          home's actual equipment and history to work out how urgent it is and what to do next.
        </Body>
      </View>

      <Notice icon="information-circle-outline">
        This is triage, not a diagnosis. It helps you decide how worried to be and what to do in the
        next hour — it cannot see inside walls or measure anything.
      </Notice>

      <Card>
        <Field
          label="What's happening?"
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder="Water pooling under the water heater since this morning. No hot water. There's a hissing sound."
          hint="More detail gives a better read — when it started, what changed, any sounds or smells."
        />
      </Card>

      {record.components.length > 0 ? (
        <Card>
          <SectionTitle title="Which equipment? (optional)" />
          <Row wrap gap={spacing.xs}>
            {record.components.map((component) => (
              <Chip
                key={component.id}
                label={component.name}
                selected={componentId === component.id}
                onPress={() => setComponentId(componentId === component.id ? undefined : component.id)}
              />
            ))}
          </Row>
          <Tertiary>Linking it pulls that item's age, model, and service history into the analysis.</Tertiary>
        </Card>
      ) : null}

      <Card>
        <SectionTitle title={`Photos (${images.length}/6)`} />
        {images.length > 0 ? (
          <Row wrap gap={spacing.sm}>
            {images.map((image) => (
              <View key={image.uri}>
                <Image
                  source={{ uri: image.uri }}
                  style={{ width: 88, height: 88, borderRadius: radius.md, backgroundColor: theme.surfaceSunken }}
                  contentFit="cover"
                />
                <Pressable
                  onPress={() => setImages((prev) => prev.filter((i) => i.uri !== image.uri))}
                  accessibilityLabel="Remove photo"
                  style={{ position: 'absolute', top: -6, right: -6, backgroundColor: theme.surface, borderRadius: radius.pill }}
                >
                  <Ionicons name="close-circle" size={22} color={theme.red} />
                </Pressable>
              </View>
            ))}
          </Row>
        ) : (
          <Small>Photos help a lot, but a description alone still works.</Small>
        )}
        <Row gap={spacing.sm} wrap>
          <Button
            label="Take a photo"
            icon="camera-outline"
            onPress={async () => {
              const photo = await capturePhoto('the problem');
              if (photo) setImages((prev) => [...prev, photo].slice(0, 6));
            }}
          />
          <Button
            label="From library"
            icon="images-outline"
            variant="secondary"
            onPress={async () => {
              const photos = await pickPhotos('the problem', 4);
              if (photos.length > 0) setImages((prev) => [...prev, ...photos].slice(0, 6));
            }}
          />
        </Row>
      </Card>

      {error ? <Notice tone="urgent" icon="alert-circle-outline">{error}</Notice> : null}

      {busy ? (
        <Loading label="Checking this against your home's record…" />
      ) : (
        <Button
          label="Analyse"
          icon="sparkles-outline"
          onPress={() => void submit()}
          disabled={description.trim().length < 8 || !isGatewayConfigured()}
          full
        />
      )}

      {!isGatewayConfigured() ? (
        <Notice icon="cloud-offline-outline">
          Triage needs an AI gateway, which is not configured on this build. If something looks
          dangerous — gas, smoke, water you cannot stop, exposed wiring — do not wait for an app.
          Make the area safe and call the appropriate emergency number or utility.
        </Notice>
      ) : null}

      <Card tone={theme.redSoft}>
        <Row gap={spacing.sm} align="flex-start">
          <Ionicons name="warning" size={18} color={theme.red} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <BodyStrong style={{ color: theme.red }}>Do not use this for an emergency</BodyStrong>
            <Body style={{ color: theme.red }}>
              If you smell gas, see smoke or fire, have water you cannot shut off, see arcing or
              exposed wiring, or a carbon monoxide alarm is sounding — leave, then call emergency
              services or your utility. Do not wait for an analysis.
            </Body>
          </View>
        </Row>
      </Card>
    </Screen>
  );
}
