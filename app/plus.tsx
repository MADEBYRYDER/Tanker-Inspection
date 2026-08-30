import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { formatDate, today } from '../src/core/dates';
import { COMPARISON, PRICES, TRIAL_DAYS } from '../src/core/entitlements';
import { computeForecast, likelyReplacements } from '../src/core/engine/forecast';
import { computeHomeHealth } from '../src/core/engine/health';
import { coverageSummary } from '../src/core/engine/warrantyIntelligence';
import { formatMoneyExact } from '../src/core/money';
import { usePlan } from '../src/state/plan';
import { useHomeRecord, useStore } from '../src/state/store';
import {
  Body,
  Button,
  Card,
  Divider,
  Enter,
  HeroPanel,
  Row,
  Screen,
  SectionTitle,
  Small,
  Tertiary,
} from '../src/ui/components';
import { Touchable } from '../src/ui/motion';
import { PlusMark } from '../src/ui/plus';
import { radius, spacing, tabular, type, useTheme } from '../src/ui/theme';

/**
 * Dwella+.
 *
 * The hard part of a subscription screen is being persuasive without lying, and
 * the way out is to stop describing the product and start describing *this
 * house*. So the top of the screen counts real things in the owner's own record
 * — how many systems are past two-thirds of their rated life, how many
 * warranties are running out — and says what Dwella+ would tell them about
 * those specific items.
 *
 * What it deliberately does not do: show the actual forecast figures. Quoting
 * someone their own monthly reserve to sell them the screen that contains it is
 * a bait-and-switch, and they would be right to resent it. The shape of the
 * answer is the honest pitch; the answer itself is the product.
 */
