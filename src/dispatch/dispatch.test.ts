import { describe, expect, it } from 'vitest';
import { buildSampleRecord } from '../data/sampleHome';
import { buildServiceRequestPacket, renderPacketText } from '../core/engine/serviceRequest';
import {
  ALLOWED_TRANSITIONS,
  SERVICE_REQUEST_STATUSES,
  canTransition,
  packetSchema,
  parseDollarsToCents,
  submitRequestSchema,
} from './contract';

function packet(overrides?: { photoCount?: number }) {
  const { record } = buildSampleRecord();
  const component = record.components.find((c) => c.id === 'cmp_water_heater')!;
  return buildServiceRequestPacket({
    record,
    component,
    problem: 'No hot water since this morning. Small puddle at the base.',
    photoCount: overrides?.photoCount ?? 2,
  });
}

describe('service request packet — contact details', () => {
  it('carries the street address, which a contractor cannot dispatch without', () => {
    const built = packet();
    expect(built.contact.address).toBe('412 Marsh Point Lane, Mount Pleasant, SC, 29464');
    expect(built.contact.ownerName).toBe('Ryder');
    expect(built.contact.phone).toBe('(843) 555-0142');
  });

  it('renders the address and contact into the plain-text brief', () => {
    const text = renderPacketText(packet(), 'Water heater');
    expect(text).toContain('Address: 412 Marsh Point Lane');
    expect(text).toContain('Contact: Ryder · (843) 555-0142');
  });

  it('omits contact lines entirely rather than printing empty labels', () => {
    const { record } = buildSampleRecord();
    // Address comes from the property; name and number come from the viewer.
    // Both have to be absent for the packet to print no contact block at all.
    const bare = {
      ...record,
      viewer: undefined,
      home: {
        ...record.home,
        addressLine1: undefined,
        city: undefined,
        state: undefined,
        postalCode: undefined,
      },
    };
    const built = buildServiceRequestPacket({ record: bare, problem: 'Something is leaking.', photoCount: 0 });
    expect(built.contact.address).toBeUndefined();
    const text = renderPacketText(built, 'Leak');
    expect(text).not.toContain('Address:');
    expect(text).not.toContain('Contact:');
  });

  it('never carries costs, documents, or the rest of the record', () => {
    const serialised = JSON.stringify(packet());
    // Sample invoices in the record run to hundreds of dollars; none may appear here.
    expect(serialised).not.toContain('costCents');
    expect(serialised).not.toContain('documentIds');
    expect(serialised).not.toContain('completions');
  });
});

describe('wire contract', () => {
  it('accepts a packet the app actually builds', () => {
    expect(packetSchema.safeParse(packet()).success).toBe(true);
  });

  it('rejects a submission whose photos exceed the cap', () => {
    const body = {
      clientRequestId: 'req_abc123',
      providerId: 'lowcountry',
      title: 'Water heater',
      urgency: 'soon' as const,
      packet: packet(),
      photos: Array.from({ length: 7 }, () => ({ data: 'AAAA', mediaType: 'image/jpeg' as const })),
    };
    expect(submitRequestSchema.safeParse(body).success).toBe(false);
  });

  it('rejects an unknown image type rather than storing it', () => {
    const body = {
      clientRequestId: 'req_abc123',
      providerId: 'lowcountry',
      title: 'Water heater',
      urgency: 'soon' as const,
      packet: packet(),
      photos: [{ data: 'AAAA', mediaType: 'image/svg+xml' }],
    };
    expect(submitRequestSchema.safeParse(body).success).toBe(false);
  });

  it('defaults photos to an empty list, so a text-only request is valid', () => {
    const parsed = submitRequestSchema.safeParse({
      clientRequestId: 'req_abc123',
      providerId: 'lowcountry',
      title: 'Water heater',
      urgency: 'routine' as const,
      packet: packet({ photoCount: 0 }),
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.photos).toEqual([]);
  });
});

describe('status transitions', () => {
  it('lets a new request be acknowledged, quoted, scheduled, or declined', () => {
    expect(canTransition('submitted', 'acknowledged')).toBe(true);
    expect(canTransition('submitted', 'scheduled')).toBe(true);
    expect(canTransition('submitted', 'declined')).toBe(true);
  });

  it('refuses to complete a job that was never scheduled', () => {
    expect(canTransition('submitted', 'completed')).toBe(false);
    expect(canTransition('quoted', 'completed')).toBe(false);
    expect(canTransition('scheduled', 'completed')).toBe(true);
  });

  it('treats completed, declined, and withdrawn as terminal', () => {
    expect(ALLOWED_TRANSITIONS.completed).toEqual([]);
    expect(ALLOWED_TRANSITIONS.declined).toEqual([]);
    expect(ALLOWED_TRANSITIONS.cancelled).toEqual([]);
    for (const status of SERVICE_REQUEST_STATUSES) {
      expect(canTransition('completed', status)).toBe(false);
    }
  });

  it('never allows a request to move backwards', () => {
    expect(canTransition('scheduled', 'submitted')).toBe(false);
    expect(canTransition('quoted', 'acknowledged')).toBe(false);
  });
});

describe('money entered by a contractor', () => {
  it('reads dollars into cents', () => {
    expect(parseDollarsToCents('412.50')).toBe(41250);
    expect(parseDollarsToCents('$1,240')).toBe(124000);
  });

  it('rounds to the nearest cent rather than truncating', () => {
    expect(parseDollarsToCents('10.005')).toBe(1001);
  });

  it('returns undefined for junk instead of guessing a number', () => {
    expect(parseDollarsToCents('')).toBeUndefined();
    expect(parseDollarsToCents('call me')).toBeUndefined();
    expect(parseDollarsToCents('9999999999')).toBeUndefined();
  });
});
