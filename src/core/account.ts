import type { ISODate, ISODateTime } from './types';

/**
 * Accounts, properties, and the membership between them.
 *
 * The one architectural rule this file exists to hold: **a person and a place
 * are separate objects, and neither owns the other.** A property is not a field
 * on a user; a user is not a field on a property. What connects them is a
 * membership, which carries a role and can be revoked.
 *
 * That separation is what makes three otherwise-impossible things ordinary:
 *
 *   - One person holds several properties — a residence, a beach house, six
 *     rentals — each with its own independent record.
 *   - One property is reachable by several people at once, at different levels:
 *     both owners, a property manager, a contractor with temporary access.
 *   - A property's record **survives the sale of the house.** Nothing is copied
 *     between accounts. The property object is the same row it always was; the
 *     memberships change and a new ownership period opens. That is the whole
 *     reason a Carfax for a house can exist at all: the history belongs to the
 *     building, not to whoever currently holds the keys.
 *
 * Retrofitting this later means migrating every record in the product. Building
 * it first costs a data model and a switcher.
 */

/* -------------------------------------------------------------------------
 * The person
 * ---------------------------------------------------------------------- */

export interface Account {
  id: string;
  /** The identity a session authenticates as. Absent only on a device-local account. */
  email?: string;
  displayName: string;
  /** Callback number, offered when composing a service request. */
  phone?: string;
  createdAt: ISODateTime;
}

/* -------------------------------------------------------------------------
 * The place
 * ---------------------------------------------------------------------- */

export type PropertyType = 'primary' | 'secondary' | 'rental' | 'condo' | 'renovation';

export const PROPERTY_TYPES: {
  key: PropertyType;
  label: string;
  icon: string;
  blurb: string;
}[] = [
  { key: 'primary', label: 'Primary residence', icon: 'home-outline', blurb: 'Where you live.' },
  { key: 'secondary', label: 'Second or vacation home', icon: 'sunny-outline', blurb: 'Somewhere you stay part of the year.' },
  { key: 'rental', label: 'Rental property', icon: 'business-outline', blurb: 'A property you let to someone else.' },
  { key: 'condo', label: 'Condo or townhome', icon: 'grid-outline', blurb: 'Shared structure; an association covers some systems.' },
  { key: 'renovation', label: 'Under renovation', icon: 'hammer-outline', blurb: 'Mid-project. Expect the record to move quickly.' },
];

export function propertyTypeLabel(type: PropertyType): string {
  return PROPERTY_TYPES.find((t) => t.key === type)?.label ?? 'Property';
}

/**
 * The public identifier for a property, the way a VIN identifies a car.
 *
 * Stable for the life of the building and quotable by a buyer, an agent, or an
 * inspector who has no account. Deliberately not the internal id: internal ids
 * are ours to change, and this one is printed on a document someone keeps.
 */
export function formatPublicId(numeric: number): string {
  return `DW-${String(numeric).padStart(6, '0')}`;
}

export function generatePublicId(random: () => number = Math.random): string {
  // Six digits is a million properties before collisions matter, and the server
  // is the authority once a property is registered there.
  return formatPublicId(Math.floor(random() * 900_000) + 100_000);
}

/* -------------------------------------------------------------------------
 * Ownership
 * ---------------------------------------------------------------------- */

/**
 * Who held a property, and when.
 *
 * Append-only. A sale closes the current period and opens a new one; it never
 * edits or deletes the old. This is the spine of the transferable record — the
 * thing that lets a buyer see "roof replaced 2025" and know it happened under
 * the previous owner rather than being a claim the seller typed last week.
 */
export interface OwnershipPeriod {
  id: string;
  propertyId: string;
  /** The Dwella account that held it, when there was one. */
  accountId?: string;
  /** Shown on the record. Kept even when the account is later deleted. */
  ownerLabel: string;
  startedOn: ISODate;
  /** Open-ended while they still own it. */
  endedOn?: ISODate;
}

export function currentOwnership(
  periods: OwnershipPeriod[],
  propertyId: string,
): OwnershipPeriod | undefined {
  return periods.find((p) => p.propertyId === propertyId && !p.endedOn);
}

