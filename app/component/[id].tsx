import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { formatDate, today } from '../../src/core/dates';
import { resolveComponentAge } from '../../src/core/engine/age';
import { computeForecast } from '../../src/core/engine/forecast';
import { computeHomeHealth } from '../../src/core/engine/health';
import { generateTasks, tasksForComponent } from '../../src/core/engine/schedule';
import { eventsForComponent } from '../../src/core/engine/timeline';
import { componentWarrantyStatus } from '../../src/core/engine/warranty';
import { formatMoney } from '../../src/core/money';
import { useHomeRecord } from '../../src/state/store';
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
  Heading,
  KeyValue,
  Meter,
  Muted,
  Notice,
  ProvenanceTag,
  Row,
  Screen,
  SectionHeader,
  Title,
} from '../../src/ui/components';
import { CATEGORY_LABEL, healthTone, scoreTone, spacing, urgencyTone, useTheme } from '../../src/ui/theme';

type Tab = 'overview' | 'history' | 'tasks';

/**
 * A component's profile — everything the record knows about one piece of equipment.
 *
 * The condition panel spells out its own reasoning rather than just showing a
 * status. A number a homeowner cannot interrogate is a number they will not act on,
 * and the fact/estimate split is the honest part of the claim.
 */
export default function ComponentProfile() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useHomeRecord();
  const asOf = today();
  const [tab, setTab] = useState<Tab>('overview');

  const data = useMemo(() => {
    if (!record || !id) return undefined;
    const component = record.components.find((c) => c.id === id);
    if (!component) return undefined;
    const tasks = generateTasks(record, { asOf });
    return {
      component,
      age: resolveComponentAge(component, record.home, asOf),
      warranty: componentWarrantyStatus(component, asOf),
      health: computeHomeHealth(record, { asOf, tasks }).components.find((c) => c.componentId === id),
      tasks: tasksForComponent(tasks, component.id),
      events: eventsForComponent(record, component.id),
      forecastItem: computeForecast(record, { asOf }).horizons.fiveYear.items.find(
        (i) => i.componentId === component.id,
      ),
    };
  }, [record, id, asOf]);

  if (!data) {
    return (
      <Screen>
        <EmptyState icon="help-circle-outline" title="Not found" body="This equipment is no longer in your record." />
      </Screen>
    );
  }

  const { component, age, warranty, health, tasks, events, forecastItem } = data;
  const tone = health ? healthTone(theme, health.status) : undefined;

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Faint>{CATEGORY_LABEL[component.category] ?? component.category}</Faint>
        <Title>{component.name}</Title>
        <Muted>
          {component.type}
          {component.location ? ` · ${component.location}` : ''}
        </Muted>
      </View>

      {health && tone ? (
        <Card>
          <Row justify="space-between">
            <Row gap={spacing.sm}>
              <Body>{tone.dot}</Body>
              <BodyStrong style={{ color: tone.fg }}>{tone.label}</BodyStrong>
            </Row>
            <BodyStrong style={{ color: scoreTone(theme, health.score) }}>{health.score}/100</BodyStrong>
          </Row>
          <Meter value={health.score} color={scoreTone(theme, health.score)} />

          <Faint>WHY</Faint>
          <View style={{ gap: spacing.sm }}>
            {health.reasons.map((reason, index) => (
              <Row key={index} gap={spacing.sm} align="flex-start">
                <Badge
                  label={reason.basis === 'fact' ? 'fact' : 'estimate'}
                  fg={reason.basis === 'fact' ? theme.success : theme.textMuted}
                  bg={reason.basis === 'fact' ? theme.successSoft : theme.surfaceAlt}
                />
                <Muted style={{ flex: 1 }}>{reason.text}</Muted>
              </Row>
            ))}
          </View>
        </Card>
      ) : null}

      <Row gap={spacing.sm}>
        <Chip label="Overview" selected={tab === 'overview'} onPress={() => setTab('overview')} />
        <Chip label={`History (${events.length})`} selected={tab === 'history'} onPress={() => setTab('history')} />
        <Chip label={`Tasks (${tasks.length})`} selected={tab === 'tasks'} onPress={() => setTab('tasks')} />
      </Row>

      {tab === 'overview' ? (
        <>
          <Card>
            <SectionHeader title="Identification" />
            {component.manufacturer ? <KeyValue label="Manufacturer" value={component.manufacturer} /> : null}
            {component.modelNumber ? <KeyValue label="Model" value={component.modelNumber} /> : null}
            {component.serialNumber ? <KeyValue label="Serial" value={component.serialNumber} /> : null}
            {!component.manufacturer && !component.modelNumber && !component.serialNumber ? (
              <Muted>
                Nothing identifying is on record. Photographing the nameplate fills this in and makes
                the age and warranty exact.
              </Muted>
            ) : null}
            <Row gap={spacing.xs}>
              <Faint>Identified by</Faint>
              <Badge
                label={
                  component.identificationSource === 'ai_scan'
                    ? `photo scan · ${Math.round(component.identificationConfidence * 100)}%`
                    : component.identificationSource
                }
                fg={theme.textMuted}
                bg={theme.surfaceAlt}
              />
            </Row>
          </Card>

          <Card>
            <SectionHeader title="Age and expected life" />
            <KeyValue
              label="Age"
              value={age.years === undefined ? 'Unknown' : `${age.years} years`}
              provenance={age.provenance}
            />
            {age.expectedLifeYears ? (
              <KeyValue label="Typical service life" value={`${age.expectedLifeYears} years`} provenance="estimated" />
            ) : null}
            {component.installedOn ? (
              <KeyValue label="Installed" value={formatDate(component.installedOn)} provenance="documented" />
            ) : null}
            <Faint>{age.basis}</Faint>
            {age.entry?.notes ? (
              <>
                <Divider />
                <Muted>{age.entry.notes}</Muted>
              </>
            ) : null}
          </Card>

          {forecastItem ? (
            <Card onPress={() => router.push('/(tabs)/money')}>
              <SectionHeader title="Replacement outlook" />
              <KeyValue label="If it needs replacing" value={formatMoney(forecastItem.fullCostCents)} />
              <KeyValue
                label="Chance within 5 years"
                value={`${Math.round(forecastItem.probability * 100)}%`}
              />
              {forecastItem.likelyYear ? (
                <KeyValue label="Most likely around" value={String(forecastItem.likelyYear)} />
              ) : null}
              <Faint>{forecastItem.note}</Faint>
            </Card>
          ) : null}

          <Card>
            <SectionHeader title="Warranty" />
            <Body>{warranty.summary}</Body>
            {component.warranties.map((w, index) => (
              <View key={index} style={{ gap: spacing.xs }}>
                <Divider />
                <Row justify="space-between">
                  <BodyStrong>{w.provider}</BodyStrong>
                  <ProvenanceTag provenance={w.provenance} />
                </Row>
                <Muted>
                  {w.kind.replace('_', ' ')}
                  {w.termYears ? ` · ${w.termYears} years` : ''}
                  {w.covers ? ` · ${w.covers}` : ''}
                </Muted>
              </View>
            ))}
          </Card>

          {component.specs.length > 0 ? (
            <Card>
              <SectionHeader title="Specifications" />
              {component.specs.map((spec, index) => (
                <KeyValue key={`${spec.key}-${index}`} label={spec.label} value={spec.value} provenance={spec.provenance} />
              ))}
            </Card>
          ) : null}

          {component.openQuestions.length > 0 ? (
            <Notice tone="warning" icon="help-circle-outline">
              {component.openQuestions.join('\n')}
            </Notice>
          ) : null}

          {component.notes ? (
            <Card>
              <SectionHeader title="Notes" />
              <Body>{component.notes}</Body>
              <Faint>Private to you. Notes are not included when the record transfers.</Faint>
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'history' ? (
        events.length === 0 ? (
          <EmptyState
            icon="time-outline"
            title="No history yet"
            body="Photograph an invoice or a receipt for this equipment and it will be dated and filed here automatically."
            action={<Button label="Add a document" icon="document-attach-outline" onPress={() => router.push('/document')} />}
          />
        ) : (
          <>
            {events.map((event) => (
              <Card key={event.id}>
                <Row justify="space-between" align="flex-start" gap={spacing.md}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <BodyStrong>{event.title}</BodyStrong>
                    <Faint>
                      {formatDate(event.date)}
                      {event.vendor ? ` · ${event.vendor}` : ''}
                    </Faint>
                    {event.description ? <Muted>{event.description}</Muted> : null}
                  </View>
                  {event.costCents !== undefined ? (
                    <BodyStrong>{formatMoney(event.costCents)}</BodyStrong>
                  ) : null}
                </Row>
              </Card>
            ))}
          </>
        )
      ) : null}

      {tab === 'tasks' ? (
        tasks.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="No recurring tasks"
            body="Nothing in the maintenance library applies to this equipment type."
          />
        ) : (
          <>
            {tasks.map((task) => {
              const taskTone = urgencyTone(theme, task.urgency, task.criticality);
              return (
                <Card key={task.key} onPress={() => router.push(`/task/${encodeURIComponent(task.key)}`)}>
                  <Row justify="space-between" align="flex-start" gap={spacing.md}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Row gap={spacing.sm}>
                        <Body>{taskTone.dot}</Body>
                        <BodyStrong style={{ flex: 1 }}>{task.title}</BodyStrong>
                      </Row>
                      <Faint>
                        Due {formatDate(task.dueDate)}
                        {task.lastCompletedOn ? ` · last done ${formatDate(task.lastCompletedOn)}` : ' · never logged'}
                      </Faint>
                    </View>
                    <Badge label={taskTone.label} fg={taskTone.fg} bg={taskTone.bg} />
                  </Row>
                </Card>
              );
            })}
          </>
        )
      ) : null}

      <SectionHeader title="Actions" />
      <Row wrap gap={spacing.sm}>
        <Button
          label="Something's wrong with this"
          icon="warning-outline"
          onPress={() => router.push({ pathname: '/problem', params: { componentId: component.id } })}
        />
        <Button
          label="Request service"
          icon="call-outline"
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/service/new', params: { componentId: component.id } })
          }
        />
        <Button
          label="Add a document"
          icon="document-attach-outline"
          variant="secondary"
          onPress={() => router.push({ pathname: '/document', params: { componentId: component.id } })}
        />
      </Row>
    </Screen>
  );
}
