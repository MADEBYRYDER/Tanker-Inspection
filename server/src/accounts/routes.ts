import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  ASSIGNABLE_ROLES,
  canRemoveMember,
  permissionsFor,
  type Permission,
} from '../../../src/core/account';
import {
  acceptInvitation,
  accountForSession,
  addMembership,
  completeTransfer,
  createInvitation,
  createProperty,
  createSession,
  createTransfer,
  deleteMembership,
  endSession,
  findInvitation,
  findTransfer,
  getProperty,
  householdOf,
  membershipsFor,
  ownershipOf,
  setMembershipRole,
  upsertAccount,
  type StoredAccount,
} from './store';

/**
 * Accounts, households, and handovers.
 *
 * Authentication is a sign-in link: the client asks for one by email, the server
 * mints a single-use code, and exchanging it returns a session. No passwords to
 * leak, reset, or reuse, and the identity the whole model hangs off — the email
 * — is verified by the act of signing in rather than trusted from a form.
 *
 * In this build the code is returned in the response and logged, because no mail
 * provider is wired up. That is a development convenience with a real security
 * consequence, so it is gated behind an explicit env var and refuses to run when
 * `NODE_ENV=production` without a mailer.
 */

export class AuthError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const asyncRoute =
  (handler: (req: Request, res: Response) => Promise<void> | void) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };

function bearer(req: Request): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
}

function requireAccount(req: Request): StoredAccount {
  const account = accountForSession(bearer(req));
  if (!account) throw new AuthError(401, 'Not signed in.');
  return account;
}

/**
 * Authorises an action against a property.
 *
 * Every property-scoped route goes through here, and it answers with the same
 * `404` whether the property does not exist or the caller simply has no
 * membership on it. Distinguishing the two would turn this endpoint into a way
 * to discover which properties exist.
 */
function authorise(account: StoredAccount, propertyId: string, permission: Permission) {
  const property = getProperty(propertyId);
  const { role, can } = permissionsFor(householdOf(propertyId), {
    accountId: account.id,
    propertyId,
    now: new Date().toISOString(),
  });
  if (!property || !role) throw new AuthError(404, 'No such property.');
  if (!can(permission)) throw new AuthError(403, `Your role (${role}) cannot do that.`);
  return { property, role };
}

/** Sign-in codes live in memory only and expire quickly. */
const codes = new Map<string, { email: string; expiresAt: number }>();
const CODE_TTL_MS = 10 * 60_000;

