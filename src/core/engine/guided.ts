import type { ComponentCategory, HomeComponent, HomeRecord } from '../types';

/**
 * The guided whole-home scan.
 *
 * Setting up a home record is a long job, and a long job with no visible end is one
 * people abandon halfway. So it is modelled as a checklist of areas rather than a
 * form: each area names exactly what to photograph, completion is inferred from
 * what is already in the record rather than tracked separately, and progress is
 * always visible.
 *
 * Inferring completion matters. Someone who scanned their furnace last week from
 * the equipment flow should not be asked to do the HVAC step again — the record
 * already has it, so the step is already done.
 */

export interface GuidedStep {
  id: string;
  label: string;
  /** Ionicons outline name. */
  icon: string;
  /** What to point the camera at, in the owner's language. */
  prompt: string;
  /** Category the scan should default to. */
  category: ComponentCategory;
  /** Categories that satisfy this step. */
  satisfiedBy: ComponentCategory[];
  /** Optional narrowing — whole words matched against type and name. */
  typeMatch?: string;
}

export const GUIDED_STEPS: GuidedStep[] = [
  {
    id: 'hvac',
    label: 'Heating & cooling',
    icon: 'thermometer-outline',
    prompt:
      'Photograph the rating label on the outdoor unit and on the furnace or air handler. The serial number carries the build year.',
    category: 'hvac',
    satisfiedBy: ['hvac'],
  },
  {
    id: 'water_heater',
    label: 'Water heater',
    icon: 'water-outline',
    prompt:
      'Photograph the label on the side of the tank. Capacity, fuel, and the date code are all on it.',
    category: 'water_heater',
    satisfiedBy: ['water_heater'],
  },
  {
    id: 'electrical',
    label: 'Electrical panel',
    icon: 'flash-outline',
    prompt:
      'Photograph the panel door label and the brand name on the box. Do not remove the cover.',
    category: 'electrical',
    satisfiedBy: ['electrical'],
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    icon: 'restaurant-outline',
    prompt:
      'Dishwasher, refrigerator, range, microwave. Model labels are usually inside the door or behind the kick plate.',
    category: 'appliance',
    satisfiedBy: ['appliance'],
    typeMatch: 'dishwasher|refrigerator|fridge|range|oven|cooktop|stove|microwave|disposal',
  },
  {
    id: 'laundry',
    label: 'Laundry',
    icon: 'shirt-outline',
    prompt: 'Washer and dryer. Check the back panel or inside the door for the model label.',
    category: 'appliance',
    satisfiedBy: ['appliance'],
    typeMatch: 'washer|dryer|washing machine',
  },
  {
    id: 'plumbing',
    label: 'Plumbing & bathrooms',
    icon: 'git-branch-outline',
    prompt:
      'The main shutoff, any water treatment or sump pump, and the pipe material where it is visible.',
    category: 'plumbing',
    satisfiedBy: ['plumbing'],
  },
  {
    id: 'safety',
    label: 'Safety devices',
    icon: 'shield-outline',
    prompt:
      'Smoke and carbon monoxide alarms. The manufacture date is printed on the back — both types expire.',
    category: 'safety',
    satisfiedBy: ['safety'],
  },
  {
    id: 'exterior',
    label: 'Exterior',
    icon: 'leaf-outline',
    prompt: 'Siding, windows, deck, garage door opener. A wide shot of each elevation is enough.',
    category: 'exterior',
    satisfiedBy: ['exterior', 'windows'],
  },
  {
    id: 'roof',
    label: 'Roof',
    icon: 'home-outline',
    prompt:
      'A photo from the ground is fine — the material and rough condition is what matters. Do not climb up.',
    category: 'roof',
    satisfiedBy: ['roof'],
  },
];

export interface GuidedStepState extends GuidedStep {
  done: boolean;
  componentIds: string[];
}

export interface GuidedProgress {
  steps: GuidedStepState[];
  done: GuidedStepState[];
  remaining: GuidedStepState[];
  /** 0–100, rounded. */
  percent: number;
  /** The next incomplete step, or undefined when everything is covered. */
  next?: GuidedStepState;
}

function matches(component: HomeComponent, step: GuidedStep): boolean {
  if (component.retiredOn) return false;
  if (!step.satisfiedBy.includes(component.category)) return false;
  if (!step.typeMatch) return true;
  const haystack = `${component.type} ${component.name}`.toLowerCase();
  // Whole words: "washer" must not match "dishwasher", or the laundry step would be
  // marked done by a kitchen appliance.
  return new RegExp(`\\b(?:${step.typeMatch})\\b`).test(haystack);
}

export function guidedProgress(record: HomeRecord): GuidedProgress {
  const steps: GuidedStepState[] = GUIDED_STEPS.map((step) => {
    const componentIds = record.components.filter((c) => matches(c, step)).map((c) => c.id);
    return { ...step, done: componentIds.length > 0, componentIds };
  });

  const done = steps.filter((s) => s.done);
  const remaining = steps.filter((s) => !s.done);

  return {
    steps,
    done,
    remaining,
    percent: Math.round((done.length / steps.length) * 100),
    next: remaining[0],
  };
}
