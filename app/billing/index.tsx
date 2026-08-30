import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { permissionsFor } from '../../src/core/account';
import {
  TIERS,
  cardExpiringSoon,
  cardSummary,
  paymentMethodFor,
  currentPeriod,
  priceSubscriptions,
  statementFor,
  statementPeriods,
  tierFor,
  type Charge,
} from '../../src/core/billing';
import { formatDate, today } from '../../src/core/dates';
import { formatMoneyExact } from '../../src/core/money';
import { subscriptionFor, useStore } from '../../src/state/store';
import {
  Badge,
  Body,
  Button,
  Card,
  Chip,
  Divider,
  Enter,
  Notice,
  Row,
  Screen,
  SectionTitle,
  Small,
  Tertiary,
  Title,
} from '../../src/ui/components';
import { Touchable } from '../../src/ui/motion';
import { spacing, tabular, type, useTheme } from '../../src/ui/theme';

/**
 * Billing & Membership.
 *
 * A first-class account area rather than a row buried in settings, because for
 * anyone with more than one property it is the only screen that answers "what
 * am I actually paying for". The order is deliberate: what you hold, then how
 * it is paid for, then what has been paid — memberships first because that is
 * the question people arrive with; the card and the history are reference.
 *
 * Every charge is tied to an account and, where it is about a building, to a
 * property. Grouping the month by property is the whole point: "Rental #2 —
 * $39.00" is reconcilable against a landlord's own books in a way that six
 * identical subscription lines are not.
 *
 * Access is gated per property. Someone can be a household admin on one home —
 * seeing its plan but not the card — and hold billing on another.
 */
