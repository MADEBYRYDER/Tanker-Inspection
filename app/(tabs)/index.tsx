import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatDate, relativeDayLabel, today } from '../../src/core/dates';
import { resolveComponentAge } from '../../src/core/engine/age';
import { computeForecast } from '../../src/core/engine/forecast';
import { computeHomeHealth } from '../../src/core/engine/health';
import { generateTasks } from '../../src/core/engine/schedule';
import { formatApprox, formatMoney } from '../../src/core/money';
import type { ComponentCategory, HomeComponent, ScheduledTask } from '../../src/core/types';
import { useHomeRecord } from '../../src/state/store';
import {
  AskRow,
  Body,
  BodyStrong,
  Button,
  Card,
  Divider,
  EmptyState,
  Enter,
  Heading,
  HeroPanel,
  IconTile,
  Row,
  Screen,
  ScoreRing,
  SectionTitle,
  Small,
  StatusPill,
  Tertiary,
  Tile,
  Title,
  Touchable,
} from '../../src/ui/components';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  greeting,
  healthStatus,
  radius,
  scoreBand,
  spacing,
  tabular,
  toneFor,
  type,
  urgencyStatus,
  useTheme,
} from '../../src/ui/theme';
import { Text } from 'react-native';

/**
 * The home dashboard.
 *
 * One question, answered above the fold: what does my house need right now?
 *
 * The hero carries the summary judgement and gives the screen a top — without one
 * focal moment a dashboard is a stack of equally-weighted cards, which is exactly
 * what makes utility software feel flat. Below it, order is the design: what needs
 * attention, then what's coming, then the numbers, then the systems themselves.
 * The assistant sits last on purpose. The house is the subject here.
 */
