import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, Row, Screen, Small, Tertiary, Title } from '../../src/ui/components';
import { radius, spacing, type, useTheme } from '../../src/ui/theme';

const STARTERS = [
  { icon: 'thermometer-outline', label: 'HVAC' },
  { icon: 'water-outline', label: 'Water heater' },
  { icon: 'cube-outline', label: 'Appliances' },
  { icon: 'flash-outline', label: 'Electrical' },
  { icon: 'git-network-outline', label: 'Plumbing' },
];

/**
 * The last screen of setup, and the first one that is actually the product.
 *
 * Everything before this was administration. This is the handover: one
 * instruction, one button, and a list of things worth pointing a camera at for
 * anybody standing in a hallway wondering what counts.
 *
 * Skipping is offered and not buried. Somebody who set up on the bus is not near
 * their water heater, and making them decline a camera prompt they cannot act on
 * is how a good first impression becomes an obstacle. The record checklist on
 * the dashboard picks the thread up whenever they are home.
 */
export default function FirstScan() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen gap={spacing.xl}>
      <View style={{ alignItems: 'center', gap: spacing.lg, marginTop: spacing.xxl }}>
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: radius.xl,
            backgroundColor: theme.scanGreen,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="scan-outline" size={32} color="#FFFFFF" />
        </View>
        <View style={{ gap: spacing.sm }}>
          <Title style={{ textAlign: 'center' }}>Let's teach Dwella about your home.</Title>
          <Small style={{ textAlign: 'center' }}>
            Point your camera at something in your house and we'll add it to your Home Record.
          </Small>
        </View>
      </View>

      <Row gap={spacing.sm} wrap justify="center">
        {STARTERS.map((starter) => (
          <Row
            key={starter.label}
            gap={6}
            style={{
              backgroundColor: theme.surfaceSunken,
              borderRadius: radius.pill,
              paddingHorizontal: spacing.md,
              paddingVertical: 7,
            }}
          >
            <Ionicons name={starter.icon as never} size={13} color={theme.textSecondary} />
            <Text style={[type.smallStrong, { color: theme.textSecondary }]}>{starter.label}</Text>
          </Row>
        ))}
      </Row>

      <View style={{ flex: 1 }} />

      <Button
        label="Scan something"
        icon="camera-outline"
        size="lg"
        onPress={() => router.replace('/scan/equipment')}
        full
      />
      <Button
        label="Not at home right now"
        variant="ghost"
        onPress={() => router.replace('/(tabs)')}
      />
      <Tertiary style={{ textAlign: 'center' }}>
        Nothing is charged, and nothing is asked for. Dwella will not mention a plan until it has
        shown you what it can do with your record.
      </Tertiary>
    </Screen>
  );
}
