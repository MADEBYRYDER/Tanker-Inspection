import { monthOf, today } from '../dates';
import type { HomeRecord, ISODate, ScheduledTask } from '../types';
import { generateTasks } from './schedule';

/**
 * Seasonal home plans.
 *
 * The standard version is the checklist every homeowner has seen: clean the
 * gutters in autumn, service the cooling before summer. Correct, and generic.
 *
 * The personalised version is the same season read against *this* record — only
 * the systems this house actually has, ordered by what is genuinely due, with
 * the climate's own hazards named. A coastal house gets the salt-air corrosion
 * item; a cold-climate house gets the freeze prep. Telling someone in Charleston
 * to winterise their outdoor spigots against a hard freeze is how a checklist
 * teaches people to ignore checklists.
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const SEASON_LABEL: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

export function seasonOf(date: ISODate): Season {
  const month = monthOf(date);
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/** The generic checklist. Free, and honestly labelled as generic. */
export const STANDARD_PLAN: Record<Season, string[]> = {
  spring: [
    'Service the cooling system before you need it',
    'Clear gutters and downspouts of winter debris',
    'Check exterior caulking and window seals',
    'Test smoke and carbon monoxide detectors',
  ],
  summer: [
    'Replace HVAC filters more often during heavy use',
    'Check the condensate drain for blockage',
    'Inspect the roof and flashing after storms',
    'Exercise the main water shutoff',
  ],
  autumn: [
    'Service the heating system before the first cold night',
    'Clear gutters after the leaves drop',
    'Drain and store hoses; check exterior spigots',
    'Check weatherstripping on doors and windows',
  ],
  winter: [
    'Watch for ice dams and roof loading after snow',
    'Keep the furnace area clear and filters fresh',
    'Check for drafts and condensation on windows',
    'Test smoke and carbon monoxide detectors',
  ],
};

export interface SeasonalItem {
  title: string;
  /** The equipment this applies to, when it maps to one. */
  componentName?: string;
  /** The scheduled task behind it, so the row can open the real thing. */
  taskKey?: string;
  dueDate?: ISODate;
  urgency?: ScheduledTask['urgency'];
  /** Why this house in particular. Absent for items that need no explanation. */
  because?: string;
}

export interface SeasonalPlan {
  season: Season;
  /** True when built from the record rather than the standard checklist. */
  personalised: boolean;
  items: SeasonalItem[];
  /** One line naming what makes this plan specific to this property. */
  note?: string;
}

/**
 * Climate notes worth adding, keyed to the bucket the owner chose at setup.
 *
 * Deliberately short. Each entry is a real, locally-specific failure mode — not
 * a generic tip dressed up with a place name.
 */
const CLIMATE_NOTES: Record<HomeRecord['home']['climate'], Partial<Record<Season, string>>> = {
  coastal: {
    spring: 'Rinse salt off the condenser coil and any exterior metal — coastal air corrodes fins years faster than inland.',
    autumn: 'Check exterior fasteners and railings for salt corrosion before the winter storms.',
  },
  humid_subtropical: {
    spring: 'Check the condensate line early — humidity here keeps it running most of the year, and a blocked one floods a ceiling.',
    summer: 'Watch for condensation and mould around registers and in closets on exterior walls.',
  },
  cold: {
    autumn: 'Shut off and drain exterior spigots before the first hard freeze.',
    winter: 'Keep an eye on ice dams at the eaves after heavy snow.',
  },
  temperate: {
    autumn: 'Service the heating before the first cold night, when every technician is booked.',
  },
  arid: {
    spring: 'Check evaporative cooler pads and the roof for UV damage — sun does more here than water.',
    summer: 'Dust loads filters faster than the standard interval assumes; check monthly.',
  },
};

export function seasonalPlan(
  record: HomeRecord,
  options: { personalised: boolean; asOf?: ISODate } = { personalised: false },
): SeasonalPlan {
  const asOf = options.asOf ?? today();
  const season = seasonOf(asOf);

  if (!options.personalised) {
    return {
      season,
      personalised: false,
      items: STANDARD_PLAN[season].map((title) => ({ title })),
    };
  }

  /*
   * Built from the schedule the app already computes, so this plan and the
   * Tasks tab can never disagree about what is due. A season is a lens on the
   * same schedule, not a second list to keep in step with it.
   */
  const tasks = generateTasks(record, { asOf });
  const items: SeasonalItem[] = tasks
    .filter((task) => task.urgency === 'overdue' || task.urgency === 'due_soon')
    .slice(0, 8)
    .map((task) => ({
      title: task.title,
      componentName: task.componentName,
      taskKey: task.key,
      dueDate: task.dueDate,
      urgency: task.urgency,
    }));

  const climateNote = CLIMATE_NOTES[record.home.climate]?.[season];
  if (climateNote) items.push({ title: climateNote, because: 'Because of where this house is' });

  return {
    season,
    personalised: true,
    items,
    note:
      items.length === 0
        ? 'Nothing is due this season — everything on your schedule is current.'
        : `Built from the ${record.components.filter((c) => !c.retiredOn).length} systems on your record and what is actually due.`,
  };
}
