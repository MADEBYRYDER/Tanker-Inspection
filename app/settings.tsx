import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { gatewayHealth, isGatewayConfigured } from '../src/ai/client';
import { buildSampleRecord } from '../src/data/sampleHome';
import { useHomeRecord, useStore } from '../src/state/store';
import {
  Badge,
  Body,
  BodyStrong,
  Button,
  Card,
  Chip,
  Tertiary,
  Heading,
  KeyValue,
  Small,
  Notice,
  Row,
  Screen,
  SectionTitle,
  Title,
} from '../src/ui/components';
import { THEME_OPTIONS, useAppearance } from '../src/state/appearance';
import { useDialog } from '../src/ui/dialog';
import { spacing, useTheme } from '../src/ui/theme';

export default function Settings() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const reset = useStore((s) => s.resetEverything);
  const loadRecord = useStore((s) => s.loadRecord);
  const { confirm } = useDialog();
  const preference = useAppearance((a) => a.preference);
  const setPreference = useAppearance((a) => a.setPreference);

  const [health, setHealth] = useState<{ ok: boolean; model?: string; detail?: string }>();

  useEffect(() => {
    let cancelled = false;
    void gatewayHealth().then((result) => {
      if (!cancelled) setHealth(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const confirmReset = async () => {
    const confirmed = await confirm({
      title: 'Erase this home record?',
      message:
        'Every piece of equipment, every timeline entry, and every document reference on this device will be deleted. This cannot be undone.',
      confirmLabel: 'Erase',
      cancelLabel: 'Keep it',
      destructive: true,
    });
    if (!confirmed) return;
    reset();
    router.replace('/onboarding');
  };

  const confirmLoadSample = async () => {
    const confirmed = await confirm({
      title: 'Replace your record?',
      message: 'This overwrites the record on this device with sample data.',
      confirmLabel: 'Load sample',
      destructive: true,
    });
    if (!confirmed) return;
    const { record: sample, media } = buildSampleRecord();
    loadRecord(sample, media);
    router.replace('/(tabs)');
  };

  return (
    <Screen>
      <Title>Settings</Title>

      {/*
        Appearance first, because it is the only setting on this screen that
        changes something the moment it is touched — everything below is about
        the record rather than about the app.
      */}
      <Card>
        <SectionTitle title="Appearance" />
        <Row gap={spacing.sm} wrap>
          {THEME_OPTIONS.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              selected={preference === option.key}
              onPress={() => setPreference(option.key)}
            />
          ))}
        </Row>
        <Tertiary>
          {preference === 'system'
            ? 'Following your phone, so Dwella turns dark when it does.'
            : `Always ${preference}, whatever your phone is set to.`}
        </Tertiary>
      </Card>

      {record ? (
        <Card>
          <SectionTitle title="This home" />
          <KeyValue label="Name" value={record.home.nickname} />
          {record.home.addressLine1 ? <KeyValue label="Address" value={record.home.addressLine1} /> : null}
          {record.home.yearBuilt ? <KeyValue label="Built" value={String(record.home.yearBuilt)} /> : null}
          {record.home.squareFeet ? <KeyValue label="Size" value={`${record.home.squareFeet.toLocaleString('en-US')} sq ft`} /> : null}
          <KeyValue label="Climate" value={record.home.climate.replace(/_/g, ' ')} />
          <KeyValue label="Equipment on record" value={String(record.components.length)} />
          <KeyValue label="Timeline entries" value={String(record.events.length)} />
          {/*
            Where post goes, kept apart from where the house is. Shown as a
            value rather than hidden behind an edit screen, because "same as
            this home" is the answer for almost everybody and seeing it
            confirmed is the whole reassurance.
          */}
          <KeyValue
            label="Mailing address"
            value={record.home.mailingAddress?.line1 ?? 'Same as this home'}
          />
          <Button
            label="Change mailing address"
            icon="mail-outline"
            variant="secondary"
            onPress={() => router.push('/home/mailing')}
          />
        </Card>
      ) : null}

      <Card>
        <SectionTitle title="AI gateway" />
        <Row justify="space-between">
          <BodyStrong>Status</BodyStrong>
          <Badge
            label={health === undefined ? 'checking' : health.ok ? 'connected' : 'not connected'}
            fg={health?.ok ? theme.sage : theme.textSecondary}
            bg={health?.ok ? theme.sageSoft : theme.surfaceSunken}
          />
        </Row>
        {health?.model ? <KeyValue label="Model" value={health.model} /> : null}
        {health && !health.ok ? <Tertiary>{health.detail}</Tertiary> : null}

        <Body>
          Photo identification, document reading, problem triage, and open-ended assistant questions
          all go through a small gateway server that holds the Anthropic API key. The app never
          holds that key — a key shipped inside a mobile binary can be extracted and spent by anyone
          who downloads the app.
        </Body>

        {!isGatewayConfigured() ? (
          <Notice icon="construct-outline">
            No gateway is configured on this build. Run the server in `server/` and set
            EXPO_PUBLIC_AI_GATEWAY_URL, or set `expo.extra.aiGatewayUrl` in app.json.
          </Notice>
        ) : null}

        <Tertiary>
          Everything that does not need a model — the maintenance schedule, health scoring, cost
          forecasting, and record lookups in the assistant — runs entirely on this device and works
          with no gateway at all.
        </Tertiary>
      </Card>

      <Card>
        <SectionTitle title="Your data" />
        <Body>
          Your record is stored on this device. It is uploaded only when you send a photo to be
          identified or share a service request with a contractor.
        </Body>
        <Tertiary>
          There is no account and no sync. That means nothing leaves the phone — and equally, that a
          lost phone loses the record. Export it from the Home Record screen to keep a copy.
        </Tertiary>
        <Button label="Open Home Record" icon="ribbon-outline" variant="secondary" onPress={() => router.push('/record')} />
      </Card>

      <Card>
        <SectionTitle title="Sample data" />
        <Small>
          Replace what is on this device with the worked example — a 1998 coastal home with twelve
          years of history. Useful for seeing every screen filled in.
        </Small>
        <Button
          label="Load the sample home"
          variant="secondary"
          icon="albums-outline"
          onPress={() => void confirmLoadSample()}
        />
      </Card>

      <Card>
        <SectionTitle title="Danger zone" />
        <Button
          label="Erase this home record"
          variant="danger"
          icon="trash-outline"
          onPress={() => void confirmReset()}
        />
      </Card>

      <View style={{ gap: spacing.xs, marginTop: spacing.lg }}>
        <Tertiary>
          Lifespan and cost figures are population averages from published component life-expectancy
          data and typical installed pricing. They describe typical equipment, not yours, and are
          labelled as estimates everywhere they appear.
        </Tertiary>
        <Tertiary>
          Nothing in this app is a substitute for a licensed inspection. For anything involving gas,
          combustion, carbon monoxide, electrical work, or structure, get a qualified trade.
        </Tertiary>
      </View>
    </Screen>
  );
}
