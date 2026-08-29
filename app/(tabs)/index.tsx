import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { today } from '../../src/core/dates';
import { computeForecast } from '../../src/core/engine/forecast';
import { computeHomeHealth } from '../../src/core/engine/health';
import { generateTasks } from '../../src/core/engine/schedule';
import { formatApprox, formatMoney } from '../../src/core/money';
import { useHomeRecord } from '../../src/state/store';
import {
  Badge,
  Body,
  BodyStrong,
  Button,
  Card,
  Display,
  EmptyState,
  Faint,
  Heading,
  KeyValue,
  Meter,
  Muted,
  Notice,
  Row,
  Screen,
  SectionHeader,
  Title,
} from '../../src/ui/components';
import { healthTone, scoreTone, spacing, urgencyTone, useTheme } from '../../src/ui/theme';

export default function Dashboard() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const asOf = today();

  const derived = useMemo(() => {
    if (!record) return undefined;
    const tasks = generateTasks(record, { asOf });
    return {
      tasks,
      health: computeHomeHealth(record, { asOf, tasks }),
      forecast: computeForecast(record, { asOf }),
    };
  }, [record, asOf]);

  if (!record || !derived) {
    return (
      <Screen>
        <EmptyState
          icon="home-outline"
          title="No home yet"
          body="Set up your property to start building its record."
          action={<Button label="Get started" onPress={() => router.replace('/onboarding')} />}
        />
      </Screen>
    );
  }

  const { health, forecast, tasks } = derived;
  const overdue = tasks.filter((t) => t.urgency === 'overdue');
  const dueSoon = tasks.filter((t) => t.urgency === 'due_soon');
  const attention = [...overdue, ...dueSoon].slice(0, 3);
  const hasEquipment = record.components.length > 0;

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Faint>{record.home.addressLine1 ?? 'Your home'}</Faint>
        <Title>{record.home.nickname}</Title>
      </View>

      {!hasEquipment ? (
        <EmptyState
          icon="camera-outline"
          title="Build your record with your camera"
          body="Walk the house and photograph the equipment — the nameplate on the water heater, the label inside the panel, the sticker on the furnace. The app reads them and builds the inventory for you."
          action={<Button label="Scan My Home" icon="camera-outline" onPress={() => router.push('/scan')} />}
        />
      ) : (
        <Card>
          <Row justify="space-between" align="flex-start">
            <View style={{ gap: 2 }}>
              <Faint>HOME HEALTH</Faint>
              <Row gap={spacing.xs} align="flex-end">
                <Display style={{ color: scoreTone(theme, health.score) }}>{health.score}</Display>
                <Muted style={{ marginBottom: 7 }}>/ 100</Muted>
              </Row>
            </View>
            <Badge
              label={`${Math.round(health.dataConfidence * 100)}% documented`}
              fg={health.dataConfidence >= 0.7 ? theme.success : theme.textMuted}
              bg={health.dataConfidence >= 0.7 ? theme.successSoft : theme.surfaceAlt}
            />
          </Row>
          <Meter value={health.score} color={scoreTone(theme, health.score)} />
          <Body>{health.summary}</Body>

          <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
            {health.components.slice(0, 6).map((component) => {
              const tone = healthTone(theme, component.status);
              return (
                <Pressable
                  key={component.componentId}
                  onPress={() => router.push(`/component/${component.componentId}`)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Row justify="space-between" gap={spacing.md}>
                    <Row gap={spacing.sm} style={{ flex: 1 }}>
                      <Body>{tone.dot}</Body>
                      <BodyStrong numberOfLines={1} style={{ flex: 1 }}>
                        {component.name}
                      </BodyStrong>
                    </Row>
                    <Row gap={spacing.sm}>
                      <Muted style={{ color: tone.fg }}>{tone.label}</Muted>
                      <Ionicons name="chevron-forward" size={15} color={theme.textFaint} />
                    </Row>
                  </Row>
                </Pressable>
              );
            })}
          </View>

          {health.components.length > 6 ? (
            <Link href="/record" asChild>
              <Button label={`See all ${health.components.length} systems`} variant="ghost" onPress={() => {}} />
            </Link>
          ) : null}
        </Card>
      )}

      {overdue.length > 0 ? (
        <Notice tone="danger" icon="alert-circle-outline">
          {overdue.length} {overdue.length === 1 ? 'task is' : 'tasks are'} overdue
          {overdue.some((t) => t.criticality === 'safety')
            ? ', including a safety item. Those are the ones worth doing today.'
            : '.'}
        </Notice>
      ) : null}

      {attention.length > 0 ? (
        <>
          <SectionHeader
            title="Needs attention"
            action={
              <Pressable onPress={() => router.push('/(tabs)/maintenance')}>
                <Muted style={{ color: theme.accent }}>All tasks</Muted>
              </Pressable>
            }
          />
          {attention.map((task) => {
            const tone = urgencyTone(theme, task.urgency, task.criticality);
            return (
              <Card key={task.key} onPress={() => router.push(`/task/${encodeURIComponent(task.key)}`)}>
                <Row justify="space-between" align="flex-start" gap={spacing.md}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Row gap={spacing.sm}>
                      <Body>{tone.dot}</Body>
                      <BodyStrong style={{ flex: 1 }}>{task.title}</BodyStrong>
                    </Row>
                    {task.componentName ? <Muted>{task.componentName}</Muted> : null}
                  </View>
                  <Badge label={tone.label} fg={tone.fg} bg={tone.bg} />
                </Row>
              </Card>
            );
          })}
        </>
      ) : null}

      {hasEquipment ? (
        <Card onPress={() => router.push('/(tabs)/money')}>
          <SectionHeader title="What's coming" />
          <KeyValue label="Next 12 months" value={formatApprox(forecast.horizons.oneYear.totalCents)} />
          <KeyValue label="Next 5 years" value={formatApprox(forecast.horizons.fiveYear.totalCents)} />
          <KeyValue
            label="Suggested reserve"
            value={`${formatMoney(forecast.suggestedMonthlyReserveCents)} / month`}
          />
          <Faint>
            Projected from equipment age and typical service life. Planning figures, not quotes.
          </Faint>
        </Card>
      ) : null}

      <SectionHeader title="Do something" />
      <Row wrap gap={spacing.sm}>
        <Button label="Scan equipment" icon="camera-outline" onPress={() => router.push('/scan')} />
        <Button
          label="Something's wrong"
          icon="warning-outline"
          variant="secondary"
          onPress={() => router.push('/problem')}
        />
        <Button
          label="Add a document"
          icon="document-attach-outline"
          variant="secondary"
          onPress={() => router.push('/document')}
        />
        <Button
          label="Home Record"
          icon="ribbon-outline"
          variant="secondary"
          onPress={() => router.push('/record')}
        />
        <Button
          label="Settings"
          icon="settings-outline"
          variant="ghost"
          onPress={() => router.push('/settings')}
        />
      </Row>

      {health.unknownComponentIds.length > 0 ? (
        <Notice icon="help-circle-outline">
          {health.unknownComponentIds.length}{' '}
          {health.unknownComponentIds.length === 1 ? 'item has' : 'items have'} no age on record, so
          they are excluded from the condition estimate. Photographing a nameplate or adding an
          install date will bring them in.
        </Notice>
      ) : null}

      <Heading>How the score is built</Heading>
      <Muted>
        Each system is scored on how much of its typical service life has been used, adjusted for
        overdue maintenance and documented service. Systems are weighted by consequence, not price —
        a roof matters more than a microwave. Tap any system to see exactly why it got the status it
        did, with each reason marked as a documented fact or an estimate.
      </Muted>
    </Screen>
  );
}
