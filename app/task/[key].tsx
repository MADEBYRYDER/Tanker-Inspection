import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { formatDate, relativeDayLabel, today } from '../../src/core/dates';
import { generateTasks } from '../../src/core/engine/schedule';
import { formatMoney } from '../../src/core/money';
import { personalDiyNotes, personalNotesSummary } from '../../src/core/engine/diyPersonal';
import { usePlan } from '../../src/state/plan';
import { useHomeRecord, useStore } from '../../src/state/store';
import {
  Body,
  BodyStrong,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Field,
  Heading,
  Label,
  Notice,
  Row,
  Screen,
  Small,
  Stat,
  StatusPill,
  StickyBar,
  Tertiary,
  Title,
} from '../../src/ui/components';
import { PlusRowLock } from '../../src/ui/plus';
import { radius, spacing, urgencyStatus, useTheme } from '../../src/ui/theme';

type Path = 'diy' | 'hire';

/**
 * One task, both ways out of it.
 *
 * Where a job genuinely needs a licensed trade, the DIY tab does not offer a
 * watered-down version of the instructions — it says why, and hands over to the
 * other path. Publishing half a heat-exchanger inspection would be worse than
 * publishing none.
 */
export default function TaskDetail() {
  const theme = useTheme();
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();
  const record = useHomeRecord();
  const completeTask = useStore((s) => s.completeTask);
  const { can } = usePlan();
  const asOf = today();

  const task = useMemo(() => {
    if (!record || !key) return undefined;
    return generateTasks(record, { asOf }).find((t) => t.key === decodeURIComponent(key));
  }, [record, key, asOf]);

  /*
   * Computed for both plans: the free lock has to name what it is withholding,
   * and deriving that from the same list the paid view renders is the only way
   * the two cannot disagree.
   */
  const personalNotes = useMemo(() => {
    if (!record || !task) return [];
    const component = task.componentId
      ? record.components.find((c) => c.id === task.componentId)
      : undefined;
    return personalDiyNotes({ record, task, component, asOf });
  }, [record, task, asOf]);
  const personalNotesText = personalNotesSummary(personalNotes);

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

  const status = urgencyStatus(task.urgency, task.criticality);
  const proOnly = Boolean(task.diy.proOnlyReason);

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
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Screen gap={spacing.xl}>
        <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
          <Row gap={spacing.sm}>
            <StatusPill status={status.key} label={status.label} />
            {task.criticality === 'safety' ? (
              <StatusPill status="urgent" label="Safety" icon="shield-outline" />
            ) : null}
          </Row>
          <Title>{task.title}</Title>
          <Small>
            {task.componentName ?? 'Whole home'} · due {formatDate(task.dueDate)} (
            {relativeDayLabel(asOf, task.dueDate)})
          </Small>
        </View>

        <Card>
          <Row>
            <Stat
              value={proOnly ? '—' : `${task.diy.estimatedMinutes} min`}
              label={proOnly ? 'Not a DIY job' : 'If you do it'}
            />
            <Stat
              value={`${formatMoney(task.hireCostRangeCents[0])}+`}
              label={`Hired, up to ${formatMoney(task.hireCostRangeCents[1])}`}
            />
            <Stat
              value={task.lastCompletedOn ? formatDate(task.lastCompletedOn).replace(/, \d{4}$/, '') : 'Never'}
              label={task.lastCompletedOn ? `Last done ${task.lastCompletedOn.slice(0, 4)}` : 'Not yet logged'}
            />
          </Row>
        </Card>

        <Card>
          <Label>Why this matters</Label>
          <Body>{task.why}</Body>
        </Card>

        <Row gap={spacing.sm}>
          <Chip label="Do it myself" selected={path === 'diy'} onPress={() => setPath('diy')} />
          <Chip label="Hire someone" selected={path === 'hire'} onPress={() => setPath('hire')} />
        </Row>

        {path === 'diy' ? (
          proOnly ? (
            <Card>
              <Notice tone="attention" icon="shield-outline">
                {task.diy.proOnlyReason}
              </Notice>
              {task.diy.steps.length > 0 ? (
                <>
                  <Divider />
                  <Label>What you can safely do yourself</Label>
                  <Steps steps={task.diy.steps} />
                </>
              ) : null}
              <Button label="Find someone to do it" icon="call-outline" onPress={() => setPath('hire')} />
            </Card>
          ) : (
            <Card>
              {task.diy.materials.length > 0 ? (
                <>
                  <Label>What you need</Label>
                  {task.diy.materials.map((material) => (
                    <Row key={material} gap={spacing.sm} align="flex-start">
                      <Ionicons name="cart-outline" size={15} color={theme.textSecondary} style={{ marginTop: 3 }} />
                      <Body style={{ flex: 1 }}>{material}</Body>
                    </Row>
                  ))}
                </>
              ) : null}

              {task.diy.tools.length > 0 ? (
                <Row wrap gap={spacing.xs}>
                  {task.diy.tools.map((tool) => (
                    <Chip key={tool} label={tool} />
                  ))}
                </Row>
              ) : null}

              <Divider />
              <Label>Steps</Label>
              <Steps steps={task.diy.steps} />

              {/* Personalised to this unit. Safety guidance is never in here —
                  proOnlyReason and every hazard warning show on both plans. */}
              {can('diy_personalized') ? (
                personalNotes.length > 0 ? (
                  <>
                    <Divider />
                    <Label>For your {task.componentName ?? 'equipment'}</Label>
                    {personalNotes.map((note, index) => (
                      <Row key={index} gap={spacing.sm} align="flex-start">
                        <Ionicons
                          name={
                            note.kind === 'warranty'
                              ? 'shield-checkmark-outline'
                              : note.kind === 'history'
                                ? 'time-outline'
                                : note.kind === 'age'
                                  ? 'hourglass-outline'
                                  : 'pricetag-outline'
                          }
                          size={15}
                          color={note.basis === 'fact' ? theme.sage : theme.textTertiary}
                          style={{ marginTop: 3 }}
                        />
                        <Body style={{ flex: 1 }}>{note.text}</Body>
                      </Row>
                    ))}
                  </>
                ) : null
              ) : personalNotesText ? (
                <>
                  <Divider />
                  <PlusRowLock label={`Dwella+ adds ${personalNotesText}.`} />
                </>
              ) : null}
            </Card>
          )
        ) : (
          <Card>
            <Label>Hire it out</Label>
            <Body>
              The request goes out with the equipment already described — make, model, serial, age,
              warranty status, and this item's service history. You don't explain it again.
            </Body>
            <Row justify="space-between">
              <Small>Typical price</Small>
              <BodyStrong>
                {formatMoney(task.hireCostRangeCents[0])}–{formatMoney(task.hireCostRangeCents[1])}
              </BodyStrong>
            </Row>
            <Button
              label="Create service request"
              icon="paper-plane-outline"
              full
              onPress={() =>
                router.push({
                  pathname: '/service/new',
                  params: { componentId: task.componentId ?? '', taskKey: task.key, title: task.title },
                })
              }
            />
          </Card>
        )}

        {logging ? (
          <Card>
            <Label>Log it</Label>
            <Field label="What did it cost? (optional)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="189.00" />
            <Field label="Who did it? (optional)" value={vendor} onChangeText={setVendor} placeholder="Company name" />
            <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Anything worth remembering next time" />
            <Row gap={spacing.sm} wrap>
              <Button label="I did it" icon="hand-left-outline" onPress={() => logComplete('diy')} />
              <Button label="A pro did it" variant="secondary" onPress={() => logComplete('pro')} />
            </Row>
            <Button label="Cancel" variant="ghost" onPress={() => setLogging(false)} />
          </Card>
        ) : (
          <Tertiary>
            Marking this done moves the next due date, and updates the health score and the cost
            forecast. Add a cost or a company and it also becomes a timeline entry.
          </Tertiary>
        )}
      </Screen>

      {!logging ? (
        <StickyBar>
          <Button label="Mark complete" icon="checkmark-circle-outline" size="lg" full onPress={() => setLogging(true)} />
        </StickyBar>
      ) : null}
    </View>
  );
}

function Steps({ steps }: { steps: { text: string; caution?: string }[] }) {
  const theme = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      {steps.map((step, index) => (
        <View key={index} style={{ gap: spacing.sm }}>
          <Row gap={spacing.md} align="flex-start">
            <View
              style={{
                width: 25,
                height: 25,
                borderRadius: radius.pill,
                backgroundColor: theme.surfaceSunken,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BodyStrong style={{ fontSize: 13, color: theme.textSecondary }}>{index + 1}</BodyStrong>
            </View>
            <Body style={{ flex: 1 }}>{step.text}</Body>
          </Row>
          {step.caution ? (
            <View style={{ paddingLeft: 37 }}>
              <Notice tone="urgent" icon="warning-outline">
                {step.caution}
              </Notice>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
