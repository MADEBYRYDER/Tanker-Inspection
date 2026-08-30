import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Membership, OwnershipPeriod, PropertyType, Role } from '../../../src/core/account';

/**
 * Identity and access.
 *
 * The three tables here are the architecture, and they are separate on purpose:
 *
 *   accounts       — people
 *   properties     — places, with a public id that outlives any owner
 *   memberships    — who may reach which place, and as what
 *   ownership      — who held which place, and when
 *
 * Nothing joins a person to a place except a membership row, which means access
 * can be granted, downgraded, expired, and revoked without touching a single
 * byte of the property's record. That is what makes a sale a change of
 * membership rather than a copy between two accounts.
 *
 * Same storage decision as dispatch: a JSON file, held in memory, written
 * through on change. It stands up anywhere, and the seam for a real database is
 * this one file.
 */

export interface StoredAccount {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  createdAt: string;
}

export interface StoredProperty {
  id: string;
  publicId: string;
  propertyType: PropertyType;
  nickname: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  createdAt: string;
}

export interface StoredInvitation {
  id: string;
  propertyId: string;
  email: string;
  displayName: string;
  role: Role;
  invitedBy: string;
  /** Hashed, never stored in the clear. The clear copy only ever leaves in the email. */
  tokenHash: string;
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
}

/** A pending handover, from the seller pressing transfer to the buyer accepting. */
export interface StoredTransfer {
  id: string;
  propertyId: string;
  fromAccountId: string;
  toEmail: string;
  tokenHash: string;
  effectiveOn: string;
  expiresAt: string;
  acceptedAt?: string;
  acceptedByAccountId?: string;
  createdAt: string;
}

export interface StoredSession {
  tokenHash: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
}

interface Database {
  version: 1;
  accounts: StoredAccount[];
  properties: StoredProperty[];
  memberships: Membership[];
  ownership: OwnershipPeriod[];
  invitations: StoredInvitation[];
  transfers: StoredTransfer[];
  sessions: StoredSession[];
  /** Monotonic source for public ids, so no two properties ever collide. */
  nextPublicId: number;
}

const DATA_DIR = process.env.DWELLA_DATA_DIR ?? path.join(process.cwd(), '.dispatch-data');
const DB_PATH = path.join(DATA_DIR, 'accounts.json');

let db: Database = {
  version: 1,
  accounts: [],
  properties: [],
  memberships: [],
  ownership: [],
  invitations: [],
  transfers: [],
  sessions: [],
  nextPublicId: 100_000,
};

function load(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) as Database;
    if (parsed?.version === 1) db = { ...db, ...parsed };
  } catch (error) {
    const quarantine = `${DB_PATH}.corrupt-${Date.now()}`;
    fs.renameSync(DB_PATH, quarantine);
    console.error(`[accounts] could not read ${DB_PATH}, moved to ${quarantine}`, error);
  }
}

function persist(): void {
  const temp = `${DB_PATH}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, DB_PATH);
}

load();

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('hex')}`;
}

/*
 * Tokens are stored hashed, never in the clear. A leaked database should not be
 * a set of working session cookies and live invitation links.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashMatches(hash: string, token: string): boolean {
  const a = Buffer.from(hash);
  const b = Buffer.from(hashToken(token));
  return a.length === b.length && timingSafeEqual(a, b);
}

/* -------------------------------------------------------------------------
 * Accounts and sessions
 * ---------------------------------------------------------------------- */

const SESSION_DAYS = 90;

