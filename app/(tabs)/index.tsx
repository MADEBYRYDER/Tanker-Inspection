import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
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
  Display,
  Divider,
  EmptyState,
  Heading,
  ListRow,
  Row,
  Screen,
  ScoreRing,
  SectionTitle,
  Small,
  StatusPill,
  Stat,
  Tertiary,
  Title,
} from '../../src/ui/components';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  greeting,
  healthStatus,
  radius,
  scoreBand,
  scoreColor,
  spacing,
  toneFor,
  urgencyStatus,
  useTheme,
} from '../../src/ui/theme';

/**
 * The home dashboard.
 *
 * One question, answered above the fold: what does my house need right now?
 *
 * Order is the whole design. Health first, because it is the summary judgement.
 * Then the specific things that need attention, because that is the actionable
 * part. Then what is coming, then the systems themselves, then the assistant —
 * which sits near the bottom on purpose. The house is the subject of this screen.
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
   * What counts as "needs attention" is the most consequential judgement on this
   * screen. Everything that is merely due soon does not qualify: on a freshly
   * scanned home a dozen tasks have never been logged and therefore show as due
   * today, and surfacing all of them as problems turns the first thing a new user
   * sees into a wall of alarm — which teaches them to ignore the section entirely.
   *
   * So attention means genuinely overdue work, plus systems the health engine has
   * flagged. Due-soon work is real, and it belongs in "Coming up" where it reads as
   * a plan rather than a failure.
   */
  const attentionSystems = health.components.filter(
    (c) => c.status === 'aging' || c.status === 'plan_replacement',
  );
  const attentionTasks = tasks.filter(
    (t) => t.urgency === 'overdue' || (t.urgency === 'due_soon' && t.criticality === 'safety'),
  );
  const attentionCount = attentionSystems.length + attentionTasks.length;

  const comingUp = tasks.filter((t) => !attentionTasks.includes(t)).slice(0, 5);

  const band = scoreBand(health.score);
  // Greet the owner if we know them. The house nickname is not a person's name —
  // "Good afternoon, Marsh Point" is worse than no name at all.
  const firstName = record.home.ownerName?.trim().split(' ')[0];

  return (
    <Screen gap={spacing.xl}>
      {/* Greeting */}
      <View style={{ gap: 2, marginTop: spacing.sm }}>
        <Title>{firstName ? `${greeting()}, ${firstName}` : greeting()}</Title>
        <Small>{record.home.addressLine1 ?? record.home.nickname}</Small>
      </View>

      {!hasEquipment ? (
        <EmptyState
          icon="camera-outline"
          title="Let's build your Home Record"
          body="Walk the house and photograph the labels — the nameplate on the water heater, the sticker on the furnace. Your camera builds the inventory for you."
          action={<Button label="Scan My Home" icon="scan-outline" onPress={() => router.push('/scan/guided')} />}
        />
      ) : (
        <>
          {/* Home health — the hero */}
          <Card onPress={() => router.push('/health')} padding={spacing.xl} raised={2}>
            <Row gap={spacing.xl}>
              <ScoreRing
                score={health.score}
                label={band.label}
                color={scoreColor(theme, health.score)}
                size={122}
              />
              <View style={{ flex: 1, gap: spacing.sm }}>
                <Heading>Home Health</Heading>
                <Small numberOfLines={4}>{health.summary}</Small>
                <Row gap={spacing.xs}>
                  <Small style={{ color: theme.blue, fontWeight: '600' }}>See breakdown</Small>
                  <Ionicons name="chevron-forward" size={14} color={theme.blue} />
                </Row>
              </View>
            </Row>
          </Card>

          {/* Needs attention */}
          {attentionCount > 0 ? (
            <View style={{ gap: spacing.md }}>
              <Row justify="space-between">
                <Heading>
                  {attentionCount} {attentionCount === 1 ? 'thing needs' : 'things need'} attention
                </Heading>
              </Row>

              {attentionSystems.slice(0, 3).map((system) => {
                const status = healthStatus(system.status);
                return (
                  <Card key={system.componentId} onPress={() => router.push(`/component/${system.componentId}`)}>
                    <ListRow
                      status={status.key}
                      title={system.name}
                      subtitle={status.label}
                      trailing={
                        <Small style={{ color: theme.blue, fontWeight: '600' }}>View</Small>
                      }
                      onPress={() => router.push(`/component/${system.componentId}`)}
                    />
                  </Card>
                );
              })}

              {attentionTasks.slice(0, 3).map((task) => (
                <AttentionTask key={task.key} task={task} asOf={asOf} />
              ))}

              {attentionCount > 6 ? (
                <Button
                  label={`See all ${attentionCount}`}
                  variant="ghost"
                  onPress={() => router.push('/(tabs)/tasks')}
                />
              ) : null}
            </View>
          ) : (
            <Card>
              <Row gap={spacing.md}>
                <Ionicons name="checkmark-circle" size={22} color={theme.sage} />
                <View style={{ flex: 1 }}>
                  <BodyStrong>Nothing needs attention</BodyStrong>
                  <Small>Everything on your calendar is up to date.</Small>
                </View>
              </Row>
            </Card>
          )}

          {/* Coming up */}
          {comingUp.length > 0 ? (
            <View style={{ gap: spacing.md }}>
              <SectionTitle title="Coming up" action="All tasks" onAction={() => router.push('/(tabs)/tasks')} />
              <Card padding={spacing.lg}>
                {comingUp.map((task, index) => (
                  <View key={task.key} style={{ gap: spacing.md }}>
                    {index > 0 ? <Divider /> : null}
                    <Pressable
                      onPress={() => router.push(`/task/${encodeURIComponent(task.key)}`)}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: 2 })}
                    >
                      <Row justify="space-between" gap={spacing.md}>
                        <View style={{ width: 58 }}>
                          <Small style={{ fontWeight: '600', color: theme.textSecondary }}>
                            {formatDate(task.dueDate).replace(/, \d{4}$/, '')}
                          </Small>
                        </View>
                        <BodyStrong numberOfLines={1} style={{ flex: 1 }}>
                          {task.title}
                        </BodyStrong>
                        <Ionicons name="chevron-forward" size={15} color={theme.textTertiary} />
                      </Row>
                    </Pressable>
                  </View>
                ))}
              </Card>
            </View>
          ) : null}

          {/* Ownership figures — the serious data underneath the calm surface */}
          <Card>
            <Row>
              <Stat
                value={formatApprox(forecast.horizons.oneYear.totalCents).replace('~', '')}
                label="Next 12 months"
              />
              <Stat
                value={`${formatMoney(forecast.suggestedMonthlyReserveCents)}/mo`}
                label="Suggested reserve"
              />
              <Stat value={String(record.components.length)} label="Systems tracked" />
            </Row>
            <Divider />
            <Pressable onPress={() => router.push('/costs')}>
              <Row justify="space-between">
                <Small style={{ color: theme.blue, fontWeight: '600' }}>See cost forecast</Small>
                <Ionicons name="chevron-forward" size={15} color={theme.blue} />
              </Row>
            </Pressable>
          </Card>

          {/* Your home */}
          <View style={{ gap: spacing.md }}>
            <SectionTitle title="Your home" />
            {groupByCategory(record.components).map(([category, components]) => (
              <SystemCard
                key={category}
                category={category}
                components={components}
                health={derived.health}
                tasks={tasks}
                asOf={asOf}
                onPress={(id) => router.push(`/component/${id}`)}
              />
            ))}
          </View>
        </>
      )}

      <AskRow
        prompt="What should I take care of this weekend?"
        onPress={() => router.push('/assistant')}
      />
    </Screen>
  );
}

