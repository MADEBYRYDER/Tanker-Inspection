import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { today, yearOf } from '../src/core/dates';
import { computeForecast, likelyReplacements } from '../src/core/engine/forecast';
import { BUCKET_LABEL, comparisonNote, spendingReport } from '../src/core/engine/spending';
import { spendForYear, summarizeSpend } from '../src/core/engine/timeline';
import { formatApprox, formatMoney } from '../src/core/money';
import type { ForecastHorizon } from '../src/core/types';
import { usePlan } from '../src/state/plan';
import { useHomeRecord } from '../src/state/store';
import {
  Badge,
  Body,
  BodyStrong,
  Button,
  Card,
  Chip,
  Display,
  Divider,
  EmptyState,
  Enter,
  Heading,
  KeyValue,
  Meter,
  Notice,
  Row,
  Screen,
  SectionTitle,
  Small,
  Tertiary,
  Title,
} from '../src/ui/components';
import { Touchable } from '../src/ui/motion';
import { PlusGate } from '../src/ui/plus';
import { CATEGORY_LABEL, spacing, tabular, type, useTheme } from '../src/ui/theme';

type Mode = 'mixed' | 'hire';

/**
 * Money.
 *
 * Two halves with a deliberate split down the middle. What has been spent is
 * free, forever — it is the owner's own history and charging to read it back
 * would be indefensible. What is *coming* is Dwella+: the projection, the
 * replacement windows, the reserve figure, and the year-over-year read.
 *
 * That line is not arbitrary. Looking backwards is bookkeeping and the record
 * already contains it. Looking forwards is the work — probability-weighted
 * failure curves over catalogued service lives — and it is the thing a
 * homeowner cannot do for themselves with a shoebox of receipts.
 */
