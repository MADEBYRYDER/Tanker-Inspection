import Constants from 'expo-constants';
import {
  assistantReplySchema,
  documentExtractionSchema,
  problemTriageSchema,
  scanResultSchema,
  type AssistantReply,
  type AssistantRequestBody,
  type DocumentExtraction,
  type DocumentRequestBody,
  type ProblemRequestBody,
  type ProblemTriage,
  type ScanRequestBody,
  type ScanResult,
} from './schemas';

/**
 * Client for the Dwella AI gateway.
 *
 * The app never holds an Anthropic API key. A key shipped inside a mobile binary is
 * a key you have published — it can be pulled out of the app bundle in minutes and
 * spent by anyone. So every model call goes through the small server in `server/`,
 * which holds the key, enforces size limits, and is the only thing that talks to
 * Anthropic.
 *
 * When no gateway is configured the app still works: scanning falls back to manual
 * entry and the assistant falls back to the deterministic record query. Those paths
 * are real features rather than error states, which is what makes the app usable
 * before a backend exists.
 */

export class GatewayNotConfiguredError extends Error {
  constructor() {
    super('No AI gateway is configured.');
    this.name = 'GatewayNotConfiguredError';
  }
}

export class GatewayRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GatewayRequestError';
    this.status = status;
  }
}

function resolveGatewayUrl(): string | undefined {
  const fromEnv = process.env.EXPO_PUBLIC_AI_GATEWAY_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/$/, '');
  const extra = Constants.expoConfig?.extra as { aiGatewayUrl?: string } | undefined;
  const fromConfig = extra?.aiGatewayUrl;
  if (fromConfig && fromConfig.length > 0) return fromConfig.replace(/\/$/, '');
  return undefined;
}

export function isGatewayConfigured(): boolean {
  return resolveGatewayUrl() !== undefined;
}

const REQUEST_TIMEOUT_MS = 90_000;

async function post<T>(path: string, body: unknown, parse: (raw: unknown) => T): Promise<T> {
  const base = resolveGatewayUrl();
  if (!base) throw new GatewayNotConfiguredError();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      let detail = text;
      try {
        const parsed = JSON.parse(text) as { error?: string; detail?: string };
        detail = parsed.detail ?? parsed.error ?? text;
      } catch {
        // Non-JSON error body; use it as-is.
      }
      throw new GatewayRequestError(response.status, detail.slice(0, 400));
    }
    return parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof GatewayRequestError || error instanceof GatewayNotConfiguredError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GatewayRequestError(408, 'The request timed out. Large photos take longer — try fewer or smaller images.');
    }
    throw new GatewayRequestError(
      0,
      error instanceof Error ? error.message : 'Could not reach the AI gateway.',
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Identifies equipment from photos of it, including its nameplate. */
export function identifyComponents(body: ScanRequestBody): Promise<ScanResult> {
  return post('/ai/scan', body, (raw) => scanResultSchema.parse(raw));
}

/** Pulls structured fields out of an invoice, receipt, or warranty document. */
export function extractDocument(body: DocumentRequestBody): Promise<DocumentExtraction> {
  return post('/ai/document', body, (raw) => documentExtractionSchema.parse(raw));
}

/** Triages a reported problem against this home's record. Never a definitive diagnosis. */
export function triageProblem(body: ProblemRequestBody): Promise<ProblemTriage> {
  return post('/ai/problem', body, (raw) => problemTriageSchema.parse(raw));
}

/** Answers a question grounded in the home record. */
export function askAssistant(body: AssistantRequestBody): Promise<AssistantReply> {
  return post('/ai/assistant', body, (raw) => assistantReplySchema.parse(raw));
}

export async function gatewayHealth(): Promise<{ ok: boolean; model?: string; detail?: string }> {
  const base = resolveGatewayUrl();
  if (!base) return { ok: false, detail: 'No gateway URL configured.' };
  try {
    const response = await fetch(`${base}/health`);
    if (!response.ok) return { ok: false, detail: `Gateway returned ${response.status}.` };
    const json = (await response.json()) as { ok?: boolean; model?: string };
    return { ok: json.ok === true, model: json.model };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : 'Unreachable.' };
  }
}
