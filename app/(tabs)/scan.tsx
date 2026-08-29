import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { isGatewayConfigured } from '../../src/ai/client';
import { guidedProgress } from '../../src/core/engine/guided';
import { useHomeRecord } from '../../src/state/store';
import {
  BigOption,
  Body,
  Card,
  Notice,
  Progress,
  Row,
  Screen,
  Small,
  Tertiary,
  Title,
} from '../../src/ui/components';
import { spacing, useTheme } from '../../src/ui/theme';

/**
 * The scan hub.
 *
 * Four large choices rather than a menu. The product's core loop is "see something,
 * scan it", and that only works if the thing you scan into is one tap from anywhere
 * and impossible to mis-tap. Twenty small menu items would technically expose more,
 * and would be used less.
 */
export default function ScanHub() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const progress = record ? guidedProgress(record) : undefined;
  const setupIncomplete = progress !== undefined && progress.percent < 100;

  return (
    <Screen gap={spacing.lg}>
      <View style={{ gap: 4, marginTop: spacing.sm }}>
        <Title>Scan</Title>
        <Small>Point your camera at it and the record fills itself in.</Small>
      </View>

      {setupIncomplete && progress ? (
        <Card onPress={() => router.push('/scan/guided')} raised={2}>
          <Row justify="space-between">
            <Body style={{ fontWeight: '600' }}>Finish your Home Record</Body>
            <Small style={{ color: theme.sage, fontWeight: '600' }}>{progress.percent}%</Small>
          </Row>
          <Progress value={progress.percent} />
          <Tertiary>
            {progress.done.length} of {progress.steps.length} areas covered · next up:{' '}
            {progress.next?.label ?? 'review'}
          </Tertiary>
        </Card>
      ) : null}

      <BigOption
        icon="camera-outline"
        title="Add Equipment"
        subtitle="Scan an appliance, HVAC label, or home system."
        onPress={() => router.push('/scan/equipment')}
      />
      <BigOption
        icon="alert-circle-outline"
        title="Something's Wrong"
        subtitle="Show us a problem and get it triaged."
        status="attention"
        onPress={() => router.push('/problem')}
      />
      <BigOption
        icon="receipt-outline"
        title="Add Receipt"
        subtitle="Scan a service invoice, receipt, or warranty."
        onPress={() => router.push('/document')}
      />
      <BigOption
        icon="home-outline"
        title="Scan My Home"
        subtitle="Guided walkthrough — build the whole record room by room."
        status="good"
        onPress={() => router.push('/scan/guided')}
      />

      {!isGatewayConfigured() ? (
        <Notice tone="neutral" icon="cloud-offline-outline">
          Automatic reading needs an AI gateway, which is not configured on this build. You can still
          add everything by hand — scheduling, health, and forecasting work identically either way.
        </Notice>
      ) : null}
    </Screen>
  );
}
