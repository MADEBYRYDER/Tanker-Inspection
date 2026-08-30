import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { daysBetween, formatDate, today } from '../../src/core/dates';
import { generateTasks } from '../../src/core/engine/schedule';
import { SEASON_LABEL, seasonalPlan } from '../../src/core/engine/seasonal';
import { formatMoney } from '../../src/core/money';
import type { ScheduledTask } from '../../src/core/types';
import { usePlan } from '../../src/state/plan';
import { useHomeRecord } from '../../src/state/store';
import {
  Button,
  Card,
  Chip,
  DiyHire,
  Divider,
  EmptyState,
  Label,
  Row,
  Screen,
  Small,
  StatusPill,
  Tertiary,
  Title,
  BodyStrong,
} from '../../src/ui/components';
import { PlusMark, PlusRowLock } from '../../src/ui/plus';
import { spacing, urgencyStatus, useTheme } from '../../src/ui/theme';

type Filter = 'all' | 'diy' | 'pro';

/**
 * Tasks.
 *
 * A task manager, not a calendar. People do not plan home maintenance by month —
 * they ask what needs doing now, this week, and roughly soon. So the buckets are
 * horizon-based, and every row carries the two ways out of it.
 */
export default function Tasks() {
  const router = useRouter();
  const record = useHomeRecord();
  const { can } = usePlan();
  const palette = useTheme();
  const asOf = today();
  const [filter, setFilter] = useState<Filter>('all');

  const tasks = useMemo(() => (record ? generateTasks(record, { asOf }) : []), [record, asOf]);

  const filtered = useMemo(() => {
    if (filter === 'diy') return tasks.filter((t) => !t.diy.proOnlyReason);
    if (filter === 'pro') return tasks.filter((t) => Boolean(t.diy.proOnlyReason));
    return tasks;
  }, [tasks, filter]);

  const buckets = useMemo(() => bucketTasks(filtered, asOf), [filtered, asOf]);
  const plan = useMemo(
    () => (record ? seasonalPlan(record, { personalised: can('seasonal_personalized'), asOf }) : undefined),
    [record, can, asOf],
  );
  const overdueCount = tasks.filter((t) => t.urgency === 'overdue').length;
  const neverLogged = tasks.filter((t) => !t.lastCompletedOn).length;

  if (!record || record.components.length === 0) {
    return (
      <Screen>
        <Title>Tasks</Title>
        <EmptyState
          icon="checkmark-circle-outline"
          title="Your calendar builds itself"
          body="Once there is equipment in your record, the app schedules only the maintenance that actually applies to it — nothing generic, nothing for equipment you don't have."
          action={<Button label="Scan My Home" icon="scan-outline" onPress={() => router.push('/scan/guided')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen gap={spacing.lg}>
      <View style={{ gap: 4, marginTop: spacing.sm }}>
        <Title>Tasks</Title>
        <Small>
          {tasks.length} recurring {tasks.length === 1 ? 'task' : 'tasks'}
          {overdueCount > 0 ? ` · ${overdueCount} overdue` : ' · nothing overdue'}
        </Small>
      </View>

      <Row gap={spacing.sm}>
        <Chip label="Everything" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="I can do it" selected={filter === 'diy'} onPress={() => setFilter('diy')} />
        <Chip label="Needs a pro" selected={filter === 'pro'} onPress={() => setFilter('pro')} />
      </Row>

      {/* The season, as a lens on the same schedule rather than a second list. */}
      {filter === 'all' && plan ? (
        <Card raised={1}>
          <Row justify="space-between">
            <Label>{`${SEASON_LABEL[plan.season]} plan`}</Label>
            {!plan.personalised ? <PlusMark /> : null}
          </Row>
          {plan.note ? <Tertiary>{plan.note}</Tertiary> : null}
          {plan.items.slice(0, 5).map((item, index) => (
            <Row key={index} gap={spacing.sm} align="flex-start">
              <Ionicons
                name={item.because ? 'location-outline' : 'ellipse-outline'}
                size={14}
                color={palette.textTertiary}
                style={{ marginTop: 3 }}
              />
              <View style={{ flex: 1 }}>
                <Small>{item.title}</Small>
                {item.componentName ? <Tertiary>{item.componentName}</Tertiary> : null}
                {item.because ? <Tertiary>{item.because}</Tertiary> : null}
              </View>
            </Row>
          ))}
          {!plan.personalised ? (
            <PlusRowLock label="Dwella+ builds this from your own systems, what is actually due, and your climate." />
          ) : null}
        </Card>
      ) : null}

      {neverLogged > 0 && filter === 'all' ? (
        <Tertiary>
          {neverLogged} of these have never been logged, so they show as due by default. Mark anything
          you have already done and the schedule corrects itself from that date.
        </Tertiary>
      ) : null}

      {buckets.map((bucket) =>
        bucket.tasks.length === 0 ? null : (
          <View key={bucket.label} style={{ gap: spacing.md }}>
            <Label>{bucket.label}</Label>
            <Card padding={spacing.lg}>
              {bucket.tasks.map((task, index) => (
                <View key={task.key} style={{ gap: spacing.md }}>
                  {index > 0 ? <Divider /> : null}
                  <TaskRow task={task} asOf={asOf} />
                </View>
              ))}
            </Card>
          </View>
        ),
      )}

      {buckets.every((b) => b.tasks.length === 0) ? (
        <EmptyState icon="checkmark-done-outline" title="Nothing here" body="No tasks match this filter." />
      ) : null}
    </Screen>
  );
}

function TaskRow({ task, asOf }: { task: ScheduledTask; asOf: string }) {
  const theme = useTheme();
  const router = useRouter();
  const status = urgencyStatus(task.urgency, task.criticality);
  const proOnly = Boolean(task.diy.proOnlyReason);
  const open = () => router.push(`/task/${encodeURIComponent(task.key)}`);

  const cost = proOnly
    ? `${formatMoney(task.hireCostRangeCents[0])}–${formatMoney(task.hireCostRangeCents[1])}`
    : `${task.diy.estimatedMinutes} min`;

  return (
    <View style={{ gap: spacing.md, paddingVertical: 2 }}>
      <Row justify="space-between" align="flex-start" gap={spacing.md}>
        <Row gap={spacing.md} style={{ flex: 1 }} align="flex-start">
          <Ionicons
            name="square-outline"
            size={21}
            color={theme.textTertiary}
            style={{ marginTop: 1 }}
            onPress={open}
          />
          <View style={{ flex: 1, gap: 3 }}>
            <BodyStrong>{task.title}</BodyStrong>
            <Small numberOfLines={1}>
              {task.componentName ? `${task.componentName} · ` : ''}
              {cost}
              {proOnly ? ' hired' : ''}
            </Small>
            <Tertiary>{formatDate(task.dueDate)}</Tertiary>
          </View>
        </Row>
        {task.urgency === 'overdue' || status.key === 'urgent' ? (
          <StatusPill status={status.key} label={status.label} />
        ) : null}
      </Row>

      <Row justify="space-between">
        <DiyHire
          diyLabel={proOnly ? 'Guide' : 'DIY'}
          onDiy={open}
          onHire={() =>
            router.push({
              pathname: '/service/new',
              params: { componentId: task.componentId ?? '', taskKey: task.key, title: task.title },
            })
          }
        />
        {proOnly ? <Tertiary>Professional recommended</Tertiary> : null}
      </Row>
    </View>
  );
}

interface Bucket {
  label: string;
  tasks: ScheduledTask[];
}

/**
 * Horizon buckets rather than calendar months.
 *
 * "Today" and "This week" are what a person acts on; anything past that is planning,
 * and finer granularity there is false precision about a schedule that shifts every
 * time a task is logged.
 */
export function bucketTasks(tasks: ScheduledTask[], asOf: string): Bucket[] {
  const buckets: Bucket[] = [
    { label: 'Overdue', tasks: [] },
    { label: 'Today', tasks: [] },
    { label: 'This week', tasks: [] },
    { label: 'This month', tasks: [] },
    { label: 'Later', tasks: [] },
  ];

  for (const task of tasks) {
    const days = daysBetween(asOf, task.dueDate);
    if (days < 0) buckets[0]!.tasks.push(task);
    else if (days === 0) buckets[1]!.tasks.push(task);
    else if (days <= 7) buckets[2]!.tasks.push(task);
    else if (days <= 31) buckets[3]!.tasks.push(task);
    else buckets[4]!.tasks.push(task);
  }

  return buckets;
}
