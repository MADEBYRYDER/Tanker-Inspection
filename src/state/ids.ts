/**
 * Id generation.
 *
 * `crypto.randomUUID` is not available on all React Native runtimes, so this uses a
 * timestamp-plus-randomness scheme instead. Ids are prefixed by kind, which makes
 * them readable in the grounding context the model sees and in exported records.
 */
let counter = 0;

export function newId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  const time = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 0xffffff)
    .toString(36)
    .padStart(4, '0');
  return `${prefix}_${time}${rand}${counter.toString(36)}`;
}

export const nowISO = (): string => new Date().toISOString();
