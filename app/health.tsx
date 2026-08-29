import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { today } from '../src/core/dates';
import { computeHomeHealth } from '../src/core/engine/health';
import { useHomeRecord } from '../src/state/store';
import {
  BarRow,
  Body,
  Card,
  Divider,
  EmptyState,
  Label,
  Row,
  Screen,
  ScoreRing,
  Small,
  StatusPill,
  Tertiary,
  Title,
} from '../src/ui/components';
import { healthStatus, scoreBand, scoreColor, spacing, toneFor, useTheme } from '../src/ui/theme';

/**
 * Home Health, explained.
 *
 * The score is a summary, and a summary that cannot be interrogated is a summary
 * nobody acts on. So this screen exists to answer "why" for every system: what the
 * app knows, what it inferred, and what it is not claiming.
 *
 * Numbers are shown as whole values and paired with a plain-language status.
 * "Planning recommended" is the useful output. "42.3%" would imply a measurement
 * precision the underlying lifespan tables do not support.
 */
export default function HealthScreen() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const asOf = today();

  const health = useMemo(
    () => (record ? computeHomeHealth(record, { asOf }) : undefined),
    [record, asOf],
  );

  if (!record || !health) return <Screen><Small>Set up your home first.</Small></Screen>;

  if (health.components.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="pulse-outline"
          title="Nothing scored yet"
          body="Scan your equipment and each system gets a condition estimate you can drill into."
        />
      </Screen>
    );
  }

  const band = scoreBand(health.score);

  return (
    <Screen gap={spacing.xl}>
      <Card style={{ alignItems: 'center', gap: spacing.lg }} padding={spacing.xxl} raised={2}>
        <ScoreRing
          score={health.score}
          label={band.label}
          color={scoreColor(theme, health.score)}
          size={168}
        />
        <Body style={{ textAlign: 'center' }}>{health.summary}</Body>
      </Card>

      <View style={{ gap: spacing.lg }}>
        <Label>By system</Label>
        <Card>
          {health.components.map((component, index) => {
            const status = healthStatus(component.status);
            const tone = toneFor(theme, status.key);
            return (
              <View key={component.componentId} style={{ gap: spacing.md }}>
                {index > 0 ? <Divider /> : null}
                <BarRow
                  label={component.name}
                  value={component.score}
                  color={tone.fg}
                  trailing={status.label}
                  onPress={() => router.push(`/component/${component.componentId}`)}
                />
              </View>
            );
          })}
        </Card>
        <Tertiary>Tap any system to see the full reasoning and its history.</Tertiary>
      </View>

      {/* The worst two, spelled out — the ones actually worth reading */}
      <View style={{ gap: spacing.lg }}>
        <Label>Why these need attention</Label>
        {health.components
          .filter((c) => c.status === 'aging' || c.status === 'plan_replacement' || c.status === 'unknown')
          .slice(0, 3)
          .map((component) => {
            const status = healthStatus(component.status);
            return (
              <Card
                key={component.componentId}
                onPress={() => router.push(`/component/${component.componentId}`)}
              >
                <Row justify="space-between">
                  <Body style={{ fontWeight: '600' }}>{component.name}</Body>
                  <StatusPill status={status.key} label={status.label} />
                </Row>
                <View style={{ gap: spacing.sm }}>
                  {component.reasons.map((reason, index) => (
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
            );
          })}
      </View>

      <Card tone={theme.surfaceSunken}>
        <Label>What is known vs. inferred</Label>
        <Small>
          {Math.round(health.dataConfidence * 100)}% of this score rests on documented dates — an
          install date you entered, or a date code read off a nameplate. The rest is estimated from
          the age of the house and typical service life for that kind of equipment.
        </Small>
        <Row gap={spacing.lg}>
          <Row gap={6}>
            <Ionicons name="document-text-outline" size={14} color={theme.sage} />
            <Tertiary>On record</Tertiary>
          </Row>
          <Row gap={6}>
            <Ionicons name="analytics-outline" size={14} color={theme.textTertiary} />
            <Tertiary>Estimated</Tertiary>
          </Row>
        </Row>
        <Small>
          Nothing here is an inspection. A system marked good can still fail tomorrow, and one marked
          for planning may run for years — this is a budgeting and scheduling tool, not a diagnosis.
        </Small>
      </Card>
    </Screen>
  );
}