export function ownershipHistory(
  periods: OwnershipPeriod[],
  propertyId: string,
): OwnershipPeriod[] {
  return periods
    .filter((p) => p.propertyId === propertyId)
    .sort((a, b) => a.startedOn.localeCompare(b.startedOn));
}

/* -------------------------------------------------------------------------
 * Membership and roles
 * ---------------------------------------------------------------------- */

export type Role = 'owner' | 'admin' | 'member' | 'manager' | 'viewer' | 'professional';

export interface Membership {
  id: string;
  accountId: string;
  propertyId: string;
  role: Role;
  /** Denormalised so a members list renders without resolving every account. */
  displayName: string;
  email?: string;
  addedAt: ISODateTime;
  addedBy?: string;
  /**
   * Full billing access without being an owner.
   *
   * Set by an owner for the person who actually holds the card — a spouse, a
   * bookkeeper, an office manager for a landlord. Grants exactly the two
   * billing permissions and nothing else; it is not a step towards ownership.
   */
  billingAdmin?: boolean;
  /** Set for time-boxed access — a contractor, an inspector, an agent. */
  expiresAt?: ISODateTime;
  /** An invitation not yet taken up. */
  pending?: boolean;
}

/**
 * Everything a role can be allowed to do.
 *
 * Named for the act rather than the screen, so a new screen cannot invent a new
 * permission by accident, and so the matrix below can be read as a sentence.
 */
export type Permission =
  | 'view_record'
  /** Costs are separable from the record: a viewer may see the roof, not the price. */
  | 'view_costs'
  | 'add_records'
  | 'edit_records'
  | 'complete_tasks'
  | 'request_service'
  | 'edit_property'
  | 'manage_members'
  | 'transfer_property'
  | 'delete_property'
  /** See what the plan includes and what is left of it — visits, discounts. */
  | 'view_benefits'
  /** See the plan, its price, and when it renews. */
  | 'view_plan'
  /** See payment history, invoices, and the card on file. */
  | 'view_billing'
  /** Change plan, cancel, or update the payment method. */
  | 'manage_billing';

const ALL: Permission[] = [
  'view_record',
  'view_costs',
  'add_records',
  'edit_records',
  'complete_tasks',
  'request_service',
  'edit_property',
  'manage_members',
  'transfer_property',
  'delete_property',
  'view_benefits',
  'view_plan',
  'view_billing',
  'manage_billing',
];

/**
 * The role matrix.
 *
 * Two lines are worth defending. **Household admin gets everything except
 * ownership** — they run the house day to day, but selling it or deleting its
 * record is not a thing a co-resident should be able to do unilaterally.
 * **Manager gets the work but not the money or the members** — a property
 * manager schedules the furnace service without seeing what the owner paid for
 * the kitchen, and cannot add themselves a colleague.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL,
  /*
   * A household admin sees the plan and what it includes — they need to know
   * there is a Care visit left before they book a contractor — but not the card
   * or the payment history, and they cannot cancel the membership. Running the
   * house and holding the account are different responsibilities, and a partner
   * being able to see what everything cost is a decision for the person paying,
   * not a default.
   */
  admin: ALL.filter(
    (p) =>
      p !== 'transfer_property' &&
      p !== 'delete_property' &&
      p !== 'view_billing' &&
      p !== 'manage_billing',
  ),
  manager: [
    'view_record',
    'add_records',
    'edit_records',
    'complete_tasks',
    'request_service',
    // Needs to know whether a Care visit is available before booking one.
    'view_benefits',
  ],
  member: ['view_record', 'view_costs', 'add_records', 'complete_tasks', 'view_benefits'],
  viewer: ['view_record'],
  /*
   * A contractor or inspector, granted access to do a specific job. They can
   * read the record and add the work they did — which is the whole point, since
   * that is how the history grows without the owner transcribing invoices — and
   * nothing else. Always paired with an expiry.
   */
  professional: ['view_record', 'add_records'],
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Household admin',
  manager: 'Manager',
  member: 'Member',
  viewer: 'Viewer',
  professional: 'Professional',
};

