import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  assistantReplySchema,
  documentExtractionSchema,
  problemTriageSchema,
  scanResultSchema,
} from '../../src/ai/schemas';
import {
  MODEL,
  ModelOutputError,
  ModelRefusalError,
  generateStructured,
  type ImageInput,
} from './anthropic';
import { DispatchError, dispatchRouter } from './dispatch/routes';
import { allProviders, usingGeneratedToken } from './dispatch/providers';
import { ASSISTANT_SYSTEM, DOCUMENT_SYSTEM, PROBLEM_SYSTEM, SCAN_SYSTEM } from './prompts';

/**
 * The Homestead server.
 *
 * Two things live here, deliberately separate:
 *
 *   - The AI gateway (`/ai/*`), which exists so the Anthropic API key lives on a
 *     server the operator controls rather than inside a mobile app bundle, where
 *     it would be trivially extractable and spendable by anyone who downloads it.
 *   - The dispatch service (`/dispatch/*`, `/provider/*`), which receives service
 *     requests from the app, gives contractors a queue to work, and reports
 *     status back to the homeowner.
 *
 * Everything the app sends is treated as untrusted input: images are size-capped
 * before they reach the model, free text is length-capped, and every dispatch
 * payload is schema-validated on arrival. See server/README.md for deployment.
 */

const PORT = Number(process.env.PORT ?? 8787);

/** ~7MB of base64 is roughly a 5MB image; the API's own request ceiling is 32MB. */
const MAX_IMAGE_BASE64_CHARS = 7_000_000;
const MAX_IMAGES = 6;
const MAX_TEXT_CHARS = 4_000;
const MAX_CONTEXT_CHARS = 120_000;

const app = express();
app.use(cors({ origin: process.env.HOMESTEAD_ALLOWED_ORIGIN ?? true }));
app.use(express.json({ limit: '48mb' }));

class BadRequest extends Error {}

const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function validateImages(raw: unknown, { required }: { required: boolean }): ImageInput[] {
  if (raw === undefined || raw === null) {
    if (required) throw new BadRequest('At least one image is required.');
    return [];
  }
  if (!Array.isArray(raw)) throw new BadRequest('`images` must be an array.');
  if (required && raw.length === 0) throw new BadRequest('At least one image is required.');
  if (raw.length > MAX_IMAGES) {
    throw new BadRequest(`Too many images — send at most ${MAX_IMAGES} per request.`);
  }

  return raw.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new BadRequest(`Image ${index + 1} is malformed.`);
    }
    const { data, mediaType, role } = entry as Record<string, unknown>;
    if (typeof data !== 'string' || data.length === 0) {
      throw new BadRequest(`Image ${index + 1} is missing base64 data.`);
    }
    if (data.length > MAX_IMAGE_BASE64_CHARS) {
      throw new BadRequest(`Image ${index + 1} is too large. Resize to about 1600px on the long edge before sending.`);
    }
    if (typeof mediaType !== 'string' || !ALLOWED_MEDIA_TYPES.has(mediaType)) {
      throw new BadRequest(`Image ${index + 1} must be JPEG, PNG, or WebP.`);
    }
    return {
      // The API rejects base64 containing newlines or a data: prefix.
      data: data.replace(/^data:[^,]+,/, '').replace(/\s/g, ''),
      mediaType: mediaType as ImageInput['mediaType'],
      role: typeof role === 'string' ? role.slice(0, 80) : undefined,
    };
  });
}

function requireText(raw: unknown, field: string, max = MAX_TEXT_CHARS): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new BadRequest(`\`${field}\` is required.`);
  }
  return raw.slice(0, max);
}

function optionalText(raw: unknown, max = MAX_TEXT_CHARS): string {
  return typeof raw === 'string' ? raw.slice(0, max) : '';
}

interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Validates conversation history off the wire, keeping only the last few turns. */
function parseHistory(raw: unknown): HistoryTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryTurn[] = [];
  for (const entry of raw.slice(-8)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') continue;
    out.push({ role, content });
  }
  return out;
}

const asyncRoute =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };

/* -------------------------------------------------------------------------
 * Routes
 * ---------------------------------------------------------------------- */

app.get('/health', (_req, res) => {
  res.json({ ok: true, model: MODEL, service: 'homestead-server' });
});

/** Service request intake, the contractor queue, and status back to the homeowner. */
app.use(dispatchRouter());

/** Identify equipment from scan photos. */
app.post(
  '/ai/scan',
  asyncRoute(async (req, res) => {
    const images = validateImages(req.body?.images, { required: true });
    const categoryHint = optionalText(req.body?.categoryHint, 120);
    const locationHint = optionalText(req.body?.locationHint, 120);
    const homeContext = optionalText(req.body?.homeContext, 4_000);

    const parts = ['Identify the equipment in these photos for a home record.'];
    if (categoryHint) parts.push(`The homeowner says this is: ${categoryHint}.`);
    if (locationHint) parts.push(`Location in the home: ${locationHint}.`);
    if (homeContext) parts.push(`\nAbout this property:\n${homeContext}`);
    parts.push(
      '\nRead only what is actually legible. Anything you cannot read belongs in openQuestions, not in a field.',
    );

    const result = await generateStructured({
      system: SCAN_SYSTEM,
      text: parts.join('\n'),
      images,
      schema: scanResultSchema,
      effort: 'high',
    });
    res.json(result);
  }),
);

