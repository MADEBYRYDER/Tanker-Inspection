import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { isGatewayConfigured } from '../../src/ai/client';
import { relativeDayLabel, today } from '../../src/core/dates';
import { guidedProgress } from '../../src/core/engine/guided';
import { useHomeRecord } from '../../src/state/store';
import {
  Card,
  Divider,
  Enter,
  HeroPanel,
  IconTile,
  Notice,
  Row,
  Screen,
  ScoreRing,
  SectionTitle,
  Small,
  Tertiary,
  Touchable,
} from '../../src/ui/components';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  elevation,
  radius,
  spacing,
  tabular,
  type,
  useTheme,
  type StatusKey,
} from '../../src/ui/theme';

/**
 * The scan hub.
 *
 * The product's core loop is "see something, scan it", so this screen has to make
 * the four ways in unmissable and the next step obvious. Four large tiles rather
 * than a menu; twenty small entries would expose more and get used less.
 *
 * The hero carries record completeness, because the honest answer to "what should
 * I scan next" is usually "the area you haven't covered yet" — and a percentage
 * that moves is what gets someone to finish an hour-long job across a weekend.
 */
export default function ScanHub() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const asOf = today();

  const progress = useMemo(() => (record ? guidedProgress(record) : undefined), [record]);

  const recent = useMemo(() => {
    if (!record) return [];
    return [...record.components]
      .filter((c) => !c.retiredOn)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 3);
  }, [record]);

  const complete = progress !== undefined && progress.percent >= 100;

  return (
    <Screen bleedTop gap={spacing.xl}>
      <HeroPanel>
        <View style={{ gap: spacing.xl }}>
          <View style={{ gap: 3 }}>
            <Text style={[type.title, { color: '#FFFFFF' }]}>Scan</Text>
            <Text style={[type.small, { color: 'rgba(255,255,255,0.68)' }]}>
              Point your camera at it and the record fills itself in.
            </Text>
          </View>

          {progress ? (
            <Touchable onPress={() => router.push('/scan/guided')} scaleTo={0.985}>
              <Row gap={spacing.xl}>
                <ScoreRing
                  score={progress.percent}
                  label={complete ? 'Complete' : 'Covered'}
                  status="good"
                  size={106}
                  onDark
                />
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <Text style={[type.label, { color: 'rgba(255,255,255,0.5)' }]}>HOME RECORD</Text>
                  <Text style={[type.small, { color: 'rgba(255,255,255,0.86)' }]}>
                    {complete
                      ? `All ${progress.steps.length} areas covered. Keep adding equipment any time — every addition sharpens the schedule and the forecast.`
                      : `${progress.done.length} of ${progress.steps.length} areas covered. Next up: ${progress.next?.label}.`}
                  </Text>
                  {!complete ? (
                    <Row gap={4}>
                      <Text style={[type.smallStrong, { color: '#FFFFFF' }]}>Continue</Text>
                      <Ionicons name="chevron-forward" size={13} color="#FFFFFF" />
                    </Row>
                  ) : null}
                </View>
              </Row>
            </Touchable>
          ) : null}
        </View>
      </HeroPanel>

      {/* The four ways in, as a 2×2 grid. */}
      <Enter>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <ScanTile
            icon="camera-outline"
            title="Add Equipment"
            subtitle="An appliance, an HVAC label, any home system"
            onPress={() => router.push('/scan/equipment')}
          />
          <ScanTile
            icon="alert-circle-outline"
            title="Something's Wrong"
            subtitle="Show us a problem and get it triaged"
            status="attention"
            onPress={() => router.push('/problem')}
          />
          <ScanTile
            icon="receipt-outline"
            title="Add Receipt"
            subtitle="An invoice, receipt, or warranty"
            status="info"
            onPress={() => router.push('/document')}
          />
          <ScanTile
            icon="home-outline"
            title="Scan My Home"
            subtitle="Guided walkthrough, area by area"
            status="good"
            onPress={() => router.push('/scan/guided')}
          />
        </View>
      </Enter>

      {/* What to point it at next — the specific area, not generic advice. */}
      {progress?.next ? (
        <Enter index={1}>
          <Card onPress={() => router.push('/scan/guided')} raised={1}>
            <Row justify="space-between">
              <Tertiary>NEXT AREA</Tertiary>
              <Text style={[{ fontSize: 12.5, fontWeight: '700', color: theme.sage }, tabular]}>
                {progress.percent}%
              </Text>
            </Row>
            <Row gap={spacing.md} align="flex-start">
              <IconTile icon={progress.next.icon as never} status="neutral" size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.subheading, { color: theme.text }]}>{progress.next.label}</Text>
                <Small numberOfLines={2}>{progress.next.prompt}</Small>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
            </Row>
          </Card>
        </Enter>
      ) : null}

      {recent.length > 0 ? (
        <Enter index={2}>
          <View style={{ gap: spacing.md }}>
            <SectionTitle title="Recently added" />
            <Card padding={spacing.lg}>
              {recent.map((component, index) => (
                <View key={component.id} style={{ gap: spacing.md }}>
                  {index > 0 ? <Divider inset={50} /> : null}
                  <Touchable
                    onPress={() => router.push(`/component/${component.id}`)}
                    scaleTo={0.99}
                  >
                    <Row gap={spacing.md} justify="space-between">
                      <IconTile
                        icon={(CATEGORY_ICON[component.category] ?? 'cube-outline') as never}
                        size={38}
                      />
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={[type.bodyStrong, { color: theme.text }]} numberOfLines={1}>
                          {component.name}
                        </Text>
                        <Tertiary numberOfLines={1}>
                          {CATEGORY_LABEL[component.category]} ·{' '}
                          {relativeDayLabel(asOf, component.createdAt.slice(0, 10))}
                        </Tertiary>
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

      {!isGatewayConfigured() ? (
        <Enter index={3}>
          <Notice tone="neutral" icon="cloud-offline-outline">
            Automatic reading needs an AI gateway, which is not configured on this build. You can
            still add everything by hand — scheduling, health, and forecasting work identically
            either way.
          </Notice>
        </Enter>
      ) : null}
    </Screen>
  );
}

/**
 * One of the four entry tiles. Deliberately large and square-ish: this is the
 * screen someone opens while standing in front of the thing they want to record.
 */
function ScanTile({
  icon,
  title,
  subtitle,
  onPress,
  status = 'neutral',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  status?: StatusKey;
}) {
  const theme = useTheme();
  return (
    <Touchable
      onPress={onPress}
      haptic="medium"
      style={[
        {
          width: '48%',
          minHeight: 168,
          backgroundColor: theme.surface,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
          padding: spacing.lg,
          gap: spacing.md,
          justifyContent: 'space-between',
        },
        elevation(theme, 1),
      ]}
    >
      <IconTile icon={icon} status={status} size={46} />
      <View style={{ gap: 3 }}>
        <Text style={[type.subheading, { color: theme.text }]}>{title}</Text>
        <Tertiary numberOfLines={2}>{subtitle}</Tertiary>
      </View>
    </Touchable>
  );
}
