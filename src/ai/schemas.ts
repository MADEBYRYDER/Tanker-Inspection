import { z } from 'zod';

/**
 * The contract between the app and the AI gateway.
 *
 * These schemas are imported by both sides: the server uses them to constrain the
 * model's output, and the app uses them to validate whatever comes back over the
 * wire before it touches the home record. A malformed or hallucinated field is
 * rejected at the boundary rather than being written into a permanent record.
 *
 * Every extracted field is paired with a confidence and, where it matters, an
 * explicit `read_from` describing what in the image supports it. That is what lets
 * the review screen show the owner which fields to check rather than asking them to
 * proofread everything.
 */

export const provenanceSchema = z.enum(['documented', 'contractor', 'estimated', 'unknown']);

export const componentCategorySchema = z.enum([
  'hvac',
  'water_heater',
  'roof',
  'electrical',
  'plumbing',
  'appliance',
  'windows',
  'exterior',
  'flooring',
  'safety',
  'structure',
  'other',
]);

/* -------------------------------------------------------------------------
 * Scan: identify a component from photos
 * ---------------------------------------------------------------------- */

export const identifiedSpecSchema = z.object({
  key: z.string().describe('snake_case identifier, e.g. filter_size, tank_capacity_gallons, tonnage'),
  label: z.string().describe('Human label, e.g. "Filter size"'),
  value: z.string(),
  provenance: provenanceSchema.describe(
    'documented only if the value is legible in the image; estimated if inferred from the model number or equipment type',
  ),
});

export const componentIdentificationSchema = z.object({
  category: componentCategorySchema,
  type: z.string().describe('Specific equipment type, e.g. "Gas furnace", "Tank water heater", "Dishwasher"'),
  name: z.string().describe('Short friendly name the owner would recognise, e.g. "Upstairs furnace"'),
  manufacturer: z.string().nullable(),
  modelNumber: z.string().nullable(),
  serialNumber: z.string().nullable(),
  manufacturedYear: z
    .number()
    .int()
    .nullable()
    .describe('Year of manufacture if legible or decodable from the serial number; null otherwise'),
  manufacturedYearBasis: z
    .string()
    .nullable()
    .describe('How the year was determined, e.g. "first four digits of serial number are date code 0619"'),
  specs: z.array(identifiedSpecSchema),
  warrantyNote: z
    .string()
    .nullable()
    .describe('Any warranty information visible on the equipment, or the manufacturer\'s standard term if well known'),
  recommendedMaintenance: z
    .array(z.string())
    .describe('Short maintenance items specific to this equipment'),
  confidence: z.number().min(0).max(1).describe('Overall confidence in this identification'),
  openQuestions: z
    .array(z.string())
    .describe('What could not be determined and would need the owner or a better photo to resolve'),
  notes: z.string().describe('One or two sentences the owner would find useful about this specific unit'),
});

export type ComponentIdentification = z.infer<typeof componentIdentificationSchema>;

export const scanResultSchema = z.object({
  components: z.array(componentIdentificationSchema),
  /** Set when the images do not show identifiable equipment. */
  unreadable: z.boolean(),
  guidance: z.string().describe('What to photograph next for a better result, or "" if nothing is needed'),
});

export type ScanResult = z.infer<typeof scanResultSchema>;

/* -------------------------------------------------------------------------
 * Documents: extract structured data from an invoice, receipt, or warranty
 * ---------------------------------------------------------------------- */

