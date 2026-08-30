import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DispatchStatus } from '../../../src/dispatch/contract';
import { canTransition } from '../../../src/dispatch/contract';
import type { ServiceRequestPacket } from '../../../src/core/types';

/**
 * Storage for the dispatch service.
 *
 * A JSON file plus a photo directory, held in memory and written through on
 * every change. That is a deliberate choice for a launch partner running one
 * crew: it deploys anywhere with a writable disk, needs no database to stand
 * up, and the whole dataset is inspectable with `cat`. The seam is narrow — a
 * dozen functions — so moving to Postgres later is a rewrite of this file and
 * nothing else.
 *
 * What it is not: concurrent-safe across processes. Run one instance. When that
 * stops being enough, that is the signal to move to a real database rather than
 * to make this file cleverer.
 */

export interface CompletionRecord {
  completedOn: string;
  vendor: string;
  costCents?: number;
  description?: string;
  /** Photo ids of the finished work, stored the same way as intake photos. */
  photoIds: string[];
}

export interface StoredRequest {
  id: string;
  clientRequestId: string;
  providerId: string;
  title: string;
  urgency: 'emergency' | 'soon' | 'routine';
  status: DispatchStatus;
  packet: ServiceRequestPacket;
  photoIds: string[];
  /** Hash-free: compared in constant time, never logged, never sent to a provider. */
  trackingToken: string;
  providerNote?: string;
  quotedCents?: number;
  scheduledFor?: string;
  completion?: CompletionRecord;
  receivedAt: string;
  updatedAt: string;
  /** Every status change, so a dispatcher can see who moved what and when. */
  history: { at: string; status: DispatchStatus; note?: string }[];
}

interface Database {
  version: 1;
  requests: StoredRequest[];
}

const DATA_DIR = process.env.HOMESTEAD_DATA_DIR ?? path.join(process.cwd(), '.dispatch-data');
const DB_PATH = path.join(DATA_DIR, 'requests.json');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');

let db: Database = { version: 1, requests: [] };

function load(): void {
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) as Database;
    if (parsed?.version === 1 && Array.isArray(parsed.requests)) db = parsed;
  } catch (error) {
    /*
     * A corrupt file is moved aside rather than deleted or silently ignored:
     * losing a contractor's job queue without a trace is unacceptable, and
     * starting empty at least keeps the service answering.
     */
    const quarantine = `${DB_PATH}.corrupt-${Date.now()}`;
    fs.renameSync(DB_PATH, quarantine);
    console.error(`[dispatch] could not read ${DB_PATH}, moved to ${quarantine}`, error);
  }
}

function persist(): void {
  // Write to a temp file and rename, so a crash mid-write cannot truncate the queue.
  const temp = `${DB_PATH}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, DB_PATH);
}

load();

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('hex')}`;
}

/** Constant-time compare, so a token cannot be guessed a character at a time. */
export function tokenMatches(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/* -------------------------------------------------------------------------
 * Photos
 * ---------------------------------------------------------------------- */

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function savePhoto(base64: string, mediaType: string): string {
  const extension = EXTENSIONS[mediaType] ?? 'bin';
  const id = `${newId('pho')}.${extension}`;
  fs.writeFileSync(path.join(PHOTO_DIR, id), Buffer.from(base64, 'base64'));
  return id;
}

export function readPhoto(id: string): { body: Buffer; mediaType: string } | undefined {
  // Ids are generated here, never echoed from a request, but a traversal check
  // costs one line and this value reaches the filesystem.
  if (!/^pho_[0-9a-f]{18}\.(jpg|png|webp|bin)$/.test(id)) return undefined;
  const file = path.join(PHOTO_DIR, id);
  if (!fs.existsSync(file)) return undefined;
  const extension = id.split('.').pop() ?? 'bin';
  const mediaType =
    Object.entries(EXTENSIONS).find(([, ext]) => ext === extension)?.[0] ?? 'application/octet-stream';
  return { body: fs.readFileSync(file), mediaType };
}

/* -------------------------------------------------------------------------
 * Requests
 * ---------------------------------------------------------------------- */

export function createRequest(input: {
  clientRequestId: string;
  providerId: string;
  title: string;
  urgency: StoredRequest['urgency'];
  packet: ServiceRequestPacket;
  photoIds: string[];
}): StoredRequest {
  /*
   * Idempotent on the app's own id. A phone that loses signal mid-send retries,
   * and a contractor seeing the same job twice in the queue is worse than a
   * dropped one — they dispatch two trucks.
   */
  const existing = db.requests.find(
    (r) => r.clientRequestId === input.clientRequestId && r.providerId === input.providerId,
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const request: StoredRequest = {
    ...input,
    id: newId('req'),
    status: 'submitted',
    trackingToken: randomBytes(24).toString('base64url'),
    receivedAt: now,
    updatedAt: now,
    history: [{ at: now, status: 'submitted' }],
  };
  db.requests.push(request);
  persist();
  return request;
}

export function getRequest(id: string): StoredRequest | undefined {
  return db.requests.find((r) => r.id === id);
}

export function listForProvider(
  providerId: string,
  filter?: { status?: DispatchStatus; open?: boolean },
): StoredRequest[] {
  const CLOSED: DispatchStatus[] = ['completed', 'declined', 'cancelled'];
  return db.requests
    .filter((r) => r.providerId === providerId)
    .filter((r) => (filter?.status ? r.status === filter.status : true))
    .filter((r) => (filter?.open ? !CLOSED.includes(r.status) : true))
    .sort((a, b) => {
      // Emergencies first, then oldest first — a queue, not a feed.
      const rank = (r: StoredRequest) =>
        r.urgency === 'emergency' ? 0 : r.urgency === 'soon' ? 1 : 2;
      return rank(a) - rank(b) || a.receivedAt.localeCompare(b.receivedAt);
    });
}

export class TransitionError extends Error {}

export function updateRequest(
  id: string,
  patch: {
    status?: DispatchStatus;
    providerNote?: string;
    quotedCents?: number;
    scheduledFor?: string;
    completion?: CompletionRecord;
  },
): StoredRequest {
  const request = db.requests.find((r) => r.id === id);
  if (!request) throw new TransitionError('No such request.');

  if (patch.status && patch.status !== request.status) {
    if (!canTransition(request.status, patch.status)) {
      throw new TransitionError(
        `A ${request.status} request cannot move to ${patch.status}.`,
      );
    }
    request.status = patch.status;
    request.history.push({ at: new Date().toISOString(), status: patch.status, note: patch.providerNote });
  }

  if (patch.providerNote !== undefined) request.providerNote = patch.providerNote;
  if (patch.quotedCents !== undefined) request.quotedCents = patch.quotedCents;
  if (patch.scheduledFor !== undefined) request.scheduledFor = patch.scheduledFor;
  if (patch.completion !== undefined) request.completion = patch.completion;

  request.updatedAt = new Date().toISOString();
  persist();
  return request;
}

/** Counts for the queue header. Cheap enough to recompute per request at this scale. */
export function providerCounts(providerId: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const request of db.requests) {
    if (request.providerId !== providerId) continue;
    counts[request.status] = (counts[request.status] ?? 0) + 1;
  }
  return counts;
}

/** Test seam: wipes in-memory state without touching disk. */
export function __resetForTests(): void {
  db = { version: 1, requests: [] };
}
