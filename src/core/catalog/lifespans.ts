import type { Cents, ComponentCategory, Home } from '../types';

/**
 * Typical service life and replacement cost by equipment type.
 *
 * These are population averages drawn from the ranges the trades and home-inspection
 * bodies publish (NAHB study of housing component life expectancies, InterNACHI's
 * lifespan chart, and manufacturer-stated design life). They describe *typical*
 * equipment, not this equipment. Every number that reaches the UI through this
 * catalog is labelled an estimate for exactly that reason — a 12-year-old water
 * heater that has been flushed annually may outlive a 6-year-old one on hard water.
 *
 * Costs are installed prices for a typical US single-family home in 2026 dollars,
 * before regional adjustment.
 */

export interface LifespanEntry {
  id: string;
  category: ComponentCategory;
  label: string;
  /** Lowercased substrings matched against `HomeComponent.type` / name, most specific first. */
  match: string[];
  typicalYears: number;
  rangeYears: [number, number];
  /** Installed replacement cost range for a ~2,000 sq ft home. */
  replacementCostCents: [Cents, Cents];
  /** Scale the cost with home square footage (roofs, flooring, windows, whole-house HVAC). */
  scalesWithArea?: boolean;
  /** Climates that shorten this component's life, with the multiplier applied. */
  climatePenalty?: Partial<Record<Home['climate'], number>>;
  notes: string;
  /** Known-defective materials the app should actively warn about. */
  warnIf?: string;
}

const K = (dollars: number): Cents => dollars * 100;

