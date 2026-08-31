import type { AddressSuggestion } from './address';

/**
 * Where Dwella is available, and for what.
 *
 * The rule this file exists to prevent is `if (city === 'Charleston')`. City
 * names are typed by people, spelled several ways, and say nothing about where a
 * house actually is — "Charleston" covers a peninsula, three islands and a
 * county line. Postal codes are what a service territory is really made of, and
 * they are what a market gets expanded by: opening Columbia should be a change
 * to this table, not a release.
 *
 * Availability is per *product*, not per company. That distinction costs almost
 * nothing now and is the whole design later: somebody in Ohio should be able to
 * document their house long before a Care technician can reach it, and the day
 * the app goes nationwide should not also be the day Dwella promises to send
 * somebody to change a filter in Cleveland.
 */

/** The things a market can have, each with its own reach. */
export type DwellaProduct =
  /** The app and the Home Record itself. */
  | 'app'
  /** The paid record tier. */
  | 'plus'
  /** The contractor marketplace — needs real contractors in the area. */
  | 'pro'
  /** Scheduled visits by a Dwella technician — needs a technician in the area. */
  | 'care';

export type MarketStatus =
  /** Open for business here today. */
  | 'live'
  /** Named, not open. Somebody here can join the waitlist for it. */
  | 'waitlist'
  /** Nothing has been said about this area, so nothing is promised. */
  | 'unannounced';

export interface Market {
  id: string;
  /** How the market is named to somebody who lives in it. */
  name: string;
  state: string;
  /**
   * The territory, as five-digit postal codes.
   *
   * Deliberately explicit rather than a prefix or a radius: a boundary drawn by
   * "starts with 294" quietly includes places nobody has agreed to serve, and
   * the first time that matters is when a Care visit is booked somewhere no van
   * goes.
   */
  postalCodes: string[];
  products: Record<DwellaProduct, MarketStatus>;
}

const ALL: Record<DwellaProduct, MarketStatus> = {
  app: 'live',
  plus: 'live',
  pro: 'live',
  care: 'live',
};
const NONE_YET: Record<DwellaProduct, MarketStatus> = {
  app: 'waitlist',
  plus: 'waitlist',
  pro: 'waitlist',
  care: 'waitlist',
};

/**
 * The markets, as data.
 *
 * Opening a new area is an edit here — and, once there is a server, a row in a
 * table this file reads instead. Nothing downstream knows the name of a city.
 */
export const MARKETS: Market[] = [
  {
    id: 'chs',
    name: 'Charleston',
    state: 'SC',
    postalCodes: [
      // Charleston proper, James Island, West Ashley, Johns Island, Daniel Island
      '29401', '29403', '29405', '29407', '29412', '29414', '29455', '29492',
      // North Charleston, Hanahan, Ladson
      '29406', '29410', '29418', '29420', '29456',
      // Mount Pleasant, Isle of Palms, Sullivan's Island, Folly Beach
      '29464', '29466', '29451', '29482', '29439',
      // Summerville
      '29483', '29485', '29486',
      // Goose Creek
      '29445',
    ],
    products: ALL,
  },
  {
    id: 'moncks-corner',
    name: 'Moncks Corner',
    state: 'SC',
    postalCodes: ['29461'],
    products: NONE_YET,
  },
  {
    id: 'columbia',
    name: 'Columbia',
    state: 'SC',
    postalCodes: ['29201', '29203', '29204', '29205', '29206', '29209', '29210', '29212'],
    products: NONE_YET,
  },
  {
    id: 'greenville',
    name: 'Greenville',
    state: 'SC',
    postalCodes: ['29601', '29605', '29607', '29609', '29615'],
    products: NONE_YET,
  },
  {
    id: 'savannah',
    name: 'Savannah',
    state: 'GA',
    postalCodes: ['31401', '31404', '31405', '31406', '31410', '31411', '31419'],
    products: NONE_YET,
  },
  {
    id: 'charlotte',
    name: 'Charlotte',
    state: 'NC',
    postalCodes: ['28202', '28203', '28204', '28205', '28206', '28207', '28209', '28211'],
    products: NONE_YET,
  },
];

