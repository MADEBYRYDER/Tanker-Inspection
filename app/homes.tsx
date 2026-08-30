import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { today } from '../src/core/dates';
import { PROPERTY_TYPES, ROLE_LABEL, propertyTypeLabel } from '../src/core/account';
import { computeHomeHealth } from '../src/core/engine/health';
import { generateTasks } from '../src/core/engine/schedule';
import { usePlan } from '../src/state/plan';
import { useProperties, useStore } from '../src/state/store';
import {
  Badge,
  Card,
  Divider,
  Enter,
  IconTile,
  Row,
  Screen,
  SectionTitle,
  Small,
  Tertiary,
  Title,
} from '../src/ui/components';
import { Touchable } from '../src/ui/motion';
import { PlusGate } from '../src/ui/plus';
import { healthStatus, radius, spacing, tabular, type, useTheme } from '../src/ui/theme';

/**
 * My Homes.
 *
 * The switcher exists because an account holds properties rather than being one.
 * Someone with a residence, a beach house, and three rentals is not an edge case
 * to bolt on later — they are the reason the data model separates the person
 * from the place, and this screen is where that separation becomes visible.
 *
 * Each row carries the thing you actually switch homes to find out: what needs
 * attention there. A list of names would make you visit each one to learn what
 * you could have been told here.
 */
export default function Homes() {
  const theme = useTheme();
  const router = useRouter();
  const properties = useProperties();
  const setActive = useStore((s) => s.setActiveProperty);
  const components = useStore((s) => s.components);
  const events = useStore((s) => s.events);
  const completions = useStore((s) => s.completions);
  const documents = useStore((s) => s.documents);
  const serviceRequests = useStore((s) => s.serviceRequests);
  const { homes } = usePlan();
  const asOf = today();

  /*
   * Each property's summary is computed from its own slice of the flat arrays.
   * Done here in one pass rather than per row so switching a home does not cost
   * a re-run of every other home's scheduler.
   */
  const summaries = useMemo(() => {
    const out = new Map<string, { attention: number; systems: number; status: string }>();
    for (const { home } of properties) {
      const record = {
        home,
        components: components.filter((c) => c.homeId === home.id),
        events: events.filter((e) => e.homeId === home.id),
        documents: documents.filter((d) => d.homeId === home.id),
        completions: completions.filter((c) => c.homeId === home.id),
        serviceRequests: serviceRequests.filter((r) => r.homeId === home.id),
      };
      if (record.components.length === 0) {
        out.set(home.id, { attention: 0, systems: 0, status: 'Nothing scanned yet' });
        continue;
      }
      const tasks = generateTasks(record, { asOf });
      const health = computeHomeHealth(record, { asOf, tasks });
      const attention =
        health.components.filter((c) => c.status === 'aging' || c.status === 'plan_replacement')
          .length + tasks.filter((t) => t.urgency === 'overdue').length;
      out.set(home.id, {
        attention,
        systems: record.components.length,
        status:
          attention === 0
            ? 'Nothing needs attention'
            : `${attention} ${attention === 1 ? 'thing needs' : 'things need'} attention`,
      });
    }
    return out;
  }, [properties, components, events, documents, completions, serviceRequests, asOf]);

  return (
    <Screen gap={spacing.xl}>
      <View style={{ gap: spacing.sm }}>
        <Title>My Homes</Title>
        <Small>
          Each property keeps its own record — its equipment, history, schedule, and costs are
          entirely separate from the others.
        </Small>
      </View>

      <View style={{ gap: spacing.md }}>
        {properties.map(({ home, role, isActive }, index) => {
          const summary = summaries.get(home.id);
          const typeIcon =
            PROPERTY_TYPES.find((t) => t.key === home.propertyType)?.icon ?? 'home-outline';
          return (
            <Enter key={home.id} index={index}>
              <Card
                raised={isActive ? 2 : 1}
                onPress={() => {
                  setActive(home.id);
                  router.replace('/(tabs)');
                }}
                style={
                  isActive
                    ? { borderColor: theme.ink, borderWidth: 1.5 }
                    : undefined
                }
              >
                <Row gap={spacing.md} align="flex-start">
                  <IconTile
                    icon={typeIcon as never}
                    status={summary && summary.attention > 0 ? 'attention' : 'neutral'}
                    size={44}
                  />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Row gap={spacing.sm}>
                      <Text style={[type.subheading, { color: theme.text, flex: 1 }]} numberOfLines={1}>
                        {home.nickname}
                      </Text>
                      {isActive ? (
                        <Ionicons name="checkmark-circle" size={18} color={theme.sage} />
                      ) : null}
                    </Row>
                    <Tertiary numberOfLines={1}>
                      {[home.addressLine1, home.city].filter(Boolean).join(', ') ||
                        propertyTypeLabel(home.propertyType)}
                    </Tertiary>
                    <Row gap={spacing.sm} wrap>
                      <Badge
                        label={propertyTypeLabel(home.propertyType)}
                        fg={theme.textSecondary}
                        bg={theme.surfaceSunken}
                      />
                      {role ? (
                        <Badge label={ROLE_LABEL[role]} fg={theme.blue} bg={theme.blueSoft} />
                      ) : null}
                    </Row>
                  </View>
                </Row>
                <Divider />
                <Row justify="space-between">
                  <Small
                    style={{
                      color: summary && summary.attention > 0 ? theme.amber : theme.textSecondary,
                    }}
                  >
                    {summary?.status ?? '—'}
                  </Small>
                  <Tertiary style={tabular}>
                    {summary?.systems ?? 0} {summary?.systems === 1 ? 'system' : 'systems'} ·{' '}
                    {home.publicId}
                  </Tertiary>
                </Row>
              </Card>
            </Enter>
          );
        })}
      </View>

      {/*
       * The limit is stated before the tap, not after. Discovering a cap inside
       * an "add a home" form you have already half filled in is the worst place
       * to learn about it.
       */}
      {homes.canAddAnother ? (
        <Enter index={properties.length}>
          <Touchable
            onPress={() => router.push('/home/new')}
            style={{
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: theme.border,
              borderRadius: radius.lg,
              padding: spacing.xl,
              alignItems: 'center',
              gap: spacing.sm,
            }}
          >
            <Ionicons name="add-circle-outline" size={26} color={theme.textSecondary} />
            <Text style={[type.bodyStrong, { color: theme.text }]}>Add a home</Text>
            {/*
              What the next one costs, stated plainly. "As many as you need" was
              here and was false: every plan includes a number and bills beyond
              it, and finding that out on a statement rather than on this line
              is exactly the kind of surprise that loses a subscriber.
            */}
            <Tertiary style={{ textAlign: 'center' }}>
              {homes.included > homes.count
                ? `${homes.included - homes.count} more included in your plan.`
                : `${homes.extraPriceLabel} a month for each home beyond the ${homes.included === 1 ? 'first' : `first ${homes.included}`}.`}
            </Tertiary>
          </Touchable>
        </Enter>
      ) : (
        <Enter index={properties.length}>
          <PlusGate
            icon="business-outline"
            title="More than one property"
            promise={`Dwella Free covers one home. Dwella+ covers your household and adds properties at ${homes.extraPriceLabel} a month each — a beach house, a rental, a parent's place, each with its own separate record.`}
          />
        </Enter>
      )}

      <Card tone={theme.surfaceSunken} raised={0}>
        <SectionTitle title="Why they are separate" />
        <Small>
          A property's record belongs to the building, not to your account. That is what lets you
          hand it to a buyer when you sell, and what keeps a rental's history intact when a tenant
          or a manager changes.
        </Small>
      </Card>
    </Screen>
  );
}