function AttentionTask({ task, asOf }: { task: ScheduledTask; asOf: string }) {
  const theme = useTheme();
  const router = useRouter();
  const status = urgencyStatus(task.urgency, task.criticality);
  return (
    <Card onPress={() => router.push(`/task/${encodeURIComponent(task.key)}`)}>
      <ListRow
        status={status.key}
        title={task.title}
        subtitle={
          task.urgency === 'overdue'
            ? `Overdue — was due ${relativeDayLabel(asOf, task.dueDate)}`
            : `Due ${relativeDayLabel(asOf, task.dueDate)}`
        }
        trailing={
          <Small style={{ color: theme.blue, fontWeight: '600' }}>
            {task.diy.proOnlyReason ? 'Schedule' : 'Do it'}
          </Small>
        }
        onPress={() => router.push(`/task/${encodeURIComponent(task.key)}`)}
      />
    </Card>
  );
}

/**
 * One card per system, not per box.
 *
 * A homeowner thinks "my HVAC", not "my condenser and my air handler". Grouping by
 * category keeps the dashboard scannable in a house with twenty tracked items, and
 * the card surfaces the worst status inside the group so nothing hides behind a
 * healthy sibling.
 */
function SystemCard({
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

  // The group takes the status of its worst member.
  const memberHealth = health.components.filter((c) => components.some((m) => m.id === c.componentId));
  const worst = memberHealth.reduce<(typeof memberHealth)[number] | undefined>(
    (acc, c) => (!acc || c.score < acc.score ? c : acc),
    undefined,
  );
  const status = healthStatus(worst?.status ?? 'unknown');
  const tone = toneFor(theme, status.key);

  const lead = components[0]!;
  const age = record ? resolveComponentAge(lead, record.home, asOf) : undefined;
  const nextTask = tasks
    .filter((t) => components.some((c) => c.id === t.componentId))
    .find((t) => t.urgency === 'overdue' || t.urgency === 'due_soon' || t.urgency === 'upcoming');

  const descriptor = [lead.manufacturer, lead.type].filter(Boolean).join(' ');
  const installed =
    lead.installedOn
      ? `Installed ${lead.installedOn.slice(0, 4)}`
      : age?.years !== undefined
        ? `Approx. ${Math.round(age.years)} years old`
        : 'Age not recorded';

  return (
    <Card onPress={() => onPress(worst?.componentId ?? lead.id)}>
      <Row justify="space-between" align="flex-start">
        <Row gap={spacing.md} style={{ flex: 1 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.md,
              backgroundColor: tone.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name={(CATEGORY_ICON[category] ?? 'cube-outline') as never}
              size={20}
              color={tone.fg}
            />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Subheadingish>{CATEGORY_LABEL[category] ?? category}</Subheadingish>
            <Small numberOfLines={1}>
              {descriptor}
              {components.length > 1 ? ` + ${components.length - 1} more` : ''}
            </Small>
            <Tertiary>{installed}</Tertiary>
          </View>
        </Row>
        <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
      </Row>

      <Row justify="space-between" gap={spacing.md}>
        <StatusPill status={status.key} label={status.label} />
        {nextTask ? (
          <Small numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }}>
            {nextTask.title} · {relativeDayLabel(asOf, nextTask.dueDate)}
          </Small>
        ) : null}
      </Row>
    </Card>
  );
}

/** Local alias so the system card's title weight stays distinct from list rows. */
function Subheadingish({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Body style={{ fontWeight: '600', color: theme.text, fontSize: 16.5, letterSpacing: -0.2 }}>
      {children}
    </Body>
  );
}

function groupByCategory(components: HomeComponent[]): [ComponentCategory, HomeComponent[]][] {
  const groups = new Map<ComponentCategory, HomeComponent[]>();
  for (const component of components) {
    if (component.retiredOn) continue;
    const bucket = groups.get(component.category);
    if (bucket) bucket.push(component);
    else groups.set(component.category, [component]);
  }
  // Consequence order, so the roof and the heating are not below the microwave.
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
  return [...groups.entries()].sort(
    ([a], [b]) => order.indexOf(a) - order.indexOf(b),
  );
}
