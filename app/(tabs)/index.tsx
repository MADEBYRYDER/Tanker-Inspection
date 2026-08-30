import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { formatDate, relativeDayLabel, today } from '../../src/core/dates';
import { resolveComponentAge } from '../../src/core/engine/age';
import { computeForecast } from '../../src/core/engine/forecast';
import { computeHomeHealth } from '../../src/core/engine/health';
import { computeRecordConfidence } from '../../src/core/engine/recordConfidence';
import { coverageSummary, warrantyAlerts } from '../../src/core/engine/warrantyIntelligence';
import { generateTasks } from '../../src/core/engine/schedule';
import { formatApprox, formatMoney } from '../../src/core/money';
import type {
  ComponentCategory,
  ComponentHealth,
  HomeComponent,
  ScheduledTask,
} from '../../src/core/types';
import { usePlan } from '../../src/state/plan';
import { useHomeRecord, useStore } from '../../src/state/store';
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
import { DwellaLockup, DwellaMark } from '../../src/ui/logo';
import { PlusGate } from '../../src/ui/plus';
import { RecordConfidenceCard } from '../../src/ui/recordConfidence';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  elevation,
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
  const { can } = usePlan();
  const propertyCount = useStore((s) => s.properties.length);
  const asOf = today();

  const derived = useMemo(() => {
    if (!record) return undefined;
    const tasks = generateTasks(record, { asOf });
    const health = computeHomeHealth(record, { asOf, tasks });
    return {
      tasks,
      health,
      forecast: computeForecast(record, { asOf }),
      /*
       * Warranty figures are computed for both plans, not just for subscribers.
       * The free gate needs the count to say what it is actually missing, and
       * deriving it in a second place is how the gate and the feature drift
       * into disagreeing about the same house.
       */
      warrantyItems: warrantyAlerts(record, asOf).filter((a) => a.kind !== 'recently_lapsed'),
      coveredCount: coverageSummary(record, asOf).length,
      confidence: computeRecordConfidence(record, { asOf }),
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

  const { health, forecast, tasks, warrantyItems, coveredCount, confidence } = derived;
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
  /*
   * Overdue work first, then what is coming. Equipment that is merely ageing is
   * deliberately not in this list — it has no date and nothing to do today, and
   * the Home Health card above already counts it and links to the breakdown.
   */
  const dueSoon = [...attentionTasks, ...comingUp].slice(0, 5);

  const band = scoreBand(health.score);
  const firstName = record.viewer?.displayName.trim().split(' ')[0];
  const systems = groupByCategory(record.components);

  return (
    <Screen bleedTop gap={spacing.xl}>
      {/* ---- Hero -------------------------------------------------------- */}
      <HeroPanel>
        <View style={{ gap: spacing.lg }}>
          {/* Brand, and the one thing on this screen that is genuinely a nudge. */}
          <Row justify="space-between" align="center">
            <DwellaLockup size="sm" onDark />
            <Touchable
              onPress={() => router.push('/(tabs)/tasks')}
              accessibilityLabel={
                attentionCount > 0
                  ? `${attentionCount} things need attention`
                  : 'Nothing needs attention'
              }
              scaleTo={0.9}
            >
              <View>
                <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.82)" />
                {attentionCount > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -5,
                      minWidth: 17,
                      height: 17,
                      borderRadius: radius.pill,
                      paddingHorizontal: 4,
                      backgroundColor: theme.red,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 10.5, fontWeight: '700' }}>
                      {attentionCount > 9 ? '9+' : attentionCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Touchable>
          </Row>

          <View style={{ gap: 3 }}>
            <Text style={[type.title, { color: '#FFFFFF' }]}>
              {firstName ? `${greeting()}, ${firstName}.` : `${greeting()}.`}
            </Text>
            {/*
              Which home this is, and a way to change it. Sitting under the
              greeting rather than in a menu because on an account holding
              several properties, "which house am I looking at" is a question
              that has to be answered before anything else on the screen means
              anything.
            */}
            <Touchable onPress={() => router.push('/homes')} scaleTo={0.98}>
              <Row gap={6}>
                <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.55)" />
                <Text style={[type.small, { color: 'rgba(255,255,255,0.62)' }]} numberOfLines={1}>
                  {record.home.nickname}
                  {record.home.addressLine1 ? ` · ${record.home.addressLine1}` : ''}
                </Text>
                {propertyCount > 1 ? (
                  <Ionicons name="chevron-down" size={13} color="rgba(255,255,255,0.55)" />
                ) : null}
              </Row>
            </Touchable>
          </View>

          {hasEquipment ? (
            <>
              {/*
                Home Health as a light card floated on the hero. Putting it on
                paper rather than on the navy is what separates it from the
                brand furniture around it — it is a reading about the house, not
                a header.
              */}
              <Touchable onPress={() => router.push('/health')} scaleTo={0.985}>
                <View
                  style={[
                    {
                      backgroundColor: theme.surface,
                      borderRadius: radius.lg,
                      padding: spacing.lg,
                      gap: spacing.md,
                      // On light ground the shadow separates the card from the
                      // hero. On dark ground there is no shadow to see, and the
                      // card and the hero are both navy — so it needs an edge.
                      borderWidth: theme.dark ? 1 : 0,
                      borderColor: theme.border,
                    },
                    elevation(theme, 2),
                  ]}
                >
                  <Row justify="space-between" align="center" gap={spacing.md}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Row gap={5}>
                        <Text style={[type.label, { color: theme.textTertiary }]}>HOME HEALTH</Text>
                        <Ionicons
                          name="information-circle-outline"
                          size={13}
                          color={theme.textTertiary}
                        />
                      </Row>
                      <Text
                        style={[type.display, { color: toneFor(theme, band.key).fg, marginTop: 2 }]}
                      >
                        {band.label.toUpperCase()}
                      </Text>
                      <BodyStrong>
                        {attentionCount} {attentionCount === 1 ? 'thing needs' : 'things need'}{' '}
                        attention
                      </BodyStrong>
                      <Tertiary>Based on documented condition,{'\n'}age and maintenance.</Tertiary>
                    </View>
                    {/*
                      The band name is already set large beside the ring, so the
                      ring carries the denominator instead of repeating it.
                    */}
                    <ScoreRing score={health.score} label="/100" status={band.key} size={112} />
                  </Row>
                  <Divider />
                  <Row justify="space-between">
                    <BodyStrong>View all recommendations</BodyStrong>
                    <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                  </Row>
                </View>
              </Touchable>

              {/*
                Record Confidence, kept beside Home Health rather than merged
                into it: one is about the building, the other about what we know
                of it. The darker panel and the mark make it read as Dwella
                talking about itself, which is exactly what it is.
              */}
              <Touchable onPress={() => router.push('/health')} scaleTo={0.985}>
                <View
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderRadius: radius.lg,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.13)',
                    padding: spacing.lg,
                  }}
                >
                  <Row gap={spacing.lg} align="center">
                    <View style={{ alignItems: 'center', gap: 2, width: 104 }}>
                      <DwellaMark size={28} house="#FFFFFF" arc={theme.brandSageLight} />
                      <Text
                        style={[type.label, { color: 'rgba(255,255,255,0.5)', fontSize: 9 }]}
                      >
                        DWELLA KNOWS
                      </Text>
                      <Text style={[type.hero, { color: '#FFFFFF', fontSize: 32 }, tabular]}>
                        {confidence.percent}%
                      </Text>
                      <Text style={[type.small, { color: 'rgba(255,255,255,0.55)' }]}>
                        of your home
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: spacing.sm }}>
                      <Text style={[type.small, { color: 'rgba(255,255,255,0.88)' }]}>
                        {confidence.nextStep ?? 'Your record covers everything Dwella asks for.'}
                      </Text>
                      <Row gap={4}>
                        <Text style={[type.smallStrong, { color: theme.brandSageLight }]}>
                          {confidence.gaps.length > 0 ? 'Continue setup' : 'See what is on record'}
                        </Text>
                        <Ionicons name="chevron-forward" size={13} color={theme.brandSageLight} />
                      </Row>
                    </View>
                  </Row>
                </View>
              </Touchable>
            </>
          ) : null}
        </View>
      </HeroPanel>

      {/* ---- Your home at a glance --------------------------------------- */}
      {hasEquipment ? (
        <Enter>
          <View style={{ gap: spacing.md }}>
            <SectionTitle
              title="Your home at a glance"
              action="View all"
              onAction={() => router.push('/health')}
            />
            <SystemGlance
              systems={systems}
              health={health}
              onPress={(id) => router.push(`/component/${id}`)}
              onAll={() => router.push('/health')}
            />
          </View>
        </Enter>
      ) : null}

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
          {/* ---- Upcoming & due soon --------------------------------------- */}
          {dueSoon.length > 0 ? (
            <View style={{ gap: spacing.md }}>
              <Enter>
                <SectionTitle
                  title="Upcoming & due soon"
                  action="View all"
                  onAction={() => router.push('/(tabs)/tasks')}
                />
              </Enter>
              <Enter index={1}>
                <Card padding={spacing.lg}>
                  {dueSoon.map((task, index) => (
                    <View key={task.key} style={{ gap: spacing.md }}>
                      {index > 0 ? <Divider inset={54} /> : null}
                      <DueRow
                        task={task}
                        asOf={asOf}
                        onPress={() => router.push(`/task/${encodeURIComponent(task.key)}`)}
                      />
                    </View>
                  ))}
                </Card>
              </Enter>
            </View>
          ) : (
            <Enter>
              <Card>
                <Row gap={spacing.md}>
                  <IconTile icon="checkmark-circle-outline" status="good" size={40} />
                  <View style={{ flex: 1 }}>
                    <BodyStrong>Nothing due</BodyStrong>
                    <Small>Everything on your calendar is up to date.</Small>
                  </View>
                </Row>
              </Card>
            </Enter>
          )}

          {/*
            ---- Warranty intelligence ------------------------------------
            Placed above the figures because it is the only thing on this
            screen with a deadline attached to it. A warranty that runs out
            while the record already shows the item playing up is money left on
            the table, and it is invisible unless something says so here.
          */}
          {can('warranty_intelligence') ? (
            warrantyItems.length > 0 ? (
              <Enter index={2}>
                <View style={{ gap: spacing.md }}>
                  <SectionTitle title="Warranties" />
                  {warrantyItems.slice(0, 2).map((alert) => (
                    <Card
                      key={alert.componentId}
                      onPress={() => router.push(`/component/${alert.componentId}`)}
                      style={{
                        borderLeftWidth: 3,
                        borderLeftColor: alert.kind === 'act_now' ? theme.amber : theme.blue,
                      }}
                    >
                      <Row gap={spacing.md} align="flex-start">
                        <IconTile
                          icon="shield-checkmark-outline"
                          status={alert.kind === 'act_now' ? 'attention' : 'info'}
                          size={40}
                        />
                        <View style={{ flex: 1, gap: 3 }}>
                          <BodyStrong>{alert.title}</BodyStrong>
                          <Tertiary>{alert.detail}</Tertiary>
                          <Small style={{ color: theme.textSecondary }}>{alert.recommendation}</Small>
                        </View>
                      </Row>
                    </Card>
                  ))}
                </View>
              </Enter>
            ) : null
          ) : coveredCount > 0 ? (
            <Enter index={2}>
              <PlusGate
                icon="shield-checkmark-outline"
                title="Warranty intelligence"
                promise={`You have ${coveredCount} ${coveredCount === 1 ? 'warranty' : 'warranties'} still running on this home. Dwella+ watches them and tells you before one ends — especially when your own record already shows that item playing up.`}
              />
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

/**
 * The whole house, one line.
 *
 * Grouped by category and taking each group's worst member, because a homeowner
 * thinks "my HVAC", not "my condenser and my air handler" — and because a strip
 * of four tiles reading Good / Good / Plan ahead / Attention is scanned in a
 * second, where four component names are read one at a time.
 *
 * Worst first, so the thing worth knowing is never the one you have to scroll to.
 */
function SystemGlance({
  systems,
  health,
  onPress,
  onAll,
}: {
  systems: [ComponentCategory, HomeComponent[]][];
  health: ReturnType<typeof computeHomeHealth>;
  onPress: (componentId: string) => void;
  onAll: () => void;
}) {
  const theme = useTheme();

  const RANK: Record<string, number> = { urgent: 0, attention: 1, neutral: 2, good: 3 };
  const groups = systems
    .map(([category, components]) => {
      const scored = components
        .map((c) => health.components.find((h) => h.componentId === c.id))
        .filter((h): h is ComponentHealth => Boolean(h));
      const worst = scored.sort((a, b) => a.score - b.score)[0];
      return worst ? { category, worst } : undefined;
    })
    .filter((g): g is { category: ComponentCategory; worst: ComponentHealth } => Boolean(g))
    .sort(
      (a, b) =>
        RANK[healthStatus(a.worst.status).key]! - RANK[healthStatus(b.worst.status).key]! ||
        a.worst.score - b.worst.score,
    );

  const shown = groups.slice(0, 4);
  const rest = groups.length - shown.length;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
    >
      {shown.map(({ category, worst }) => {
        const status = healthStatus(worst.status);
        const tone = toneFor(theme, status.key);
        return (
          <Touchable key={category} onPress={() => onPress(worst.componentId)} scaleTo={0.96}>
            <View
              style={[
                {
                  width: 96,
                  borderRadius: radius.md,
                  backgroundColor: theme.surface,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.sm,
                  alignItems: 'center',
                  gap: 5,
                },
                elevation(theme, 1),
              ]}
            >
              <Ionicons
                name={(CATEGORY_ICON[category] ?? 'cube-outline') as never}
                size={20}
                color={tone.fg}
              />
              <Text
                style={[
                  type.smallStrong,
                  { color: theme.text, textAlign: 'center', fontSize: 12.5, lineHeight: 15 },
                ]}
                numberOfLines={2}
              >
                {CATEGORY_LABEL[category] ?? category}
              </Text>
              <Text
                style={{ fontSize: 11, fontWeight: '600', color: tone.fg, textAlign: 'center' }}
                numberOfLines={1}
              >
                {status.short}
              </Text>
            </View>
          </Touchable>
        );
      })}

      {rest > 0 ? (
        <Touchable onPress={onAll} scaleTo={0.96}>
          <View
            style={{
              width: 96,
              borderRadius: radius.md,
              backgroundColor: theme.surfaceSunken,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.sm,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              flex: 1,
            }}
          >
            <Ionicons name="grid-outline" size={20} color={theme.textSecondary} />
            <Text style={[type.smallStrong, { color: theme.text }]}>+{rest} More</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: theme.textTertiary }}>
              View all
            </Text>
          </View>
        </Touchable>
      ) : null}
    </ScrollView>
  );
}

