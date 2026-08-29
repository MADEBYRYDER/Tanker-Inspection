import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { gatewayHealth, isGatewayConfigured } from '../src/ai/client';
import { buildSampleRecord } from '../src/data/sampleHome';
import { useHomeRecord, useStore } from '../src/state/store';
import {
  Badge,
  Body,
  BodyStrong,
  Button,
  Card,
  Faint,
  Heading,
  KeyValue,
  Muted,
  Notice,
  Row,
  Screen,
  SectionHeader,
  Title,
} from '../src/ui/components';
import { spacing, useTheme } from '../src/ui/theme';

export default function Settings() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const reset = useStore((s) => s.resetEverything);
  const loadRecord = useStore((s) => s.loadRecord);

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

  const confirmReset = () => {
    Alert.alert(
      'Erase this home record?',
      'Every piece of equipment, every timeline entry, and every document reference on this device will be deleted. This cannot be undone.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Erase',
          style: 'destructive',
          onPress: () => {
            reset();
            router.replace('/onboarding');
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Title>Settings</Title>

      {record ? (
        <Card>
          <SectionHeader title="This home" />
          <KeyValue label="Name" value={record.home.nickname} />
          {record.home.addressLine1 ? <KeyValue label="Address" value={record.home.addressLine1} /> : null}
          {record.home.yearBuilt ? <KeyValue label="Built" value={String(record.home.yearBuilt)} /> : null}
          {record.home.squareFeet ? <KeyValue label="Size" value={`${record.home.squareFeet.toLocaleString('en-US')} sq ft`} /> : null}
          <KeyValue label="Climate" value={record.home.climate.replace(/_/g, ' ')} />
          <KeyValue label="Equipment on record" value={String(record.components.length)} />
          <KeyValue label="Timeline entries" value={String(record.events.length)} />
        </Card>
      ) : null}

      <Card>
        <SectionHeader title="AI gateway" />
        <Row justify="space-between">
          <BodyStrong>Status</BodyStrong>
          <Badge
            label={health === undefined ? 'checking' : health.ok ? 'connected' : 'not connected'}
            fg={health?.ok ? theme.success : theme.textMuted}
            bg={health?.ok ? theme.successSoft : theme.surfaceAlt}
          />
        </Row>
        {health?.model ? <KeyValue label="Model" value={health.model} /> : null}
        {health && !health.ok ? <Faint>{health.detail}</Faint> : null}

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

        <Faint>
          Everything that does not need a model — the maintenance schedule, health scoring, cost
          forecasting, and record lookups in the assistant — runs entirely on this device and works
          with no gateway at all.
        </Faint>
      </Card>

      <Card>
        <SectionHeader title="Your data" />
        <Body>
          Your record is stored on this device. It is uploaded only when you send a photo to be
          identified or share a service request with a contractor.
        </Body>
        <Faint>
          There is no account and no sync. That means nothing leaves the phone — and equally, that a
          lost phone loses the record. Export it from the Home Record screen to keep a copy.
        </Faint>
        <Button label="Open Home Record" icon="ribbon-outline" variant="secondary" onPress={() => router.push('/record')} />
      </Card>

      <Card>
        <SectionHeader title="Sample data" />
        <Muted>
          Replace what is on this device with the worked example — a 1998 coastal home with twelve
          years of history. Useful for seeing every screen filled in.
        </Muted>
        <Button
          label="Load the sample home"
          variant="secondary"
          icon="albums-outline"
          onPress={() =>
            Alert.alert('Replace your record?', 'This overwrites the record on this device with sample data.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Load sample',
                onPress: () => {
                  const { record: sample, media } = buildSampleRecord();
                  loadRecord(sample, media);
                  router.replace('/(tabs)');
                },
              },
            ])
          }
        />
      </Card>

      <Card>
        <SectionHeader title="Danger zone" />
        <Button label="Erase this home record" variant="danger" icon="trash-outline" onPress={confirmReset} />
      </Card>

      <View style={{ gap: spacing.xs, marginTop: spacing.lg }}>
        <Faint>
          Lifespan and cost figures are population averages from published component life-expectancy
          data and typical installed pricing. They describe typical equipment, not yours, and are
          labelled as estimates everywhere they appear.
        </Faint>
        <Faint>
          Nothing in this app is a substitute for a licensed inspection. For anything involving gas,
          combustion, carbon monoxide, electrical work, or structure, get a qualified trade.
        </Faint>
      </View>
    </Screen>
  );
}