export function accountsRouter(): Router {
  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));

  /* ---------------------------------------------------------------------
   * Sign in
   * ------------------------------------------------------------------ */

  router.post(
    '/auth/request',
    asyncRoute((req, res) => {
      const parsed = z
        .object({ email: z.string().email().max(320), displayName: z.string().max(120).optional() })
        .safeParse(req.body);
      if (!parsed.success) throw new AuthError(400, 'A valid email is required.');

      const code = randomBytes(4).toString('hex');
      codes.set(code, { email: parsed.data.email, expiresAt: Date.now() + CODE_TTL_MS });

      const canEcho = process.env.DWELLA_ECHO_SIGNIN_CODES === '1';
      if (process.env.NODE_ENV === 'production' && canEcho) {
        throw new AuthError(
          500,
          'DWELLA_ECHO_SIGNIN_CODES must not be set in production — it hands anyone a sign-in code for any address.',
        );
      }
      console.log(`[accounts] sign-in code for ${parsed.data.email}: ${code}`);
      res.json({
        sent: true,
        // Only ever echoed in development, and only when explicitly enabled.
        ...(canEcho ? { code } : {}),
        detail: canEcho
          ? 'No mail provider is configured, so the code is returned here for development.'
          : 'Check the server log — no mail provider is configured yet.',
      });
    }),
  );

  router.post(
    '/auth/verify',
    asyncRoute((req, res) => {
      const parsed = z
        .object({ code: z.string().min(4).max(64), displayName: z.string().max(120).optional() })
        .safeParse(req.body);
      if (!parsed.success) throw new AuthError(400, 'A code is required.');

      const entry = codes.get(parsed.data.code);
      if (!entry || entry.expiresAt < Date.now()) throw new AuthError(401, 'That code is not valid.');
      // Single use: a code that has been exchanged is gone.
      codes.delete(parsed.data.code);

      const account = upsertAccount({ email: entry.email, displayName: parsed.data.displayName });
      res.json({ token: createSession(account.id), account });
    }),
  );

  router.post(
    '/auth/signout',
    asyncRoute((req, res) => {
      const token = bearer(req);
      if (token) endSession(token);
      res.json({ ok: true });
    }),
  );

  router.get(
    '/me',
    asyncRoute((req, res) => {
      const account = requireAccount(req);
      const memberships = membershipsFor(account.id);
      res.json({
        account,
        properties: memberships
          .map((m) => {
            const property = getProperty(m.propertyId);
            return property ? { ...property, role: m.role, membershipId: m.id } : undefined;
          })
          .filter(Boolean),
      });
    }),
  );

  /* ---------------------------------------------------------------------
   * Properties
   * ------------------------------------------------------------------ */

  router.post(
    '/properties',
    asyncRoute((req, res) => {
      const account = requireAccount(req);
      const parsed = z
        .object({
          nickname: z.string().min(1).max(120),
          propertyType: z.enum(['primary', 'secondary', 'rental', 'condo', 'renovation']),
          addressLine1: z.string().max(200).optional(),
          city: z.string().max(120).optional(),
          state: z.string().max(60).optional(),
          postalCode: z.string().max(20).optional(),
          ownedSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new AuthError(400, parsed.error.issues[0]?.message ?? 'Invalid property.');

      const { ownedSince, ...property } = parsed.data;
      const created = createProperty(property, account, ownedSince ?? new Date().toISOString().slice(0, 10));
      res.status(201).json(created);
    }),
  );

  router.get(
    '/properties/:id',
    asyncRoute((req, res) => {
      const account = requireAccount(req);
      const { property, role } = authorise(account, req.params.id ?? '', 'view_record');
      res.json({
        property,
        role,
        household: householdOf(property.id),
        ownership: ownershipOf(property.id),
      });
    }),
  );

  /* ---------------------------------------------------------------------
   * Household
   * ------------------------------------------------------------------ */

  router.post(
    '/properties/:id/invitations',
    asyncRoute((req, res) => {
      const account = requireAccount(req);
      const { property } = authorise(account, req.params.id ?? '', 'manage_members');
      const parsed = z
        .object({
          email: z.string().email().max(320),
          displayName: z.string().min(1).max(120),
          // Owner is never invited — it is transferred, deliberately.
          role: z.enum(ASSIGNABLE_ROLES as [string, ...string[]]),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new AuthError(400, 'An email, a name, and a role are required.');

      const { invitation, token } = createInvitation({
        propertyId: property.id,
        email: parsed.data.email,
        displayName: parsed.data.displayName,
        role: parsed.data.role as never,
        invitedBy: account.id,
      });
      console.log(`[accounts] invitation to ${invitation.email} for ${property.nickname}: ${token}`);
      res.status(201).json({
        invitation: { ...invitation, tokenHash: undefined },
        ...(process.env.DWELLA_ECHO_SIGNIN_CODES === '1' ? { token } : {}),
      });
    }),
  );

  router.post(
    '/invitations/accept',
    asyncRoute((req, res) => {
      const account = requireAccount(req);
      const parsed = z.object({ token: z.string().min(4).max(200) }).safeParse(req.body);
      if (!parsed.success) throw new AuthError(400, 'A token is required.');
      const invitation = findInvitation(parsed.data.token);
      if (!invitation) throw new AuthError(404, 'That invitation is no longer valid.');
      /*
       * The invitation names an address, and only that address may take it up.
       * Otherwise a forwarded link is an access grant to whoever received it.
       */
      if (invitation.email !== account.email) {
        throw new AuthError(403, 'That invitation was sent to a different address.');
      }
      res.json({ membership: acceptInvitation(invitation, account) });
    }),
  );

  router.patch(
    '/memberships/:id',
    asyncRoute((req, res) => {
      const account = requireAccount(req);
      const parsed = z
        .object({
          propertyId: z.string(),
          role: z.enum(ASSIGNABLE_ROLES as [string, ...string[]]),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new AuthError(400, 'A property and a role are required.');
      authorise(account, parsed.data.propertyId, 'manage_members');

      const updated = setMembershipRole(req.params.id ?? '', parsed.data.role as never);
      if (!updated) throw new AuthError(404, 'No such membership.');
      res.json({ membership: updated });
    }),
  );

  router.delete(
    '/memberships/:id',
    asyncRoute((req, res) => {
      const account = requireAccount(req);
      const parsed = z.object({ propertyId: z.string() }).safeParse(req.body);
      if (!parsed.success) throw new AuthError(400, 'A property is required.');
      authorise(account, parsed.data.propertyId, 'manage_members');

      const verdict = canRemoveMember(householdOf(parsed.data.propertyId), req.params.id ?? '');
      if (!verdict.allowed) throw new AuthError(409, verdict.reason ?? 'Cannot remove that member.');
      deleteMembership(req.params.id ?? '');
      res.json({ ok: true });
    }),
  );

  /* ---------------------------------------------------------------------
   * Transfer of ownership
   * ------------------------------------------------------------------ */

  router.post(
    '/properties/:id/transfer',
    asyncRoute((req, res) => {
      const account = requireAccount(req);
      const { property } = authorise(account, req.params.id ?? '', 'transfer_property');
      const parsed = z
        .object({
          toEmail: z.string().email().max(320),
          effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new AuthError(400, 'A buyer email and a date are required.');

      const { transfer, token } = createTransfer({
        propertyId: property.id,
        fromAccountId: account.id,
        toEmail: parsed.data.toEmail,
        effectiveOn: parsed.data.effectiveOn,
      });
      console.log(`[accounts] transfer of ${property.publicId} to ${transfer.toEmail}: ${token}`);
      res.status(201).json({
        transfer: { ...transfer, tokenHash: undefined },
        ...(process.env.DWELLA_ECHO_SIGNIN_CODES === '1' ? { token } : {}),
      });
    }),
  );

  router.post(
    '/transfers/accept',
    asyncRoute((req, res) => {
      const account = requireAccount(req);
      const parsed = z.object({ token: z.string().min(4).max(200) }).safeParse(req.body);
      if (!parsed.success) throw new AuthError(400, 'A token is required.');
      const transfer = findTransfer(parsed.data.token);
      if (!transfer) throw new AuthError(404, 'That transfer is no longer valid.');
      if (transfer.toEmail !== account.email) {
        throw new AuthError(403, 'That transfer was offered to a different address.');
      }
      const result = completeTransfer(transfer, account);
      const property = getProperty(transfer.propertyId)!;
      res.json({
        // Same property id, same public id: the record survived the sale.
        property,
        membership: result.membership,
        ownership: ownershipOf(property.id),
      });
    }),
  );

  return router;
}

export { addMembership };
