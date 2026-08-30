import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

/**
 * The only place in this codebase that talks to Anthropic.
 *
 * Every call uses structured outputs. The app writes model output into a permanent
 * home record, so a response that does not conform to the expected shape has to
 * fail loudly here rather than arrive half-parsed at the review screen.
 */

export const MODEL = process.env.DWELLA_MODEL ?? 'claude-opus-5';

// Credentials resolve from the environment: ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN,
// or an `ant auth login` profile.
export const anthropic = new Anthropic();

export interface ImageInput {
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  role?: string;
}

export class ModelRefusalError extends Error {
  readonly category: string | null;
  constructor(explanation: string, category: string | null) {
    super(explanation);
    this.name = 'ModelRefusalError';
    this.category = category;
  }
}

export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelOutputError';
  }
}

/**
 * One structured, image-capable request.
 *
 * `effort` is exposed because the four surfaces genuinely differ: reading a total
 * off an invoice is not the same class of problem as triaging a possible gas smell
 * against fourteen years of service history.
 */
export async function generateStructured<T extends z.ZodType>(params: {
  system: string;
  text: string;
  images?: ImageInput[];
  schema: T;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  maxTokens?: number;
}): Promise<z.infer<T>> {
  const content: Anthropic.ContentBlockParam[] = [];

  for (const image of params.images ?? []) {
    if (image.role) content.push({ type: 'text', text: `[Photo — ${image.role}]` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.data },
    });
  }
  content.push({ type: 'text', text: params.text });

  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: params.maxTokens ?? 16000,
    system: params.system,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: params.effort ?? 'high',
      format: zodOutputFormat(params.schema),
    },
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') {
    const details = response.stop_details;
    throw new ModelRefusalError(
      details?.explanation ?? 'The model declined to respond to this request.',
      details?.category ?? null,
    );
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ModelOutputError('The response was cut off before it was complete. Try fewer images.');
  }
  if (response.parsed_output == null) {
    throw new ModelOutputError('The model did not return a response in the expected format.');
  }

  return response.parsed_output as z.infer<T>;
}
