import type { Cents, MaintenanceTemplate } from '../types';

const K = (dollars: number): Cents => dollars * 100;

/**
 * The maintenance library.
 *
 * A template becomes a real task only when the home actually has the equipment it
 * applies to (or `wholeHome` is set). Each one carries both paths the product
 * promises: enough DIY detail to actually do the job, and a realistic price range
 * for handing it to someone else.
 *
 * Where a job is genuinely unsafe for an untrained person, `diy.proOnlyReason` is
 * set and the app does not offer step-by-step instructions for it.
 */
export const MAINTENANCE_TEMPLATES: MaintenanceTemplate[] = [
  /* ------------------------------ HVAC ------------------------------ */
  {
    id: 'hvac.filter',
    title: 'Replace HVAC filter',
    appliesTo: ['hvac'],
    anchorType: 'furnace|air handler|mini split|mini-split|ductless',
    intervalMonths: 3,
    criticality: 'high',
    why: 'A loaded filter starves the blower, which raises energy use and is the single most common cause of a frozen coil and an emergency service call.',
    diy: {
      difficulty: 'easy',
      estimatedMinutes: 10,
      materials: ['Replacement filter in the size printed on the old filter'],
      tools: [],
      steps: [
        { text: 'Turn the system off at the thermostat before opening the filter compartment.' },
        { text: 'Slide the old filter out and note the size and the airflow arrow printed on its frame.' },
        { text: 'Insert the new filter with the airflow arrow pointing toward the blower — backwards filters bypass air around the media.' },
        { text: 'Close the compartment, turn the system back on, and log the date here so the next reminder is accurate.' },
      ],
    },
    hireCostRangeCents: [K(20), K(60)],
  },
  {
    id: 'hvac.service_cooling',
    title: 'HVAC service — cooling season',
    appliesTo: ['hvac'],
    anchorType: 'condenser|heat pump|mini split|mini-split|ductless|air condition',
    intervalMonths: 12,
    seasonalMonths: [3, 4],
    criticality: 'high',
    why: 'Spring service catches low refrigerant, a failing capacitor, and a clogged condensate drain before the first hot week, which is when technicians are least available.',
    diy: {
      difficulty: 'moderate',
      estimatedMinutes: 60,
      materials: ['Coil cleaner', 'Distilled vinegar for the condensate line'],
      tools: ['Garden hose', 'Fin comb', 'Shop vacuum'],
      steps: [
        { text: 'Cut power at the outdoor disconnect before touching the condenser.', caution: 'Capacitors hold a charge after the power is off. Do not open the electrical compartment.' },
        { text: 'Clear leaves and growth back at least two feet from the condenser on all sides.' },
        { text: 'Rinse the outdoor coil from the inside out with a garden hose — never a pressure washer, which bends the fins closed.' },
        { text: 'Flush the condensate drain line with a cup of distilled vinegar, or pull the clog with a shop vacuum at the outdoor termination.' },
        { text: 'Restore power and confirm cold air at the registers.' },
      ],
      proOnlyReason: 'Refrigerant charge, capacitor testing, and electrical diagnostics require an EPA-certified technician. The cleaning steps above are the homeowner-safe portion.',
    },
    hireCostRangeCents: [K(120), K(250)],
  },
  {
    id: 'hvac.service_heating',
    title: 'HVAC service — heating season',
    appliesTo: ['hvac'],
    anchorType: 'furnace|boiler|heat pump|mini split|mini-split',
    intervalMonths: 12,
    seasonalMonths: [9, 10],
    criticality: 'safety',
    why: 'A combustion inspection checks the heat exchanger for cracks. This is the maintenance item with a carbon monoxide consequence attached, which is why it is treated as a safety task rather than a comfort one.',
    diy: {
      difficulty: 'advanced',
      estimatedMinutes: 0,
      materials: [],
      tools: [],
      steps: [],
      proOnlyReason: 'Heat exchanger inspection and combustion analysis need a combustion analyzer and a licensed technician. There is no safe homeowner substitute for this one.',
    },
    hireCostRangeCents: [K(130), K(280)],
  },
  {
    id: 'hvac.condensate',
    title: 'Flush the AC condensate drain',
    appliesTo: ['hvac'],
    anchorType: 'furnace|air handler|mini split|mini-split|ductless',
    intervalMonths: 6,
    seasonalMonths: [5, 11],
    criticality: 'medium',
    why: 'A blocked condensate line backs water up into the air handler, and a pan overflow inside a ceiling is one of the more expensive small failures in a house.',
    diy: {
      difficulty: 'easy',
      estimatedMinutes: 20,
      materials: ['Distilled white vinegar'],
      tools: ['Shop vacuum', 'Funnel'],
      steps: [
        { text: 'Find the access tee on the drain line near the air handler and remove the cap.' },
        { text: 'Pour a cup of distilled vinegar into the line and let it sit 30 minutes.' },
        { text: 'If water still backs up, seal a shop vacuum to the outdoor drain termination and pull the clog out.' },
        { text: 'Replace the cap and confirm the line drains freely.' },
      ],
    },
    hireCostRangeCents: [K(90), K(200)],
  },

  /* -------------------------- Water heater -------------------------- */
  {
    id: 'water_heater.flush',
    title: 'Flush the water heater',
    appliesTo: ['water_heater'],
    typeMatch: 'tank',
    intervalMonths: 12,
    criticality: 'medium',
    why: 'Sediment settling on the tank bottom insulates the burner from the water, which wastes fuel and overheats the steel. Annual flushing is the difference between a 9-year tank and a 15-year one.',
    diy: {
      difficulty: 'moderate',
      estimatedMinutes: 60,
      materials: [],
      tools: ['Garden hose', 'Flathead screwdriver'],
      steps: [
        { text: 'Switch a gas heater to "pilot", or turn the breaker off for an electric one.', caution: 'Never drain an electric tank with the elements powered — they burn out within seconds when dry.' },
        { text: 'Close the cold water supply valve at the top of the tank.' },
        { text: 'Attach a hose to the drain valve and run it to a floor drain or outside.' },
        { text: 'Open the drain valve and a hot tap upstairs to break the vacuum. Let it run until the water is clear.' },
        { text: 'Close the drain, reopen the supply, and let the tank refill fully before restoring heat.' },
      ],
    },
    hireCostRangeCents: [K(120), K(250)],
  },
  {
    id: 'water_heater.anode',
    title: 'Inspect the anode rod',
    appliesTo: ['water_heater'],
    typeMatch: 'tank',
    intervalMonths: 36,
    criticality: 'medium',
    why: 'The anode rod corrodes so the tank does not. Once it is consumed, the tank starts rusting from the inside and the clock to a leak is short. A $40 rod routinely buys five extra years.',
    diy: {
      difficulty: 'moderate',
      estimatedMinutes: 45,
      materials: ['Replacement anode rod matched to the tank', 'Thread sealant tape'],
      tools: ['1 1/16" socket', 'Breaker bar'],
      steps: [
        { text: 'Shut off power or gas and the cold water supply, then drain a few gallons from the tank.' },
        { text: 'Break the anode rod hex loose from the top of the tank — it is usually very tight.' },
        { text: 'If more than about 6 inches of bare core wire is exposed, replace the rod.' },
        { text: 'Wrap the new rod threads with sealant tape, install, refill, and check for leaks before restoring heat.' },
      ],
    },
    hireCostRangeCents: [K(150), K(350)],
  },
  {
    id: 'water_heater.tankless_descale',
    title: 'Descale the tankless water heater',
    appliesTo: ['water_heater'],
    typeMatch: 'tankless',
    intervalMonths: 12,
    criticality: 'medium',
    why: 'Scale on the heat exchanger is the main cause of reduced flow and error codes on tankless units, and most manufacturers require annual descaling to keep the warranty valid.',
    diy: {
      difficulty: 'moderate',
      estimatedMinutes: 90,
      materials: ['4 gallons of white vinegar'],
      tools: ['Submersible pump', 'Two washing machine hoses', 'Bucket'],
      steps: [
        { text: 'Shut off gas and the hot and cold isolation valves at the unit.' },
        { text: 'Connect hoses to the service ports and circulate vinegar through the exchanger with the pump for 45–60 minutes.' },
        { text: 'Flush with clean water, clean the inlet screen filter, and restore the valves and gas.' },
      ],
    },
    hireCostRangeCents: [K(180), K(400)],
  },

  /* ---------------------------- Appliances -------------------------- */
  {
    id: 'appliance.dryer_vent',
    title: 'Clean the dryer vent',
    appliesTo: ['appliance'],
    typeMatch: 'dryer',
    intervalMonths: 12,
    criticality: 'safety',
    why: 'Lint in the duct is a leading cause of household fires, and a restricted vent roughly doubles drying time and the energy that goes with it.',
    diy: {
      difficulty: 'easy',
      estimatedMinutes: 45,
      materials: ['Foil tape if the duct is reconnected'],
      tools: ['Dryer vent brush kit', 'Shop vacuum', 'Screwdriver'],
      steps: [
        { text: 'Unplug the dryer, or shut off the gas and unplug it for a gas unit.' },
        { text: 'Pull the dryer forward and disconnect the duct from the back.' },
        { text: 'Run the brush through the full duct run from both the dryer end and the exterior hood.' },
        { text: 'Vacuum the lint trap housing and the floor behind the dryer.' },
        { text: 'Reconnect with foil tape — never sheet metal screws, which snag lint — and confirm the exterior damper opens when the dryer runs.' },
      ],
    },
    hireCostRangeCents: [K(120), K(250)],
  },
  {
    id: 'appliance.washer_hoses',
    title: 'Inspect washing machine hoses',
    appliesTo: ['appliance'],
    typeMatch: 'washer',
    intervalMonths: 12,
    criticality: 'high',
    why: 'A burst supply hose delivers several hundred gallons an hour into the house. It is one of the largest common insurance claims and one of the cheapest to prevent.',
    diy: {
      difficulty: 'easy',
      estimatedMinutes: 20,
      materials: ['Braided stainless steel hoses if replacing'],
      tools: ['Adjustable wrench'],
      steps: [
        { text: 'Pull the washer out and look at both hoses for bulges, rust at the crimp, or cracking.' },
        { text: 'Replace any rubber hose older than five years with braided stainless — they are about $20 for the pair.' },
        { text: 'Hand-tighten plus a quarter turn, then run a cycle and check the connections for weeping.' },
      ],
    },
    hireCostRangeCents: [K(90), K(200)],
  },
  {
    id: 'appliance.fridge_coils',
    title: 'Clean the refrigerator condenser coils',
    appliesTo: ['appliance'],
    typeMatch: 'refrigerator',
    intervalMonths: 12,
    criticality: 'low',
    why: 'Dust-blanketed coils make the compressor run longer and hotter, which is what actually kills refrigerators.',
    diy: {
      difficulty: 'easy',
      estimatedMinutes: 20,
      materials: [],
      tools: ['Coil brush', 'Vacuum with crevice tool'],
      steps: [
        { text: 'Unplug the refrigerator.' },
        { text: 'Find the coils behind the toe kick or on the back panel and brush the dust loose.' },
        { text: 'Vacuum the debris, including the condenser fan blade, and plug the unit back in.' },
      ],
    },
    hireCostRangeCents: [K(80), K(160)],
  },
  {
    id: 'appliance.dishwasher_filter',
    title: 'Clean the dishwasher filter',
    appliesTo: ['appliance'],
    typeMatch: 'dishwasher',
    intervalMonths: 3,
    criticality: 'low',
    why: 'Nearly every dishwasher built in the last decade has a manual filter. A clogged one is the cause of most "it stopped cleaning well" complaints.',
    diy: {
      difficulty: 'easy',
      estimatedMinutes: 10,
      materials: [],
      tools: ['Dish soap', 'Soft brush'],
      steps: [
        { text: 'Pull the lower rack and twist the cylindrical filter counter-clockwise to release it.' },
        { text: 'Rinse it under hot water and scrub the mesh with a soft brush and dish soap.' },
        { text: 'Wipe the sump area, then seat the filter and lock it back into place.' },
      ],
    },
    hireCostRangeCents: [K(80), K(160)],
  },

  /* ------------------------------ Roof ------------------------------ */
  {
    id: 'roof.inspection',
    title: 'Inspect the roof',
    appliesTo: ['roof'],
    intervalMonths: 12,
    seasonalMonths: [10, 11],
    criticality: 'high',
    why: 'Lifted shingles, failed pipe boots, and cracked flashing sealant are cheap to fix and expensive to ignore. Pipe boots in particular fail well before the shingles do.',
    diy: {
      difficulty: 'moderate',
      estimatedMinutes: 40,
      materials: [],
      tools: ['Binoculars', 'Flashlight'],
      steps: [
        { text: 'Inspect from the ground with binoculars — do not walk the roof.', caution: 'Falls from roofs are among the most serious homeowner injuries. Hire someone rather than climbing.' },
        { text: 'Look for missing, curled, or lifted shingles, especially on the south-facing slope.' },
        { text: 'Check the rubber boots around plumbing vents for cracking — these commonly fail around year 10.' },
        { text: 'From inside, check the attic with a flashlight for daylight, staining, or damp insulation.' },
      ],
    },
    hireCostRangeCents: [K(150), K(400)],
  },
  {
    id: 'roof.gutters',
    title: 'Clean the gutters',
    appliesTo: ['roof', 'exterior'],
    anchorType: 'roof|gutter',
    intervalMonths: 6,
    seasonalMonths: [4, 11],
    criticality: 'medium',
    why: 'Overflowing gutters dump water at the foundation. Nearly every wet-basement and foundation-settlement problem starts as a drainage problem.',
    diy: {
      difficulty: 'moderate',
      estimatedMinutes: 90,
      materials: [],
      tools: ['Ladder', 'Gloves', 'Garden hose', 'Gutter scoop'],
      steps: [
        { text: 'Set the ladder on firm level ground and have someone foot it.', caution: 'Never lean the ladder against the gutter itself.' },
        { text: 'Scoop debris from the trough, working toward the downspout.' },
        { text: 'Flush with a hose and confirm every downspout runs clear.' },
        { text: 'Check that downspout extensions carry water at least four feet from the foundation.' },
      ],
    },
    hireCostRangeCents: [K(120), K(300)],
  },

  /* ---------------------------- Exterior ---------------------------- */
  {
    id: 'exterior.caulking',
    title: 'Inspect exterior caulking',
    appliesTo: ['exterior', 'windows'],
    anchorType: 'window|siding|paint',
    intervalMonths: 12,
    seasonalMonths: [9],
    criticality: 'medium',
    why: 'Failed caulk at window and door trim is how water gets behind siding. The repair is a $10 tube; the consequence is rotted sheathing.',
    diy: {
      difficulty: 'easy',
      estimatedMinutes: 120,
      materials: ['Exterior-grade polyurethane or siliconized acrylic sealant'],
      tools: ['Caulk gun', 'Utility knife', 'Putty knife'],
      steps: [
        { text: 'Walk the exterior and check joints at window trim, door trim, corner boards, and any penetration through the wall.' },
        { text: 'Cut out any caulk that has separated, cracked, or pulled away from one side of the joint.' },
        { text: 'Clean and dry the joint, then lay a continuous bead and tool it so it makes contact with both faces.' },
        { text: 'Leave weep holes at the bottom of window frames open — sealing them traps water inside the assembly.' },
      ],
    },
    hireCostRangeCents: [K(250), K(700)],
  },
  {
    id: 'exterior.grading',
    title: 'Check drainage and grading',
    appliesTo: ['exterior', 'structure'],
    intervalMonths: 12,
    seasonalMonths: [3],
    criticality: 'medium',
    wholeHome: true,
    why: 'Soil should fall away from the house about six inches over the first ten feet. Settled soil against the foundation is the root cause of most water intrusion.',
    diy: {
      difficulty: 'easy',
      estimatedMinutes: 45,
      materials: ['Fill soil if needed'],
      tools: ['Shovel', 'Level'],
      steps: [
        { text: 'Walk the perimeter after a heavy rain and look for standing water within ten feet of the foundation.' },
        { text: 'Look for soil that has settled into a trough along the wall and add fill to restore the slope away from the house.' },
        { text: 'Confirm downspouts discharge past the backfill zone, not right at the wall.' },
      ],
    },
    hireCostRangeCents: [K(300), K(1200)],
  },
  {
    id: 'exterior.garage_door_safety',
    title: 'Test the garage door safety reverse',
    appliesTo: ['exterior'],
    typeMatch: 'garage',
    intervalMonths: 6,
    criticality: 'safety',
    why: 'The photo-eye and the down-force reversal are the two systems that stop a garage door closing on a person. Both fail silently.',
    diy: {
      difficulty: 'easy',
      estimatedMinutes: 15,
      materials: ['Garage door lubricant (not WD-40)'],
      tools: [],
      steps: [
        { text: 'Lay a 2x4 flat on the floor in the door path and close the door — it must reverse on contact.' },
        { text: 'With the door closing, break the photo-eye beam with a broom handle. It must reverse immediately.' },
        { text: 'Lubricate the rollers, hinges, and springs with a garage-door-rated lubricant.', caution: 'Never adjust or attempt to release torsion springs. They store enough energy to be lethal.' },
      ],
    },
    hireCostRangeCents: [K(100), K(220)],
  },

  /* ----------------------------- Safety ----------------------------- */
  {
    id: 'safety.detectors',
    title: 'Test smoke and CO detectors',
    appliesTo: ['safety'],
    intervalMonths: 6,
    seasonalMonths: [3, 9],
    criticality: 'safety',
    wholeHome: true,
    why: 'Detectors fail silently. Testing takes a minute per unit, and both smoke and CO sensors also have a hard expiry printed on the back of the unit.',
    diy: {
      difficulty: 'easy',
      estimatedMinutes: 20,
      materials: ['9V or AA batteries as required'],
      tools: ['Step ladder'],
      steps: [
        { text: 'Press and hold the test button on each unit until it sounds.' },
        { text: 'Replace batteries in any unit that chirps or sounds weak.' },
        { text: 'Check the manufacture date printed on the back — replace smoke alarms at 10 years and CO alarms at their stated end of life, usually 7.' },
        { text: 'Confirm there is an alarm on every level, inside every bedroom, and outside each sleeping area.' },
      ],
    },
    hireCostRangeCents: [K(80), K(200)],
  },
  {
    id: 'safety.gfci',
    title: 'Test GFCI outlets',
    appliesTo: ['electrical'],
    intervalMonths: 6,
    criticality: 'safety',
    wholeHome: true,
    why: 'GFCI devices protect against electrocution in wet locations and do wear out. The manufacturers specify monthly testing; twice a year is the realistic floor.',
    diy: {
      difficulty: 'easy',
      estimatedMinutes: 15,
      materials: [],
      tools: [],
      steps: [
        { text: 'Press TEST on each GFCI outlet — kitchen, bathrooms, garage, exterior, and any near a sink.' },
        { text: 'Confirm power to the outlet actually cuts, then press RESET.' },
        { text: 'Replace any device that will not trip or will not reset. A GFCI that fails to trip offers no protection.' },
      ],
    },
    hireCostRangeCents: [K(120), K(300)],
  },

  /* ---------------------------- Plumbing ---------------------------- */
  {
    id: 'plumbing.shutoff',
    title: 'Exercise the main water shutoff',
    appliesTo: ['plumbing'],
    intervalMonths: 12,
    criticality: 'high',
    wholeHome: true,
    why: 'A valve that has not moved in years seizes. The moment you need it — a burst pipe at 2am — is the wrong moment to find that out.',
    diy: {
      difficulty: 'easy',
      estimatedMinutes: 15,
      materials: [],
      tools: [],
      steps: [
        { text: 'Locate the main shutoff and make sure everyone in the house knows where it is.' },
        { text: 'Close it fully, confirm the taps run dry, then reopen it fully and back off a quarter turn.' },
        { text: 'If the valve is stiff, weeping, or will not fully close, have it replaced now rather than during an emergency.' },
      ],
    },
    hireCostRangeCents: [K(150), K(450)],
  },
  {
    id: 'plumbing.sump_test',
    title: 'Test the sump pump',
    appliesTo: ['plumbing'],
    typeMatch: 'sump',
    intervalMonths: 6,
    seasonalMonths: [3, 9],
    criticality: 'high',
    why: 'A sump pump that has sat idle through a dry season may not start when the water arrives.',
    diy: {
      difficulty: 'easy',
      estimatedMinutes: 15,
      materials: [],
      tools: ['Bucket'],
      steps: [
        { text: 'Pour water into the pit until the float lifts and the pump starts.' },
        { text: 'Confirm the pump moves water and shuts off on its own when the float drops.' },
        { text: 'Check that the discharge line is clear and terminates away from the foundation.' },
        { text: 'If the house depends on the pump, consider a battery backup — power failures and heavy rain arrive together.' },
      ],
    },
    hireCostRangeCents: [K(120), K(280)],
  },
  {
    id: 'plumbing.septic_pump',
    title: 'Pump the septic tank',
    appliesTo: ['plumbing'],
    typeMatch: 'septic',
    intervalMonths: 36,
    criticality: 'high',
    why: 'Solids that carry over into the drainfield destroy it. Pumping costs a few hundred dollars; a drainfield replacement runs into five figures.',
    diy: {
      difficulty: 'advanced',
      estimatedMinutes: 0,
      materials: [],
      tools: [],
      steps: [],
      proOnlyReason: 'Requires a licensed septic hauler and permitted disposal. Tank gases are lethal and the lids are a confined-space hazard.',
    },
    hireCostRangeCents: [K(350), K(700)],
  },
  {
    id: 'plumbing.softener_salt',
    title: 'Check the water softener salt',
    appliesTo: ['plumbing'],
    typeMatch: 'softener',
    intervalMonths: 3,
    criticality: 'low',
    why: 'An empty brine tank means the softener silently stops working, and the hardness goes straight back into the water heater and fixtures.',
    diy: {
      difficulty: 'easy',
      estimatedMinutes: 15,
      materials: ['Softener salt'],
      tools: [],
      steps: [
        { text: 'Open the brine tank and keep the salt at least a third full and above the water line.' },
        { text: 'Break up any crust that has bridged across the tank — it looks full while the water below it is untouched.' },
      ],
    },
    hireCostRangeCents: [K(60), K(150)],
  },

  /* ---------------------------- Whole home -------------------------- */
  {
    id: 'home.hvac_seasonal_reversal',
    title: 'Seasonal walkthrough',
    appliesTo: ['structure'],
    intervalMonths: 6,
    seasonalMonths: [4, 10],
    criticality: 'low',
    wholeHome: true,
    why: 'Twenty minutes twice a year catches the small things — a running toilet, a dripping valve, a stained ceiling — while they are still small.',
    diy: {
      difficulty: 'easy',
      estimatedMinutes: 30,
      materials: [],
      tools: ['Flashlight'],
      steps: [
        { text: 'Check under every sink and around every toilet for damp cabinet bottoms or corrosion on the supply valves.' },
        { text: 'Look at ceilings and the top of walls for new staining, particularly below bathrooms and around the chimney.' },
        { text: 'Open and close every window and door and check that weatherstripping still seals.' },
        { text: 'Read the water meter with everything off — a moving dial means a hidden leak.' },
      ],
    },
    hireCostRangeCents: [K(200), K(500)],
  },
];

export function findTemplate(id: string): MaintenanceTemplate | undefined {
  return MAINTENANCE_TEMPLATES.find((t) => t.id === id);
}

/** Midpoint of the contractor price range — what the forecast charges for recurring work. */
export function hireCostMidpoint(template: MaintenanceTemplate): Cents {
  const [low, high] = template.hireCostRangeCents;
  return Math.round((low + high) / 2);
}

/** Rough materials cost for doing it yourself. Used to show the DIY-vs-hire delta. */
export function diyMaterialsCostCents(template: MaintenanceTemplate): Cents {
  // Materials lists are short and cheap by construction; this is a deliberate
  // order-of-magnitude figure rather than a priced bill of materials.
  return template.diy.materials.length * K(18);
}