export const LIFESPAN_CATALOG: LifespanEntry[] = [
  /* ------------------------------ Roof ------------------------------ */
  {
    id: 'roof.metal',
    category: 'roof',
    label: 'Metal roof',
    match: ['metal roof', 'standing seam', 'metal'],
    typicalYears: 45,
    rangeYears: [30, 70],
    replacementCostCents: [K(18000), K(38000)],
    scalesWithArea: true,
    notes: 'Panels outlast fasteners and sealant — those need periodic attention well before the roof does.',
  },
  {
    id: 'roof.tile',
    category: 'roof',
    label: 'Tile roof',
    match: ['tile roof', 'clay tile', 'concrete tile'],
    typicalYears: 50,
    rangeYears: [40, 80],
    replacementCostCents: [K(20000), K(45000)],
    scalesWithArea: true,
    notes: 'The tile outlives the underlayment; underlayment replacement is the real 25–30 year expense.',
  },
  {
    id: 'roof.architectural',
    category: 'roof',
    label: 'Architectural shingle roof',
    match: ['architectural', 'dimensional shingle', 'laminate shingle'],
    typicalYears: 25,
    rangeYears: [20, 32],
    replacementCostCents: [K(11000), K(22000)],
    scalesWithArea: true,
    climatePenalty: { coastal: 0.85, humid_subtropical: 0.9 },
    notes: 'Heat and UV drive shingle aging more than rain does; south-facing slopes fail first.',
  },
  {
    id: 'roof.flat',
    category: 'roof',
    label: 'Flat / low-slope roof',
    match: ['flat roof', 'tpo', 'epdm', 'modified bitumen', 'low slope'],
    typicalYears: 20,
    rangeYears: [15, 28],
    replacementCostCents: [K(9000), K(20000)],
    scalesWithArea: true,
    notes: 'Ponding water and seam failure are the usual causes of a shortened life.',
  },
  {
    id: 'roof.asphalt',
    category: 'roof',
    label: 'Asphalt shingle roof',
    match: ['asphalt', 'shingle', 'roof'],
    typicalYears: 20,
    rangeYears: [15, 28],
    replacementCostCents: [K(9000), K(18000)],
    scalesWithArea: true,
    climatePenalty: { coastal: 0.85, humid_subtropical: 0.9, arid: 0.9 },
    notes: '3-tab shingles sit at the low end of the range; hail and high wind cut it further.',
  },

  /* ------------------------------ HVAC ------------------------------ */
  {
    id: 'hvac.mini_split',
    category: 'hvac',
    label: 'Ductless mini-split',
    match: ['mini split', 'mini-split', 'ductless'],
    typicalYears: 15,
    rangeYears: [12, 20],
    replacementCostCents: [K(3500), K(8000)],
    climatePenalty: { coastal: 0.85 },
    notes: 'Outdoor unit coils corrode first in salt air.',
  },
  {
    id: 'hvac.boiler',
    category: 'hvac',
    label: 'Boiler',
    match: ['boiler', 'hydronic'],
    typicalYears: 25,
    rangeYears: [20, 35],
    replacementCostCents: [K(6000), K(12000)],
    notes: 'Cast-iron boilers regularly exceed 30 years with annual service.',
  },
  {
    id: 'hvac.heat_pump',
    category: 'hvac',
    label: 'Heat pump',
    match: ['heat pump'],
    typicalYears: 15,
    rangeYears: [12, 20],
    replacementCostCents: [K(6500), K(13000)],
    climatePenalty: { coastal: 0.85, humid_subtropical: 0.92 },
    notes: 'Runs year-round for both heating and cooling, so it accumulates roughly twice the hours of an AC-only condenser.',
  },
  {
    id: 'hvac.furnace',
    category: 'hvac',
    label: 'Furnace',
    match: ['furnace', 'gas furnace', 'air handler'],
    typicalYears: 20,
    rangeYears: [15, 28],
    replacementCostCents: [K(4500), K(9000)],
    notes: 'Heat exchanger cracking is the failure that ends a furnace — and the reason annual inspection is a safety item, not a nicety.',
  },
  {
    id: 'hvac.condenser',
    category: 'hvac',
    label: 'AC condenser',
    match: ['condenser', 'air condition', 'central air', 'ac unit', 'a/c', 'hvac'],
    typicalYears: 15,
    rangeYears: [12, 20],
    replacementCostCents: [K(6000), K(11000)],
    climatePenalty: { coastal: 0.8, humid_subtropical: 0.9 },
    notes: 'Units older than 2010 often use R-22 refrigerant, which is no longer produced — repairs get expensive fast.',
  },

  /* -------------------------- Water heater -------------------------- */
  {
    id: 'water_heater.tankless',
    category: 'water_heater',
    label: 'Tankless water heater',
    match: ['tankless', 'on demand', 'on-demand'],
    typicalYears: 20,
    rangeYears: [15, 25],
    replacementCostCents: [K(3000), K(6000)],
    notes: 'Reaching the upper range depends on annual descaling, especially on hard water.',
  },
  {
    id: 'water_heater.heat_pump',
    category: 'water_heater',
    label: 'Heat pump water heater',
    match: ['heat pump water', 'hybrid water'],
    typicalYears: 13,
    rangeYears: [10, 18],
    replacementCostCents: [K(2200), K(4500)],
    notes: 'Compressor is the life-limiting part; the tank itself often outlasts it.',
  },
  {
    id: 'water_heater.tank',
    category: 'water_heater',
    label: 'Tank water heater',
    match: ['water heater', 'tank'],
    typicalYears: 11,
    rangeYears: [8, 15],
    replacementCostCents: [K(1600), K(3200)],
    climatePenalty: { coastal: 0.9 },
    notes: 'Life turns almost entirely on the sacrificial anode rod and whether the tank was ever flushed.',
  },

  /* --------------------------- Electrical --------------------------- */
  {
    id: 'electrical.panel',
    category: 'electrical',
    label: 'Electrical panel',
    match: ['panel', 'breaker box', 'load center', 'service panel'],
    typicalYears: 40,
    rangeYears: [25, 60],
    replacementCostCents: [K(2000), K(4500)],
    warnIf: 'federal pacific|stab-lok|zinsco|challenger',
    notes: 'Federal Pacific Stab-Lok and Zinsco panels have documented failure-to-trip histories and are usually replaced on sight.',
  },
  {
    id: 'electrical.wiring',
    category: 'electrical',
    label: 'Branch wiring',
    match: ['wiring', 'romex', 'branch circuit'],
    typicalYears: 60,
    rangeYears: [40, 100],
    replacementCostCents: [K(8000), K(20000)],
    scalesWithArea: true,
    warnIf: 'aluminum|knob and tube|cloth',
    notes: 'Copper branch wiring effectively lasts the life of the house. Aluminum branch wiring and knob-and-tube do not.',
  },
  {
    id: 'electrical.generator',
    category: 'electrical',
    label: 'Standby generator',
    match: ['generator'],
    typicalYears: 20,
    rangeYears: [15, 30],
    replacementCostCents: [K(5000), K(12000)],
    notes: 'Rated in run hours; a standby unit exercised weekly accumulates them slowly.',
  },

  /* ---------------------------- Plumbing ---------------------------- */
  {
    id: 'plumbing.supply_polybutylene',
    category: 'plumbing',
    label: 'Polybutylene supply piping',
    match: ['polybutylene', 'poly-b', 'pb pipe'],
    typicalYears: 20,
    rangeYears: [10, 30],
    replacementCostCents: [K(6000), K(16000)],
    scalesWithArea: true,
    warnIf: 'polybutylene',
    notes: 'Subject of a major class-action settlement over fitting failures. Many insurers will not write a policy on it.',
  },
  {
    id: 'plumbing.supply_copper',
    category: 'plumbing',
    label: 'Copper supply piping',
    match: ['copper'],
    typicalYears: 60,
    rangeYears: [40, 80],
    replacementCostCents: [K(8000), K(20000)],
    scalesWithArea: true,
    notes: 'Acidic water causes pinhole leaks well before the nominal life.',
  },
  {
    id: 'plumbing.supply_pex',
    category: 'plumbing',
    label: 'PEX supply piping',
    match: ['pex'],
    typicalYears: 50,
    rangeYears: [40, 70],
    replacementCostCents: [K(6000), K(15000)],
    scalesWithArea: true,
    notes: 'Degrades under UV, so exposed runs should be sleeved or painted.',
  },
  {
    id: 'plumbing.sewer',
    category: 'plumbing',
    label: 'Sewer lateral',
    match: ['sewer', 'lateral', 'main drain'],
    typicalYears: 50,
    rangeYears: [30, 80],
    replacementCostCents: [K(4000), K(14000)],
    warnIf: 'orangeburg|clay',
    notes: 'Root intrusion at clay joints and Orangeburg collapse are the two common early failures.',
  },
  {
    id: 'plumbing.septic',
    category: 'plumbing',
    label: 'Septic system',
    match: ['septic', 'drain field', 'drainfield'],
    typicalYears: 30,
    rangeYears: [20, 45],
    replacementCostCents: [K(7000), K(22000)],
    notes: 'Drainfield life depends almost entirely on pumping the tank on schedule.',
  },
  {
    id: 'plumbing.water_softener',
    category: 'plumbing',
    label: 'Water softener',
    match: ['softener', 'water treatment'],
    typicalYears: 15,
    rangeYears: [10, 20],
    replacementCostCents: [K(1500), K(3500)],
    notes: 'Resin bed exhausts before the control head fails.',
  },
  {
    id: 'plumbing.sump_pump',
    category: 'plumbing',
    label: 'Sump pump',
    match: ['sump'],
    typicalYears: 8,
    rangeYears: [5, 12],
    replacementCostCents: [K(600), K(1600)],
    notes: 'A pump that never runs still seizes; a pump that runs constantly wears out faster.',
  },
  {
    id: 'plumbing.well_pump',
    category: 'plumbing',
    label: 'Well pump',
    match: ['well pump', 'well'],
    typicalYears: 12,
    rangeYears: [8, 18],
    replacementCostCents: [K(1500), K(4000)],
    notes: 'Submersible pumps last longer than jet pumps but cost more to pull and replace.',
  },
  {
    id: 'plumbing.fixture',
    category: 'plumbing',
    label: 'Plumbing fixture',
    match: ['faucet', 'toilet', 'sink', 'shower', 'fixture'],
    typicalYears: 20,
    rangeYears: [12, 30],
    replacementCostCents: [K(300), K(1200)],
    notes: 'Cartridges and flappers wear out long before the fixture does and cost a few dollars.',
  },

  /* --------------------------- Appliances --------------------------- */
  {
    id: 'appliance.refrigerator',
    category: 'appliance',
    label: 'Refrigerator',
    match: ['refrigerator', 'fridge'],
    typicalYears: 13,
    rangeYears: [9, 18],
    replacementCostCents: [K(1200), K(3500)],
    notes: 'Sealed-system failures after year 10 usually cost more to fix than the unit is worth.',
  },
  {
    id: 'appliance.dishwasher',
    category: 'appliance',
    label: 'Dishwasher',
    match: ['dishwasher'],
    typicalYears: 10,
    rangeYears: [7, 14],
    replacementCostCents: [K(700), K(1800)],
    notes: 'Supply-line and door-seal leaks cause more damage than the appliance is worth — worth catching early.',
  },
  {
    id: 'appliance.range',
    category: 'appliance',
    label: 'Range / oven',
    match: ['range', 'oven', 'cooktop', 'stove'],
    typicalYears: 15,
    rangeYears: [10, 20],
    replacementCostCents: [K(900), K(2800)],
    notes: 'Gas ranges outlast electric; induction cooktops are the newest and least established.',
  },
  {
    id: 'appliance.washer',
    category: 'appliance',
    label: 'Clothes washer',
    match: ['washer', 'washing machine'],
    typicalYears: 11,
    rangeYears: [8, 15],
    replacementCostCents: [K(800), K(1800)],
    notes: 'Burst supply hoses are one of the most common large water-damage claims. Braided hoses are a $20 fix.',
  },
  {
    id: 'appliance.dryer',
    category: 'appliance',
    label: 'Clothes dryer',
    match: ['dryer'],
    typicalYears: 13,
    rangeYears: [9, 18],
    replacementCostCents: [K(700), K(1600)],
    notes: 'Lint accumulation in the vent is a fire hazard and the main reason dryers underperform.',
  },
  {
    id: 'appliance.microwave',
    category: 'appliance',
    label: 'Microwave',
    match: ['microwave'],
    typicalYears: 9,
    rangeYears: [6, 12],
    replacementCostCents: [K(300), K(900)],
    notes: 'Over-the-range units also serve as the kitchen exhaust and fail sooner from grease.',
  },
  {
    id: 'appliance.disposal',
    category: 'appliance',
    label: 'Garbage disposal',
    match: ['disposal', 'garbage disposal'],
    typicalYears: 10,
    rangeYears: [7, 14],
    replacementCostCents: [K(200), K(600)],
    notes: 'A leak at the flange or body means replacement, not repair.',
  },

  /* ----------------------------- Windows ---------------------------- */
  {
    id: 'windows.vinyl',
    category: 'windows',
    label: 'Vinyl windows',
    match: ['vinyl window', 'vinyl'],
    typicalYears: 25,
    rangeYears: [20, 35],
    replacementCostCents: [K(9000), K(20000)],
    scalesWithArea: true,
    notes: 'Seal failure (fogging between panes) usually shows up before the frame gives out.',
  },
  {
    id: 'windows.wood',
    category: 'windows',
    label: 'Wood windows',
    match: ['wood window', 'window'],
    typicalYears: 30,
    rangeYears: [20, 60],
    replacementCostCents: [K(12000), K(28000)],
    scalesWithArea: true,
    climatePenalty: { coastal: 0.8, humid_subtropical: 0.85 },
    notes: 'Maintained wood windows can last a century; unmaintained ones rot at the sill in 20 years.',
  },

  /* ---------------------------- Exterior ---------------------------- */
  {
    id: 'exterior.paint',
    category: 'exterior',
    label: 'Exterior paint',
    match: ['paint', 'exterior paint'],
    typicalYears: 8,
    rangeYears: [5, 12],
    replacementCostCents: [K(4000), K(10000)],
    scalesWithArea: true,
    climatePenalty: { coastal: 0.7, humid_subtropical: 0.8, arid: 0.85 },
    notes: 'Sun exposure and moisture drive repaint intervals more than paint quality does.',
  },
  {
    id: 'exterior.siding',
    category: 'exterior',
    label: 'Siding',
    match: ['siding', 'hardie', 'fiber cement', 'stucco'],
    typicalYears: 35,
    rangeYears: [25, 60],
    replacementCostCents: [K(12000), K(30000)],
    scalesWithArea: true,
    notes: 'Fiber cement and brick outlast vinyl; the caulk joints need attention long before the siding does.',
  },
  {
    id: 'exterior.deck',
    category: 'exterior',
    label: 'Deck',
    match: ['deck'],
    typicalYears: 15,
    rangeYears: [10, 25],
    replacementCostCents: [K(6000), K(18000)],
    climatePenalty: { coastal: 0.8, humid_subtropical: 0.85 },
    notes: 'Ledger-board attachment and post bases fail before the decking surface does — and that failure is a safety issue.',
  },
  {
    id: 'exterior.garage_door',
    category: 'exterior',
    label: 'Garage door',
    match: ['garage door opener', 'opener'],
    typicalYears: 12,
    rangeYears: [8, 18],
    replacementCostCents: [K(400), K(1000)],
    notes: 'Openers made before 1993 lack photo-eye reversal and should be replaced regardless of condition.',
  },
  {
    id: 'exterior.gutters',
    category: 'exterior',
    label: 'Gutters',
    match: ['gutter', 'downspout'],
    typicalYears: 25,
    rangeYears: [18, 40],
    replacementCostCents: [K(1500), K(4000)],
    scalesWithArea: true,
    notes: 'Failed gutters route water to the foundation, so the downstream cost far exceeds the gutter itself.',
  },

  /* ---------------------------- Flooring ---------------------------- */
  {
    id: 'flooring.carpet',
    category: 'flooring',
    label: 'Carpet',
    match: ['carpet'],
    typicalYears: 8,
    rangeYears: [5, 15],
    replacementCostCents: [K(2500), K(7000)],
    scalesWithArea: true,
    notes: 'Traffic pattern wear, not age, is what ends a carpet.',
  },
  {
    id: 'flooring.lvp',
    category: 'flooring',
    label: 'Luxury vinyl plank',
    match: ['lvp', 'luxury vinyl', 'vinyl plank', 'laminate'],
    typicalYears: 20,
    rangeYears: [15, 30],
    replacementCostCents: [K(4000), K(10000)],
    scalesWithArea: true,
    notes: 'Wear layer thickness is the main predictor; commercial-grade wear layers last far longer.',
  },
  {
    id: 'flooring.hardwood',
    category: 'flooring',
    label: 'Hardwood flooring',
    match: ['hardwood', 'wood floor', 'oak'],
    typicalYears: 60,
    rangeYears: [40, 100],
    replacementCostCents: [K(8000), K(20000)],
    scalesWithArea: true,
    notes: 'Solid hardwood is refinished rather than replaced, roughly every 10–15 years.',
  },
  {
    id: 'flooring.tile',
    category: 'flooring',
    label: 'Tile flooring',
    match: ['tile floor', 'ceramic', 'porcelain'],
    typicalYears: 50,
    rangeYears: [30, 90],
    replacementCostCents: [K(6000), K(15000)],
    scalesWithArea: true,
    notes: 'Grout is the maintenance item; the tile itself effectively does not wear out.',
  },

  /* ----------------------------- Safety ----------------------------- */
  {
    id: 'safety.smoke_detector',
    category: 'safety',
    label: 'Smoke detector',
    match: ['smoke detector', 'smoke alarm'],
    typicalYears: 10,
    rangeYears: [10, 10],
    replacementCostCents: [K(150), K(450)],
    notes: 'A hard 10-year replacement interval from the date of manufacture — the sensor degrades whether or not it has ever alarmed.',
  },
  {
    id: 'safety.co_detector',
    category: 'safety',
    label: 'Carbon monoxide detector',
    match: ['carbon monoxide', 'co detector', 'co alarm'],
    typicalYears: 7,
    rangeYears: [5, 10],
    replacementCostCents: [K(100), K(300)],
    notes: 'Electrochemical sensors have a stated end-of-life, typically 7 years, printed on the unit.',
  },
  {
    id: 'safety.extinguisher',
    category: 'safety',
    label: 'Fire extinguisher',
    match: ['extinguisher'],
    typicalYears: 12,
    rangeYears: [10, 12],
    replacementCostCents: [K(40), K(120)],
    notes: 'Disposable units are replaced at 12 years; rechargeable units are serviced at 6.',
  },
];

