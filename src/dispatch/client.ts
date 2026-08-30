import Constants from 'expo-constants';
import type { ImagePayload } from '../ai/schemas';
import type { ServiceRequest } from '../core/types';
import {
  statusResponseSchema,
  submitResponseSchema,
  type StatusResponse,
  type SubmitResponse,
} from './contract';

/**
 * Client for a provider's dispatch server.
 *
 * Local-first, on purpose. A service request is written to the phone before any
 * network call, and sending is a separate step that can fail, be retried, or
 * never be configured at all. Someone standing in a flooded laundry room with
 * one bar should end up with a record of what they asked for either way — the
 * network is an optimisation on top of a request that already exists.
 *
 * The dispatch URL is configured exactly like the AI gateway: a public env var
 * or app config. Nothing secret lives here. The per-request tracking token the
 * server issues is the only credential, it arrives in the response, and it stays
 * on the device.
 */

export class DispatchNotConfiguredError extends Error {
  constructor() {
    super('No dispatch server is configured.');
    this.name = 'DispatchNotConfiguredError';
  }
}

export class DispatchRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'DispatchRequestError';
    this.status = status;
  }
}

function resolveDispatchUrl(): string | undefined {
  const fromEnv = process.env.EXPO_PUBLIC_DISPATCH_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/$/, '');
  const extra = Constants.expoConfig?.extra as { dispatchUrl?: string } | undefined;
  const fromConfig = extra?.dispatchUrl;
  if (fromConfig && fromConfig.length > 0) return fromConfig.replace(/\/$/, '');
  return undefined;
}

export function isDispatchConfigured(): boolean {
  return resolveDispatchUrl() !== undefined;
}

const TIMEOUT_MS = 60_000;

async function call<T>(
  path: string,
  init: RequestInit,
  parse: (raw: unknown) => T,
): Promise<T> {
  const base = resolveDispatchUrl();
  if (!base) throw new DispatchNotConfiguredError();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${base}${path}`, { ...init, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      let detail = text;
      try {
        const parsed = JSON.parse(text) as { error?: string; detail?: string };
        detail = parsed.detail ?? parsed.error ?? text;
      } catch {
        // Non-JSON error body; use it as-is.
      }
      throw new DispatchRequestError(response.status, detail.slice(0, 400));
    }
    return parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof DispatchRequestError || error instanceof DispatchNotConfiguredError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new DispatchRequestError(408, 'The request timed out. Try again when you have a better signal.');
    }
    throw new DispatchRequestError(
      0,
      error instanceof Error ? error.message : 'Could not reach the dispatch server.',
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Sends a composed request to the selected provider. Safe to retry: the server dedupes on id. */
export function submitToProvider(params: {
  request: ServiceRequest;
  providerId: string;
  photos: ImagePayload[];
}): Promise<SubmitResponse> {
  const { request, providerId, photos } = params;
  return call(
    '/dispatch/requests',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientRequestId: request.id,
        providerId,
        title: request.title,
        urgency: request.urgency,
        packet: request.packet,
        photos,
      }),
    },
    (raw) => submitResponseSchema.parse(raw),
  );
}

/** Reads one request's status back. The tracking token grants that request and nothing else. */
export function fetchStatus(remoteId: string, trackingToken: string): Promise<StatusResponse> {
  return call(
    `/dispatch/requests/${encodeURIComponent(remoteId)}?token=${encodeURIComponent(trackingToken)}`,
    { method: 'GET' },
    (raw) => statusResponseSchema.parse(raw),
  );
}
