import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { z } from 'zod';
import {
  parseDollarsToCents,
  submitRequestSchema,
  type DispatchStatus,
  type StatusResponse,
} from '../../../src/dispatch/contract';
import { authenticate, providerById, providerName, tokenFromRequest, type ProviderAccount } from './providers';
import {
  TransitionError,
  createRequest,
  getRequest,
  listForProvider,
  providerCounts,
  readPhoto,
  savePhoto,
  tokenMatches,
  updateRequest,
  type StoredRequest,
} from './store';
import { loginPage, queuePage, requestPage } from './web';

/**
 * The dispatch service: intake from the app, a queue for the contractor, and a
 * status channel back to the homeowner.
 *
 * Three audiences, three authentication stories, and they are kept apart on
 * purpose:
 *
 *   - The app posts a request with no credential at all. Anyone can send a
 *     provider a job, exactly as anyone can call their office. What that buys an
 *     attacker is a nuisance entry in a queue a human reads, not access to
 *     anything.
 *   - The homeowner reads their own request back with a per-request tracking
 *     token issued at intake. It grants exactly one request and nothing else, so
 *     there is no account to create and nothing to leak beyond the one job.
 *   - The contractor authenticates as a provider and sees only their own queue.
 */

export class DispatchError extends Error {
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

/** Attaches the authenticated provider, or rejects. */
function requireProvider(req: Request): ProviderAccount {
  const provider = authenticate(tokenFromRequest(req.headers as { authorization?: string; cookie?: string }));
  if (!provider) throw new DispatchError(401, 'Not signed in.');
  return provider;
}

/** A provider may only ever touch their own requests. */
function ownedRequest(provider: ProviderAccount, id: string): StoredRequest {
  const request = getRequest(id);
  // Same error either way: whether a request id exists is not a provider's business.
  if (!request || request.providerId !== provider.id) {
    throw new DispatchError(404, 'No such request.');
  }
  return request;
}

function statusResponse(request: StoredRequest): StatusResponse {
  return {
    id: request.id,
    status: request.status,
    providerName: providerName(request.providerId),
    providerNote: request.providerNote,
    quotedCents: request.quotedCents,
    scheduledFor: request.scheduledFor,
    completion: request.completion
      ? {
          completedOn: request.completion.completedOn,
          vendor: request.completion.vendor,
          costCents: request.completion.costCents,
          description: request.completion.description,
        }
      : undefined,
    updatedAt: request.updatedAt,
  };
}

export function dispatchRouter(): Router {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false, limit: '1mb' }));

  /* ---------------------------------------------------------------------
   * Intake — from the app
   * ------------------------------------------------------------------ */

  router.post(
    '/dispatch/requests',
    asyncRoute((req, res) => {
      const parsed = submitRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new DispatchError(400, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      }
      const body = parsed.data;
      const provider = providerById(body.providerId);
      if (!provider) throw new DispatchError(404, 'No such provider.');

      const photoIds = body.photos.map((photo) => savePhoto(photo.data, photo.mediaType));
      const request = createRequest({
        clientRequestId: body.clientRequestId,
        providerId: provider.id,
        title: body.title,
        urgency: body.urgency,
        packet: body.packet,
        photoIds,
      });

      res.status(201).json({
        id: request.id,
        status: request.status,
        receivedAt: request.receivedAt,
        providerName: provider.name,
        trackingToken: request.trackingToken,
      });
    }),
  );

  /* ---------------------------------------------------------------------
   * Status — back to the homeowner
   * ------------------------------------------------------------------ */

  router.get(
    '/dispatch/requests/:id',
    asyncRoute((req, res) => {
      const token = String(req.query.token ?? '');
      const request = getRequest(req.params.id ?? '');
      // A wrong id and a wrong token are the same answer, so this cannot be used
      // to discover which request ids exist.
      if (!request || !token || !tokenMatches(request.trackingToken, token)) {
        throw new DispatchError(404, 'No such request.');
      }
      res.json(statusResponse(request));
    }),
  );

  /* ---------------------------------------------------------------------
   * Provider JSON API
   * ------------------------------------------------------------------ */

  router.get(
    '/provider/api/requests',
    asyncRoute((req, res) => {
      const provider = requireProvider(req);
      const open = req.query.open === '1';
      res.json({
        provider: { id: provider.id, name: provider.name },
        counts: providerCounts(provider.id),
        requests: listForProvider(provider.id, { open }).map((r) => ({
          id: r.id,
          title: r.title,
          urgency: r.urgency,
          status: r.status,
          receivedAt: r.receivedAt,
          address: r.packet.contact.address,
          equipment: r.packet.equipment?.name,
        })),
      });
    }),
  );

  router.get(
    '/provider/api/requests/:id',
    asyncRoute((req, res) => {
      const provider = requireProvider(req);
      const request = ownedRequest(provider, req.params.id ?? '');
      const { trackingToken: _withheld, ...safe } = request;
      res.json(safe);
    }),
  );

  const updateBody = z.object({
    status: z
      .enum(['acknowledged', 'quoted', 'scheduled', 'completed', 'declined'])
      .optional(),
    providerNote: z.string().max(2_000).optional(),
    quotedCents: z.number().int().min(0).max(100_000_000).optional(),
    scheduledFor: z.string().max(40).optional(),
    completion: z
      .object({
        completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        vendor: z.string().min(1).max(200),
        costCents: z.number().int().min(0).max(100_000_000).optional(),
        description: z.string().max(4_000).optional(),
        photoIds: z.array(z.string().max(80)).max(12).default([]),
      })
      .optional(),
  });

  router.post(
    '/provider/api/requests/:id',
    express.json({ limit: '1mb' }),
    asyncRoute((req, res) => {
      const provider = requireProvider(req);
      const request = ownedRequest(provider, req.params.id ?? '');
      const parsed = updateBody.safeParse(req.body);
      if (!parsed.success) throw new DispatchError(400, parsed.error.issues[0]?.message ?? 'Invalid update.');
      res.json(statusResponse(applyUpdate(request, parsed.data)));
    }),
  );

  /** Completion photos, uploaded before the completion is filed. */
  router.post(
    '/provider/api/requests/:id/photos',
    express.json({ limit: '32mb' }),
    asyncRoute((req, res) => {
      const provider = requireProvider(req);
      ownedRequest(provider, req.params.id ?? '');
      const parsed = z
        .object({
          photos: z
            .array(
              z.object({
                data: z.string().max(7_000_000),
                mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
              }),
            )
            .min(1)
            .max(12),
        })
        .safeParse(req.body);
      if (!parsed.success) throw new DispatchError(400, 'Invalid photo upload.');
      res.json({ photoIds: parsed.data.photos.map((p) => savePhoto(p.data, p.mediaType)) });
    }),
  );

  /* ---------------------------------------------------------------------
   * Photos
   * ------------------------------------------------------------------ */

  router.get(
    '/provider/photo/:photoId',
    asyncRoute((req, res) => {
      const provider = requireProvider(req);
      const photoId = req.params.photoId ?? '';
      // Authorisation is by ownership of a request that references the photo —
      // possession of an id is not access.
      const owned = listForProvider(provider.id).some(
        (r) => r.photoIds.includes(photoId) || r.completion?.photoIds.includes(photoId),
      );
      if (!owned) throw new DispatchError(404, 'No such photo.');
      const photo = readPhoto(photoId);
      if (!photo) throw new DispatchError(404, 'No such photo.');
      res.setHeader('Content-Type', photo.mediaType);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(photo.body);
    }),
  );

  /* ---------------------------------------------------------------------
   * The dispatch view — server-rendered HTML
   * ------------------------------------------------------------------ */

  router.get('/dispatch', (req, res) => {
    const provider = authenticate(tokenFromRequest(req.headers as never));
    if (!provider) {
      res.status(200).type('html').send(loginPage({ error: req.query.error === '1' }));
      return;
    }
    const open = req.query.all !== '1';
    res.type('html').send(
      queuePage({
        provider,
        requests: listForProvider(provider.id, { open }),
        counts: providerCounts(provider.id),
        showingOpenOnly: open,
      }),
    );
  });

  router.post('/dispatch/login', (req, res) => {
    const token = String((req.body as { token?: string })?.token ?? '').trim();
    if (!authenticate(token)) {
      res.redirect('/dispatch?error=1');
      return;
    }
    /*
     * SameSite=Strict is what stands between this cookie and cross-site form
     * posts: every state change below is a plain HTML form, so without it a
     * third-party page could complete or decline a contractor's jobs.
     */
    res.setHeader(
      'Set-Cookie',
      `homestead_dispatch=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${
        process.env.NODE_ENV === 'production' ? '; Secure' : ''
      }`,
    );
    res.redirect('/dispatch');
  });

  router.post('/dispatch/logout', (_req, res) => {
    res.setHeader('Set-Cookie', 'homestead_dispatch=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    res.redirect('/dispatch');
  });

  router.get(
    '/dispatch/r/:id',
    asyncRoute((req, res) => {
      const provider = requireProvider(req);
      const request = ownedRequest(provider, req.params.id ?? '');
      res.type('html').send(requestPage({ provider, request, error: stringOrUndefined(req.query.error) }));
    }),
  );

  /** Every state change from the web view lands here as a plain form post. */
  router.post(
    '/dispatch/r/:id',
    asyncRoute((req, res) => {
      const provider = requireProvider(req);
      const request = ownedRequest(provider, req.params.id ?? '');
      const form = req.body as Record<string, string | undefined>;

      try {
        applyUpdate(request, {
          status: form.status as DispatchStatus | undefined,
          providerNote: form.providerNote?.trim() || undefined,
          quotedCents: form.quotedDollars ? parseDollarsToCents(form.quotedDollars) : undefined,
          scheduledFor: form.scheduledFor?.trim() || undefined,
          completion:
            form.status === 'completed'
              ? {
                  completedOn: form.completedOn?.trim() || new Date().toISOString().slice(0, 10),
                  vendor: form.vendor?.trim() || provider.name,
                  costCents: form.costDollars ? parseDollarsToCents(form.costDollars) : undefined,
                  description: form.description?.trim() || undefined,
                  photoIds: (form.completionPhotoIds ?? '')
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, 12),
                }
              : undefined,
        });
      } catch (error) {
        // The dispatcher gets the reason on the page they are already looking at,
        // rather than a JSON body in place of their queue.
        if (error instanceof DispatchError && error.status === 409) {
          res.redirect(`/dispatch/r/${request.id}?error=${encodeURIComponent(error.message)}`);
          return;
        }
        throw error;
      }
      res.redirect(`/dispatch/r/${request.id}`);
    }),
  );

  return router;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 300) : undefined;
}

/**
 * The one place a request changes, so the API and the web view cannot diverge.
 *
 * A refused transition is the caller asking for something the job's current
 * state does not allow — a client error, and specifically a conflict, not a
 * fault in the server. Returning 500 for it would tell a contractor that
 * dispatch is broken when in fact they tried to close a job nobody scheduled.
 */
function applyUpdate(
  request: StoredRequest,
  patch: {
    status?: DispatchStatus;
    providerNote?: string;
    quotedCents?: number;
    scheduledFor?: string;
    completion?: {
      completedOn: string;
      vendor: string;
      costCents?: number;
      description?: string;
      photoIds: string[];
    };
  },
): StoredRequest {
  try {
    return updateRequest(request.id, patch);
  } catch (error) {
    if (error instanceof TransitionError) throw new DispatchError(409, error.message);
    throw error;
  }
}
