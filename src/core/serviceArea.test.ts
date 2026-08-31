import { describe, expect, it } from 'vitest';
import {
  MARKETS,
  PRODUCT_DEFAULT,
  SIGNUP_GATE,
  announcedMarkets,
  checkEligibility,
  isLive,
  liveMarkets,
  marketForPostalCode,
  normalizePostalCode,
  placeLabel,
  statusFor,
} from './serviceArea';
import {
  NO_CONSENTS,
  buildWaitlistEntry,
  demandByMarket,
  demandByPostalCode,
} from './waitlist';

describe('service areas', () => {
  it('decides on the postal code, never on the city name', () => {
    // The same city string in two markets, and a market whose name nobody
    // types. If any of this were matched on `city` it would go wrong here.
    expect(marketForPostalCode('29445')?.id).toBe('chs');
    expect(marketForPostalCode('29205')?.id).toBe('columbia');
    expect(checkEligibility({ line1: '1 Anywhere', city: 'Charleston', postalCode: '29205' }).kind)
      .toBe('waitlist');
  });

  it('normalises what people actually type', () => {
    expect(normalizePostalCode('29445-1234')).toBe('29445');
    expect(normalizePostalCode(' 29445 ')).toBe('29445');
    expect(normalizePostalCode('294')).toBeUndefined();
    expect(normalizePostalCode(undefined)).toBeUndefined();
  });

  it('treats an unrecognised area as not served rather than as served', () => {
    // Failing closed is the whole point: an address that matched nothing must
    // never be waved through, because the cost of the other mistake is a
    // technician dispatched to a county nobody agreed to cover.
    expect(statusFor('app', '99999')).toBe(PRODUCT_DEFAULT.app);
    expect(isLive('care', '99999')).toBe(false);
    expect(isLive('app', undefined)).toBe(false);
  });

  it('answers "unknown" for an address with no postal code', () => {
    // Not a rejection. A hand-typed address may carry no postal code, and
    // turning a missing field into "Dwella is not available" is both wrong and
    // the most discouraging way to be wrong.
    expect(checkEligibility({ line1: '123 Main Street' }).kind).toBe('unknown');
  });

  it('opens the Charleston metro and nothing else', () => {
    expect(liveMarkets().map((m) => m.id)).toEqual(['chs']);
    for (const zip of ['29401', '29464', '29483', '29445', '29406']) {
      expect(checkEligibility({ line1: 'x', postalCode: zip }).kind).toBe('live');
    }
    // Named, adjacent, and deliberately not open.
    expect(checkEligibility({ line1: 'x', postalCode: '29461' }).kind).toBe('waitlist');
  });

  it('carries availability per product, not per company', () => {
    // The distinction that matters later: the day the app goes nationwide must
    // not be the day Dwella promises a technician everywhere. Flipping the
    // app's default is one line and moves nothing else.
    const relaxed = { ...PRODUCT_DEFAULT, app: 'live' as const };
    expect(relaxed.app).toBe('live');
    expect(relaxed.care).toBe('waitlist');
    // And a live market can carry a different status per product.
    const chs = MARKETS.find((m) => m.id === 'chs')!;
    expect(Object.keys(chs.products).sort()).toEqual(['app', 'care', 'plus', 'pro']);
  });

  it('names a place only when there is a market to name', () => {
    expect(placeLabel({ line1: 'x', postalCode: '29205' })).toBe('Columbia, SC');
    // Nowhere Dwella has announced: describe what they gave us, promise nothing.
    expect(placeLabel({ line1: 'x', city: 'Boise', state: 'ID', postalCode: '83702' })).toBe('Boise, ID');
    expect(announcedMarkets().every((m) => m.products[SIGNUP_GATE] === 'waitlist')).toBe(true);
  });

  it('has no postal code in two markets at once', () => {
    // A postal code in two territories makes eligibility depend on array order,
    // which is the kind of bug that only shows up as one confused customer.
    const seen = new Set<string>();
    for (const market of MARKETS) {
      for (const zip of market.postalCodes) {
        expect(seen.has(zip), `${zip} is in more than one market`).toBe(false);
        seen.add(zip);
        expect(zip, `${zip} is not five digits`).toMatch(/^\d{5}$/);
      }
    }
  });
});

describe('the waitlist', () => {
  const entry = (postalCode: string, state?: string, email = 'a@b.com') =>
    buildWaitlistEntry(
      { email, address: { line1: 'x', postalCode, state }, consents: NO_CONSENTS },
      `wl_${postalCode}_${email}`,
      '2026-08-31T00:00:00.000Z',
    )!;

  it('refuses an entry it could never act on', () => {
    // No postal code means it cannot be counted and cannot be told when its
    // area opens. That is not a waitlist entry, it is an email address.
    expect(
      buildWaitlistEntry(
        { email: 'a@b.com', address: { line1: 'x' }, consents: NO_CONSENTS },
        'wl_1',
        '2026-08-31T00:00:00.000Z',
      ),
    ).toBeUndefined();
  });

  it('records the launch notice and nothing else by default', () => {
    // Wanting to know when Dwella arrives is not a newsletter subscription and
    // is certainly not an invitation to send post to the address somebody typed
    // in to check whether they were covered.
    const e = entry('29205');
    expect(e.consents.launchNotice).toBe(true);
    expect(e.consents.productEmail).toBe(false);
    expect(e.consents.postalMail).toBe(false);
  });

  it('is honest that a local entry has not reached anyone', () => {
    expect(entry('29205').delivered).toBe(false);
  });

  it('counts demand by market, biggest first', () => {
    const rows = demandByMarket([
      entry('29205', 'SC', 'a@x.com'),
      entry('29206', 'SC', 'b@x.com'),
      entry('29205', 'SC', 'c@x.com'),
      entry('28202', 'NC', 'd@x.com'),
    ]);
    expect(rows[0]).toEqual({ key: 'columbia', label: 'Columbia, SC', count: 3 });
    expect(rows[1]!.count).toBe(1);
  });

  it('keeps demand from unnamed areas rather than discarding it', () => {
    // "Forty-one homes in Georgia" is precisely the signal that a market
    // nobody has drawn yet should be.
    const rows = demandByMarket([entry('83702', 'ID', 'a@x.com'), entry('83703', 'ID', 'b@x.com')]);
    expect(rows).toEqual([{ key: 'state:ID', label: 'Elsewhere in ID', count: 2 }]);
  });

  it('drills into postal codes within one market', () => {
    const rows = demandByPostalCode(
      [
        entry('29205', 'SC', 'a@x.com'),
        entry('29205', 'SC', 'b@x.com'),
        entry('29206', 'SC', 'c@x.com'),
        entry('28202', 'NC', 'd@x.com'),
      ],
      'columbia',
    );
    expect(rows).toEqual([
      { key: '29205', label: '29205', count: 2 },
      { key: '29206', label: '29206', count: 1 },
    ]);
  });
});