export const ROLE_BLURB: Record<Role, string> = {
  owner: 'Everything, including selling the home or deleting its record.',
  admin: 'Everything day to day — the home, its equipment, tasks, services, and who else has access. Cannot transfer or delete the property.',
  manager: 'Runs maintenance and services. Cannot see costs, manage people, or touch ownership.',
  member: 'Sees the home and its costs, adds records, and completes tasks.',
  viewer: 'Read-only. Sees the home and its equipment, not what anything cost.',
  professional: 'Temporary access for a contractor or inspector: read the record, add the work they did.',
};

/** Roles a member-manager may hand out. Owner is never granted, only transferred. */
export const ASSIGNABLE_ROLES: Role[] = ['admin', 'manager', 'member', 'viewer', 'professional'];

export function roleCan(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Whether a membership is usable right now.
 *
 * Expiry is evaluated against the clock rather than a stored flag, so a
 * contractor's access ends when it said it would even if nothing ran a cleanup
 * job that night.
 */
export function membershipActive(membership: Membership, now: ISODateTime): boolean {
  if (membership.pending) return false;
  if (membership.expiresAt && now >= membership.expiresAt) return false;
  return true;
}

/** What this account may do on this property. The one function screens should ask. */
export function permissionsFor(
  memberships: Membership[],
  params: { accountId: string; propertyId: string; now: ISODateTime },
): { role?: Role; billingAdmin?: boolean; can: (permission: Permission) => boolean } {
  const membership = memberships.find(
    (m) =>
      m.accountId === params.accountId &&
      m.propertyId === params.propertyId &&
      membershipActive(m, params.now),
  );
  if (!membership) return { can: () => false };
  return {
    role: membership.role,
    billingAdmin: membership.billingAdmin === true,
    can: (permission) =>
      roleCan(membership.role, permission) ||
      // The billing-admin flag adds billing access on top of whatever the role
      // already allows. It never removes anything and never grants anything else.
      (membership.billingAdmin === true &&
        (permission === 'view_billing' || permission === 'manage_billing' || permission === 'view_plan')),
  };
}

/** Properties this account can currently reach, most privileged first. */
export function accessibleProperties(
  memberships: Membership[],
  params: { accountId: string; now: ISODateTime },
): { propertyId: string; role: Role }[] {
  const rank: Record<Role, number> = {
    owner: 0,
    admin: 1,
    manager: 2,
    member: 3,
    viewer: 4,
    professional: 5,
  };
  return memberships
    .filter((m) => m.accountId === params.accountId && membershipActive(m, params.now))
    .map((m) => ({ propertyId: m.propertyId, role: m.role }))
    .sort((a, b) => rank[a.role] - rank[b.role]);
}

/** Everyone with access to one property, owners first. */
export function householdFor(
  memberships: Membership[],
  propertyId: string,
): Membership[] {
  const rank: Record<Role, number> = {
    owner: 0,
    admin: 1,
    manager: 2,
    member: 3,
    viewer: 4,
    professional: 5,
  };
  return memberships
    .filter((m) => m.propertyId === propertyId)
    .sort((a, b) => rank[a.role] - rank[b.role] || a.addedAt.localeCompare(b.addedAt));
}

/**
 * Guards the last-owner case.
 *
 * A property with no owner is unreachable and unsellable — nobody can transfer
 * it, delete it, or grant anyone else access. So the last owner cannot be
 * removed or demoted; they have to hand ownership to somebody first.
 */
export function canRemoveMember(
  memberships: Membership[],
  membershipId: string,
): { allowed: boolean; reason?: string } {
  const target = memberships.find((m) => m.id === membershipId);
  if (!target) return { allowed: false, reason: 'No such member.' };
  if (target.role !== 'owner') return { allowed: true };
  const owners = memberships.filter(
    (m) => m.propertyId === target.propertyId && m.role === 'owner',
  );
  return owners.length > 1
    ? { allowed: true }
    : {
        allowed: false,
        reason: 'This is the only owner. Make someone else an owner first, or transfer the home.',
      };
}