export default function Plus() {
  const theme = useTheme();
  const router = useRouter();
  const record = useHomeRecord();
  const { isPlus, subscription, trialDaysLeft, canStartTrial } = usePlan();
  const beginTrial = useStore((s) => s.beginTrial);
  const cancelSubscription = useStore((s) => s.cancelSubscription);
  const [selected, setSelected] = useState<'monthly' | 'annual'>('annual');

  const asOf = today();

  /*
   * Counts, not costs. Enough to prove Dwella already knows the house well
   * enough for the forecast to mean something, without handing over the figure
   * the subscription is for.
   */
  const evidence = useMemo(() => {
    if (!record || record.components.length === 0) return undefined;
    const forecast = computeForecast(record, { asOf });
    const health = computeHomeHealth(record, { asOf });
    const replacements = likelyReplacements(forecast);
    const aging = health.components.filter(
      (c) => c.status === 'aging' || c.status === 'plan_replacement',
    );
    const coverage = coverageSummary(record, asOf);
    return {
      componentCount: record.components.filter((c) => !c.retiredOn).length,
      replacementCount: replacements.length,
      soonest: replacements[0],
      agingCount: aging.length,
      coverageCount: coverage.length,
      documentedShare: Math.round(forecast.confidence * 100),
    };
  }, [record, asOf]);

  const price = PRICES.find((p) => p.id === selected)!;
  const annual = PRICES.find((p) => p.id === 'annual')!;

  const start = () => {
    beginTrial();
    router.back();
  };

  /*
   * There is no billing provider wired up yet, and pretending otherwise would
   * mean showing a purchase flow that silently grants a paid plan nobody paid
   * for. Say so instead. When StoreKit and Play Billing are in, this is the one
   * call site that changes: it becomes a purchase, and its success handler calls
   * `activateSubscription`.
   */
  const purchase = () => {
    Alert.alert(
      'Not yet available',
      'In-app purchase is not wired up in this build, so Dwella+ cannot be bought here yet. The 30-day trial works and unlocks everything.',
      [{ text: 'OK' }],
    );
  };

  if (isPlus) {
    return (
      <Screen bleedTop gap={spacing.xl}>
        <HeroPanel>
          <View style={{ gap: spacing.md }}>
            <PlusMark size="md" />
            <Text style={[type.title, { color: '#FFFFFF' }]}>
              {trialDaysLeft !== undefined ? 'Your trial is running' : 'Thanks for subscribing'}
            </Text>
            <Text style={[type.small, { color: 'rgba(255,255,255,0.72)' }]}>
              {trialDaysLeft !== undefined
                ? `${trialDaysLeft} ${trialDaysLeft === 1 ? 'day' : 'days'} left${
                    subscription.trialEndsOn ? `, until ${formatDate(subscription.trialEndsOn)}` : ''
                  }. Everything below is on.`
                : 'Dwella is watching this house for you.'}
            </Text>
          </View>
        </HeroPanel>

        <Enter>
          <Card>
            <SectionTitle title="What you have" />
            {COMPARISON.filter((row) => row.headline).map((row, index) => (
              <View key={row.label} style={{ gap: spacing.md }}>
                {index > 0 ? <Divider /> : null}
                <Row gap={spacing.md} align="flex-start">
                  <Ionicons name="checkmark-circle" size={17} color={theme.sage} style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.bodyStrong, { color: theme.text }]}>{row.label}</Text>
                    <Tertiary>{row.plus}</Tertiary>
                  </View>
                </Row>
              </View>
            ))}
          </Card>
        </Enter>

        <Enter index={1}>
          <Card>
            <SectionTitle title="Your plan" />
            <Small>
              {trialDaysLeft !== undefined
                ? `A free trial, ending ${subscription.trialEndsOn ? formatDate(subscription.trialEndsOn) : 'soon'}. Nothing will be charged — in-app purchase is not wired up in this build, so the plan simply returns to Dwella Free when the trial ends.`
                : subscription.renewsOn
                  ? `Renews ${formatDate(subscription.renewsOn)}.`
                  : 'Active.'}
            </Small>
            <Button
              label={trialDaysLeft !== undefined ? 'End the trial now' : 'Cancel'}
              variant="ghost"
              tone={theme.textSecondary}
              onPress={() =>
                Alert.alert(
                  trialDaysLeft !== undefined ? 'End the trial?' : 'Cancel Dwella+?',
                  'Your home record, history, and reminders stay exactly as they are. You lose the forecast, warranty alerts, and the full health breakdown.',
                  [
                    { text: 'Keep it', style: 'cancel' },
                    { text: 'End it', style: 'destructive', onPress: cancelSubscription },
                  ],
                )
              }
            />
          </Card>
        </Enter>
      </Screen>
    );
  }

  return (
    <Screen bleedTop gap={spacing.xl}>
      <HeroPanel>
        <View style={{ gap: spacing.lg }}>
          <PlusMark size="md" />
          <View style={{ gap: 6 }}>
            <Text style={[type.display, { color: '#FFFFFF' }]}>Know what’s coming.</Text>
            <Text style={[type.body, { color: 'rgba(255,255,255,0.72)' }]}>
              Dwella remembers your home. Dwella+ looks ahead — what will need replacing, when,
              and what to set aside for it.
            </Text>
          </View>
        </View>
      </HeroPanel>

      {/* Their house, counted. The proof that the forecast is about something real. */}
      {evidence ? (
        <Enter>
          <Card raised={2}>
            <SectionTitle title="What Dwella already knows about your home" />
            <Row gap={spacing.md} align="flex-start">
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.mega, { color: theme.text }, tabular]}>
                  {evidence.componentCount}
                </Text>
                <Tertiary>systems on record</Tertiary>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.mega, { color: evidence.agingCount > 0 ? theme.amber : theme.text }, tabular]}>
                  {evidence.agingCount}
                </Text>
                <Tertiary>aging or due for planning</Tertiary>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.mega, { color: theme.text }, tabular]}>
                  {evidence.coverageCount}
                </Text>
                <Tertiary>warranties still running</Tertiary>
              </View>
            </Row>
            <Divider />
            <Small>
              {evidence.replacementCount > 0
                ? `Dwella+ would show you the ${evidence.replacementCount === 1 ? 'one replacement' : `${evidence.replacementCount} replacements`} it expects in the next five years${
                    evidence.soonest?.likelyYear
                      ? `, starting with ${evidence.soonest.label} around ${evidence.soonest.likelyYear}`
                      : ''
                  }, what each is likely to cost, and what to put aside every month so none of it is a surprise.`
                : 'Dwella+ would show you the cost of keeping this house running for the next five years, and what to put aside each month for it.'}
            </Small>
            <Tertiary>
              {evidence.documentedShare}% of that rests on dates documented in your record rather
              than estimates. It gets sharper every time you scan something.
            </Tertiary>
          </Card>
        </Enter>
      ) : null}

      {/* The four things people actually buy this for. */}
      <Enter index={1}>
        <View style={{ gap: spacing.md }}>
          <SectionTitle title="What you get" />
          <Reason
            icon="trending-up-outline"
            title="Home Forecast"
            body="One, three, and five years ahead, priced from your actual equipment and its actual age — with a monthly reserve figure so the big ones are already paid for when they arrive."
          />
          <Reason
            icon="pulse-outline"
            title="Every system, with reasons"
            body="Not a score out of a hundred. Roof, electrical, HVAC, water heater — each with a status and the plain explanation of why it has that status."
          />
          <Reason
            icon="shield-checkmark-outline"
            title="Warranty intelligence"
            body="Dwella watches the coverage it has on file and tells you when something is about to run out — especially when your own record already shows that item playing up."
          />
          <Reason
            icon="sparkles-outline"
            title="Ask Dwella, without limits"
            body="“What should I do around the house this weekend?” answered from your records, your last service dates, and what you noted the last time you looked at it."
          />
          <Reason
            icon="people-outline"
            title="Everyone in the household"
            body="One subscription is meant to cover the home, not a person — so whoever else lives there is included at no extra cost. Sharing needs a Dwella account to sync between phones, which is not built yet; today your record lives on this device only."
          />
        </View>
      </Enter>

      {/* Pricing. */}
      <Enter index={2}>
        <Card raised={2}>
          <SectionTitle title="Pricing" />
          <Row gap={spacing.md}>
            {PRICES.map((option) => {
              const active = selected === option.id;
              return (
                <Touchable
                  key={option.id}
                  onPress={() => setSelected(option.id)}
                  style={{
                    flex: 1,
                    borderWidth: active ? 2 : StyleSheet.hairlineWidth,
                    borderColor: active ? theme.ink : theme.hairline,
                    borderRadius: radius.lg,
                    padding: spacing.lg,
                    gap: 3,
                    backgroundColor: active ? theme.surfaceSunken : theme.surface,
                  }}
                >
                  <Tertiary>{option.label}</Tertiary>
                  <Text style={[type.heading, { color: theme.text }, tabular]}>
                    {formatMoneyExact(option.priceCents)}
                  </Text>
                  <Tertiary>
                    {option.id === 'annual'
                      ? `${formatMoneyExact(option.perMonthCents)}/mo · save ${option.savingPercent}%`
                      : 'per month'}
                  </Tertiary>
                </Touchable>
              );
            })}
          </Row>

          {canStartTrial ? (
            <>
              <Button
                label={`Start ${TRIAL_DAYS} days free`}
                icon="sparkles-outline"
                size="lg"
                onPress={start}
                full
              />
              <Tertiary style={{ textAlign: 'center' }}>
                No card needed. After {TRIAL_DAYS} days Dwella returns to the free plan on its own —
                nothing is charged and nothing is lost.
              </Tertiary>
            </>
          ) : (
            <>
              <Button
                label={`Subscribe — ${formatMoneyExact(price.priceCents)}${price.id === 'annual' ? '/year' : '/month'}`}
                size="lg"
                onPress={purchase}
                full
              />
              <Tertiary style={{ textAlign: 'center' }}>
                Your free trial has already been used.
              </Tertiary>
            </>
          )}
          <Tertiary style={{ textAlign: 'center' }}>
            Annual works out to {formatMoneyExact(annual.perMonthCents)} a month.
          </Tertiary>
        </Card>
      </Enter>

      {/* The full table. Everything, including what free keeps. */}
      <Enter index={3}>
        <Card padding={spacing.lg}>
          <SectionTitle title="Free and Plus, side by side" />
          <Row gap={spacing.md}>
            <View style={{ flex: 1.4 }} />
            <Tertiary style={{ flex: 1, textAlign: 'center' }}>DWELLA</Tertiary>
            <Tertiary style={{ flex: 1, textAlign: 'center' }}>DWELLA+</Tertiary>
          </Row>
          {COMPARISON.map((row, index) => (
            <View key={row.label} style={{ gap: spacing.sm }}>
              {index > 0 ? <Divider /> : null}
              <Row gap={spacing.md} align="flex-start">
                <Text style={[type.small, { flex: 1.4, color: theme.text }]}>{row.label}</Text>
                <Text
                  style={[
                    type.small,
                    {
                      flex: 1,
                      textAlign: 'center',
                      color: row.free === 'Not included' ? theme.textTertiary : theme.textSecondary,
                    },
                  ]}
                >
                  {row.free}
                </Text>
                <Text style={[type.smallStrong, { flex: 1, textAlign: 'center', color: theme.text }]}>
                  {row.plus}
                </Text>
              </Row>
            </View>
          ))}
        </Card>
      </Enter>

      {/* The promise that makes the free tier trustworthy. */}
      <Enter index={4}>
        <Card tone={theme.sageSoft} raised={0}>
          <Row gap={spacing.md} align="flex-start">
            <Ionicons name="home-outline" size={18} color={theme.sage} style={{ marginTop: 1 }} />
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Text style={[type.bodyStrong, { color: theme.sage }]}>
                Your home record is never behind a paywall
              </Text>
              <Small style={{ color: theme.sage }}>
                Your house, your equipment, your history, and your maintenance reminders stay free
                forever, for everyone. If you stop paying, nothing is deleted and nothing is locked —
                you keep the record and lose only the forecasting.
              </Small>
            </View>
          </Row>
        </Card>
      </Enter>

      <Enter index={5}>
        <Row justify="center" gap={spacing.lg}>
          <Touchable onPress={() => void Linking.openURL('https://dwella.app/terms')}>
            <Tertiary>Terms</Tertiary>
          </Touchable>
          <Touchable onPress={() => void Linking.openURL('https://dwella.app/privacy')}>
            <Tertiary>Privacy</Tertiary>
          </Touchable>
        </Row>
      </Enter>
    </Screen>
  );
}

function Reason({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  const theme = useTheme();
  return (
    <Card raised={1}>
      <Row gap={spacing.md} align="flex-start">
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.md,
            backgroundColor: theme.surfaceSunken,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={19} color={theme.text} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[type.subheading, { color: theme.text }]}>{title}</Text>
          <Body style={{ color: theme.textSecondary }}>{body}</Body>
        </View>
      </Row>
    </Card>
  );
}
