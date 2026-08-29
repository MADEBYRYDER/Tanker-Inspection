import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { guidedProgress, type GuidedStepState } from '../../src/core/engine/guided';
import { useHomeRecord } from '../../src/state/store';
import {
  Body,
  BodyStrong,
  Button,
  Card,
  Divider,
  Heading,
  Progress,
  Row,
  Screen,
  Small,
  Tertiary,
  Title,
} from '../../src/ui/components';
import { radius, spacing, useTheme } from '../../src/ui/theme';

/**
 * The guided whole-home scan.
 *
 * Building a home record is an hour of work. Presented as a form, it is an hour
 * nobody finishes. Presented as a checklist with visible progress and one clear
 * next action, it becomes a thing people come back to across a weekend.
 *
 * Completion is inferred from the record, never tracked separately — scan a furnace
 * from anywhere in the app and the HVAC step here is already ticked.
 */
export default function GuidedScan() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();

  const progress = useMemo(() => (record ? guidedProgress(record) : undefined), [record]);

  if (!record || !progress) return <Screen><Small>Set up your home first.</Small></Screen>;

  const complete = progress.next === undefined;

  return (
    <Screen gap={spacing.xl}>
      <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
        <Title>Let's build your Home Record</Title>
        <Row justify="space-between" align="flex-end">
          <Small>
            {progress.done.length} of {progress.steps.length} areas covered
          </Small>
          <Heading style={{ color: theme.sage }}>{progress.percent}%</Heading>
        </Row>
        <Progress value={progress.percent} />
      </View>

      {complete ? (
        <Card raised={2}>
          <Row gap={spacing.md}>
            <Ionicons name="checkmark-circle" size={24} color={theme.sage} />
            <View style={{ flex: 1 }}>
              <BodyStrong>Every area is covered</BodyStrong>
              <Small>
                You can keep adding equipment any time — the record grows as you go, and every
                addition sharpens the maintenance schedule and the cost forecast.
              </Small>
            </View>
          </Row>
          <Button label="Back to home" onPress={() => router.replace('/(tabs)')} full />
        </Card>
      ) : (
        <Card raised={2}>
          <Tertiary>NEXT</Tertiary>
          <Heading>{progress.next!.label}</Heading>
          <Body>{progress.next!.prompt}</Body>
          <Button
            label="Open camera"
            icon="camera-outline"
            size="lg"
            full
            onPress={() =>
              router.push({
                pathname: '/scan/equipment',
                params: { category: progress.next!.category, area: progress.next!.label },
              })
            }
          />
        </Card>
      )}

      <View style={{ gap: spacing.md }}>
        {progress.steps.map((step, index) => (
          <View key={step.id} style={{ gap: spacing.md }}>
            {index > 0 ? <Divider inset={44} /> : null}
            <StepRow step={step} />
          </View>
        ))}
      </View>

      <Tertiary>
        Skip anything you don't have — a home with no sump pump simply never gets sump pump
        reminders. Areas tick themselves off as soon as the record contains matching equipment.
      </Tertiary>
    </Screen>
  );
}

function StepRow({ step }: { step: GuidedStepState }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Row
      gap={spacing.md}
      justify="space-between"
      style={{ opacity: step.done ? 0.65 : 1 }}
    >
      <Row gap={spacing.md} style={{ flex: 1 }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: step.done ? theme.sageSoft : theme.surfaceSunken,
            borderWidth: step.done ? 0 : 1.5,
            borderColor: theme.border,
          }}
        >
          {step.done ? (
            <Ionicons name="checkmark" size={17} color={theme.sage} />
          ) : (
            <Ionicons name={step.icon as never} size={15} color={theme.textTertiary} />
          )}
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <BodyStrong>{step.label}</BodyStrong>
          <Tertiary numberOfLines={1}>
            {step.done
              ? `${step.componentIds.length} ${step.componentIds.length === 1 ? 'item' : 'items'} on record`
              : 'Not started'}
          </Tertiary>
        </View>
      </Row>
      {!step.done ? (
        <Button
          label="Scan"
          size="sm"
          variant="quiet"
          onPress={() =>
            router.push({
              pathname: '/scan/equipment',
              params: { category: step.category, area: step.label },
            })
          }
        />
      ) : null}
    </Row>
  );
}
