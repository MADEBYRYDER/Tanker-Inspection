import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  checkPayload,
  decodedBytes,
  formatBytes,
  totalBytes,
} from './payload';

/** Base64 of roughly `bytes` of data. */
function fakeImage(bytes: number) {
  const chars = Math.ceil((bytes * 4) / 3 / 4) * 4;
  return { data: 'A'.repeat(chars) };
}

describe('decodedBytes', () => {
  it('measures real base64', () => {
    // "hello world" is 11 bytes.
    expect(decodedBytes('aGVsbG8gd29ybGQ=')).toBe(11);
    // "any carnal pleasure" is 19 bytes and encodes with one pad char.
    expect(decodedBytes('YW55IGNhcm5hbCBwbGVhc3VyZQ==')).toBe(19);
    expect(decodedBytes('')).toBe(0);
  });

  it('lands within a byte of the requested size for the test helper', () => {
    for (const size of [1000, 50_000, 3_000_000]) {
      expect(Math.abs(decodedBytes(fakeImage(size).data) - size)).toBeLessThanOrEqual(3);
    }
  });
});

describe('formatBytes', () => {
  it('picks a readable unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1_500_000)).toBe('1.4 MB');
  });
});

describe('checkPayload', () => {
  it('rejects an empty set', () => {
    const verdict = checkPayload([]);
    expect(verdict.ok).toBe(false);
  });

  it('accepts a normal resized capture', () => {
    // Three photos at ~300 KB, which is what the resize pipeline produces.
    const verdict = checkPayload([fakeImage(300_000), fakeImage(300_000), fakeImage(300_000)]);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.warning).toBeUndefined();
  });

  it('rejects too many photos and says how many', () => {
    const verdict = checkPayload(Array.from({ length: MAX_IMAGES + 1 }, () => fakeImage(100_000)));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain(String(MAX_IMAGES + 1));
  });

  it('names which photo is oversized rather than failing generically', () => {
    // A full-resolution library import — the case the gateway would reject.
    const verdict = checkPayload([
      fakeImage(200_000),
      fakeImage(MAX_IMAGE_BYTES + 1_000_000),
      fakeImage(200_000),
    ]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toContain('Photo 2');
      expect(verdict.reason).toMatch(/MB/);
    }
  });

  it('rejects a set that is individually fine but collectively too large', () => {
    const verdict = checkPayload(Array.from({ length: 5 }, () => fakeImage(4_800_000)));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/too much to send/);
  });

  it('warns before a slow upload without blocking it', () => {
    const verdict = checkPayload([fakeImage(4_000_000), fakeImage(4_000_000), fakeImage(4_000_000)]);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.warning).toMatch(/may take a moment/);
  });

  it('reports the total either way, so the UI can show it', () => {
    const images = [fakeImage(100_000), fakeImage(150_000)];
    expect(checkPayload(images).totalBytes).toBeCloseTo(totalBytes(images), -2);
  });
});
