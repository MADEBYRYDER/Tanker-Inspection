import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import type { GuidedProgress } from '../core/engine/guided';
import type { RecordConfidence } from '../core/engine/recordConfidence';
import { Card, Meter, Row, Small, Tertiary } from './components';
import { Touchable } from './motion';
import { fonts, radius, spacing, tabular, type, useTheme } from './theme';

/**
 * Building the record, as a run of steps rather than a number.
 *
 * Shown while the record is still thin and gone once it is not. A checklist is
 * the right shape for the first week — it says how far along you are and what is
 * next, which a percentage alone does not — and exactly the wrong shape for year
 * three, when a permanent list of unticked boxes on the home screen reads as
 * nagging about a house somebody has already documented.
 *
 * It hangs off Record Confidence and never off Home Health. Ticking these boxes
 * is the owner telling Dwella about the building; it changes what we know, not
 * what the building is. Attaching a checklist to a condition score would make
 * the condition score something you could complete.
 */
export function BuildYourRecord({
  confidence,
  progress,
  onContinue,
}: {
  confidence: RecordConfidence;
  progress: GuidedProgress;
  onContinue: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();

  const steps = progress.steps.slice(0, 6);

  return (
    <Card raised={2}>
      <Row justify="space-between" align="flex-start" gap={spacing.md}>
        <View style={{ flex: 1, gap: 2 }}>
          <Tertiary>BUILD YOUR HOME RECORD</Tertiary>
          <Text style={[type.subheading, { color: theme.text }]}>
            Dwella knows {confidence.percent}% of your home
          </Text>
        </View>
        <Text style={[type.title, { color: theme.text }, tabular]}>{confidence.percent}%</Text>
      </Row>

      <Meter value={confidence.percent} color={theme.sage} />

      <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
        {/*
          The two steps setup already completed are shown ticked rather than
          omitted. A checklist that starts at zero when the person has just
          finished creating a property and adding a system tells them their work
          did not count.
        */}
        <StepRow done label="Property created" />
        <StepRow done={confidence.total > 0 && steps.some((s) => s.done)} label="First system added" />
        {steps
          .filter((step) => !step.done)
          .slice(0, 4)
          .map((step) => (
            <StepRow
              key={step.id}
              done={false}
              label={`Add ${step.label.toLowerCase()}`}
              onPress={() => router.push('/scan/guided')}
            />
          ))}
      </View>

      <Touchable onPress={onContinue} scaleTo={0.99} accessibilityLabel="Continue Home Scan">
        <Row
          gap={spacing.sm}
          justify="center"
          style={{
            backgroundColor: theme.ink,
            borderRadius: radius.md,
            paddingVertical: 13,
            marginTop: spacing.xs,
          }}
        >
          <Feather name="maximize" size={16} color={theme.onInk} />
          <Text style={{ fontSize: 15, fontFamily: fonts.sans[600], color: theme.onInk }}>
            Continue Home Scan
          </Text>
        </Row>
      </Touchable>

      <Tertiary>
        This is how much of your home Dwella knows — not how healthy it is. The two move for
        different reasons.
      </Tertiary>
    </Card>
  );
}

function StepRow({
  done,
  label,
  onPress,
}: {
  done: boolean;
  label: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const body = (
    <Row gap={spacing.md} align="center">
      <Feather
        name={done ? 'check-circle' : 'circle'}
        size={17}
        color={done ? theme.sage : theme.textTertiary}
      />
      <Small style={{ flex: 1, color: done ? theme.textSecondary : theme.text }}>{label}</Small>
      {onPress ? <Feather name="chevron-right" size={15} color={theme.textTertiary} /> : null}
    </Row>
  );
  return onPress ? (
    <Touchable onPress={onPress} scaleTo={0.99}>
      {body}
    </Touchable>
  ) : (
    body
  );
}