export default function Dashboard() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const asOf = today();

  const derived = useMemo(() => {
    if (!record) return undefined;
    const tasks = generateTasks(record, { asOf });
    const health = computeHomeHealth(record, { asOf, tasks });
    return { tasks, health, forecast: computeForecast(record, { asOf }) };
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
  const hasEquipment = record.components.length > 0;

  /*
   * What counts as "needs attention" is the most consequential judgement here.
   * Merely due-soon work does not qualify: on a freshly scanned home a dozen tasks
   * have never been logged and therefore show as due today, and surfacing all of
   * them as problems turns the first screen into a wall of alarm — which teaches
   * people to ignore the section entirely.
   */
  const attentionSystems = health.components.filter(
    (c) => c.status === 'aging' || c.status === 'plan_replacement',
  );
  const attentionTasks = tasks.filter(
    (t) => t.urgency === 'overdue' || (t.urgency === 'due_soon' && t.criticality === 'safety'),
  );
  const attentionCount = attentionSystems.length + attentionTasks.length;
  const comingUp = tasks.filter((t) => !attentionTasks.includes(t)).slice(0, 4);

  const band = scoreBand(health.score);
  const firstName = record.home.ownerName?.trim().split(' ')[0];
  const systems = groupByCategory(record.components);

  return (
    <Screen bleedTop gap={spacing.xl}>
      {/* ---- Hero -------------------------------------------------------- */}
      <HeroPanel>
        <View style={{ gap: spacing.xl }}>
          <View style={{ gap: 3 }}>
            <Text style={[type.title, { color: '#FFFFFF' }]}>
              {firstName ? `${greeting()}, ${firstName}` : greeting()}
            </Text>
            <Row gap={6}>
              <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.6)" />
              <Text style={[type.small, { color: 'rgba(255,255,255,0.68)' }]}>
                {record.home.addressLine1 ?? record.home.nickname}
              </Text>
            </Row>
          </View>

          {hasEquipment ? (
            <Touchable onPress={() => router.push('/health')} scaleTo={0.985}>
              <Row gap={spacing.xl}>
                <ScoreRing
                  score={health.score}
                  label={band.label}
                  status={band.key}
                  size={132}
                  onDark
                />
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <Text style={[type.label, { color: 'rgba(255,255,255,0.5)' }]}>HOME HEALTH</Text>
                  <Text style={[type.small, { color: 'rgba(255,255,255,0.86)' }]} numberOfLines={5}>
                    {health.summary}
                  </Text>
                  <Row gap={4}>
                    <Text style={[type.smallStrong, { color: '#FFFFFF' }]}>See breakdown</Text>
                    <Ionicons name="chevron-forward" size={13} color="#FFFFFF" />
                  </Row>
                </View>
              </Row>
            </Touchable>
          ) : null}
        </View>
      </HeroPanel>

      {!hasEquipment ? (
        <Enter>
          <EmptyState
            icon="scan-outline"
            title="Let's build your Home Record"
            body="Walk the house and photograph the labels — the nameplate on the water heater, the sticker on the furnace. Your camera builds the inventory for you."
            action={
              <Button label="Scan My Home" icon="scan-outline" size="lg" onPress={() => router.push('/scan/guided')} />
            }
          />
        </Enter>
      ) : (
        <>
          {/* ---- Needs attention ------------------------------------------ */}
          {attentionCount > 0 ? (
            <View style={{ gap: spacing.md }}>
              <Enter>
                <Row gap={spacing.sm}>
                  <Heading>
                    {attentionCount} {attentionCount === 1 ? 'thing needs' : 'things need'} attention
                  </Heading>
                </Row>
              </Enter>

              {attentionSystems.slice(0, 3).map((system, index) => {
                const status = healthStatus(system.status);
                return (
                  <Enter key={system.componentId} index={index}>
                    <AttentionCard
                      icon={(CATEGORY_ICON[system.category] ?? 'cube-outline') as never}
                      status={status.key}
                      title={system.name}
                      subtitle={status.label}
                      action="View"
                      onPress={() => router.push(`/component/${system.componentId}`)}
                    />
                  </Enter>
                );
              })}

              {attentionTasks.slice(0, 3).map((task, index) => {
                const status = urgencyStatus(task.urgency, task.criticality);
                return (
                  <Enter key={task.key} index={attentionSystems.length + index}>
                    <AttentionCard
                      icon="alarm-outline"
                      status={status.key}
                      title={task.title}
                      subtitle={
                        task.urgency === 'overdue'
                          ? `Overdue — was due ${relativeDayLabel(asOf, task.dueDate)}`
                          : `Due ${relativeDayLabel(asOf, task.dueDate)}`
                      }
                      action={task.diy.proOnlyReason ? 'Schedule' : 'Do it'}
                      onPress={() => router.push(`/task/${encodeURIComponent(task.key)}`)}
                    />
                  </Enter>
                );
              })}

              {attentionCount > 6 ? (
                <Button
                  label={`See all ${attentionCount}`}
                  variant="ghost"
                  onPress={() => router.push('/(tabs)/tasks')}
                />
              ) : null}
            </View>
          ) : (
            <Enter>
              <Card>
                <Row gap={spacing.md}>
                  <IconTile icon="checkmark-circle-outline" status="good" size={40} />
                  <View style={{ flex: 1 }}>
                    <BodyStrong>Nothing needs attention</BodyStrong>
                    <Small>Everything on your calendar is up to date.</Small>
                  </View>
                </Row>
              </Card>
            </Enter>
          )}

          {/* ---- Coming up ------------------------------------------------ */}
          {comingUp.length > 0 ? (
            <Enter index={1}>
              <View style={{ gap: spacing.md }}>
                <SectionTitle title="Coming up" action="All" onAction={() => router.push('/(tabs)/tasks')} />
                <Card padding={spacing.lg}>
                  {comingUp.map((task, index) => (
                    <View key={task.key} style={{ gap: spacing.md }}>
                      {index > 0 ? <Divider inset={54} /> : null}
                      <Touchable
                        onPress={() => router.push(`/task/${encodeURIComponent(task.key)}`)}
                        scaleTo={0.99}
                      >
                        <Row gap={spacing.md} justify="space-between">
                          <DateChip date={task.dueDate} />
                          <View style={{ flex: 1, gap: 1 }}>
                            <BodyStrong numberOfLines={1}>{task.title}</BodyStrong>
                            {task.componentName ? (
                              <Tertiary numberOfLines={1}>{task.componentName}</Tertiary>
                            ) : null}
                          </View>
                          <Ionicons name="chevron-forward" size={15} color={theme.textTertiary} />
                        </Row>
                      </Touchable>
                    </View>
                  ))}
                </Card>
              </View>
            </Enter>
          ) : null}

          {/* ---- Ownership figures, as a bento row ------------------------ */}
          <Enter index={2}>
            <View style={{ gap: spacing.md }}>
              <SectionTitle title="Ownership" action="Costs" onAction={() => router.push('/costs')} />
              <Row gap={spacing.md} align="stretch">
                <Tile
                  icon="wallet-outline"
                  value={formatApprox(forecast.horizons.oneYear.totalCents).replace('~', '')}
                  label="Likely, next 12 months"
                  onPress={() => router.push('/costs')}
                />
                <Tile
                  icon="trending-up-outline"
                  status="good"
                  value={`${formatMoney(forecast.suggestedMonthlyReserveCents)}`}
                  label="Suggested monthly reserve"
                  onPress={() => router.push('/costs')}
                />
              </Row>
              <Row gap={spacing.md} align="stretch">
                <Tile
                  icon="cube-outline"
                  value={String(record.components.length)}
                  label="Systems tracked"
                  onPress={() => router.push('/health')}
                />
                <Tile
                  icon="document-text-outline"
                  value={`${Math.round(health.dataConfidence * 100)}%`}
                  label="Backed by documented dates"
                  onPress={() => router.push('/health')}
                />
              </Row>
            </View>
          </Enter>

          {/* ---- Your home ------------------------------------------------ */}
          <Enter index={3}>
            <View style={{ gap: spacing.md }}>
              <SectionTitle title="Your home" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                {systems.map(([category, components]) => (
                  <SystemTile
                    key={category}
                    category={category}
                    components={components}
                    health={health}
                    tasks={tasks}
                    asOf={asOf}
                    onPress={(id) => router.push(`/component/${id}`)}
                  />
                ))}
              </View>
            </View>
          </Enter>
        </>
      )}

      <Enter index={4}>
        <AskRow
          prompt="What should I take care of this weekend?"
          onPress={() => router.push('/assistant')}
        />
      </Enter>
    </Screen>
  );
}

