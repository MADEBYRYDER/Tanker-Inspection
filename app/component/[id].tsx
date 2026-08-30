import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { formatDate, relativeDayLabel, today } from '../../src/core/dates';
import { resolveComponentAge } from '../../src/core/engine/age';
import { computeForecast } from '../../src/core/engine/forecast';
import { computeHomeHealth } from '../../src/core/engine/health';
import { generateTasks, tasksForComponent } from '../../src/core/engine/schedule';
import { eventsForComponent } from '../../src/core/engine/timeline';
import { componentWarrantyStatus } from '../../src/core/engine/warranty';
import { formatMoney } from '../../src/core/money';
import { useHomeRecord } from '../../src/state/store';
import {
  AskRow,
  Body,
  BodyStrong,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Heading,
  KeyValue,
  Label,
  ListRow,
  Row,
  Screen,
  Small,
  StatusPill,
  Stat,
  StickyBar,
  Tertiary,
  Title,
} from '../../src/ui/components';
import {
  fonts,
  CATEGORY_ICON,
  CATEGORY_LABEL,
  healthStatus,
  radius,
  spacing,
  toneFor,
  urgencyStatus,
  useTheme,
} from '../../src/ui/theme';

type Tab = 'overview' | 'history' | 'documents';

/**
 * The asset page — everything the record knows about one system.
 *
 * Structured as: what it is, how it is doing, and what happens next — in that
 * order, with the numbers a homeowner would actually quote (age, last service,
 * next task, replacement window) surfaced as a strip rather than buried in prose.
 *
 * The replacement window is deliberately a range of years, not a date. The
 * underlying model is a probability distribution over service life; printing
 * "fails in 2031" would be a claim the app cannot support.
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
    const age = resolveComponentAge(component, record.home, asOf);
    const forecastItem = computeForecast(record, { asOf }).horizons.fiveYear.items.find(
      (i) => i.componentId === component.id,
    );
    const events = eventsForComponent(record, component.id);
    return {
      component,
      age,
      forecastItem,
      warranty: componentWarrantyStatus(component, asOf),
      health: computeHomeHealth(record, { asOf, tasks }).components.find((c) => c.componentId === id),
      tasks: tasksForComponent(tasks, component.id),
      events,
      lastService: events.find((e) => e.type === 'service' || e.type === 'repair'),
      documents: record.documents.filter((d) => component.documentIds.includes(d.id)),
    };
  }, [record, id, asOf]);

  if (!data) {
    return (
      <Screen>
        <EmptyState icon="help-circle-outline" title="Not found" body="This equipment is no longer in your record." />
      </Screen>
    );
  }

  const { component, age, forecastItem, warranty, health, tasks, events, lastService, documents } = data;
  const status = healthStatus(health?.status ?? 'unknown');
  const tone = toneFor(theme, status.key);
  const nextTask = tasks.find((t) => t.urgency !== 'scheduled') ?? tasks[0];

  // A window rather than a date: ±20% around the remaining expected life.
  const replacementWindow =
    age.years !== undefined && age.expectedLifeYears !== undefined
      ? (() => {
          const year = Number(asOf.slice(0, 4));
          const remaining = Math.max(0, age.expectedLifeYears - age.years);
          return `${year + Math.round(remaining * 0.75)}–${year + Math.round(remaining * 1.35 + 1)}`;
        })()
      : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Screen gap={spacing.xl}>
        {/* Identity */}
        <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
          <Row gap={spacing.md}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.md,
                backgroundColor: tone.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather
                name={(CATEGORY_ICON[component.category] ?? 'box') as never}
                size={22}
                color={tone.fg}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Tertiary>{CATEGORY_LABEL[component.category] ?? component.category}</Tertiary>
              <Title>{component.name}</Title>
            </View>
          </Row>
          <Small>
            {[component.manufacturer, component.type].filter(Boolean).join(' ')}
            {component.location ? ` · ${component.location}` : ''}
          </Small>
          <StatusPill status={status.key} label={status.label} />
        </View>

        {/* The four figures a homeowner would quote */}
        <Card>
          <Row>
            <Stat
              value={age.years !== undefined ? `${Math.round(age.years)} yr` : '—'}
              label={
                age.provenance === 'documented' || age.provenance === 'contractor'
                  ? 'Age, on record'
                  : 'Age, estimated'
              }
            />
            <Stat
              value={lastService ? formatDate(lastService.date).replace(/, \d{4}$/, '') : '—'}
              label={lastService ? `Last service ${lastService.date.slice(0, 4)}` : 'No service logged'}
            />
            <Stat
              value={nextTask ? relativeDayLabel(asOf, nextTask.dueDate).replace('in ', '') : '—'}
              label={nextTask ? nextTask.title : 'Nothing scheduled'}
              color={nextTask && nextTask.urgency === 'overdue' ? theme.red : undefined}
            />
          </Row>
          {replacementWindow ? (
            <>
              <Divider />
              <Row justify="space-between">
                <Small>Estimated replacement window</Small>
                <BodyStrong>{replacementWindow}</BodyStrong>
              </Row>
              {forecastItem ? (
                <Tertiary>
                  About {formatMoney(forecastItem.fullCostCents)} when it happens. This is a planning
                  range from equipment age and typical service life, not a prediction.
                </Tertiary>
              ) : null}
            </>
          ) : null}
        </Card>

        <Row gap={spacing.sm}>
          <Chip label="Overview" selected={tab === 'overview'} onPress={() => setTab('overview')} />
          <Chip label={`History (${events.length})`} selected={tab === 'history'} onPress={() => setTab('history')} />
          <Chip
            label={`Documents (${documents.length})`}
            selected={tab === 'documents'}
            onPress={() => setTab('documents')}
          />
        </Row>

        {tab === 'overview' ? (
          <>
            {health ? (
              <Card>
                <Label>Why this status</Label>
                <View style={{ gap: spacing.sm }}>
                  {health.reasons.map((reason, index) => (
                    <Row key={index} gap={spacing.sm} align="flex-start">
                      <Ionicons
                        name={reason.basis === 'fact' ? 'document-text-outline' : 'analytics-outline'}
                        size={14}
                        color={reason.basis === 'fact' ? theme.sage : theme.textTertiary}
                        style={{ marginTop: 3 }}
                      />
                      <Small style={{ flex: 1 }}>{reason.text}</Small>
                    </Row>
                  ))}
                </View>
              </Card>
            ) : null}

            <Card>
              <Label>Identification</Label>
              {component.manufacturer ? <KeyValue label="Manufacturer" value={component.manufacturer} /> : null}
              {component.modelNumber ? <KeyValue label="Model" value={component.modelNumber} /> : null}
              {component.serialNumber ? <KeyValue label="Serial" value={component.serialNumber} /> : null}
              {component.installedOn ? (
                <KeyValue label="Installed" value={formatDate(component.installedOn)} provenance="documented" />
              ) : null}
              {component.specs.map((spec, index) => (
                <KeyValue key={index} label={spec.label} value={spec.value} provenance={spec.provenance} />
              ))}
              {!component.manufacturer && !component.modelNumber && component.specs.length === 0 ? (
                <Small>
                  Nothing identifying is on record. Photographing the nameplate fills this in and
                  makes the age and warranty exact.
                </Small>
              ) : null}
            </Card>

            <Card>
              <Label>Warranty</Label>
              <Body>{warranty.summary}</Body>
            </Card>

            {tasks.length > 0 ? (
              <Card padding={spacing.lg}>
                <Label>Maintenance</Label>
                {tasks.map((task, index) => {
                  const taskStatus = urgencyStatus(task.urgency, task.criticality);
                  return (
                    <View key={task.key} style={{ gap: spacing.md }}>
                      {index > 0 ? <Divider /> : null}
                      <ListRow
                        status={taskStatus.key}
                        title={task.title}
                        subtitle={`Due ${formatDate(task.dueDate)}${
                          task.lastCompletedOn ? ` · last done ${formatDate(task.lastCompletedOn)}` : ' · never logged'
                        }`}
                        onPress={() => router.push(`/task/${encodeURIComponent(task.key)}`)}
                      />
                    </View>
                  );
                })}
              </Card>
            ) : null}

            {component.openQuestions.length > 0 ? (
              <Card tone={theme.amberSoft}>
                <Label color={theme.amber}>Unresolved</Label>
                {component.openQuestions.map((question) => (
                  <Small key={question} style={{ color: theme.amber }}>
                    {question}
                  </Small>
                ))}
              </Card>
            ) : null}

            {component.notes ? (
              <Card>
                <Label>Notes</Label>
                <Body>{component.notes}</Body>
                <Tertiary>Private to you — notes are excluded when the record transfers.</Tertiary>
              </Card>
            ) : null}
          </>
        ) : null}

        {tab === 'history' ? (
          events.length === 0 ? (
            <EmptyState
              icon="time-outline"
              title="No history yet"
              body="Photograph an invoice for this equipment and it will be read, dated, and filed here automatically."
              action={<Button label="Add receipt" icon="receipt-outline" onPress={() => router.push('/document')} />}
            />
          ) : (
            <Card padding={spacing.lg}>
              <Label>Recent activity</Label>
              {events.map((event, index) => (
                <View key={event.id} style={{ gap: spacing.md }}>
                  {index > 0 ? <Divider /> : null}
                  <Row justify="space-between" align="flex-start" gap={spacing.md}>
                    <View style={{ width: 52 }}>
                      <Small style={{ fontFamily: fonts.sans[600] }}>
                        {formatDate(event.date).replace(/, \d{4}$/, '')}
                      </Small>
                      <Tertiary>{event.date.slice(0, 4)}</Tertiary>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <BodyStrong>{event.title}</BodyStrong>
                      {event.vendor ? <Small>{event.vendor}</Small> : null}
                      {event.description ? (
                        <Tertiary numberOfLines={3}>{event.description}</Tertiary>
                      ) : null}
                    </View>
                    {event.costCents !== undefined ? (
                      <BodyStrong>{formatMoney(event.costCents)}</BodyStrong>
                    ) : null}
                  </Row>
                </View>
              ))}
            </Card>
          )
        ) : null}

        {tab === 'documents' ? (
          documents.length === 0 ? (
            <EmptyState
              icon="document-outline"
              title="No documents"
              body="Warranties, manuals, invoices, and permits filed against this equipment appear here."
              action={<Button label="Add document" icon="receipt-outline" onPress={() => router.push('/document')} />}
            />
          ) : (
            <Card padding={spacing.lg}>
              {documents.map((document, index) => (
                <View key={document.id} style={{ gap: spacing.md }}>
                  {index > 0 ? <Divider inset={48} /> : null}
                  <ListRow
                    icon="document-text-outline"
                    title={document.title}
                    subtitle={`${document.kind} · added ${formatDate(document.addedAt.slice(0, 10))}`}
                    chevron={false}
                  />
                </View>
              ))}
            </Card>
          )
        ) : null}

        <AskRow
          title={`Ask about this ${CATEGORY_LABEL[component.category] ?? 'system'}`}
          prompt={`What maintenance does my ${component.name.toLowerCase()} need?`}
          onPress={() =>
            router.push({ pathname: '/assistant', params: { seed: `Tell me about my ${component.name}` } })
          }
        />

        <Row gap={spacing.sm} wrap>
          <Button
            label="Something's wrong"
            variant="secondary"
            size="sm"
            icon="alert-circle-outline"
            onPress={() => router.push({ pathname: '/problem', params: { componentId: component.id } })}
          />
        </Row>
      </Screen>

      <StickyBar>
        <Row gap={spacing.sm}>
          <Button
            label="Add service / repair"
            icon="add-outline"
            full
            onPress={() => router.push({ pathname: '/document', params: { componentId: component.id } })}
          />
          <Button
            label="Hire"
            variant="secondary"
            onPress={() => router.push({ pathname: '/service/new', params: { componentId: component.id } })}
          />
        </Row>
      </StickyBar>
    </View>
  );
}
