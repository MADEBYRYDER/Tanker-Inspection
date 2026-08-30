import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { gatewayHealth } from '../../src/ai/client';
import { today } from '../../src/core/dates';
import { computeForecast } from '../../src/core/engine/forecast';
import { summarizeSpend } from '../../src/core/engine/timeline';
import { formatMoney } from '../../src/core/money';
import { buildSampleRecord } from '../../src/data/sampleHome';
import { usePlan } from '../../src/state/plan';
import { useHomeRecord, useStore } from '../../src/state/store';
import {
  Badge,
  Body,
  Button,
  Card,
  Divider,
  Label,
  ListRow,
  Row,
  Screen,
  Small,
  Stat,
  Tertiary,
  Title,
} from '../../src/ui/components';
import { PlusMark } from '../../src/ui/plus';
import { radius, spacing, useTheme } from '../../src/ui/theme';

/**
 * Profile.
 *
 * The home's own identity, the ownership figures, and everything that is a setting
 * rather than a daily action. Keeping this off the four action tabs is the point —
 * the tab bar should only hold places you go to do something.
 */
export default function Profile() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const { can, isPlus, canStartTrial, trialDaysLeft } = usePlan();
  const reset = useStore((s) => s.resetEverything);
  const loadRecord = useStore((s) => s.loadRecord);
  const [gateway, setGateway] = useState<{ ok: boolean; model?: string; detail?: string }>();

  useEffect(() => {
    let cancelled = false;
    void gatewayHealth().then((result) => {
      if (!cancelled) setGateway(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const figures = useMemo(() => {
    if (!record) return undefined;
    return {
      forecast: computeForecast(record, { asOf: today() }),
      spend: summarizeSpend(record),
    };
  }, [record]);

  if (!record || !figures) return <Screen><Small>Set up your home first.</Small></Screen>;

  const confirmReset = () =>
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

  return (
    <Screen gap={spacing.xl}>
      {/* The property itself */}
      <Card raised={2}>
        <Row gap={spacing.lg}>
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: radius.md,
              backgroundColor: theme.surfaceSunken,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="home-outline" size={26} color={theme.textSecondary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Title>{record.home.nickname}</Title>
            <Small>
              {[record.home.addressLine1, record.home.city, record.home.state]
                .filter(Boolean)
                .join(', ') || 'No address recorded'}
            </Small>
            <Tertiary>
              {record.home.yearBuilt ? `Built ${record.home.yearBuilt}` : 'Build year not recorded'}
              {record.home.squareFeet ? ` · ${record.home.squareFeet.toLocaleString('en-US')} sq ft` : ''}
            </Tertiary>
          </View>
        </Row>
        <Divider />
        <Row>
          <Stat value={String(record.components.length)} label="Systems tracked" />
          <Stat value={String(record.events.length)} label="Recorded entries" />
          <Stat value={formatMoney(figures.spend.totalCents)} label="Documented spend" />
        </Row>
      </Card>

      {/* The plan, stated once and where someone would look for it. */}
      <Card
        onPress={() => router.push('/plus')}
        tone={isPlus ? undefined : theme.surfaceSunken}
        raised={isPlus ? 2 : 1}
      >
        <Row gap={spacing.md} justify="space-between">
          <View style={{ flex: 1, gap: 3 }}>
            <Row gap={spacing.sm}>
              <PlusMark />
              {trialDaysLeft !== undefined ? (
                <Badge
                  label={`trial · ${trialDaysLeft}d left`}
                  fg={theme.blue}
                  bg={theme.blueSoft}
                />
              ) : null}
            </Row>
            <Small>
              {isPlus
                ? 'Forecasting, warranty alerts, the full health breakdown, and unlimited questions are on.'
                : canStartTrial
                  ? 'Know what this house will need, when, and what to set aside for it. Free for 30 days.'
                  : 'Forecasting, warranty alerts, and the full health breakdown.'}
            </Small>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
        </Row>
      </Card>

      <View style={{ gap: spacing.md }}>
        <Label>Your home</Label>
        <Card padding={spacing.lg}>
          <ListRow
            icon="wallet-outline"
            title="Cost forecast"
            subtitle={
              can('forecast')
                ? `${formatMoney(figures.forecast.suggestedMonthlyReserveCents)}/month suggested reserve`
                : 'What you have spent, and what is coming'
            }
            onPress={() => router.push('/costs')}
          />
          <Divider inset={48} />
          <ListRow
            icon="pulse-outline"
            title="Home Health"
            subtitle="Every system, and why it scored what it did"
            onPress={() => router.push('/health')}
          />
          <Divider inset={48} />
          <ListRow
            icon="ribbon-outline"
            title="Home Record"
            subtitle="The document you hand a buyer, an agent, or an inspector"
            onPress={() => router.push('/record')}
          />
          <Divider inset={48} />
          <ListRow
            icon="sparkles-outline"
            title="Ask your home"
            subtitle="Questions answered from this house's own record"
            onPress={() => router.push('/assistant')}
          />
        </Card>
      </View>

      <View style={{ gap: spacing.md }}>
        <Label>App</Label>
        <Card padding={spacing.lg}>
          <ListRow
            icon={gateway?.ok ? 'cloud-done-outline' : 'cloud-offline-outline'}
            iconStatus={gateway?.ok ? 'good' : 'neutral'}
            title="AI features"
            subtitle={
              gateway === undefined
                ? 'Checking…'
                : gateway.ok
                  ? `Connected · ${gateway.model ?? 'ready'}`
                  : 'Not connected — everything else still works'
            }
            onPress={() => router.push('/settings')}
          />
          <Divider inset={48} />
          <ListRow
            icon="settings-outline"
            title="Settings"
            subtitle="Property details, data, and diagnostics"
            onPress={() => router.push('/settings')}
          />
        </Card>
      </View>

      <View style={{ gap: spacing.md }}>
        <Label>Data</Label>
        <Card>
          <Body>
            Your record is stored on this device. It is uploaded only when you send a photo to be
            read, or share a service request with a contractor.
          </Body>
          <Tertiary>
            There is no account and no sync — nothing leaves the phone, and equally, a lost phone
            loses the record. Export a copy from the Home Record screen.
          </Tertiary>
          <Row gap={spacing.sm} wrap>
            <Button
              label="Load sample home"
              variant="quiet"
              size="sm"
              onPress={() =>
                Alert.alert('Replace your record?', 'This overwrites what is on this device with sample data.', [
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
            <Button label="Erase everything" variant="danger" size="sm" onPress={confirmReset} />
          </Row>
        </Card>
      </View>

      <Tertiary>
        Lifespan and cost figures are population averages, adjusted for your climate and home size.
        They describe typical equipment, not yours, and are labelled as estimates wherever they
        appear. Nothing here replaces a licensed inspection.
      </Tertiary>
    </Screen>
  );
}