/**
 * What a product does somewhere no market covers.
 *
 * Every one of these is `waitlist` while Dwella is one city, and this is the
 * single place that changes when it is not. Taking the app nationwide is
 * `app: 'live'` here — Care stays on its own line, which is the point.
 *
 * Never `live` by omission: an address that matched nothing must not be treated
 * as served. Failing the other way sends a van to a county nobody agreed to.
 */
export const PRODUCT_DEFAULT: Record<DwellaProduct, MarketStatus> = {
  app: 'waitlist',
  plus: 'waitlist',
  pro: 'waitlist',
  care: 'waitlist',
};

/**
 * The product that decides whether somebody can sign up at all.
 *
 * One constant so the gate is a stated decision rather than an emergent
 * property of whichever check a screen happened to call.
 */
export const SIGNUP_GATE: DwellaProduct = 'app';

/** Five digits, or nothing. Handles "29445-1234" and stray whitespace. */
export function normalizePostalCode(raw: string | undefined): string | undefined {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length >= 5 ? digits.slice(0, 5) : undefined;
}

export function marketForPostalCode(raw: string | undefined): Market | undefined {
  const postalCode = normalizePostalCode(raw);
  if (!postalCode) return undefined;
  return MARKETS.find((m) => m.postalCodes.includes(postalCode));
}

/** What a given product does at a given postal code. */
export function statusFor(product: DwellaProduct, postalCode: string | undefined): MarketStatus {
  const market = marketForPostalCode(postalCode);
  return market ? market.products[product] : PRODUCT_DEFAULT[product];
}

export function isLive(product: DwellaProduct, postalCode: string | undefined): boolean {
  return statusFor(product, postalCode) === 'live';
}

export type Eligibility =
  | { kind: 'live'; market: Market; postalCode: string }
  | { kind: 'waitlist'; market?: Market; postalCode: string }
  /** No postal code, so no answer. Not a rejection — a missing input. */
  | { kind: 'unknown' };

/**
 * Whether setup may proceed for this address.
 *
 * Returns `unknown` rather than guessing when there is no postal code. An
 * address typed by hand may not carry one, and treating that as "not eligible"
 * turns a missing field into a rejection — which is both wrong and the most
 * discouraging possible way to be wrong.
 */
export function checkEligibility(address: AddressSuggestion): Eligibility {
  const postalCode = normalizePostalCode(address.postalCode);
  if (!postalCode) return { kind: 'unknown' };
  const market = marketForPostalCode(postalCode);
  const status = market ? market.products[SIGNUP_GATE] : PRODUCT_DEFAULT[SIGNUP_GATE];
  if (status === 'live' && market) return { kind: 'live', market, postalCode };
  return { kind: 'waitlist', market, postalCode };
}

/**
 * How to name where somebody is when telling them Dwella is not there yet.
 *
 * A named market gets its name — "Dwella is coming to Columbia" is a promise
 * with a place in it. Anywhere else is described by what they gave us and no
 * more, because naming a market that does not exist is inventing a plan.
 */
export function placeLabel(address: AddressSuggestion): string | undefined {
  const market = marketForPostalCode(address.postalCode);
  if (market) return `${market.name}, ${market.state}`;
  const local = [address.city, address.state].filter(Boolean).join(', ');
  return local || normalizePostalCode(address.postalCode);
}

/** Markets that are named but not open, for "where we are going next". */
export function announcedMarkets(): Market[] {
  return MARKETS.filter((m) => m.products[SIGNUP_GATE] === 'waitlist');
}

/** Markets open for the signup gate today. */
export function liveMarkets(): Market[] {
  return MARKETS.filter((m) => m.products[SIGNUP_GATE] === 'live');
}
