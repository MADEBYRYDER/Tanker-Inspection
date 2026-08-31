import Constants from 'expo-constants';

/**
 * Signing in.
 *
 * No passwords. A home record is something people come back to twice a year for
 * fifteen years, which is exactly the interval over which a password becomes a
 * reset email — so the email route is a six-digit code, and the buttons above it
 * are the platform identities somebody already has.
 *
 * Two modes, and the difference is stated in the UI rather than hidden:
 *
 * - **With a server.** The code is issued and verified by `server/`, which
 *   returns a session token and an account. That is the real path.
 * - **Without one.** Everything in this app already works offline against a
 *   local record, so refusing to let someone in because there is no accounts
 *   server would be a gate protecting nothing. The app creates the account on
 *   the device and says so. What it must never do is invent a code and pretend
 *   to have emailed it — so in local mode there is no code step at all.
 */

export interface AuthAccount {
  id: string;
  email?: string;
  displayName: string;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  account: AuthAccount;
}

export class AuthError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

function resolveBase(): string | undefined {
  const fromEnv = process.env.EXPO_PUBLIC_ACCOUNTS_URL ?? process.env.EXPO_PUBLIC_AI_GATEWAY_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/$/, '');
  const extra = Constants.expoConfig?.extra as
    | { accountsUrl?: string; aiGatewayUrl?: string }
    | undefined;
  const fromConfig = extra?.accountsUrl ?? extra?.aiGatewayUrl;
  if (fromConfig && fromConfig.length > 0) return fromConfig.replace(/\/$/, '');
  return undefined;
}

/** Whether a real accounts server is reachable for this build. */
export function isAccountsServerConfigured(): boolean {
  return resolveBase() !== undefined;
}

const TIMEOUT_MS = 20_000;

async function call<T>(path: string, body: unknown): Promise<T> {
  const base = resolveBase();
  if (!base) throw new AuthError(0, 'No accounts server is configured on this build.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new AuthError(
        response.status,
        typeof raw.error === 'string' ? raw.error : 'That did not work. Try again.',
      );
    }
    return raw as T;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AuthError(408, 'The server took too long to answer.');
    }
    throw new AuthError(0, 'Could not reach the accounts server.');
  } finally {
    clearTimeout(timer);
  }
}

export interface CodeRequest {
  sent: boolean;
  /** Present only in development, when the server is explicitly told to echo. */
  code?: string;
  detail?: string;
}

/** Asks the server to email a six-digit code. */
export function requestCode(email: string, displayName?: string): Promise<CodeRequest> {
  return call<CodeRequest>('/auth/request', { email, displayName });
}

/** Exchanges the code for a session. */
export function verifyCode(code: string, displayName?: string): Promise<AuthSession> {
  return call<AuthSession>('/auth/verify', { code, displayName });
}

/**
 * The identity providers.
 *
 * Deliberately not faked. Sign in with Apple needs an Apple developer team and
 * a configured service id; Google needs an OAuth client per platform. Neither
 * exists in this build, and a button that silently produced a signed-in state
 * would make the whole sign-in flow untrustworthy to test against — the one
 * thing worse than a missing provider is one that appears to work.
 *
 * `expo-apple-authentication` and `expo-auth-session` are the seams. This
 * function is what those replace.
 */
export type IdentityProvider = 'apple' | 'google';

export function providerAvailable(_provider: IdentityProvider): boolean {
  return false;
}

export const PROVIDER_UNAVAILABLE: Record<IdentityProvider, string> = {
  apple:
    'Sign in with Apple needs an Apple developer team and a service identifier, neither of which this build has. Continue with email — it creates the same account.',
  google:
    'Google sign-in needs an OAuth client configured per platform, which this build does not have. Continue with email — it creates the same account.',
};