const AREA_BASELINE_SQFT = 2000;

function areaMultiplier(home: Home): number {
  if (!home.squareFeet || home.squareFeet <= 0) return 1;
  const raw = home.squareFeet / AREA_BASELINE_SQFT;
  // Costs scale sub-linearly — a 4,000 sq ft roof is not twice the price per square.
  const scaled = Math.pow(raw, 0.85);
  return Math.min(2.2, Math.max(0.55, scaled));
}

/**
 * Finds the catalog entry for a component. Matching is most-specific-first: entries
 * are declared in that order within a category, so 'heat pump water heater' resolves
 * before the generic 'water heater'.
 */
export function findLifespan(
  category: ComponentCategory,
  typeText: string,
): LifespanEntry | undefined {
  const haystack = typeText.toLowerCase();
  const inCategory = LIFESPAN_CATALOG.filter((e) => e.category === category);
  for (const entry of inCategory) {
    if (entry.match.some((m) => haystack.includes(m))) return entry;
  }
  // Fall back to the least specific entry in the category, if there is one.
  return inCategory[inCategory.length - 1];
}

/** Expected life in years, adjusted for the home's climate. */
export function expectedLifeYears(entry: LifespanEntry, home: Home): number {
  const penalty = entry.climatePenalty?.[home.climate] ?? 1;
  return Math.round(entry.typicalYears * penalty * 10) / 10;
}

/** Replacement cost range in cents, adjusted for home size where the cost scales with area. */
export function replacementCostRange(entry: LifespanEntry, home: Home): [Cents, Cents] {
  const mult = entry.scalesWithArea ? areaMultiplier(home) : 1;
  const [low, high] = entry.replacementCostCents;
  return [Math.round(low * mult), Math.round(high * mult)];
}

/** Midpoint of the adjusted replacement range — the single number the forecast uses. */
export function replacementCostMidpoint(entry: LifespanEntry, home: Home): Cents {
  const [low, high] = replacementCostRange(entry, home);
  return Math.round((low + high) / 2);
}

/** Returns the catalog's warning when a component's text matches a known-defective material. */
export function materialWarning(entry: LifespanEntry, typeText: string): string | undefined {
  if (!entry.warnIf) return undefined;
  return new RegExp(entry.warnIf, 'i').test(typeText) ? entry.notes : undefined;
}