/**
 * One line of work: when, what, and the verb for doing it.
 *
 * The action word is the honest one for the job — a task with a
 * `proOnlyReason` cannot be done by the owner, so offering "Do it" there would
 * be sending somebody up a ladder the app has already said not to climb.
 */
function DueRow({
  task,
  asOf,
  onPress,
}: {
  task: ScheduledTask;
  asOf: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const status = urgencyStatus(task.urgency, task.criticality);
  const tone = toneFor(theme, status.key);
  const needsPro = Boolean(task.diy.proOnlyReason);

  return (
    <Touchable onPress={onPress} scaleTo={0.99}>
      <Row gap={spacing.md} justify="space-between">
        <DateChip date={task.dueDate} />
        <View style={{ flex: 1, gap: 1 }}>
          <BodyStrong numberOfLines={1}>{task.title}</BodyStrong>
          <Small
            numberOfLines={1}
            style={{ color: task.urgency === 'overdue' ? theme.red : tone.fg }}
          >
            {task.urgency === 'overdue'
              ? `Overdue — was due ${relativeDayLabel(asOf, task.dueDate)}`
              : relativeDayLabel(asOf, task.dueDate)}
          </Small>
        </View>
        <View
          style={{
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: needsPro ? theme.border : theme.amber,
            backgroundColor: needsPro ? 'transparent' : theme.amberSoft,
            paddingHorizontal: 13,
            paddingVertical: 6,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: needsPro ? theme.textSecondary : theme.amber,
            }}
          >
            {needsPro ? 'Schedule' : 'Do it'}
          </Text>
        </View>
      </Row>
    </Touchable>
  );
}
