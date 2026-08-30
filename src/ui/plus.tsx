import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FeatureKey, UsageVerdict } from '../core/entitlements';
import { usePlan } from '../state/plan';
import { Badge, Card, Row, Small, Tertiary } from './components';
import { Touchable } from './motion';
import { radius, spacing, type, useTheme } from './theme';

/**
 * How Dwella+ shows up inside the app.
 *
 * The whole design rule for these components: **a locked feature explains
 * itself and then gets out of the way.** No interstitials, no countdown
 * pressure, no blurred screenshot of what you are missing, no badge on a tab
 * bar. Someone who is not paying is still a customer with a house, and a free
 * tier that spends its day advertising is a free tier people delete.
 *
 * So a gate does three things and stops: name the feature, say plainly what it
 * would tell them about *their* home, and offer one way in. It never implies the
 * free product is broken, because it is not.
 */

/** The mark used wherever the paid tier is named, so it reads consistently. */
export function PlusMark({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.ink,
        borderRadius: radius.pill,
        paddingHorizontal: size === 'md' ? 10 : 8,
        paddingVertical: size === 'md' ? 4 : 2.5,
      }}
    >
      <Text
        style={{
          color: theme.onInk,
          fontSize: size === 'md' ? 12.5 : 11,
          fontWeight: '700',
          letterSpacing: 0.2,
        }}
      >
        Dwella+
      </Text>
    </View>
  );
}

/**
 * A locked feature, stated in terms of this home.
 *
 * `promise` is the important prop: it must say what the feature would tell *this
 * homeowner*, not what the feature is. "Know what your water heater will cost to
 * replace and when" earns a tap. "Unlock advanced analytics" does not.
 */
export function PlusGate({
  title,
  promise,
  icon = 'lock-closed-outline',
  children,
}: {
  title: string;
  promise: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Optional preview built from real data — never a blurred or faked one. */
  children?: ReactNode;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { canStartTrial } = usePlan();

  return (
    <Card raised={1}>
      <Row gap={spacing.md} align="flex-start">
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: radius.md,
            backgroundColor: theme.surfaceSunken,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={18} color={theme.textSecondary} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Row gap={spacing.sm}>
            <Text style={[type.subheading, { color: theme.text }]}>{title}</Text>
            <PlusMark />
          </Row>
          <Small>{promise}</Small>
        </View>
      </Row>

      {children}

      <Touchable
        onPress={() => router.push('/plus')}
        style={{
          backgroundColor: theme.ink,
          borderRadius: radius.md,
          paddingVertical: 13,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: theme.onInk, fontSize: 15, fontWeight: '700' }}>
          {canStartTrial ? 'Try free for 30 days' : 'See Dwella+'}
        </Text>
      </Touchable>
      {canStartTrial ? (
        <Tertiary style={{ textAlign: 'center' }}>No card needed. Cancel any time.</Tertiary>
      ) : null}
    </Card>
  );
}

/**
 * The allowance line beside a metered action.
 *
 * Shown to everyone, including subscribers, because a number that only appears
 * when you are running out is a pressure tactic. A subscriber seeing "unlimited"
 * is being told what they bought.
 */
export function AllowanceRow({
  verdict,
  noun,
  hint,
}: {
  verdict: UsageVerdict;
  noun: { one: string; many: string };
  /** Extra context, e.g. when the allowance resets. */
  hint?: string;
}) {
  const theme = useTheme();
  const router = useRouter();

  if (verdict.unlimited) {
    return (
      <Row gap={spacing.xs}>
        <Ionicons name="infinite-outline" size={14} color={theme.textTertiary} />
        <Tertiary>Unlimited on Dwella+</Tertiary>
      </Row>
    );
  }

  const remaining = verdict.remaining ?? 0;
  const exhausted = remaining === 0;
  const scope = verdict.period === 'monthly' ? ' this month' : '';

  return (
    <Row justify="space-between" gap={spacing.sm}>
      <Tertiary style={{ flex: 1, color: exhausted ? theme.amber : undefined }}>
        {exhausted
          ? `You have used all ${verdict.limit}${scope}.`
          : `${remaining} of ${verdict.limit} ${remaining === 1 ? noun.one : noun.many} left${scope}.`}
        {hint ? ` ${hint}` : ''}
      </Tertiary>
      <Touchable onPress={() => router.push('/plus')} scaleTo={0.96}>
        <Badge label="More on Dwella+" fg={theme.blue} bg={theme.blueSoft} />
      </Touchable>
    </Row>
  );
}

/**
 * Shown when an allowance is spent.
 *
 * Says when it comes back, because "you have run out" without "it resets on the
 * 1st" is a sales pitch rather than an answer. The alternative that still works
 * today is offered first — every metered feature in Dwella has one.
 */
export function AllowanceSpent({
  what,
  alternative,
  period = 'monthly',
}: {
  what: string;
  alternative: string;
  /** A standing cap never "resets", and saying it would is a lie. */
  period?: 'monthly' | 'total';
}) {
  const theme = useTheme();
  const router = useRouter();
  const { canStartTrial } = usePlan();

  return (
    <Card tone={theme.surfaceSunken} raised={0}>
      <Row gap={spacing.md} align="flex-start">
        <Ionicons name="hourglass-outline" size={17} color={theme.textSecondary} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Text style={[type.bodyStrong, { color: theme.text }]}>
            {period === 'monthly' ? `That is your ${what} for this month` : `That is your ${what}`}
          </Text>
          <Small>{alternative}</Small>
          <Tertiary>
            {period === 'monthly'
              ? 'Your allowance resets on the 1st.'
              : 'Removing a document you no longer need frees a slot.'}
          </Tertiary>
        </View>
      </Row>
      <Touchable
        onPress={() => router.push('/plus')}
        style={{
          backgroundColor: theme.ink,
          borderRadius: radius.md,
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: theme.onInk, fontSize: 14.5, fontWeight: '700' }}>
          {canStartTrial ? 'Try Dwella+ free for 30 days' : 'See Dwella+'}
        </Text>
      </Touchable>
    </Card>
  );
}

/** A small inline lock for a single row inside an otherwise-available screen. */
export function PlusRowLock({ label }: { label: string }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Touchable onPress={() => router.push('/plus')} scaleTo={0.99}>
      <Row
        justify="space-between"
        gap={spacing.md}
        style={{
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.hairline,
          borderRadius: radius.md,
          padding: spacing.lg,
          backgroundColor: theme.surfaceSunken,
        }}
      >
        <Row gap={spacing.sm} style={{ flex: 1 }}>
          <Ionicons name="lock-closed-outline" size={14} color={theme.textTertiary} />
          <Small style={{ flex: 1 }}>{label}</Small>
        </Row>
        <PlusMark />
      </Row>
    </Touchable>
  );
}

/** Convenience: renders `children` on Dwella+, and a gate otherwise. */
export function Gated({
  feature,
  title,
  promise,
  icon,
  preview,
  children,
}: {
  feature: FeatureKey;
  title: string;
  promise: string;
  icon?: keyof typeof Ionicons.glyphMap;
  preview?: ReactNode;
  children: ReactNode;
}) {
  const { can } = usePlan();
  if (can(feature)) return <>{children}</>;
  return (
    <PlusGate title={title} promise={promise} icon={icon}>
      {preview}
    </PlusGate>
  );
}