export const documentExtractionSchema = z.object({
  documentKind: z.enum(['invoice', 'receipt', 'warranty', 'manual', 'permit', 'inspection', 'other']),
  vendor: z.string().nullable(),
  serviceDate: z
    .string()
    .nullable()
    .describe('ISO date YYYY-MM-DD of the work or purchase, not the date printed on the letterhead'),
  totalCents: z.number().int().nullable().describe('Total amount in cents'),
  title: z.string().describe('Short timeline title, e.g. "HVAC serviced" or "Kitchen plumbing repaired"'),
  summary: z.string().describe('Two or three sentences on what was actually done'),
  eventType: z.enum(['installation', 'service', 'repair', 'replacement', 'inspection', 'improvement', 'issue']),
  /** Free-text description of which component this belongs to; matched against the record app-side. */
  relatesTo: z
    .string()
    .nullable()
    .describe('The equipment this document concerns, described in the document\'s own words'),
  suggestedComponentId: z
    .string()
    .nullable()
    .describe('id of the matching component from the provided record, or null if no clear match'),
  warranty: z
    .object({
      provider: z.string(),
      kind: z.enum(['manufacturer', 'extended', 'workmanship', 'home_warranty']),
      termYears: z.number().nullable(),
      startDate: z.string().nullable(),
      expiresOn: z.string().nullable(),
      covers: z.string().nullable(),
    })
    .nullable()
    .describe('Present only if the document establishes warranty coverage'),
  lineItems: z.array(z.object({ description: z.string(), amountCents: z.number().int().nullable() })),
  confidence: z.number().min(0).max(1),
  uncertainFields: z.array(z.string()).describe('Field names the owner should verify before saving'),
});

export type DocumentExtraction = z.infer<typeof documentExtractionSchema>;

/* -------------------------------------------------------------------------
 * Problem scanner: triage, explicitly not diagnosis
 * ---------------------------------------------------------------------- */

export const problemTriageSchema = z.object({
  headline: z.string().describe('One line naming what appears to be going on'),
  /**
   * emergency: stop and call now (gas, active water, electrical, structural, CO)
   * urgent: days, not weeks
   * soon: schedule within a few weeks
   * routine: monitor or handle at leisure
   */
  urgency: z.enum(['emergency', 'urgent', 'soon', 'routine']),
  urgencyReason: z.string(),
  /** Ranked, each with how confident the model is that it fits what is visible. */
  possibleCauses: z.array(
    z.object({
      cause: z.string(),
      likelihood: z.enum(['likely', 'possible', 'less_likely']),
      reasoning: z.string().describe('What in the photo or the home record points to this'),
    }),
  ),
  safeSteps: z
    .array(z.string())
    .describe('Things the owner can safely check or do right now. Empty if nothing is safe to attempt.'),
  doNotDo: z.array(z.string()).describe('Specific things that would make it worse or are dangerous'),
  professionalNeeded: z.boolean(),
  professionalTrade: z.string().nullable().describe('Which trade, e.g. "licensed plumber"'),
  relatedComponentIds: z.array(z.string()).describe('ids from the provided record this concerns'),
  recordContext: z
    .string()
    .describe('What in this home\'s specific history is relevant, or "" if nothing is'),
  limitations: z
    .string()
    .describe('What cannot be determined from a photograph and would need an in-person look'),
});

export type ProblemTriage = z.infer<typeof problemTriageSchema>;

/* -------------------------------------------------------------------------
 * Assistant
 * ---------------------------------------------------------------------- */

export const assistantReplySchema = z.object({
  answer: z.string(),
  /** Which record items the answer drew on, so the UI can link them. */
  usedComponentIds: z.array(z.string()),
  /** True when the answer relies on general knowledge rather than this home's record. */
  isGeneralKnowledge: z.boolean(),
  followUps: z.array(z.string()).max(3),
});

export type AssistantReply = z.infer<typeof assistantReplySchema>;

/* -------------------------------------------------------------------------
 * Wire types
 * ---------------------------------------------------------------------- */

export interface ImagePayload {
  /** Base64-encoded image data, no data: prefix. */
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** What the photo is meant to show, passed through to the prompt. */
  role?: string;
}

export interface ScanRequestBody {
  images: ImagePayload[];
  categoryHint?: string;
  locationHint?: string;
  homeContext?: string;
}

export interface DocumentRequestBody {
  images: ImagePayload[];
  recordContext: string;
}

export interface ProblemRequestBody {
  images: ImagePayload[];
  description: string;
  recordContext: string;
}

export interface AssistantRequestBody {
  question: string;
  recordContext: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export interface GatewayError {
  error: string;
  detail?: string;
}
