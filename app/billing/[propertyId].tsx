import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { permissionsFor } from '../../src/core/account';
import {
  TIERS,
  TIER_ORDER,
  careBenefits,
  chargesForProperty,
  priceOfAdding,
  tierFor,
  tierMove,
  trialAvailable,
  type Tier,
} from '../../src/core/billing';
import { isLive, placeLabel } from '../../src/core/serviceArea';
import { formatDate, today } from '../../src/core/dates';
import { formatMoneyExact } from '../../src/core/money';
import { subscriptionFor, useStore } from '../../src/state/store';
import {
  Badge,
  Body,
  Button,
  Card,
  Divider,
  Enter,
  EmptyState,
  Meter,
  Notice,
  Row,
  Screen,
  SectionTitle,
  Small,
  Tertiary,
  Title,
} from '../../src/ui/components';
import { useDialog } from '../../src/ui/dialog';
import { spacing, tabular, type, useTheme } from '../../src/ui/theme';

/**
 * Membership details for one property.
 *
 * Two halves. What the plan *includes*, which anyone in the household can see —
 * a manager about to book a contractor needs to know a Care visit is available.
 * And what it *costs*, which only the owner or a billing admin sees.
 *
 * Benefits are shown as remaining credits rather than as terms. Nobody
 * remembers "two seasonal visits per membership year"; they remember "one visit
 * left". A benefit somebody forgets they have is a benefit they did not buy.
 */