export default function Billing() {
  const theme = useTheme();
  const router = useRouter();
  const account = useStore((s) => s.account);
  const properties = useStore((s) => s.properties);
  const memberships = useStore((s) => s.memberships);
  const subscriptions = useStore((s) => s.subscriptions);
  const paymentMethods = useStore((s) => s.paymentMethods);
  const charges = useStore((s) => s.charges);
  const setPaymentMethod = useStore((s) => s.setPaymentMethod);
  const asOf = today();

  const [period, setPeriod] = useState(currentPeriod(asOf));

  const nameOf = useMemo(
    () => (propertyId: string | undefined) =>
      properties.find((p) => p.id === propertyId)?.nickname ?? 'Account',
    [properties],
  );

  /*
   * Billing visibility is per property. Anything the viewer cannot see billing
   * for is filtered out entirely rather than shown blanked — a redacted row
   * still tells you the charge exists and what it was for.
   */
  const visible = useMemo(() => {
    if (!account) return { properties: [] as typeof properties, chargeIds: new Set<string>() };
    const allowed = properties.filter(
      (property) =>
        permissionsFor(memberships, {
          accountId: account.id,
          propertyId: property.id,
          now: new Date().toISOString(),
        }).can('view_billing'),
    );
    const ids = new Set(allowed.map((p) => p.id));
    return {
      properties: allowed,
      chargeIds: new Set(
        charges.filter((c) => !c.propertyId || ids.has(c.propertyId)).map((c) => c.id),
      ),
    };
  }, [account, properties, memberships, charges]);

  const visibleCharges = charges.filter((c) => visible.chargeIds.has(c.id));
  const pricing = useMemo(
    () => priceSubscriptions(subscriptions.filter((s) => visible.properties.some((p) => p.id === s.propertyId)), asOf),
    [subscriptions, visible.properties, asOf],
  );
  const periods = statementPeriods(visibleCharges);
  const statement = statementFor(visibleCharges, period, nameOf);
  /*
   * One card, shown as the account default. Resolution still goes through
   * `paymentMethodFor` rather than picking the default inline, so the day this
   * screen gains a per-property card picker, nothing about how a charge finds
   * its card has to change.
   */
  const card = paymentMethodFor(paymentMethods);

  /* Properties the viewer can see the plan for, whether or not they see billing. */
  const planVisible = useMemo(() => {
    if (!account) return [];
    return properties.filter((property) =>
      permissionsFor(memberships, {
        accountId: account.id,
        propertyId: property.id,
        now: new Date().toISOString(),
      }).can('view_plan'),
    );
  }, [account, properties, memberships]);

  if (!account) return <Screen><Small>Sign in to see billing.</Small></Screen>;

  if (planVisible.length === 0) {
    return (
      <Screen>
        <Title>Billing &amp; Membership</Title>
        <Notice icon="lock-closed-outline">
          Your role on these homes does not include billing. Whoever owns them can see the plans,
          the card, and the payment history.
        </Notice>
      </Screen>
    );
  }

  return (
    <Screen gap={spacing.xl}>
      <View style={{ gap: spacing.sm }}>
        <Title>Billing &amp; Membership</Title>
        <Small>
          One account, one card — a plan for each home. {account.email ?? account.displayName}
        </Small>
      </View>

      {/* ---------------- Current memberships ---------------- */}
      <Enter>
        <View style={{ gap: spacing.md }}>
          <Row justify="space-between">
            <SectionTitle title="Current memberships" />
            {pricing.monthlyTotalCents > 0 ? (
              <Text style={[type.bodyStrong, { color: theme.text }, tabular]}>
                {formatMoneyExact(pricing.monthlyTotalCents)}/mo
              </Text>
            ) : null}
          </Row>

          {planVisible.map((property) => {
            const subscription = subscriptionFor(subscriptions, property.id);
            const tier = tierFor(subscription, asOf);
            const definition = TIERS[tier];
            const line = pricing.lines.find((l) => l.propertyId === property.id);
            return (
              <Card
                key={property.id}
                onPress={() => router.push(`/billing/${property.id}`)}
                raised={tier === 'free' ? 1 : 2}
              >
                <Row justify="space-between" align="flex-start" gap={spacing.md}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[type.bodyStrong, { color: theme.text }]} numberOfLines={1}>
                      {property.nickname}
                    </Text>
                    <Row gap={spacing.sm} wrap>
                      <Text style={[type.subheading, { color: theme.text }]}>{definition.name}</Text>
                      {line?.trialing ? (
                        <Badge label="trial" fg={theme.blue} bg={theme.blueSoft} />
                      ) : null}
                      {line?.discounted ? (
                        <Badge label="additional home" fg={theme.sage} bg={theme.sageSoft} />
                      ) : null}
                    </Row>
                    {tier === 'care' ? <Tertiary>Includes Dwella+</Tertiary> : null}
                    {subscription?.cancelledOn ? (
                      <Tertiary style={{ color: theme.amber }}>
                        Cancelled — runs until{' '}
                        {subscription.renewsOn ? formatDate(subscription.renewsOn) : 'the end of the period'}
                      </Tertiary>
                    ) : line?.renewsOn ? (
                      <Tertiary>Next payment: {formatDate(line.renewsOn)}</Tertiary>
                    ) : line?.trialing ? (
                      <Tertiary>
                        Free until{' '}
                        {subscription?.trialEndsOn ? formatDate(subscription.trialEndsOn) : 'the trial ends'}
                      </Tertiary>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text style={[type.bodyStrong, { color: theme.text }, tabular]}>
                      {line && line.monthlyCents > 0 ? `${formatMoneyExact(line.monthlyCents)}/mo` : '—'}
                    </Text>
                    <Row gap={2}>
                      <Text style={[type.smallStrong, { color: theme.blue }]}>
                        {tier === 'free' ? 'Upgrade' : 'Manage'}
                      </Text>
                      <Ionicons name="chevron-forward" size={13} color={theme.blue} />
                    </Row>
                  </View>
                </Row>
              </Card>
            );
          })}
        </View>
      </Enter>

      {/* ---------------- Payment method ---------------- */}
      {visible.properties.length > 0 ? (
        <Enter index={1}>
          <View style={{ gap: spacing.md }}>
            <SectionTitle title="Payment method" />
            <Card>
              {card ? (
                <>
                  <Row justify="space-between">
                    <View style={{ flex: 1 }}>
                      <Text style={[type.bodyStrong, { color: theme.text }]}>{cardSummary(card)}</Text>
                      <Tertiary>
                        Expires {String(card.expMonth).padStart(2, '0')}/{String(card.expYear).slice(-2)}
                      </Tertiary>
                    </View>
                    <Ionicons name="card-outline" size={22} color={theme.textSecondary} />
                  </Row>
                  {cardExpiringSoon(card, asOf) ? (
                    <Notice tone="attention" icon="warning-outline">
                      This card expires before your next renewal. Update it to avoid a failed
                      payment.
                    </Notice>
                  ) : null}
                </>
              ) : (
                <Small>No card on file.</Small>
              )}
              <Button
                label={card ? 'Update payment method' : 'Add a payment method'}
                variant="secondary"
                icon="card-outline"
                onPress={() =>
                  /*
                   * A card is never handled by this app. In production this
                   * hands off to the store's own sheet or a hosted payment
                   * form; the app only ever learns a brand and four digits.
                   */
                  setPaymentMethod({ brand: 'visa', last4: '4821', expMonth: 8, expYear: 2029 })
                }
              />
              <Tertiary>
                Card details are never stored by Dwella. Payments go through the App Store or
                Google Play, which is where a card can be changed or removed.
              </Tertiary>
            </Card>
          </View>
        </Enter>
      ) : null}

      {/* ---------------- Payment history ---------------- */}
      {visible.properties.length > 0 ? (
        <Enter index={2}>
          <View style={{ gap: spacing.md }}>
            <SectionTitle title="Payment history" />

            {periods.length > 0 ? (
              <Row gap={spacing.xs} wrap>
                {periods.slice(0, 6).map((option) => (
                  <Chip
                    key={option}
                    label={statementFor([], option, nameOf).label}
                    selected={option === period}
                    onPress={() => setPeriod(option)}
                  />
                ))}
              </Row>
            ) : null}

            {statement.byProperty.length === 0 ? (
              <Card>
                <Small>Nothing charged in {statement.label}.</Small>
              </Card>
            ) : (
              <Card>
                {/*
                  The month's total, then the same month split by property. A
                  landlord reconciling six rentals needs the split; everybody
                  else needs the total. Both, in that order, costs one row.
                */}
                <Row justify="space-between" align="flex-end">
                  <View style={{ flex: 1 }}>
                    <Tertiary>{statement.label.toUpperCase()}</Tertiary>
                    <Text style={[type.heading, { color: theme.text }, tabular]}>
                      {formatMoneyExact(statement.totalCents)}
                    </Text>
                  </View>
                </Row>
                {statement.byProperty.map((line, index) => (
                  <View key={line.propertyId ?? 'account'} style={{ gap: spacing.sm }}>
                    {index === 0 ? <Divider /> : null}
                    <Row justify="space-between" gap={spacing.md}>
                      <Text style={[type.bodyStrong, { color: theme.text, flex: 1 }]} numberOfLines={1}>
                        {line.propertyName}
                      </Text>
                      <Text style={[type.bodyStrong, { color: theme.text }, tabular]}>
                        {formatMoneyExact(line.totalCents)}
                      </Text>
                    </Row>
                    {line.charges.map((charge) => (
                      <ChargeRow key={charge.id} charge={charge} />
                    ))}
                  </View>
                ))}
              </Card>
            )}
          </View>
        </Enter>
      ) : null}

      {/* Someone with plan visibility but no billing access is told why. */}
      {visible.properties.length === 0 ? (
        <Enter index={1}>
          <Notice icon="lock-closed-outline">
            You can see what each plan includes, but not the card or the payment history — those
            stay with whoever owns the home.
          </Notice>
        </Enter>
      ) : null}

      <Card tone={theme.surfaceSunken} raised={0}>
        <SectionTitle title="Where charges land" />
        <Small>
          Every charge is tied to your account and, when it is about a specific home, to that home —
          so a rental's subscriptions and Dwella-booked services can be read off as that property's
          expenses rather than untangled from one list.
        </Small>
      </Card>
    </Screen>
  );
}

/** One line of a statement: what it was, when, and whether it went through. */
function ChargeRow({ charge }: { charge: Charge }) {
  const theme = useTheme();
  const failed = charge.status === 'failed';
  const refunded = charge.status === 'refunded';
  return (
    <Touchable
      onPress={charge.receiptNumber ? () => {} : undefined}
      scaleTo={0.995}
      accessibilityLabel={`${charge.description}, ${formatMoneyExact(charge.amountCents)}`}
    >
      <Row justify="space-between" gap={spacing.md} style={{ paddingLeft: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Small numberOfLines={1}>{charge.description}</Small>
          <Tertiary>
            {formatDate(charge.date)}
            {charge.receiptNumber ? ` · Receipt ${charge.receiptNumber}` : ''}
          </Tertiary>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Small
            style={[
              tabular,
              { color: refunded ? theme.textTertiary : failed ? theme.red : theme.textSecondary },
            ]}
          >
            {charge.amountCents < 0 ? '−' : ''}
            {formatMoneyExact(Math.abs(charge.amountCents))}
          </Small>
          {charge.status !== 'paid' ? (
            <Badge
              label={charge.status}
              fg={failed ? theme.red : theme.textSecondary}
              bg={failed ? theme.redSoft : theme.surfaceSunken}
            />
          ) : null}
        </View>
      </Row>
    </Touchable>
  );
}
