import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import type { RecordConfidence, RecordGap } from '../core/engine/recordConfidence';
import { Body, Card, Divider, Meter, Row, SectionTitle, Small, Tertiary } from './components';
import { Touchable } from './motion';
import { fonts, radius, spacing, tabular, type, useTheme } from './theme';

/**
 * How much of the house Dwella knows, and what to add next.
 *
 * The counterpart to Home Health, and deliberately a different object on the
 * screen: health is a condition estimate about the building, this is a
 * completeness measure about the record. Keeping the progress bar, the
 * percentage and the "add three more" prompt on this card is what allows Home
 * Health to stay an honest assessment — nobody is being invited to raise their
 * home's condition by filling in a form.
 *
 * Gaps are listed by what they are worth rather than by category, because the
 * useful next action is the one that closes the most doubt, and a missing roof
 * is worth more than a missing dishwasher.
 */
export function RecordConfidenceCard({
  confidence,
  limit = 3,
}: {
  confidence: RecordConfidence;
  limit?: number;
}) {
  const theme = useTheme();
  const router = useRouter();
  const top = confidence.gaps.slice(0, limit);

  return (
    <Card raised={2}>
      <Row justify="space-between" align="flex-start" gap={spacing.md}>
        <View style={{ flex: 1, gap: 2 }}>
          <Tertiary>RECORD CONFIDENCE</Tertiary>
          <Text style={[type.subheading, { color: theme.text }]}>{confidence.headline}</Text>
        </View>
        <Text style={[type.title, { color: theme.text }, tabular]}>{confidence.percent}%</Text>
      </Row>

      <Meter
        value={confidence.percent}
        color={confidence.percent >= 80 ? theme.sage : confidence.percent >= 50 ? theme.blue : theme.amber}
      />

      <Small>
        How complete this home's record is — not how healthy the house is. Filling these in makes
        every forecast, warranty date and cost estimate rest on fact instead of a typical figure.
      </Small>

      {top.length > 0 ? (
        <>
          <Divider />
          <SectionTitle title={confidence.nextStep ?? 'What is missing'} />
          <View style={{ gap: spacing.sm }}>
            {top.map((gap) => (
              <GapRow
                key={gap.id}
                gap={gap}
                onPress={() =>
                  gap.componentId
                    ? router.push(`/component/${gap.componentId}`)
                    : gap.kind === 'property_detail'
                      ? router.push('/settings')
                      : router.push('/scan')
                }
              />
            ))}
          </View>
          {confidence.gaps.length > top.length ? (
            <Tertiary>
              and {confidence.gaps.length - top.length} more{' '}
              {confidence.gaps.length - top.length === 1 ? 'detail' : 'details'}
            </Tertiary>
          ) : null}
        </>
      ) : (
        <Row gap={spacing.sm}>
          <Ionicons name="checkmark-circle" size={16} color={theme.sage} />
          <Small style={{ flex: 1 }}>
            Everything Dwella knows to ask for is on record. Anything you add from here is detail
            beyond a complete record.
          </Small>
        </Row>
      )}
    </Card>
  );
}

function GapRow({ gap, onPress }: { gap: RecordGap; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Touchable onPress={onPress} scaleTo={0.99}>
      <Row gap={spacing.md} align="center">
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: radius.sm,
            backgroundColor: theme.surfaceSunken,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={ICON[gap.kind]} size={15} color={theme.textSecondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Body style={{ fontFamily: fonts.sans[600] }}>{gap.label}</Body>
          <Tertiary>{gap.detail}</Tertiary>
        </View>
        <Ionicons name="chevron-forward" size={15} color={theme.textTertiary} />
      </Row>
    </Touchable>
  );
}

const ICON: Record<RecordGap['kind'], keyof typeof Ionicons.glyphMap> = {
  missing_system: 'add-circle-outline',
  unknown_age: 'calendar-outline',
  thin_identification: 'pricetag-outline',
  property_detail: 'home-outline',
};