/** Pull structured data out of an invoice, receipt, or warranty. */
app.post(
  '/ai/document',
  asyncRoute(async (req, res) => {
    const images = validateImages(req.body?.images, { required: true });
    const recordContext = optionalText(req.body?.recordContext, MAX_CONTEXT_CHARS);

    const result = await generateStructured({
      system: DOCUMENT_SYSTEM,
      text: [
        'Extract this document into a record entry.',
        '',
        "This home's existing record, for matching the document to equipment:",
        recordContext || '(no equipment recorded yet)',
        '',
        'Only set suggestedComponentId when the match is unambiguous.',
      ].join('\n'),
      images,
      schema: documentExtractionSchema,
      effort: 'high',
    });
    res.json(result);
  }),
);

/** Triage a reported problem against the home's record. */
app.post(
  '/ai/problem',
  asyncRoute(async (req, res) => {
    const images = validateImages(req.body?.images, { required: false });
    const description = requireText(req.body?.description, 'description');
    const recordContext = optionalText(req.body?.recordContext, MAX_CONTEXT_CHARS);

    const result = await generateStructured({
      system: PROBLEM_SYSTEM,
      text: [
        'The homeowner reports:',
        description,
        '',
        images.length > 0
          ? `${images.length} photo${images.length === 1 ? '' : 's'} attached above.`
          : 'No photos were provided — say what a photo would help resolve.',
        '',
        "This home's record:",
        recordContext || '(no record yet)',
      ].join('\n'),
      images,
      schema: problemTriageSchema,
      // Urgency calls carry real consequences, so this one gets the most headroom.
      effort: 'xhigh',
    });
    res.json(result);
  }),
);

/** Answer a question grounded in the home record. */
app.post(
  '/ai/assistant',
  asyncRoute(async (req, res) => {
    const question = requireText(req.body?.question, 'question');
    const recordContext = optionalText(req.body?.recordContext, MAX_CONTEXT_CHARS);
    const history = parseHistory(req.body?.history).map(
      (m) => `${m.role === 'user' ? 'Homeowner' : 'You'}: ${m.content.slice(0, 1_500)}`,
    );

    const result = await generateStructured({
      system: ASSISTANT_SYSTEM,
      text: [
        "THIS HOME'S RECORD",
        recordContext || '(no record yet — say so rather than answering generically)',
        '',
        history.length > 0 ? `EARLIER IN THIS CONVERSATION\n${history.join('\n')}\n` : '',
        'QUESTION',
        question,
      ].join('\n'),
      schema: assistantReplySchema,
      effort: 'high',
    });
    res.json(result);
  }),
);

/* -------------------------------------------------------------------------
 * Errors
 * ---------------------------------------------------------------------- */

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof DispatchError) {
    // An unauthenticated browser hitting a dispatch page gets the sign-in screen
    // rather than a JSON 401 it cannot do anything with.
    if (error.status === 401 && req.accepts(['json', 'html']) === 'html') {
      res.redirect('/dispatch');
      return;
    }
    res.status(error.status).json({ error: 'dispatch_error', detail: error.message });
    return;
  }
  if (error instanceof BadRequest) {
    res.status(400).json({ error: 'bad_request', detail: error.message });
    return;
  }
  if (error instanceof ModelRefusalError) {
    res.status(422).json({
      error: 'model_refusal',
      detail: `The model declined this request${error.category ? ` (${error.category})` : ''}. ${error.message}`,
    });
    return;
  }
  if (error instanceof ModelOutputError) {
    res.status(502).json({ error: 'model_output', detail: error.message });
    return;
  }
  // Typed SDK errors, most specific first.
  const named = error as { constructor?: { name?: string }; status?: number; message?: string };
  const kind = named?.constructor?.name;
  if (kind === 'AuthenticationError') {
    res.status(500).json({
      error: 'gateway_misconfigured',
      detail: 'The gateway has no valid Anthropic credentials. Set ANTHROPIC_API_KEY on the server.',
    });
    return;
  }
  if (kind === 'RateLimitError') {
    res.status(429).json({ error: 'rate_limited', detail: 'Too many requests right now. Try again shortly.' });
    return;
  }
  if (typeof named?.status === 'number') {
    res.status(502).json({ error: 'upstream_error', detail: named.message ?? 'Upstream API error.' });
    return;
  }

  console.error('[gateway] unhandled error', error);
  res.status(500).json({ error: 'internal_error', detail: 'Something went wrong in the gateway.' });
});

app.listen(PORT, () => {
  console.log(`Homestead server listening on :${PORT} (model: ${MODEL})`);
  console.log(`  Dispatch view:  http://localhost:${PORT}/dispatch`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.warn(
      'No ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN set. The SDK will look for an `ant auth login` profile; if there is none, requests will fail with an authentication error.',
    );
  }
  if (usingGeneratedToken) {
    /*
     * Printed once, and only when the operator configured nothing. A fresh
     * random token per process beats any default: a dev instance someone forgot
     * to shut down is not a door anyone else can walk through.
     */
    const [provider] = allProviders();
    console.warn(
      `\nNo HOMESTEAD_PROVIDERS configured. Generated a development token for "${provider?.name}":\n` +
        `  ${provider?.token}\n` +
        `Sign in at http://localhost:${PORT}/dispatch. Set HOMESTEAD_PROVIDERS to make this stable.\n`,
    );
  }
});