export default function Money() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const { can } = usePlan();
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
  const report = useMemo(() => (record ? spendingReport(record, asOf) : undefined), [record, asOf]);

  if (!record || !forecast || !spend || !thisYear || !report) {
    return <Screen><Small>Set up your home first.</Small></Screen>;
  }

  if (record.components.length === 0) {
    return (
      <Screen>
        <Title>Money</Title>
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
  const replacements = likelyReplacements(forecast);

  return (
    <Screen>
      <Title>Money</Title>

      {/* ---------------- Looking forward: Dwella+ ---------------- */}

      {can('forecast') ? (
        <>
          <Enter>
            <Card raised={2}>
              <Tertiary>SUGGESTED MONTHLY RESERVE</Tertiary>
              <Row align="flex-end" gap={spacing.xs}>
                <Display style={{ color: theme.blue }}>
                  {formatMoney(forecast.suggestedMonthlyReserveCents)}
                </Display>
                <Small style={{ marginBottom: 7 }}>/ month</Small>
              </Row>
              <Body>
                Set this aside and the five-year projection below is already covered when it
                arrives. The point is to have the money there when a water heater goes — not to
                discover the gap in the month it happens.
              </Body>
            </Card>
          </Enter>

          <Enter index={1}>
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
          </Enter>

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
            Replacement costs are weighted by probability rather than assumed. A 13-year-old
            condenser does not cost you $8,500 next year — it carries roughly a 48% chance of
            needing replacement in that window, so the projection charges about half. That is what
            keeps the monthly reserve stable instead of swinging between $0 and a full replacement.
          </Notice>
        </>
      ) : (
        <Enter>
          <PlusGate
            icon="trending-up-outline"
            title="Home Forecast"
            promise={
              replacements.length > 0
                ? `Dwella has enough on this house to project the next five years. ${
                    replacements.length === 1 ? 'One system is' : `${replacements.length} systems are`
                  } likely to need replacing in that window — Dwella+ tells you which, roughly when, what each costs, and what to set aside every month so it is already covered.`
                : 'What this house will cost to keep running over the next one, three, and five years — priced from your own equipment and its actual age, with a monthly reserve figure.'
            }
          />
        </Enter>
      )}

      {/* ---------------- Looking back: free for everyone ---------------- */}

      <SectionTitle title="What you have actually spent" />

      <Enter index={2}>
        <Card>
          <Row justify="space-between" align="flex-end">
            <View style={{ gap: 2 }}>
              <Tertiary>{report.current.year} SO FAR</Tertiary>
              <Text style={[type.display, { color: theme.text }, tabular]}>
                {formatMoney(report.current.totalCents)}
              </Text>
            </View>
            {can('cost_insights') && report.changePercent !== undefined ? (
              <Badge
                label={`${report.changePercent > 0 ? '↑' : report.changePercent < 0 ? '↓' : ''} ${Math.abs(report.changePercent)}% vs ${report.previous?.year}`}
                fg={report.changePercent > 0 ? theme.amber : theme.sage}
                bg={report.changePercent > 0 ? theme.amberSoft : theme.sageSoft}
              />
            ) : null}
          </Row>

          {can('cost_insights') ? <Small>{comparisonNote(report)}</Small> : null}

          <Divider />

          {report.current.buckets.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {report.current.buckets.map((bucket) => (
                <View key={bucket.bucket} style={{ gap: 4 }}>
                  <Row justify="space-between">
                    <Small>{BUCKET_LABEL[bucket.bucket]}</Small>
                    <Small>{formatMoney(bucket.totalCents)}</Small>
                  </Row>
                  <Meter
                    value={(bucket.totalCents / Math.max(report.current.totalCents, 1)) * 100}
                    color={theme.blue}
                  />
                </View>
              ))}
            </View>
          ) : (
            <Small>Nothing with a recorded amount this year yet.</Small>
          )}

          <KeyValue label="All time on record" value={formatMoney(spend.totalCents)} />
          <Tertiary>
            Only entries with a recorded amount are counted.
            {report.current.undocumentedEventCount > 0
              ? ` ${report.current.undocumentedEventCount} ${report.current.undocumentedEventCount === 1 ? 'entry' : 'entries'} this year ${report.current.undocumentedEventCount === 1 ? 'has' : 'have'} no cost on them, so ${report.current.undocumentedEventCount === 1 ? 'it is' : 'they are'} in your timeline but not this total.`
              : ''}
          </Tertiary>
        </Card>
      </Enter>

      {/* Spending insights — the part that turns a total into an answer. */}
      {can('cost_insights') ? (
        <>
          {report.byComponent.length > 0 ? (
            <Enter index={3}>
              <Card>
                <SectionTitle title="What each thing has cost you" />
                <Tertiary>Everything recorded against that item, all time.</Tertiary>
                {report.byComponent.slice(0, 8).map((entry, index) => (
                  <View key={entry.componentId} style={{ gap: spacing.sm }}>
                    {index > 0 ? <Divider /> : null}
                    <Touchable onPress={() => router.push(`/component/${entry.componentId}`)} scaleTo={0.99}>
                      <Row justify="space-between" gap={spacing.md}>
                        <View style={{ flex: 1 }}>
                          <BodyStrong>{entry.name}</BodyStrong>
                          <Tertiary>
                            {entry.eventCount} {entry.eventCount === 1 ? 'entry' : 'entries'}
                          </Tertiary>
                        </View>
                        <Text style={[type.bodyStrong, { color: theme.text }, tabular]}>
                          {formatMoney(entry.totalCents)}
                        </Text>
                      </Row>
                    </Touchable>
                  </View>
                ))}
              </Card>
            </Enter>
          ) : null}

          {report.history.length > 1 ? (
            <Enter index={4}>
              <Card>
                <SectionTitle title="Year by year" />
                {report.history.map((year) => (
                  <View key={year.year} style={{ gap: 4 }}>
                    <Row justify="space-between">
                      <Small>
                        {year.year}
                        {year.year === report.current.year && !report.currentYearComplete
                          ? ' (so far)'
                          : ''}
                      </Small>
                      <Small>{formatMoney(year.totalCents)}</Small>
                    </Row>
                    <Meter
                      value={
                        (year.totalCents /
                          Math.max(...report.history.map((h) => h.totalCents), 1)) *
                        100
                      }
                      color={year.year === report.current.year ? theme.blue : theme.textTertiary}
                    />
                  </View>
                ))}
              </Card>
            </Enter>
          ) : null}

          <Enter index={5}>
            <Card>
              <SectionTitle title="Ask about your spending" />
              <Row wrap gap={spacing.xs}>
                {[
                  'How much have I spent on the HVAC?',
                  'What has been my most expensive item?',
                  'How much should I budget next year?',
                  'How much did repairs cost me last year?',
                ].map((question) => (
                  <Chip
                    key={question}
                    label={question}
                    onPress={() => router.push(`/assistant?seed=${encodeURIComponent(question)}`)}
                  />
                ))}
              </Row>
            </Card>
          </Enter>
        </>
      ) : (
        <Enter index={3}>
          <PlusGate
            icon="stats-chart-outline"
            title="Spending insights"
            promise={
              report.previous
                ? `You have ${report.current.year} and ${report.previous.year} on record. Dwella+ compares them, breaks the total down by item, and answers questions like "how much has this HVAC actually cost me?"`
                : 'Year-over-year trends, what each piece of equipment has cost you all told, and a straight answer to what you should budget for next year.'
            }
          />
        </Enter>
      )}

      {can('forecast') ? (
        <Card>
          <Heading>How confident is this?</Heading>
          <Small>
            {Math.round(forecast.confidence * 100)}% of the equipment behind these numbers has a
            documented age. The rest is estimated from the age of the house and typical service
            life, and is marked as such on every line above. Adding install dates — or photographing
            a nameplate — moves an item from estimate to fact and tightens the whole forecast.
          </Small>
        </Card>
      ) : null}
    </Screen>
  );
}
