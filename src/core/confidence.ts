/**
 * How sure the app says it is.
 *
 * Never as a percentage, and never as certainty. A model that reports 1.0 is
 * reporting the top of its own scale, not that the answer is beyond doubt, and
 * printing "100% sure" next to a serial number invites someone to skip the one
 * check that would have caught a misread digit. The bands below top out at
 * "High confidence" for exactly that reason: there is no phrasing here that
 * claims the app cannot be wrong.
 *
 * The bands are also honest in the other direction. A low read is labelled as
 * needing a look rather than hidden, because the cost of a wrong install date
 * is every forecast and warranty window derived from it.
 */

export type ConfidenceBand = 'high' | 'good' | 'low';

export interface ConfidenceLabel {
  band: ConfidenceBand;
  /** For a badge next to an identification. */
  label: string;
  /** For a line that describes what the app did, when there is room for it. */
  statement: string;
  /** Whether the UI should ask the owner to check this before saving. */
  needsReview: boolean;
}

/** Below this, the owner is asked to confirm before it becomes part of the record. */
export const REVIEW_THRESHOLD = 0.6;
const HIGH_THRESHOLD = 0.85;

export function confidenceLabel(confidence: number): ConfidenceLabel {
  if (confidence >= HIGH_THRESHOLD) {
    return {
      band: 'high',
      label: 'High confidence',
      statement: 'Label clearly identified',
      needsReview: false,
    };
  }
  if (confidence >= REVIEW_THRESHOLD) {
    return {
      band: 'good',
      label: 'Good confidence',
      statement: 'Read from the label — worth a glance',
      needsReview: false,
    };
  }
  return {
    band: 'low',
    label: 'Low confidence',
    statement: 'Hard to read — please check',
    needsReview: true,
  };
}

/** What to show where the app found nothing, rather than an empty field. */
export const NOT_DETECTED = 'Not detected — add manually';

/**
 * A field's value, or the honest absence of one.
 *
 * Distinguishing "we looked and could not read it" from "this is blank" is the
 * difference between a form the owner trusts and one they re-check by hand.
 */
export function valueOrNotDetected(value: string | undefined | null): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : NOT_DETECTED;
}
