import { z } from 'zod';
import type { DispatchStatus } from '../core/types';

/**
 * The wire contract between the app and a provider's dispatch server.
 *
 * One file, imported by both sides, so the phone and the server can never drift
 * into disagreeing about what a service request is. The server validates every
 * field of it on arrival — the app is untrusted input, and a contractor's queue
 * is not a place to discover that assumption was wrong.
 *
 * Note what is deliberately absent: cost history, documents, the rest of the
 * home record, the health score. A contractor gets what they need to quote and
 * schedule this one job, and nothing else. The homeowner sees the entire packet
 * on the compose screen before it goes.
 */

export const SERVICE_REQUEST_STATUSES = [
  'submitted',
  'acknowledged',
  'quoted',
  'scheduled',
  'completed',
  'declined',
  'cancelled',
] as const satisfies readonly DispatchStatus[];

export type { DispatchStatus };

/** Statuses a provider can move a request to, from a given status. */
export const ALLOWED_TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = {
  submitted: ['acknowledged', 'quoted', 'scheduled', 'declined'],
  acknowledged: ['quoted', 'scheduled', 'declined'],
  quoted: ['scheduled', 'declined'],
  scheduled: ['completed', 'declined'],
  // Terminal. A finished, declined, or withdrawn job stays that way; anything
  // else is a new request, which keeps the audit trail honest.
  completed: [],
  declined: [],
  cancelled: [],
};

export function canTransition(from: DispatchStatus, to: DispatchStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const packetSchema = z.object({
  homeSummary: z.string().max(400),
  contact: z.object({
    address: z.string().max(300).optional(),
    ownerName: z.string().max(120).optional(),
    phone: z.string().max(40).optional(),
  }),
  equipment: z
    .object({
      name: z.string().max(200),
      type: z.string().max(200),
      manufacturer: z.string().max(120).optional(),
      modelNumber: z.string().max(120).optional(),
      serialNumber: z.string().max(120).optional(),
      ageSummary: z.string().max(200),
      specs: z
        .array(
          z.object({
            label: z.string().max(120),
            value: z.string().max(300),
            /*
             * Provenance rides all the way to the contractor's screen. A quote
             * built on an estimate the contractor believed was a fact is the
             * exact trust failure this product exists to prevent.
             */
            provenance: z.enum(['documented', 'contractor', 'estimated', 'unknown']),
          }),
        )
        .max(40),
      warrantyStatus: z.string().max(600),
    })
    .optional(),
  relevantHistory: z
    .array(
      z.object({
        date: isoDate,
        title: z.string().max(300),
        vendor: z.string().max(200).optional(),
      }),
    )
    .max(20),
  problem: z.string().max(4_000),
  photoCount: z.number().int().min(0).max(20),
  generatedAt: z.string().max(40),
});

export const submitRequestSchema = z.object({
  /** The app's own id, so a retried send is not filed twice. */
  clientRequestId: z.string().min(4).max(80),
  providerId: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  urgency: z.enum(['emergency', 'soon', 'routine']),
  packet: packetSchema,
  photos: z
    .array(
      z.object({
        data: z.string().max(7_000_000),
        mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        role: z.string().max(80).optional(),
      }),
    )
    .max(6)
    .default([]),
});

export type SubmitRequestBody = z.infer<typeof submitRequestSchema>;

export const submitResponseSchema = z.object({
  id: z.string(),
  status: z.enum(SERVICE_REQUEST_STATUSES),
  receivedAt: z.string(),
  providerName: z.string(),
  /** The secret the app uses to read this one request back. Never leaves the device. */
  trackingToken: z.string(),
});

export type SubmitResponse = z.infer<typeof submitResponseSchema>;

export const statusResponseSchema = z.object({
  id: z.string(),
  status: z.enum(SERVICE_REQUEST_STATUSES),
  providerName: z.string(),
  providerNote: z.string().optional(),
  quotedCents: z.number().int().optional(),
  scheduledFor: z.string().optional(),
  completion: z
    .object({
      completedOn: isoDate,
      vendor: z.string(),
      costCents: z.number().int().optional(),
      description: z.string().optional(),
    })
    .optional(),
  updatedAt: z.string(),
});

export type StatusResponse = z.infer<typeof statusResponseSchema>;

/** Cents, as entered by a contractor in dollars. Rejects nonsense rather than rounding it. */
export function parseDollarsToCents(raw: string): number | undefined {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (cleaned.length === 0) return undefined;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) return undefined;
  return Math.round(value * 100);
}