export default function MembershipDetails() {
  const theme = useTheme();
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const account = useStore((s) => s.account);
  const properties = useStore((s) => s.properties);
  const memberships = useStore((s) => s.memberships);
  const subscriptions = useStore((s) => s.subscriptions);
  const careVisits = useStore((s) => s.careVisits);
  const charges = useStore((s) => s.charges);
  const changeTier = useStore((s) => s.changeTier);
  const cancelSubscription = useStore((s) => s.cancelSubscription);
  const resumeSubscription = useStore((s) => s.resumeSubscription);
  const beginTrial = useStore((s) => s.beginTrial);
  const { confirm } = useDialog();
  const asOf = today();

  const property = properties.find((p) => p.id === propertyId);
  const subscription = propertyId ? subscriptionFor(subscriptions, propertyId) : undefined;
  const tier = tierFor(subscription, asOf);

  const access = useMemo(() => {
    if (!account || !propertyId) return { can: () => false };
    return permissionsFor(memberships, {
      accountId: account.id,
      propertyId,
      now: new Date().toISOString(),
    });
  }, [account, memberships, propertyId]);

  const benefits = subscription
    ? careBenefits({ subscription, visits: careVisits, asOf })
    : undefined;

  if (!property || !access.can('view_benefits')) {
    return (
      <Screen>
        <EmptyState
          icon="lock-closed-outline"
          title="Not available"
          body="You do not have access to this home's membership."
        />
      </Screen>
    );
  }

  const mayManage = access.can('manage_billing');
  const maySeePrice = access.can('view_plan');
  const definition = TIERS[tier];
  const history = propertyId ? chargesForProperty(charges, propertyId) : [];
  /*
   * A plan already cancelled should not offer cancelling again. Until the period
   * runs out the useful action is the opposite one, so the free row is replaced
   * by a way back — nobody should have to re-buy something they are still paying
   * for because they changed their mind two days later.
   */
  const pendingCancellation = Boolean(subscription?.cancelledOn) && tier !== 'free';

  /**
   * What a row offers, said as a direction rather than a destination.
   *
   * "Switch to Dwella+" made the owner work out which way they were moving by
   * comparing prices. Naming the direction answers it. Moving to free keeps its
   * own verb: it is a cancellation — billing stops and access runs to the end of
   * the period — and calling that a downgrade would hide the part that matters.
   */
  const moveLabel = (option: Tier) => {
    const target = TIERS[option];
    if (option === 'free') return `Cancel — move to ${target.name}`;
    return `${tierMove(tier, option) === 'upgrade' ? 'Upgrade' : 'Downgrade'} to ${target.name}`;
  };

  /**
   * Moving between plans.
   *
   * Downgrading is a decision the owner is entitled to make on the spot, so it
   * confirms and applies. Upgrading would normally be a purchase — there is no
   * billing provider wired up here, so the change is applied for evaluation and
   * the dialog says exactly that rather than implying a charge that never
   * happened. When StoreKit and Play Billing are in, this branch becomes a
   * purchase whose success handler calls `activateSubscription`.
   *
   * The confirmation repeats the row's own verb. A dialog that says "Switch"
   * over a button that said "Downgrade" is a second, vaguer description of the
   * thing already decided on.
   */
  const move = async (next: Tier) => {
    if (!propertyId) return;

    if (next === 'free') {
      const confirmed = await confirm({
        title: `Cancel ${definition.name}?`,
        message: `${property.nickname} keeps its record, history, and reminders — those are free forever. You lose the forecast, warranty alerts, and the full health breakdown${tier === 'care' ? ', and the seasonal visits' : ''}. Access continues until the end of the period you have already paid for.`,
        confirmLabel: 'Cancel plan',
        cancelLabel: 'Keep it',
        destructive: true,
      });
      if (confirmed) cancelSubscription(propertyId);
      return;
    }

    const target = TIERS[next];
    const direction = tierMove(tier, next);
    const verb = direction === 'upgrade' ? 'Upgrade' : 'Downgrade';
    const price = priceOfAdding(
      subscriptions.filter((s) => s.propertyId !== propertyId),
      next as Exclude<Tier, 'free'>,
      asOf,
    );
    const confirmed = await confirm({
      title: `${verb} ${property.nickname} to ${target.name}?`,
      message: `${target.name} is ${formatMoneyExact(price)} a month for this home${
        direction === 'downgrade' ? `, down from ${definition.name}` : ''
      }. In-app purchase is not wired up in this build, so nothing will be charged — the plan is applied so you can see what it changes.`,
      confirmLabel: `${verb} to ${target.name}`,
    });
    if (confirmed) changeTier(propertyId, next);
  };

  return (
    <Screen gap={spacing.xl}>
      <View style={{ gap: spacing.sm }}>
        <Title>{definition.name}</Title>
        <Row gap={spacing.sm} wrap>
          {maySeePrice && tier !== 'free' ? (
            <Text style={[type.subheading, { color: theme.text }, tabular]}>
              {formatMoneyExact(
                priceOfAdding(
                  subscriptions.filter((s) => s.propertyId !== propertyId),
                  tier as Exclude<Tier, 'free'>,
                  asOf,
                ),
              )}
              /month
            </Text>
          ) : null}
          <Badge label={property.nickname} fg={theme.textSecondary} bg={theme.surfaceSunken} />
        </Row>
        <Small>{definition.blurb}</Small>
      </View>

      {/* What is included. Visible to everyone in the household. */}
      <Enter>
        <Card>
          <SectionTitle title="What this includes" />
          {definition.includes.map((line) => (
            <Row key={line} gap={spacing.sm} align="flex-start">
              <Ionicons
                name="checkmark"
                size={16}
                color={tier === 'free' ? theme.textSecondary : theme.sage}
                style={{ marginTop: 2 }}
              />
              <Body style={{ flex: 1 }}>{line}</Body>
            </Row>
          ))}
        </Card>
      </Enter>

      {/* Care benefits, as credits. */}
      {benefits ? (
        <Enter index={1}>
          <Card raised={2}>
            <SectionTitle title="Your Care benefits" />

            <View style={{ gap: spacing.sm }}>
              <Row justify="space-between">
                <Small>Seasonal visits</Small>
                <Text style={[type.bodyStrong, { color: theme.text }, tabular]}>
                  {benefits.seasonalVisitsRemaining} of {benefits.seasonalVisitsIncluded} left
                </Text>
              </Row>
              <Meter
                value={(benefits.seasonalVisitsUsed / benefits.seasonalVisitsIncluded) * 100}
                color={benefits.seasonalVisitsRemaining > 0 ? theme.sage : theme.textTertiary}
              />
              <Tertiary>
                {benefits.seasonalVisitsRemaining === 0
                  ? `Both visits used this membership year. The next two become available ${formatDate(benefits.renewsOn)}.`
                  : benefits.nextEligibleOn && benefits.nextEligibleOn > asOf
                    ? `Next eligible visit: ${formatDate(benefits.nextEligibleOn)} — visits are spaced so they land in different seasons.`
                    : 'Available to book now.'}
              </Tertiary>
            </View>

            <Divider />

            <Row justify="space-between">
              <Small>Handyman discount</Small>
              <Text style={[type.bodyStrong, { color: theme.text }]}>
                {benefits.handymanDiscountPercent}%
              </Text>
            </Row>
            <Row justify="space-between">
              <Small>Priority booking</Small>
              <Badge label="active" fg={theme.sage} bg={theme.sageSoft} />
            </Row>
            <Row justify="space-between">
              <Small>Dwella+</Small>
              <Badge label="included" fg={theme.sage} bg={theme.sageSoft} />
            </Row>
            <Row justify="space-between">
              <Small>Next annual plan review</Small>
              <Tertiary>{formatDate(benefits.planReviewOn)}</Tertiary>
            </Row>
          </Card>
        </Enter>
      ) : null}

      {/* Plan and billing controls. Owner or billing admin only. */}
      {mayManage ? (
        <Enter index={2}>
          <View style={{ gap: spacing.md }}>
            <SectionTitle title="Plan" />
            {TIER_ORDER.filter(
              (option) => option !== tier && !(pendingCancellation && option === 'free'),
            ).map((option) => {
              const target = TIERS[option];
              const price =
                option === 'free'
                  ? 0
                  : priceOfAdding(
                      subscriptions.filter((s) => s.propertyId !== propertyId),
                      option as Exclude<Tier, 'free'>,
                      asOf,
                    );
              /*
               * Care is a van, not a download. Selling seasonal visits at a
               * property no technician can reach is a promise that fails on
               * the day somebody tries to book — so it is offered where it can
               * be honoured, and named as coming everywhere else. The record
               * tiers have no such constraint and are never gated this way.
               */
              const reachable = option !== 'care' || isLive('care', property.postalCode);
              return (
                <Card key={option} onPress={reachable ? () => void move(option) : undefined}>
                  <Row justify="space-between" gap={spacing.md}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          type.bodyStrong,
                          { color: reachable ? theme.text : theme.textSecondary },
                        ]}
                      >
                        {reachable ? moveLabel(option) : `${target.name}`}
                      </Text>
                      <Tertiary>
                        {reachable
                          ? target.blurb
                          : `Not in ${placeLabel({ line1: '', city: property.city, state: property.state, postalCode: property.postalCode }) ?? 'your area'} yet — Care visits run where Dwella has technicians.`}
                      </Tertiary>
                    </View>
                    {reachable ? (
                      <Text style={[type.bodyStrong, { color: theme.text }, tabular]}>
                        {price > 0 ? `${formatMoneyExact(price)}/mo` : 'Free'}
                      </Text>
                    ) : (
                      <Badge label="coming soon" fg={theme.textSecondary} bg={theme.surfaceSunken} />
                    )}
                  </Row>
                </Card>
              );
            })}

            {tier === 'free' && trialAvailable(subscription) ? (
              <Button
                label="Try Dwella+ free for 30 days"
                icon="sparkles-outline"
                onPress={() => {
                  if (propertyId) beginTrial(propertyId);
                }}
                full
              />
            ) : null}

            {subscription?.cancelledOn ? (
              <>
                <Notice tone="attention" icon="information-circle-outline">
                  Cancelled on {formatDate(subscription.cancelledOn)}. You keep everything until{' '}
                  {subscription.renewsOn ? formatDate(subscription.renewsOn) : 'the end of the period'}{' '}
                  — nothing you have paid for is taken away early.
                </Notice>
                {pendingCancellation ? (
                  <Button
                    label={`Keep ${definition.name} after all`}
                    icon="refresh-outline"
                    variant="secondary"
                    onPress={() => {
                      if (propertyId) resumeSubscription(propertyId);
                    }}
                    full
                  />
                ) : null}
              </>
            ) : null}
          </View>
        </Enter>
      ) : maySeePrice ? (
        <Notice icon="lock-closed-outline">
          You can see this plan and what it includes, but changing or cancelling it is the owner's.
        </Notice>
      ) : null}

      {/* This property's charges — the beginning of its expense history. */}
      {access.can('view_billing') && history.length > 0 ? (
        <Enter index={3}>
          <View style={{ gap: spacing.md }}>
            <SectionTitle title={`Charges for ${property.nickname}`} />
            <Card>
              {history.slice(0, 12).map((charge, index) => (
                <View key={charge.id} style={{ gap: spacing.sm }}>
                  {index > 0 ? <Divider /> : null}
                  <Row justify="space-between" gap={spacing.md}>
                    <View style={{ flex: 1 }}>
                      <Small numberOfLines={1}>{charge.description}</Small>
                      <Tertiary>
                        {formatDate(charge.date)}
                        {charge.receiptNumber ? ` · Receipt ${charge.receiptNumber}` : ''}
                      </Tertiary>
                    </View>
                    <Small style={tabular}>{formatMoneyExact(charge.amountCents)}</Small>
                  </Row>
                </View>
              ))}
              <Tertiary>
                These feed this home's expense history, which is what makes a rental's costs
                straightforward to total at the end of a tax year.
              </Tertiary>
            </Card>
          </View>
        </Enter>
      ) : null}

      <Button label="Back to billing" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
