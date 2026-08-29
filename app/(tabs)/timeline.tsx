import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { formatDate } from '../../src/core/dates';
import { groupEventsByYear } from '../../src/core/engine/timeline';
import { formatMoney } from '../../src/core/money';
import type { TimelineEventType } from '../../src/core/types';
import { useHomeRecord } from '../../src/state/store';
import {
  Body,
  BodyStrong,
  Button,
  Card,
  Divider,
  EmptyState,
  Heading,
  Row,
  Screen,
  Small,
  Tertiary,
  Title,
} from '../../src/ui/components';
import { radius, spacing, useTheme } from '../../src/ui/theme';

const EVENT_ICON: Record<TimelineEventType, string> = {
  installation: 'add-circle-outline',
  service: 'construct-outline',
  repair: 'build-outline',
  replacement: 'swap-horizontal-outline',
  inspection: 'search-outline',
  improvement: 'trending-up-outline',
  issue: 'alert-circle-outline',
};

/**
 * The Home Timeline.
 *
 * Everything that has happened to the house, newest first, with a year total. This
 * is the artefact that eventually transfers to a new owner, so it reads as a record
 * rather than an activity feed — dates on the left, what happened in the middle,
 * what it cost on the right.
 */
export default function Timeline() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();

  const groups = useMemo(() => (record ? groupEventsByYear(record.events) : []), [record]);
  const componentName = useMemo(
    () => new Map((record?.components ?? []).map((c) => [c.id, c.name])),
    [record],
  );

  if (!record) return <Screen><Small>Set up your home first.</Small></Screen>;

  if (groups.length === 0) {
    return (
      <Screen>
        <Title>Timeline</Title>
        <EmptyState
          icon="time-outline"
          title="Nothing recorded yet"
          body="Photograph an invoice, receipt, or warranty and it will be read, dated, and filed against the right equipment. Over time this becomes the history that transfers with the house."
          action={<Button label="Add receipt" icon="receipt-outline" onPress={() => router.push('/document')} />}
        />
      </Screen>
    );
  }

  const total = record.events.reduce((sum, e) => sum + (e.costCents ?? 0), 0);

  return (
    <Screen gap={spacing.xl}>
      <View style={{ gap: 4, marginTop: spacing.sm }}>
        <Title>Timeline</Title>
        <Small>
          {record.events.length} {record.events.length === 1 ? 'entry' : 'entries'} ·{' '}
          {formatMoney(total)} documented
        </Small>
      </View>

      {groups.map((group) => (
        <View key={group.year} style={{ gap: spacing.md }}>
          <Row justify="space-between" align="flex-end">
            <Heading>{group.year}</Heading>
            <Small>{group.totalCents > 0 ? formatMoney(group.totalCents) : '—'}</Small>
          </Row>

          <Card padding={spacing.lg}>
            {group.events.map((event, index) => (
              <View key={event.id} style={{ gap: spacing.md }}>
                {index > 0 ? <Divider inset={48} /> : null}
                <Row
                  gap={spacing.md}
                  align="flex-start"
                  justify="space-between"
                  style={{ paddingVertical: 2 }}
                >
                  <Row gap={spacing.md} style={{ flex: 1 }} align="flex-start">
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: radius.md,
                        backgroundColor: theme.surfaceSunken,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons
                        name={(EVENT_ICON[event.type] ?? 'ellipse-outline') as never}
                        size={17}
                        color={theme.textSecondary}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <BodyStrong>{event.title}</BodyStrong>
                      <Small>
                        {formatDate(event.date)}
                        {event.vendor ? ` · ${event.vendor}` : ''}
                      </Small>
                      {event.componentId ? (
                        <Tertiary>{componentName.get(event.componentId) ?? ''}</Tertiary>
                      ) : null}
                      {event.description ? (
                        <Body
                          numberOfLines={2}
                          style={{ color: theme.textSecondary, fontSize: 14, marginTop: 2 }}
                        >
                          {event.description}
                        </Body>
                      ) : null}
                    </View>
                  </Row>
                  {event.costCents !== undefined ? (
                    <BodyStrong>{formatMoney(event.costCents)}</BodyStrong>
                  ) : null}
                </Row>
              </View>
            ))}
          </Card>
        </View>
      ))}

      <Card tone={theme.surfaceSunken}>
        <BodyStrong>What transfers when you sell</BodyStrong>
        <Small>
          The work itself — what was done, when, and by whom — moves to the next owner. What you paid
          does not, unless you choose to include it. Anything marked private stays with you entirely.
        </Small>
        <Button label="Open Home Record" variant="quiet" size="sm" onPress={() => router.push('/record')} />
      </Card>
    </Screen>
  );
}
