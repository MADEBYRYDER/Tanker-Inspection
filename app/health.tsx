import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { today } from '../src/core/dates';
import { computeHomeHealth } from '../src/core/engine/health';
import { computeRecordConfidence } from '../src/core/engine/recordConfidence';
import { usePlan } from '../src/state/plan';
import { useHomeRecord } from '../src/state/store';
import {
  BarRow,
  Body,
  Card,
  Enter,
  HeroPanel,
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
import { PlusGate } from '../src/ui/plus';
import { RecordConfidenceCard } from '../src/ui/recordConfidence';
import { healthStatus, scoreBand, spacing, tabular, toneFor, useTheme } from '../src/ui/theme';

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
  const { can } = usePlan();
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

  const documentedPct = Math.round(health.dataConfidence * 100);
  const confidence = computeRecordConfidence(record, { asOf: today() });
  const attention = health.components.filter(
    (c) => c.status === 'aging' || c.status === 'plan_replacement' || c.status === 'unknown',
  );

  return (
    <Screen gap={spacing.xl} bleedTop>
      {/* The same dark panel as the dashboard, so the score reads as one object
          the user has followed from one screen to the next. */}
      <HeroPanel>
        <View style={{ alignItems: 'center', gap: spacing.lg, paddingTop: spacing.sm }}>
          <ScoreRing score={health.score} label={band.label} status={band.key} size={186} onDark />
          <Text
            style={{
              color: 'rgba(255,255,255,0.86)',
              fontSize: 15,
              lineHeight: 22,
              textAlign: 'center',
            }}
          >
            {health.summary}
          </Text>
          <Row gap={spacing.xl}>
            <HeroStat value={`${health.components.length}`} label="systems" />
            <HeroStat value={`${attention.length}`} label="need attention" />
            <HeroStat value={`${documentedPct}%`} label="documented" />
          </Row>
        </View>
      </HeroPanel>

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
        <Tertiary>Tap any system to see its history.</Tertiary>
      </View>

      {/*
       * The reasoning is the paid half. Free gets the picture — which systems are
       * fine and which are not, which is the thing a homeowner needs to know and
       * should never have to pay for. Dwella+ gets the "why": what Dwella read,
       * what it inferred, and which of the two each conclusion rests on.
       */}
      {can('health_detail') ? (
        <View style={{ gap: spacing.lg }}>
          <Label>Why these need attention</Label>
          {attention.slice(0, 3).map((component) => {
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
      ) : (
        <PlusGate
          icon="pulse-outline"
          title="Why each system has its status"
          promise={
            attention.length > 0
              ? `${attention.length === 1 ? 'One system needs' : `${attention.length} systems need`} attention — ${attention
                  .slice(0, 3)
                  .map((c) => c.name)
                  .join(', ')}${attention.length > 3 ? ', and more' : ''}. Dwella+ explains what led to each status, which parts of it are documented fact and which are estimated, and what to do next.`
              : 'Every system comes with the reasoning behind its status — what Dwella read off your record, what it inferred, and which is which.'
          }
        />
      )}

      {/*
        Record Confidence, kept as its own object rather than folded into the
        score above. The house does not get healthier because we learned more
        about it, so the progress bar and the "add these" prompt live here.
      */}
      <RecordConfidenceCard confidence={confidence} />

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

/** A small figure on the dark hero. Three across, under the ring. */
function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 1 }}>
      <Text style={[{ color: '#FFFFFF', fontSize: 19, fontWeight: '700', letterSpacing: -0.5 }, tabular]}>
        {value}
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11.5, fontWeight: '600', letterSpacing: 0.3 }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}