/** Email is the identity, so it is normalised once, here, and never again. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function findAccountByEmail(email: string): StoredAccount | undefined {
  const wanted = normaliseEmail(email);
  return db.accounts.find((a) => a.email === wanted);
}

export function upsertAccount(input: { email: string; displayName?: string }): StoredAccount {
  const existing = findAccountByEmail(input.email);
  if (existing) {
    if (input.displayName && !existing.displayName) {
      existing.displayName = input.displayName;
      persist();
    }
    return existing;
  }
  const account: StoredAccount = {
    id: newId('acct'),
    email: normaliseEmail(input.email),
    displayName: input.displayName?.trim() || normaliseEmail(input.email).split('@')[0]!,
    createdAt: new Date().toISOString(),
  };
  db.accounts.push(account);
  persist();
  return account;
}

export function getAccount(id: string): StoredAccount | undefined {
  return db.accounts.find((a) => a.id === id);
}

export function updateAccount(id: string, patch: { displayName?: string; phone?: string }): StoredAccount | undefined {
  const account = getAccount(id);
  if (!account) return undefined;
  if (patch.displayName !== undefined) account.displayName = patch.displayName;
  if (patch.phone !== undefined) account.phone = patch.phone;
  persist();
  return account;
}

export function createSession(accountId: string): string {
  const token = randomBytes(24).toString('base64url');
  const now = Date.now();
  db.sessions.push({
    tokenHash: hashToken(token),
    accountId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_DAYS * 86_400_000).toISOString(),
  });
  persist();
  return token;
}

export function accountForSession(token: string | undefined): StoredAccount | undefined {
  if (!token) return undefined;
  const now = new Date().toISOString();
  const session = db.sessions.find((s) => hashMatches(s.tokenHash, token) && s.expiresAt > now);
  return session ? getAccount(session.accountId) : undefined;
}

export function endSession(token: string): void {
  db.sessions = db.sessions.filter((s) => !hashMatches(s.tokenHash, token));
  persist();
}

/* -------------------------------------------------------------------------
 * Properties, memberships, ownership
 * ---------------------------------------------------------------------- */

export function createProperty(
  input: Omit<StoredProperty, 'id' | 'publicId' | 'createdAt'>,
  owner: StoredAccount,
  ownedSince: string,
): { property: StoredProperty; membership: Membership; period: OwnershipPeriod } {
  const property: StoredProperty = {
    ...input,
    id: newId('prop'),
    publicId: `DW-${db.nextPublicId}`,
    createdAt: new Date().toISOString(),
  };
  db.nextPublicId += 1;

  const membership: Membership = {
    id: newId('mem'),
    accountId: owner.id,
    propertyId: property.id,
    role: 'owner',
    displayName: owner.displayName,
    email: owner.email,
    addedAt: new Date().toISOString(),
  };
  const period: OwnershipPeriod = {
    id: newId('own'),
    propertyId: property.id,
    accountId: owner.id,
    ownerLabel: owner.displayName,
    startedOn: ownedSince,
  };

  db.properties.push(property);
  db.memberships.push(membership);
  db.ownership.push(period);
  persist();
  return { property, membership, period };
}

export function getProperty(id: string): StoredProperty | undefined {
  return db.properties.find((p) => p.id === id);
}

export function membershipsFor(accountId: string): Membership[] {
  return db.memberships.filter((m) => m.accountId === accountId);
}

export function householdOf(propertyId: string): Membership[] {
  return db.memberships.filter((m) => m.propertyId === propertyId);
}

export function ownershipOf(propertyId: string): OwnershipPeriod[] {
  return db.ownership
    .filter((o) => o.propertyId === propertyId)
    .sort((a, b) => a.startedOn.localeCompare(b.startedOn));
}

export function addMembership(input: Omit<Membership, 'id' | 'addedAt'>): Membership {
  const membership: Membership = { ...input, id: newId('mem'), addedAt: new Date().toISOString() };
  db.memberships.push(membership);
  persist();
  return membership;
}

export function setMembershipRole(membershipId: string, role: Role): Membership | undefined {
  const membership = db.memberships.find((m) => m.id === membershipId);
  if (!membership) return undefined;
  membership.role = role;
  persist();
  return membership;
}

export function deleteMembership(membershipId: string): void {
  db.memberships = db.memberships.filter((m) => m.id !== membershipId);
  persist();
}

