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
  Badge,
  Body,
  BodyStrong,
  Button,
  Card,
  EmptyState,
  Faint,
  Heading,
  Muted,
  Row,
  Screen,
  Title,
} from '../../src/ui/components';
import { spacing, useTheme } from '../../src/ui/theme';

const EVENT_ICON: Record<TimelineEventType, keyof typeof Ionicons.glyphMap> = {
  installation: 'add-circle-outline',
  service: 'construct-outline',
  repair: 'build-outline',
  replacement: 'swap-horizontal-outline',
  inspection: 'search-outline',
  improvement: 'trending-up-outline',
  issue: 'alert-circle-outline',
};

export default function Timeline() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();

  const groups = useMemo(() => (record ? groupEventsByYear(record.events) : []), [record]);
  const componentName = useMemo(
    () => new Map((record?.components ?? []).map((c) => [c.id, c.name])),
    [record],
  );

  if (!record) return <Screen><Muted>Set up your home first.</Muted></Screen>;

  if (groups.length === 0) {
    return (
      <Screen>
        <Title>Home Timeline</Title>
        <EmptyState
          icon="time-outline"
          title="Nothing recorded yet"
          body="Photograph an invoice, a receipt, or a warranty and it will be read, dated, and filed against the right equipment. Over time this becomes the history that transfers with the house."
          action={
            <Button label="Add a document" icon="document-attach-outline" onPress={() => router.push('/document')} />
          }
        />
      </Screen>
    );
  }

  const totalDocumented = record.events.reduce((sum, e) => sum + (e.costCents ?? 0), 0);

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Title>Home Timeline</Title>
        <Muted>
          {record.events.length} recorded {record.events.length === 1 ? 'entry' : 'entries'} ·{' '}
          {formatMoney(totalDocumented)} documented
        </Muted>
      </View>

      <Row gap={spacing.sm} wrap>
        <Button label="Add a document" icon="document-attach-outline" onPress={() => router.push('/document')} />
        <Button
          label="Home Record"
          icon="ribbon-outline"
          variant="secondary"
          onPress={() => router.push('/record')}
        />
      </Row>

      {groups.map((group) => (
        <View key={group.year} style={{ gap: spacing.sm }}>
          <Row justify="space-between">
            <Heading>{group.year}</Heading>
            <Muted>{group.totalCents > 0 ? formatMoney(group.totalCents) : '—'}</Muted>
          </Row>

          {group.events.map((event) => (
            <Card
              key={event.id}
              onPress={
                event.componentId ? () => router.push(`/component/${event.componentId}`) : undefined
              }
            >
              <Row justify="space-between" align="flex-start" gap={spacing.md}>
                <Row gap={spacing.md} align="flex-start" style={{ flex: 1 }}>
                  <Ionicons
                    name={EVENT_ICON[event.type]}
                    size={19}
                    color={theme.textMuted}
                    style={{ marginTop: 2 }}
                  />
                  <View style={{ flex: 1, gap: 3 }}>
                    <BodyStrong>{event.title}</BodyStrong>
                    <Faint>
                      {formatDate(event.date)}
                      {event.vendor ? ` · ${event.vendor}` : ''}
                      {event.componentId ? ` · ${componentName.get(event.componentId) ?? ''}` : ''}
                    </Faint>
                    {event.description ? (
                      <Body style={{ color: theme.textMuted, marginTop: 2 }} numberOfLines={3}>
                        {event.description}
                      </Body>
                    ) : null}
                    <Row gap={spacing.xs} wrap style={{ marginTop: 2 }}>
                      {event.source === 'contractor' ? (
                        <Badge label="from contractor" fg={theme.info} bg={theme.infoSoft} />
                      ) : null}
                      {event.source === 'ai_document' ? (
                        <Badge label="read from document" fg={theme.info} bg={theme.infoSoft} />
                      ) : null}
                      {event.visibility === 'private' ? (
                        <Badge label="private" fg={theme.textMuted} bg={theme.surfaceAlt} />
                      ) : null}
                      {event.documentIds.length > 0 ? (
                        <Badge
                          label={`${event.documentIds.length} doc${event.documentIds.length === 1 ? '' : 's'}`}
                          fg={theme.textMuted}
                          bg={theme.surfaceAlt}
                        />
                      ) : null}
                    </Row>
                  </View>
                </Row>
                {event.costCents !== undefined ? (
                  <BodyStrong>{formatMoney(event.costCents)}</BodyStrong>
                ) : null}
              </Row>
            </Card>
          ))}
        </View>
      ))}

      <Card>
        <Heading>What transfers, and what doesn't</Heading>
        <Muted>
          The work itself — what was done, when, and by whom — moves to the next owner if you sell.
          What you paid does not, unless you choose to include it. Anything you mark private stays
          with you entirely.
        </Muted>
      </Card>
    </Screen>
  );
}
