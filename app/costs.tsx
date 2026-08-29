import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { today, yearOf } from '../src/core/dates';
import { computeForecast } from '../src/core/engine/forecast';
import { spendForYear, summarizeSpend } from '../src/core/engine/timeline';
import { formatApprox, formatMoney } from '../src/core/money';
import type { ForecastHorizon } from '../src/core/types';
import { useHomeRecord } from '../src/state/store';
import {
  Badge,
  Body,
  BodyStrong,
  Button,
  Card,
  Chip,
  Display,
  EmptyState,
  Tertiary,
  Heading,
  KeyValue,
  Meter,
  Small,
  Notice,
  Row,
  Screen,
  SectionTitle,
  Title,
} from '../src/ui/components';
import { CATEGORY_LABEL, spacing, useTheme } from '../src/ui/theme';

type Mode = 'mixed' | 'hire';

export default function Money() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const asOf = today();
  const [mode, setMode] = useState<Mode>('mixed');
  const [horizon, setHorizon] = useState<1 | 3 | 5>(5);

  const forecast = useMemo(
    () => (record ? computeForecast(record, { asOf, maintenanceMode: mode }) : undefined),
    [record, asOf, mode],
  );
  const spend = useMemo(() => (record ? summarizeSpend(record) : undefined), [record]);
  const thisYear = useMemo(
    () => (record ? spendForYear(record, yearOf(asOf)) : undefined),
    [record, asOf],
  );

  if (!record || !forecast || !spend || !thisYear) {
    return <Screen><Small>Set up your home first.</Small></Screen>;
  }

  if (record.components.length === 0) {
    return (
      <Screen>
        <Title>Costs</Title>
        <EmptyState
          icon="wallet-outline"
          title="Forecasting needs equipment"
          body="Projections come from what you own and how old it is. Scan your equipment and the app can tell you what is likely coming and what to set aside for it."
          action={<Button label="Scan My Home" icon="camera-outline" onPress={() => router.push('/scan')} />}
        />
      </Screen>
    );
  }

  const selected: ForecastHorizon =
    horizon === 1
      ? forecast.horizons.oneYear
      : horizon === 3
        ? forecast.horizons.threeYear
        : forecast.horizons.fiveYear;

  const maxItem = Math.max(...selected.items.map((i) => i.expectedCents), 1);

  return (
    <Screen>
      <Title>Costs</Title>

      <Card>
        <Tertiary>SUGGESTED MONTHLY RESERVE</Tertiary>
        <Row align="flex-end" gap={spacing.xs}>
          <Display style={{ color: theme.blue }}>
            {formatMoney(forecast.suggestedMonthlyReserveCents)}
          </Display>
          <Small style={{ marginBottom: 7 }}>/ month</Small>
        </Row>
        <Body>
          Set this aside and the five-year projection below is already covered when it arrives. The
          point is to have the money there when a water heater goes — not to discover the gap in the
          month it happens.
        </Body>
      </Card>

      <Card>
        <SectionTitle title="Projected spending" />
        <KeyValue label="Next 12 months" value={formatApprox(forecast.horizons.oneYear.totalCents)} />
        <KeyValue label="Next 3 years" value={formatApprox(forecast.horizons.threeYear.totalCents)} />
        <KeyValue label="Next 5 years" value={formatApprox(forecast.horizons.fiveYear.totalCents)} />
        <Row gap={spacing.sm} wrap>
          <Chip label="I'll DIY what I can" selected={mode === 'mixed'} onPress={() => setMode('mixed')} />
          <Chip label="Hire everything out" selected={mode === 'hire'} onPress={() => setMode('hire')} />
        </Row>
        <Tertiary>
          {mode === 'mixed'
            ? 'Recurring tasks priced as DIY where that is safe, and at contractor rates where the job needs a licensed trade.'
            : 'Every recurring task priced at contractor rates.'}
        </Tertiary>
      </Card>

      <SectionTitle title="What makes up the number" />
      <Row gap={spacing.sm}>
        {([1, 3, 5] as const).map((h) => (
          <Chip key={h} label={`${h} year${h === 1 ? '' : 's'}`} selected={horizon === h} onPress={() => setHorizon(h)} />
        ))}
      </Row>

      {selected.items.length === 0 ? (
        <Card><Small>Nothing projected in this window.</Small></Card>
      ) : null}

      {selected.items.map((item, index) => (
        <Card
          key={`${item.label}-${index}`}
          onPress={item.componentId ? () => router.push(`/component/${item.componentId}`) : undefined}
        >
          <Row justify="space-between" align="flex-start" gap={spacing.md}>
            <View style={{ flex: 1, gap: 3 }}>
              <BodyStrong>{item.label}</BodyStrong>
              {item.kind === 'replacement' ? (
                <Tertiary>
                  {formatMoney(item.fullCostCents)} if it happens · {Math.round(item.probability * 100)}%
                  chance in {horizon} {horizon === 1 ? 'year' : 'years'}
                  {item.likelyYear ? ` · likely around ${item.likelyYear}` : ''}
                </Tertiary>
              ) : (
                <Tertiary>Recurring maintenance across {horizon} {horizon === 1 ? 'year' : 'years'}</Tertiary>
              )}
            </View>
            <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
              <BodyStrong>{formatMoney(item.expectedCents)}</BodyStrong>
              <Badge
                label={item.basis === 'fact' ? 'documented age' : 'estimated age'}
                fg={item.basis === 'fact' ? theme.sage : theme.textSecondary}
                bg={item.basis === 'fact' ? theme.sageSoft : theme.surfaceSunken}
              />
            </View>
          </Row>
          <Meter
            value={(item.expectedCents / maxItem) * 100}
            color={item.basis === 'fact' ? theme.blue : theme.textTertiary}
          />
          <Tertiary>{item.note}</Tertiary>
        </Card>
      ))}

      <Notice icon="calculator-outline">
        Replacement costs are weighted by probability rather than assumed. A 13-year-old condenser
        does not cost you $8,500 next year — it carries roughly a 48% chance of needing replacement
        in that window, so the projection charges about half. That is what keeps the monthly reserve
        stable instead of swinging between $0 and a full replacement.
      </Notice>

      <SectionTitle title="What you have actually spent" />
      <Card>
        <KeyValue label={`${yearOf(asOf)} so far`} value={formatMoney(thisYear.totalCents)} />
        <KeyValue label="All time on record" value={formatMoney(spend.totalCents)} />
        <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          {spend.byCategory.slice(0, 6).map((bucket) => (
            <View key={bucket.category} style={{ gap: 4 }}>
              <Row justify="space-between">
                <Small>{CATEGORY_LABEL[bucket.category] ?? 'Not linked to equipment'}</Small>
                <Small>{formatMoney(bucket.totalCents)}</Small>
              </Row>
              <Meter
                value={(bucket.totalCents / Math.max(spend.totalCents, 1)) * 100}
                color={theme.blue}
              />
            </View>
          ))}
        </View>
        <Tertiary>
          Only entries with a recorded amount are counted. Work logged without a cost is in your
          timeline but not in this total.
        </Tertiary>
      </Card>

      <Card>
        <Heading>How confident is this?</Heading>
        <Small>
          {Math.round(forecast.confidence * 100)}% of the equipment behind these numbers has a
          documented age. The rest is estimated from the age of the house and typical service life,
          and is marked as such on every line above. Adding install dates — or photographing a
          nameplate — moves an item from estimate to fact and tightens the whole forecast.
        </Small>
      </Card>
    </Screen>
  );
}
