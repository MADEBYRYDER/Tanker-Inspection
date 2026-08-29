import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { formatDate, relativeDayLabel, today } from '../../src/core/dates';
import { generateTasks, groupTasksByMonth } from '../../src/core/engine/schedule';
import { formatRange } from '../../src/core/money';
import type { ScheduledTask } from '../../src/core/types';
import { useHomeRecord } from '../../src/state/store';
import {
  Badge,
  Body,
  BodyStrong,
  Button,
  Card,
  Chip,
  EmptyState,
  Faint,
  Heading,
  Muted,
  Notice,
  Row,
  Screen,
  Title,
} from '../../src/ui/components';
import { spacing, urgencyTone, useTheme } from '../../src/ui/theme';

type Filter = 'all' | 'attention' | 'diy' | 'pro';

export default function Maintenance() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const asOf = today();
  const [filter, setFilter] = useState<Filter>('all');

  const tasks = useMemo(() => (record ? generateTasks(record, { asOf }) : []), [record, asOf]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'attention':
        return tasks.filter((t) => t.urgency === 'overdue' || t.urgency === 'due_soon');
      case 'diy':
        return tasks.filter((t) => !t.diy.proOnlyReason);
      case 'pro':
        return tasks.filter((t) => Boolean(t.diy.proOnlyReason));
      default:
        return tasks;
    }
  }, [tasks, filter]);

  const groups = useMemo(() => groupTasksByMonth(filtered, 12), [filtered]);
  const overdueCount = tasks.filter((t) => t.urgency === 'overdue').length;
  const neverLogged = tasks.filter((t) => !t.lastCompletedOn).length;

  if (!record || record.components.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="calendar-outline"
          title="Your calendar builds itself"
          body="Once there is equipment in your record, the app schedules the maintenance that actually applies to it — nothing generic, nothing for equipment you do not have."
          action={<Button label="Scan My Home" icon="camera-outline" onPress={() => router.push('/scan')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Title>Maintenance</Title>
        <Muted>
          {tasks.length} recurring {tasks.length === 1 ? 'task' : 'tasks'} for the equipment in your
          record{overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}
        </Muted>
      </View>

      <Row wrap gap={spacing.sm}>
        <Chip label="Everything" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Needs attention" selected={filter === 'attention'} onPress={() => setFilter('attention')} />
        <Chip label="I can do it" selected={filter === 'diy'} onPress={() => setFilter('diy')} />
        <Chip label="Needs a pro" selected={filter === 'pro'} onPress={() => setFilter('pro')} />
      </Row>

      {neverLogged > 0 && filter === 'all' ? (
        <Notice icon="information-circle-outline">
          {neverLogged} {neverLogged === 1 ? 'task has' : 'tasks have'} never been logged, so they show
          as due today by default. Mark anything you have already done and the schedule corrects
          itself from that date.
        </Notice>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title="Nothing here"
          body="No tasks match this filter."
        />
      ) : null}

      {groups.map((group) => (
        <View key={group.monthStart} style={{ gap: spacing.sm }}>
          <Heading>{group.label}</Heading>
          {group.tasks.map((task) => (
            <TaskRow key={task.key} task={task} asOf={asOf} onPress={() => router.push(`/task/${encodeURIComponent(task.key)}`)} />
          ))}
        </View>
      ))}

      <Card>
        <Heading>Two ways to do everything</Heading>
        <Muted>
          Every task opens with step-by-step instructions, the materials and tools it needs, and how
          long it takes — alongside what a contractor would charge for the same job. Where a job is
          genuinely unsafe without a licensed trade, the app says so and does not walk you through it.
        </Muted>
        <Row gap={spacing.sm}>
          <Ionicons name="shield-checkmark-outline" size={16} color={theme.accent} />
          <Faint style={{ flex: 1 }}>
            Safety items — combustion, gas, and detectors — are flagged in red even before they are
            late.
          </Faint>
        </Row>
      </Card>
    </Screen>
  );
}

function TaskRow({
  task,
  asOf,
  onPress,
}: {
  task: ScheduledTask;
  asOf: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const tone = urgencyTone(theme, task.urgency, task.criticality);
  return (
    <Card onPress={onPress}>
      <Row justify="space-between" align="flex-start" gap={spacing.md}>
        <View style={{ flex: 1, gap: 3 }}>
          <Row gap={spacing.sm}>
            <Body>{tone.dot}</Body>
            <BodyStrong style={{ flex: 1 }}>{task.title}</BodyStrong>
          </Row>
          {task.componentName ? <Muted>{task.componentName}</Muted> : null}
          <Faint>
            {formatDate(task.dueDate)} · {relativeDayLabel(asOf, task.dueDate)}
            {task.lastCompletedOn ? ` · last done ${formatDate(task.lastCompletedOn)}` : ' · never logged'}
          </Faint>
        </View>
        <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
          <Badge label={tone.label} fg={tone.fg} bg={tone.bg} />
          <Faint>
            {task.diy.proOnlyReason ? 'Pro only' : `DIY ${task.diy.estimatedMinutes} min`}
          </Faint>
          <Faint>{formatRange(task.hireCostRangeCents)} hired</Faint>
        </View>
      </Row>
    </Card>
  );
}
