import type { AddressSuggestion } from './address';
import { marketForPostalCode, normalizePostalCode } from './serviceArea';

/**
 * People whose homes Dwella cannot reach yet.
 *
 * A waitlist is usually a polite dead end. This one is the expansion plan: every
 * entry is a house at a postal code, so the answer to "which city opens next"
 * stops being a guess and becomes a count. That is only true if the postal code
 * is kept — a list of email addresses tells you nothing about where to go.
 *
 * ## Consent
 *
 * Three different permissions, deliberately not one flag.
 *
 * Joining is a request to be told when Dwella opens where you live: that notice
 * is the thing being asked for, so it needs no separate box. Wanting to hear
 * when Dwella arrives is not agreeing to a newsletter, and it is certainly not
 * agreeing to receive post — somebody handed over their address to find out
 * whether a service covers it, which is a different act from inviting mail to
 * it. Bundling the three would make every one of them worth less, because a
 * consent that was never really given is one somebody withdraws by reporting the
 * message as spam.
 */

export interface MarketingConsents {
  /**
   * Told once, when Dwella opens in their area. Implied by joining — it is what
   * joining is for — and recorded explicitly anyway so there is a record of what
   * was agreed and when.
   */
  launchNotice: boolean;
  /** Ongoing email about the product. Off unless asked for. */
  productEmail: boolean;
  /**
   * Physical mail to the address they gave. Off unless asked for, and never
   * inferred from the fact that an address was typed in to check coverage.
   */
  postalMail: boolean;
}

export const NO_CONSENTS: MarketingConsents = {
  launchNotice: false,
  productEmail: false,
  postalMail: false,
};

export interface WaitlistEntry {
  id: string;
  email: string;
  /** Five digits. The field the expansion decision is actually made on. */
  postalCode: string;
  city?: string;
  state?: string;
  /** Which named market this falls in, when it falls in one at all. */
  marketId?: string;
  joinedAt: string;
  consents: MarketingConsents;
  /**
   * Whether this reached Dwella or is still sitting on the device.
   *
   * Kept on the entry rather than assumed, so the screen can say which it is.
   * "You're on the list" is a lie if the list is a phone.
   */
  delivered: boolean;
}

export interface WaitlistDraft {
  email: string;
  address: AddressSuggestion;
  consents: MarketingConsents;
}

/**
 * Builds the entry from what the screen collected.
 *
 * Returns undefined without a usable postal code: an entry with no postal code
 * cannot be counted, cannot be told when its area opens, and is therefore not
 * a waitlist entry — it is just an email address.
 */
export function buildWaitlistEntry(
  draft: WaitlistDraft,
  id: string,
  now: string,
): WaitlistEntry | undefined {
  const postalCode = normalizePostalCode(draft.address.postalCode);
  if (!postalCode) return undefined;
  const market = marketForPostalCode(postalCode);
  return {
    id,
    email: draft.email.trim().toLowerCase(),
    postalCode,
    city: draft.address.city,
    state: draft.address.state,
    marketId: market?.id,
    joinedAt: now,
    consents: { ...draft.consents, launchNotice: true },
    delivered: false,
  };
}

export interface DemandRow {
  key: string;
  label: string;
  count: number;
}

/**
 * Where the demand is, by market and by postal code.
 *
 * The reason the postal code is on the entry. Grouped by market for the
 * "which city next" question and by postal code for everything after it —
 * which neighbourhoods to advertise in, where a Care technician would have
 * enough stops in a day to be worth hiring.
 *
 * Entries outside any named market are grouped under their state rather than
 * discarded, because "forty-one homes in Georgia" is the signal that a market
 * nobody has drawn yet should be.
 */
export function demandByMarket(entries: WaitlistEntry[]): DemandRow[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const entry of entries) {
    const market = marketForPostalCode(entry.postalCode);
    const key = market?.id ?? `state:${entry.state ?? 'unknown'}`;
    const label = market
      ? `${market.name}, ${market.state}`
      : entry.state
        ? `Elsewhere in ${entry.state}`
        : 'Elsewhere';
    const row = counts.get(key) ?? { label, count: 0 };
    row.count += 1;
    counts.set(key, row);
  }
  return [...counts.entries()]
    .map(([key, row]) => ({ key, ...row }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function demandByPostalCode(entries: WaitlistEntry[], marketId?: string): DemandRow[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (marketId && marketForPostalCode(entry.postalCode)?.id !== marketId) continue;
    counts.set(entry.postalCode, (counts.get(entry.postalCode) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
