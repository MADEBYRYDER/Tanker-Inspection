import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { guidedProgress } from '../../src/core/engine/guided';
import { useHomeRecord } from '../../src/state/store';
import { Row, Touchable } from '../../src/ui/components';
import { DwellaMark } from '../../src/ui/logo';
import { radius, spacing, type, useTheme } from '../../src/ui/theme';
import { SCAN_GROUND } from './_layout';

/**
 * The scan chooser.
 *
 * Everything the camera can start, on one dark screen with nothing else on it.
 *
 * Deliberately not a dashboard. This is reached by pressing the one raised
 * button in the tab bar, which is a decisive gesture, and answering it with a
 * screen of progress meters and recent activity turns a decision into browsing.
 * Four options, phrased as the thing the person is holding their phone up to do
 * — "something doesn't look right" is how a homeowner says it, not "problem
 * triage".
 *
 * The dark ground is doing work too: it is the only full-bleed dark screen in
 * the app, so it reads as a mode you have entered and will leave, which is what
 * the close control at the top promises.
 */
export default function ScanChooser() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();

  const progress = useMemo(() => (record ? guidedProgress(record) : undefined), [record]);

  const options = [
    {
      key: 'equipment',
      icon: 'camera-outline' as const,
      tint: theme.scanGreen,
      title: 'Add something\nto my home',
      body: 'Scan equipment or appliances',
      go: () => router.push('/scan/equipment'),
    },
    {
      key: 'problem',
      icon: 'search-outline' as const,
      tint: '#C08A22',
      title: 'Something doesn’t\nlook right',
      body: 'Ask Dwella about a problem',
      go: () => router.push('/problem'),
    },
    {
      key: 'document',
      icon: 'document-text-outline' as const,
      tint: '#2E5C82',
      title: 'Add a receipt\nor document',
      body: 'Store important paperwork',
      go: () => router.push('/document'),
    },
    {
      key: 'guided',
      icon: 'home-outline' as const,
      tint: theme.brandSage,
      title: 'Scan My Home',
      // The one option whose subtitle can say something specific about this
      // house rather than describing itself.
      body:
        progress && progress.done.length > 0
          ? `Guided setup — ${progress.done.length} of ${progress.steps.length} areas covered`
          : 'Guided whole-home setup',
      go: () => router.push('/scan/guided'),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: SCAN_GROUND }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={{
            padding: spacing.xl,
            paddingBottom: spacing.xxxl,
            gap: spacing.xl,
          }}
        >
          <Row justify="space-between" align="center">
            <Touchable
              onPress={() => router.push('/(tabs)')}
              accessibilityLabel="Close"
              scaleTo={0.9}
            >
              <Ionicons name="close" size={26} color="rgba(255,255,255,0.8)" />
            </Touchable>
            <DwellaMark size={30} house="#FFFFFF" arc={theme.brandSageLight} />
            <View style={{ width: 26 }} />
          </Row>

          <View style={{ alignItems: 'center', gap: spacing.md }}>
            <Text
              style={[type.title, { color: '#FFFFFF', textAlign: 'center', lineHeight: 32 }]}
            >
              What would you{'\n'}like to do?
            </Text>
            <View
              style={{ width: 34, height: 2, backgroundColor: 'rgba(255,255,255,0.22)' }}
            />
          </View>

          <View
            style={{
              backgroundColor: theme.dark ? theme.surface : '#FFFFFF',
              borderRadius: radius.lg,
              paddingHorizontal: spacing.lg,
            }}
          >
            {options.map((option, index) => (
              <View key={option.key}>
                {index > 0 ? (
                  <View style={{ height: 1, backgroundColor: theme.hairline, marginLeft: 58 }} />
                ) : null}
                <Touchable onPress={option.go} scaleTo={0.99} accessibilityLabel={option.body}>
                  <Row gap={spacing.md} align="center" style={{ paddingVertical: spacing.lg }}>
                    <View
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: radius.sm,
                        backgroundColor: option.tint,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name={option.icon} size={21} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.bodyStrong, { color: theme.text, lineHeight: 20 }]}>
                        {option.title}
                      </Text>
                      <Text style={[type.small, { color: theme.textSecondary }]}>
                        {option.body}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color={theme.textTertiary} />
                  </Row>
                </Touchable>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
