import { randomBytes } from 'node:crypto';
import { tokenMatches } from './store';

/**
 * Who is allowed to see a queue.
 *
 * Providers and their access tokens come from the environment, not from the
 * database, so adding a contractor is a deploy-time act by the operator rather
 * than something any request can do. One shared token per provider is honest for
 * a launch partner with one crew; the moment two people at a company need
 * different permissions, this becomes real per-user accounts, and the seam for
 * that is `authenticate` returning a richer principal.
 *
 * Format:  DWELLA_PROVIDERS="lowcountry:Lowcountry Home Maintenance:<token>"
 * Multiple providers are separated by commas.
 */

export interface ProviderAccount {
  id: string;
  name: string;
  token: string;
}

function parseProviders(raw: string | undefined): ProviderAccount[] {
  if (!raw) return [];
  const accounts: ProviderAccount[] = [];
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [id, name, token] = trimmed.split(':').map((part) => part.trim());
    if (!id || !name || !token) {
      console.warn(`[dispatch] ignoring malformed provider entry: "${trimmed.slice(0, 40)}"`);
      continue;
    }
    accounts.push({ id, name, token });
  }
  return accounts;
}

let accounts = parseProviders(process.env.DWELLA_PROVIDERS);

/*
 * With nothing configured, generate a token for the launch partner and print it
 * once at boot. This makes the service runnable in one command for development
 * without ever falling back to an empty or default password — the token is
 * random per process, so a forgotten dev instance is not an open door.
 */
export const usingGeneratedToken = accounts.length === 0;
if (usingGeneratedToken) {
  accounts = [
    { id: 'lowcountry', name: 'Lowcountry Home Maintenance', token: randomBytes(18).toString('base64url') },
  ];
}

export function allProviders(): ProviderAccount[] {
  return accounts.map((a) => ({ ...a }));
}

export function providerById(id: string): ProviderAccount | undefined {
  return accounts.find((a) => a.id === id);
}

export function providerName(id: string): string {
  return providerById(id)?.name ?? id;
}

/** Resolves a bearer token to a provider, in constant time against every account. */
export function authenticate(token: string | undefined): ProviderAccount | undefined {
  if (!token) return undefined;
  // Check all accounts rather than short-circuiting, so timing does not reveal
  // which provider a token nearly matched.
  let match: ProviderAccount | undefined;
  for (const account of accounts) {
    if (tokenMatches(account.token, token)) match = account;
  }
  return match;
}

/** Pulls a token from `Authorization: Bearer`, or the dispatch session cookie. */
export function tokenFromRequest(headers: {
  authorization?: string;
  cookie?: string;
}): string | undefined {
  const header = headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();

  const cookie = headers.cookie;
  if (!cookie) return undefined;
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === 'dwella_dispatch') return decodeURIComponent(rest.join('='));
  }
  return undefined;
}
