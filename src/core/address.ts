/**
 * Address suggestions.
 *
 * A seam, not a feature. The setup flow needs somebody to *pick* an address
 * rather than type one, because picking is what turns a string into a confirmed
 * building — and the confirm step is what stops a typo becoming a permanent
 * record attached to the wrong house.
 *
 * What is behind it here is a short local list, which is honest about being one
 * on the screen that uses it. Swapping in Places, Mapbox or Smarty means
 * replacing this function and nothing else: everything downstream takes an
 * `AddressSuggestion` and does not care where it came from.
 */

export interface AddressSuggestion {
  line1: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

/**
 * Enough real streets to make the picker behave like a picker.
 *
 * Weighted to the Lowcountry because that is where the sample home is, so the
 * flow reads coherently end to end rather than offering Kansas addresses for a
 * coastal property.
 */
const KNOWN: AddressSuggestion[] = [
  { line1: '123 Main Street', city: 'Goose Creek', state: 'SC', postalCode: '29445' },
  { line1: '412 Marsh Point Lane', city: 'Mount Pleasant', state: 'SC', postalCode: '29464' },
  { line1: '54 Marsh View Drive', city: 'Charleston', state: 'SC', postalCode: '29403' },
  { line1: '18 Live Oak Lane', city: 'Summerville', state: 'SC', postalCode: '29483' },
  { line1: '2201 Palmetto Avenue', city: 'North Charleston', state: 'SC', postalCode: '29405' },
  { line1: '77 Cypress Gardens Road', city: 'Moncks Corner', state: 'SC', postalCode: '29461' },
  { line1: '905 Ashley River Road', city: 'Charleston', state: 'SC', postalCode: '29407' },
  { line1: '31 Rifle Range Road', city: 'Mount Pleasant', state: 'SC', postalCode: '29464' },
];

/**
 * Matches on any word the person has typed so far.
 *
 * Word-prefix rather than substring: somebody typing "main" should see Main
 * Street, but should not see "Domain Court". Below two characters nothing is
 * offered at all — a list that appears on the first keystroke is noise.
 */
export function suggestAddresses(query: string, limit = 5): AddressSuggestion[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) return [];

  const terms = trimmed.split(/\s+/).filter(Boolean);
  return KNOWN.filter((entry) => {
    const haystack = [entry.line1, entry.city, entry.state, entry.postalCode]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const words = haystack.split(/\s+/);
    return terms.every((term) => words.some((word) => word.startsWith(term)));
  }).slice(0, limit);
}

/** A short label for a suggestion, for confirmations and list rows. */
export function formatAddress(address: AddressSuggestion): string {
  const rest = [address.city, address.state].filter(Boolean).join(', ');
  return rest ? `${address.line1}, ${rest}` : address.line1;
}

/**
 * A house needs a name before it has one.
 *
 * "123 Main Street" is a better default nickname than "Home" for anybody who
 * will eventually hold more than one property, and it is derived rather than
 * asked for — one less field in a flow whose whole point is having almost none.
 */
export function nicknameFor(address: AddressSuggestion): string {
  return address.line1.trim() || 'Home';
}