function AttentionCard({
  icon,
  status,
  title,
  subtitle,
  action,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  status: 'good' | 'attention' | 'urgent' | 'neutral' | 'info';
  title: string;
  subtitle: string;
  action: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const tone = toneFor(theme, status);
  return (
    <Card
      onPress={onPress}
      padding={spacing.lg}
      // A status edge that follows the corner radius, so it reads as part of the
      // card rather than a tab stuck to its side.
      style={{ borderLeftWidth: 3, borderLeftColor: tone.fg }}
    >
      <Row gap={spacing.md} justify="space-between">
        <Row gap={spacing.md} style={{ flex: 1 }}>
          <IconTile icon={icon} status={status} size={40} />
          <View style={{ flex: 1, gap: 2 }}>
            <BodyStrong numberOfLines={1}>{title}</BodyStrong>
            <Small numberOfLines={1} style={{ color: tone.fg }}>
              {subtitle}
            </Small>
          </View>
        </Row>
        <Row gap={2}>
          <Small style={{ color: theme.blue, fontWeight: '600' }}>{action}</Small>
          <Ionicons name="chevron-forward" size={14} color={theme.blue} />
        </Row>
      </Row>
    </Card>
  );
}

/** Month + day stacked in a tinted square. Reads faster than a date string. */
function DateChip({ date }: { date: string }) {
  const theme = useTheme();
  const label = formatDate(date);
  const [month, day] = label.split(' ');
  return (
    <View
      style={{
        width: 42,
        height: 42,
        borderRadius: radius.sm,
        backgroundColor: theme.surfaceSunken,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.4, color: theme.textTertiary }}>
        {(month ?? '').toUpperCase()}
      </Text>
      <Text style={[{ fontSize: 16, fontWeight: '700', letterSpacing: -0.5, color: theme.text }, tabular]}>
        {(day ?? '').replace(',', '')}
      </Text>
    </View>
  );
}

/**
 * One tile per system, two across.
 *
 * A homeowner thinks "my HVAC", not "my condenser and my air handler", so the tile
 * groups by category and takes the status of its worst member — nothing hides
 * behind a healthy sibling.
 */
function SystemTile({
  category,
  components,
  health,
  tasks,
  asOf,
  onPress,
}: {
  category: ComponentCategory;
  components: HomeComponent[];
  health: ReturnType<typeof computeHomeHealth>;
  tasks: ScheduledTask[];
  asOf: string;
  onPress: (componentId: string) => void;
}) {
  const theme = useTheme();
  const record = useHomeRecord();

  const memberHealth = health.components.filter((c) => components.some((m) => m.id === c.componentId));
  const worst = memberHealth.reduce<(typeof memberHealth)[number] | undefined>(
    (acc, c) => (!acc || c.score < acc.score ? c : acc),
    undefined,
  );
  const status = healthStatus(worst?.status ?? 'unknown');

  const lead = components[0]!;
  const age = record ? resolveComponentAge(lead, record.home, asOf) : undefined;
  const nextTask = tasks
    .filter((t) => components.some((c) => c.id === t.componentId))
    .find((t) => t.urgency !== 'scheduled');

  const subtitle = lead.manufacturer
    ? `${lead.manufacturer}${components.length > 1 ? ` +${components.length - 1}` : ''}`
    : lead.type;
  const ageLine = lead.installedOn
    ? `Installed ${lead.installedOn.slice(0, 4)}`
    : age?.years !== undefined
      ? `~${Math.round(age.years)} yrs old`
      : 'Age unknown';

  return (
    <Touchable
      onPress={() => onPress(worst?.componentId ?? lead.id)}
      style={{
        // Two across, accounting for the 12pt gutter.
        width: '48%',
        backgroundColor: theme.surface,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.hairline,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <Row justify="space-between" align="flex-start">
        <IconTile icon={(CATEGORY_ICON[category] ?? 'cube-outline') as never} status={status.key} size={40} />
        <Dotish status={status.key} />
      </Row>
      <View style={{ gap: 2 }}>
        <BodyStrong numberOfLines={1}>{CATEGORY_LABEL[category] ?? category}</BodyStrong>
        <Tertiary numberOfLines={1}>{subtitle}</Tertiary>
        <Tertiary numberOfLines={1}>{ageLine}</Tertiary>
      </View>
      <StatusPill status={status.key} label={status.label} />
      {nextTask ? (
        <Tertiary numberOfLines={1}>
          {nextTask.title} · {relativeDayLabel(asOf, nextTask.dueDate)}
        </Tertiary>
      ) : null}
    </Touchable>
  );
}

function Dotish({ status }: { status: 'good' | 'attention' | 'urgent' | 'neutral' | 'info' }) {
  const theme = useTheme();
  const tone = toneFor(theme, status);
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone.fg, marginTop: 6 }} />;
}

function groupByCategory(components: HomeComponent[]): [ComponentCategory, HomeComponent[]][] {
  const groups = new Map<ComponentCategory, HomeComponent[]>();
  for (const component of components) {
    if (component.retiredOn) continue;
    const bucket = groups.get(component.category);
    if (bucket) bucket.push(component);
    else groups.set(component.category, [component]);
  }
  // Consequence order — the roof and the heating never sit below the microwave.
  const order: ComponentCategory[] = [
    'hvac',
    'water_heater',
    'roof',
    'electrical',
    'plumbing',
    'appliance',
    'windows',
    'exterior',
    'safety',
    'flooring',
    'structure',
    'other',
  ];
  return [...groups.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
}
