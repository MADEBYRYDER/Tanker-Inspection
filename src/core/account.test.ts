import { describe, expect, it } from 'vitest';
import { nicknameFor, suggestAddresses } from './address';
import {
  ASSIGNABLE_ROLES,
  ROLE_PERMISSIONS,
  accessibleProperties,
  canRemoveMember,
  currentOwnership,
  formatPublicId,
  generatePublicId,
  householdFor,
  membershipActive,
  ownershipHistory,
  permissionsFor,
  roleCan,
  type Membership,
  type OwnershipPeriod,
  type Role,
  roleForRelationship,
  opensOwnershipPeriod,
  canTransferProperty,
} from './account';

const NOW = '2026-08-30T12:00:00.000Z';

function member(over: Partial<Membership> & { accountId: string; propertyId: string; role: Role }): Membership {
  return {
    id: `mem_${over.accountId}_${over.propertyId}`,
    displayName: over.accountId,
    addedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

/**
 * The architectural guarantees. Each of these is a property of the *model*
 * rather than of a screen, which is why they are tested here: a screen can be
 * rewritten, but if one of these stops holding the product is broken in a way
 * that only shows up as somebody seeing a house they do not own.
 */

describe('one account, many properties', () => {
  const memberships = [
    member({ accountId: 'ryder', propertyId: 'p_home', role: 'owner' }),
    member({ accountId: 'ryder', propertyId: 'p_beach', role: 'owner' }),
    member({ accountId: 'ryder', propertyId: 'p_rental', role: 'owner' }),
    member({ accountId: 'adrienne', propertyId: 'p_home', role: 'admin' }),
  ];

  it('lists every property an account can reach', () => {
    const mine = accessibleProperties(memberships, { accountId: 'ryder', now: NOW });
    expect(mine.map((p) => p.propertyId).sort()).toEqual(['p_beach', 'p_home', 'p_rental']);
  });

  it('never leaks a property the account has no membership on', () => {
    const theirs = accessibleProperties(memberships, { accountId: 'adrienne', now: NOW });
    expect(theirs.map((p) => p.propertyId)).toEqual(['p_home']);
    expect(permissionsFor(memberships, { accountId: 'adrienne', propertyId: 'p_beach', now: NOW }).role)
      .toBeUndefined();
  });

  it('gives no permissions at all on a property with no membership', () => {
    const { can } = permissionsFor(memberships, {
      accountId: 'stranger',
      propertyId: 'p_home',
      now: NOW,
    });
    expect(can('view_record')).toBe(false);
    expect(can('view_costs')).toBe(false);
    expect(can('transfer_property')).toBe(false);
  });
});

describe('one property, many accounts', () => {
  const memberships = [
    member({ accountId: 'ryder', propertyId: 'p_home', role: 'owner' }),
    member({ accountId: 'adrienne', propertyId: 'p_home', role: 'admin' }),
    member({ accountId: 'pm', propertyId: 'p_home', role: 'manager' }),
    member({ accountId: 'mom', propertyId: 'p_home', role: 'viewer' }),
  ];

  it('lists the whole household, owners first', () => {
    expect(householdFor(memberships, 'p_home').map((m) => m.role)).toEqual([
      'owner',
      'admin',
      'manager',
      'viewer',
    ]);
  });

  it('lets an admin run the house but not sell it', () => {
    const { can } = permissionsFor(memberships, { accountId: 'adrienne', propertyId: 'p_home', now: NOW });
    expect(can('manage_members')).toBe(true);
    expect(can('edit_property')).toBe(true);
    expect(can('transfer_property')).toBe(false);
    expect(can('delete_property')).toBe(false);
  });

  it('lets a manager do the work without seeing the money or the people', () => {
    const { can } = permissionsFor(memberships, { accountId: 'pm', propertyId: 'p_home', now: NOW });
    expect(can('complete_tasks')).toBe(true);
    expect(can('request_service')).toBe(true);
    expect(can('view_costs')).toBe(false);
    expect(can('manage_members')).toBe(false);
  });

  it('keeps a viewer read-only, and out of the costs', () => {
    const { can } = permissionsFor(memberships, { accountId: 'mom', propertyId: 'p_home', now: NOW });
    expect(can('view_record')).toBe(true);
    expect(can('view_costs')).toBe(false);
    expect(can('add_records')).toBe(false);
  });
});

describe('roles', () => {
  it('gives the owner everything', () => {
    for (const permission of ROLE_PERMISSIONS.owner) {
      expect(roleCan('owner', permission)).toBe(true);
    }
    expect(roleCan('owner', 'delete_property')).toBe(true);
  });

  it('reserves ownership actions for the owner alone', () => {
    for (const role of ['admin', 'manager', 'member', 'viewer', 'professional'] as Role[]) {
      expect(roleCan(role, 'transfer_property')).toBe(false);
      expect(roleCan(role, 'delete_property')).toBe(false);
    }
  });

  it('reserves billing for the owner, not the household admin', () => {
    // Running the house and holding the card are different responsibilities.
    expect(roleCan('admin', 'view_plan')).toBe(true);
    expect(roleCan('admin', 'view_benefits')).toBe(true);
    expect(roleCan('admin', 'view_billing')).toBe(false);
    expect(roleCan('admin', 'manage_billing')).toBe(false);
    expect(roleCan('owner', 'view_billing')).toBe(true);
    expect(roleCan('owner', 'manage_billing')).toBe(true);
  });

  it('lets a member see the benefits without the payment history', () => {
    expect(roleCan('member', 'view_benefits')).toBe(true);
    expect(roleCan('member', 'view_plan')).toBe(false);
    expect(roleCan('member', 'view_billing')).toBe(false);
  });

  it('lets a manager check a Care visit is available without seeing money', () => {
    expect(roleCan('manager', 'view_benefits')).toBe(true);
    expect(roleCan('manager', 'view_costs')).toBe(false);
    expect(roleCan('manager', 'view_billing')).toBe(false);
  });

  it('gives a professional no billing access of any kind', () => {
    for (const permission of ['view_benefits', 'view_plan', 'view_billing', 'manage_billing'] as const) {
      expect(roleCan('professional', permission)).toBe(false);
    }
  });
});

describe('the billing admin flag', () => {
  const base = member({ accountId: 'bookkeeper', propertyId: 'p_home', role: 'admin' });

  it('adds billing access without adding anything else', () => {
    const withFlag = [{ ...base, billingAdmin: true }];
    const { can } = permissionsFor(withFlag, { accountId: 'bookkeeper', propertyId: 'p_home', now: NOW });
    expect(can('view_billing')).toBe(true);
    expect(can('manage_billing')).toBe(true);
    // Still not a step towards ownership.
    expect(can('transfer_property')).toBe(false);
    expect(can('delete_property')).toBe(false);
  });

  it('does nothing without a membership', () => {
    const { can } = permissionsFor([{ ...base, billingAdmin: true }], {
      accountId: 'stranger',
      propertyId: 'p_home',
      now: NOW,
    });
    expect(can('view_billing')).toBe(false);
  });

  it('is off unless it is set', () => {
    const { can } = permissionsFor([base], { accountId: 'bookkeeper', propertyId: 'p_home', now: NOW });
    expect(can('view_billing')).toBe(false);
  });

  it('never offers owner as a role to hand out', () => {
    // Ownership is transferred, deliberately and with a confirmation, not
    // granted from a dropdown next to somebody's name.
    expect(ASSIGNABLE_ROLES).not.toContain('owner');
  });

  it('lets a professional add the work they did and nothing more', () => {
    expect(roleCan('professional', 'add_records')).toBe(true);
    expect(roleCan('professional', 'view_record')).toBe(true);
    expect(roleCan('professional', 'view_costs')).toBe(false);
    expect(roleCan('professional', 'edit_records')).toBe(false);
  });
});

describe('time-boxed access', () => {
  const expiring = member({
    accountId: 'contractor',
    propertyId: 'p_home',
    role: 'professional',
    expiresAt: '2026-08-30T11:00:00.000Z',
  });

  it('expires by the clock rather than by a cleanup job', () => {
    expect(membershipActive(expiring, '2026-08-30T10:59:00.000Z')).toBe(true);
    expect(membershipActive(expiring, NOW)).toBe(false);
  });

  it('drops an expired membership out of the account’s property list', () => {
    expect(accessibleProperties([expiring], { accountId: 'contractor', now: NOW })).toEqual([]);
  });

  it('treats an unaccepted invitation as no access', () => {
    const invited = member({ accountId: 'new', propertyId: 'p_home', role: 'member', pending: true });
    expect(membershipActive(invited, NOW)).toBe(false);
    expect(permissionsFor([invited], { accountId: 'new', propertyId: 'p_home', now: NOW }).role)
      .toBeUndefined();
  });
});

describe('the last owner', () => {
  it('cannot be removed, because a property with no owner is unreachable', () => {
    const only = [member({ accountId: 'ryder', propertyId: 'p_home', role: 'owner' })];
    const verdict = canRemoveMember(only, only[0]!.id);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/only owner/i);
  });

  it('can be removed once somebody else is an owner too', () => {
    const two = [
      member({ accountId: 'ryder', propertyId: 'p_home', role: 'owner' }),
      member({ accountId: 'adrienne', propertyId: 'p_home', role: 'owner' }),
    ];
    expect(canRemoveMember(two, two[0]!.id).allowed).toBe(true);
  });

  it('does not block removing a non-owner', () => {
    const mixed = [
      member({ accountId: 'ryder', propertyId: 'p_home', role: 'owner' }),
      member({ accountId: 'pm', propertyId: 'p_home', role: 'manager' }),
    ];
    expect(canRemoveMember(mixed, mixed[1]!.id).allowed).toBe(true);
  });
});

describe('ownership periods', () => {
  const periods: OwnershipPeriod[] = [
    {
      id: 'own_1',
      propertyId: 'p_home',
      accountId: 'ryder',
      ownerLabel: 'Ryder',
      startedOn: '2026-01-01',
      endedOn: '2034-06-01',
    },
    { id: 'own_2', propertyId: 'p_home', ownerLabel: 'New Owner', startedOn: '2034-06-01' },
    { id: 'own_other', propertyId: 'p_beach', ownerLabel: 'Ryder', startedOn: '2020-01-01' },
  ];

  it('knows who holds a property now', () => {
    expect(currentOwnership(periods, 'p_home')?.ownerLabel).toBe('New Owner');
    expect(currentOwnership(periods, 'p_beach')?.ownerLabel).toBe('Ryder');
  });

  it('keeps the previous owner on the record rather than replacing them', () => {
    // This is the Carfax property: the history belongs to the building, so the
    // 2026–2034 period survives the sale intact.
    const history = ownershipHistory(periods, 'p_home');
    expect(history.map((p) => p.ownerLabel)).toEqual(['Ryder', 'New Owner']);
    expect(history[0]?.endedOn).toBe('2034-06-01');
  });

  it('never mixes one property’s history into another’s', () => {
    expect(ownershipHistory(periods, 'p_beach')).toHaveLength(1);
  });
});

describe('public identifiers', () => {
  it('formats as a quotable code', () => {
    expect(formatPublicId(829173)).toBe('DW-829173');
  });

  it('is always six digits, so it reads the same on every document', () => {
    for (const seed of [0, 0.5, 0.999999]) {
      expect(generatePublicId(() => seed)).toMatch(/^DW-\d{6}$/);
    }
  });
});

describe('relationship is not the same thing as role', () => {
  /*
   * The distinction exists so that a letting agent can run a record without
   * being able to sell the building. If either half of that came apart, the
   * separation would be decorative.
   */
  it('lets everyone administer the record they created', () => {
    for (const relationship of ['owner', 'renter', 'manager', 'household'] as const) {
      const role = roleForRelationship(relationship);
      expect(ROLE_PERMISSIONS[role]).toContain('add_records');
      expect(ROLE_PERMISSIONS[role]).toContain('edit_records');
      expect(ROLE_PERMISSIONS[role]).toContain('manage_members');
    }
  });

  it('opens an ownership period only for an owner', () => {
    expect(opensOwnershipPeriod('owner')).toBe(true);
    for (const other of ['renter', 'manager', 'household'] as const) {
      expect(opensOwnershipPeriod(other)).toBe(false);
    }
  });

  it('offers transfer only to an owner, however capable the role', () => {
    const canEverything = () => true;
    expect(canTransferProperty(canEverything, 'owner')).toBe(true);
    for (const other of ['renter', 'manager', 'household'] as const) {
      expect(canTransferProperty(canEverything, other)).toBe(false);
    }
  });

  it('still refuses an owner who lacks the permission', () => {
    expect(canTransferProperty(() => false, 'owner')).toBe(false);
  });

  it('refuses when the relationship is unknown', () => {
    expect(canTransferProperty(() => true, undefined)).toBe(false);
  });
});

describe('address suggestions', () => {
  it('says nothing until there is something to go on', () => {
    expect(suggestAddresses('')).toHaveLength(0);
    expect(suggestAddresses('1')).toHaveLength(0);
  });

  it('matches on word starts, not substrings', () => {
    const hits = suggestAddresses('main');
    expect(hits.some((h) => h.line1 === '123 Main Street')).toBe(true);
    // "ain" is inside "Main" but starts no word, so it must not match.
    expect(suggestAddresses('ain')).toHaveLength(0);
  });

  it('narrows as more words are typed', () => {
    const broad = suggestAddresses('charleston');
    const narrow = suggestAddresses('charleston ashley');
    expect(narrow.length).toBeLessThan(broad.length);
  });

  it('derives a nickname so setup never has to ask for one', () => {
    expect(nicknameFor({ line1: '123 Main Street' })).toBe('123 Main Street');
    expect(nicknameFor({ line1: '  ' })).toBe('Home');
  });
});