/* -------------------------------------------------------------------------
 * Invitations
 * ---------------------------------------------------------------------- */

const INVITE_DAYS = 14;

export function createInvitation(input: {
  propertyId: string;
  email: string;
  displayName: string;
  role: Role;
  invitedBy: string;
}): { invitation: StoredInvitation; token: string } {
  const token = randomBytes(18).toString('base64url');
  const invitation: StoredInvitation = {
    ...input,
    email: normaliseEmail(input.email),
    id: newId('inv'),
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  db.invitations.push(invitation);
  persist();
  return { invitation, token };
}

export function findInvitation(token: string): StoredInvitation | undefined {
  const now = new Date().toISOString();
  return db.invitations.find(
    (i) => hashMatches(i.tokenHash, token) && !i.acceptedAt && i.expiresAt > now,
  );
}

export function acceptInvitation(invitation: StoredInvitation, account: StoredAccount): Membership {
  invitation.acceptedAt = new Date().toISOString();
  const membership = addMembership({
    accountId: account.id,
    propertyId: invitation.propertyId,
    role: invitation.role,
    displayName: account.displayName,
    email: account.email,
    addedBy: invitation.invitedBy,
  });
  persist();
  return membership;
}

/* -------------------------------------------------------------------------
 * Transfers
 * ---------------------------------------------------------------------- */

const TRANSFER_DAYS = 30;

export function createTransfer(input: {
  propertyId: string;
  fromAccountId: string;
  toEmail: string;
  effectiveOn: string;
}): { transfer: StoredTransfer; token: string } {
  const token = randomBytes(18).toString('base64url');
  const transfer: StoredTransfer = {
    ...input,
    toEmail: normaliseEmail(input.toEmail),
    id: newId('xfer'),
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TRANSFER_DAYS * 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  db.transfers.push(transfer);
  persist();
  return { transfer, token };
}

export function findTransfer(token: string): StoredTransfer | undefined {
  const now = new Date().toISOString();
  return db.transfers.find(
    (t) => hashMatches(t.tokenHash, token) && !t.acceptedAt && t.expiresAt > now,
  );
}

/**
 * Completes a sale.
 *
 * The property row is never touched: same id, same public id, same equipment and
 * history hanging off it. What changes is that the seller's ownership period
 * gets an end date, a new one opens for the buyer, and the memberships are
 * replaced. That is the whole mechanism behind a record that outlives an owner —
 * there is no copy step to get wrong.
 */
export function completeTransfer(
  transfer: StoredTransfer,
  buyer: StoredAccount,
): { membership: Membership; period: OwnershipPeriod } {
  transfer.acceptedAt = new Date().toISOString();
  transfer.acceptedByAccountId = buyer.id;

  for (const period of db.ownership) {
    if (period.propertyId === transfer.propertyId && !period.endedOn) {
      period.endedOn = transfer.effectiveOn;
    }
  }
  const period: OwnershipPeriod = {
    id: newId('own'),
    propertyId: transfer.propertyId,
    accountId: buyer.id,
    ownerLabel: buyer.displayName,
    startedOn: transfer.effectiveOn,
  };
  db.ownership.push(period);

  // Everyone from the seller's household loses access; the buyer becomes owner.
  db.memberships = db.memberships.filter((m) => m.propertyId !== transfer.propertyId);
  const membership: Membership = {
    id: newId('mem'),
    accountId: buyer.id,
    propertyId: transfer.propertyId,
    role: 'owner',
    displayName: buyer.displayName,
    email: buyer.email,
    addedAt: new Date().toISOString(),
  };
  db.memberships.push(membership);
  persist();
  return { membership, period };
}

/** Test seam: wipes in-memory state without touching disk. */
export function __resetForTests(): void {
  db = {
    version: 1,
    accounts: [],
    properties: [],
    memberships: [],
    ownership: [],
    invitations: [],
    transfers: [],
    sessions: [],
    nextPublicId: 100_000,
  };
}
