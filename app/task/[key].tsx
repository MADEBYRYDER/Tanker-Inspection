import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { formatDate, relativeDayLabel, today } from '../../src/core/dates';
import { generateTasks } from '../../src/core/engine/schedule';
import { formatMoney, formatRange } from '../../src/core/money';
import { useHomeRecord, useStore } from '../../src/state/store';
import {
  Badge,
  Body,
  BodyStrong,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Faint,
  Field,
  Heading,
  KeyValue,
  Muted,
  Notice,
  Row,
  Screen,
  SectionHeader,
  Title,
} from '../../src/ui/components';
import { spacing, urgencyTone, useTheme } from '../../src/ui/theme';

type Path = 'diy' | 'hire';

/**
 * A single maintenance task, with both paths the product promises.
 *
 * Where a job is genuinely unsafe without a licensed trade, the DIY tab does not
 * offer a watered-down version of the instructions — it says why, and points at the
 * other path. Publishing half a heat-exchanger inspection would be worse than
 * publishing none.
 */
export default function TaskDetail() {
  const theme = useTheme();
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();
  const record = useHomeRecord();
  const completeTask = useStore((s) => s.completeTask);
  const asOf = today();

  const task = useMemo(() => {
    if (!record || !key) return undefined;
    return generateTasks(record, { asOf }).find((t) => t.key === decodeURIComponent(key));
  }, [record, key, asOf]);

  const [path, setPath] = useState<Path>('diy');
  const [logging, setLogging] = useState(false);
  const [cost, setCost] = useState('');
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');

  if (!task) {
    return (
      <Screen>
        <EmptyState icon="help-circle-outline" title="Task not found" body="This task is no longer on your schedule." />
      </Screen>
    );
  }

  const tone = urgencyTone(theme, task.urgency, task.criticality);
  const proOnly = Boolean(task.diy.proOnlyReason);
  const effectivePath: Path = proOnly && path === 'diy' ? 'diy' : path;

  const logComplete = (performedBy: 'diy' | 'pro') => {
    const parsed = Number(cost.replace(/[^0-9.]/g, ''));
    completeTask({
      task,
      completedOn: asOf,
      performedBy,
      costCents: cost && Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined,
      vendor: vendor.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    router.back();
  };

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Row gap={spacing.sm}>
          <Body>{tone.dot}</Body>
          <Badge label={tone.label} fg={tone.fg} bg={tone.bg} />
          {task.criticality === 'safety' ? (
            <Badge label="safety" fg={theme.danger} bg={theme.dangerSoft} />
          ) : null}
        </Row>
        <Title>{task.title}</Title>
        {task.componentName ? (
          <Muted>
            {task.componentName}
            {task.componentId ? '' : ''}
          </Muted>
        ) : (
          <Muted>Whole home</Muted>
        )}
        <Faint>
          Due {formatDate(task.dueDate)} · {relativeDayLabel(asOf, task.dueDate)}
          {task.lastCompletedOn ? ` · last done ${formatDate(task.lastCompletedOn)}` : ' · never logged'}
        </Faint>
      </View>

      <Card>
        <Heading>Why this matters</Heading>
        <Body>{task.why}</Body>
      </Card>

      <Row gap={spacing.sm}>
        <Chip label="Do it myself" selected={effectivePath === 'diy'} onPress={() => setPath('diy')} />
        <Chip label="Hire someone" selected={effectivePath === 'hire'} onPress={() => setPath('hire')} />
      </Row>

      {effectivePath === 'diy' ? (
        proOnly ? (
          <Card>
            <Notice tone="warning" icon="shield-outline">
              {task.diy.proOnlyReason}
            </Notice>
            {task.diy.steps.length > 0 ? (
              <>
                <Divider />
                <Heading>What you can safely do yourself</Heading>
                <Steps task={task} />
              </>
            ) : null}
            <Button label="Find someone to do it" icon="call-outline" onPress={() => setPath('hire')} />
          </Card>
        ) : (
          <Card>
            <Row gap={spacing.lg}>
              <View>
                <Faint>TIME</Faint>
                <BodyStrong>{task.diy.estimatedMinutes} min</BodyStrong>
              </View>
              <View>
                <Faint>DIFFICULTY</Faint>
                <BodyStrong style={{ textTransform: 'capitalize' }}>{task.diy.difficulty}</BodyStrong>
              </View>
              <View>
                <Faint>VS. HIRING</Faint>
                <BodyStrong>{formatRange(task.hireCostRangeCents)}</BodyStrong>
              </View>
            </Row>

            {task.diy.materials.length > 0 ? (
              <>
                <Divider />
                <Faint>MATERIALS</Faint>
                {task.diy.materials.map((m) => (
                  <Row key={m} gap={spacing.sm} align="flex-start">
                    <Ionicons name="cart-outline" size={15} color={theme.textMuted} style={{ marginTop: 2 }} />
                    <Body style={{ flex: 1 }}>{m}</Body>
                  </Row>
                ))}
              </>
            ) : null}

            {task.diy.tools.length > 0 ? (
              <>
                <Faint>TOOLS</Faint>
                <Row wrap gap={spacing.xs}>
                  {task.diy.tools.map((t) => (
                    <Chip key={t} label={t} />
                  ))}
                </Row>
              </>
            ) : null}

            <Divider />
            <Heading>Steps</Heading>
            <Steps task={task} />
          </Card>
        )
      ) : (
        <Card>
          <SectionHeader title="Hire it out" />
          <KeyValue label="Typical price" value={formatRange(task.hireCostRangeCents)} />
          <Body>
            The request goes out with the equipment already described — make, model, serial, age,
            warranty status, and the service history for this item. You do not explain it again.
          </Body>
          <Button
            label="Create service request"
            icon="paper-plane-outline"
            onPress={() =>
              router.push({
                pathname: '/service/new',
                params: { componentId: task.componentId ?? '', taskKey: task.key, title: task.title },
              })
            }
          />
        </Card>
      )}

      <SectionHeader title="Mark it done" />
      {logging ? (
        <Card>
          <Field label="What did it cost? (optional)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="189.00" />
          <Field label="Who did it? (optional)" value={vendor} onChangeText={setVendor} placeholder="Company name" />
          <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Anything worth remembering next time" />
          <Row gap={spacing.sm} wrap>
            <Button label="I did it myself" icon="hand-left-outline" onPress={() => logComplete('diy')} />
            <Button label="A pro did it" icon="briefcase-outline" variant="secondary" onPress={() => logComplete('pro')} />
          </Row>
          <Button label="Cancel" variant="ghost" onPress={() => setLogging(false)} />
        </Card>
      ) : (
        <Card>
          <Muted>
            Logging this moves the next due date to {task.lastCompletedOn ? 'today plus the interval' : 'the correct date'} and
            updates the health score and the forecast. If a cost or a company is entered, it also
            becomes a timeline entry.
          </Muted>
          <Button label="Mark complete" icon="checkmark-circle-outline" onPress={() => setLogging(true)} full />
        </Card>
      )}
    </Screen>
  );
}

function Steps({ task }: { task: { diy: { steps: { text: string; caution?: string }[] } } }) {
  const theme = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      {task.diy.steps.map((step, index) => (
        <View key={index} style={{ gap: spacing.xs }}>
          <Row gap={spacing.md} align="flex-start">
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: theme.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BodyStrong style={{ color: theme.accent, fontSize: 13 }}>{index + 1}</BodyStrong>
            </View>
            <Body style={{ flex: 1, lineHeight: 21 }}>{step.text}</Body>
          </Row>
          {step.caution ? (
            <View style={{ paddingLeft: 36 }}>
              <Notice tone="danger" icon="warning-outline">
                {step.caution}
              </Notice>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
