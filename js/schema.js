/*
 * schema.js — the inspection workflow definition.
 *
 * The whole app is driven by this file. Steps render generically, so adding a
 * question, a photo requirement or a whole new step means editing data here,
 * not touching the renderer.
 *
 * Field types:
 *   text | textarea | number | date | time | select | radio | photos |
 *   checklist | repeater | signature | note
 */

const SCHEMA = {
  version: 1,
  title: 'Tank Car / Tanker Inspection Report',

  steps: [
    /* ------------------------------------------------------------------ 1 */
    {
      id: 'setup',
      title: 'Inspection Details',
      short: 'Details',
      icon: '📋',
      intro:
        'Identify the equipment and the job before you touch anything. Everything ' +
        'downstream is filed against the numbers you enter here.',
      guidance: [
        'Read the reporting mark off the car itself, not off the paperwork — mismatches between the bill of lading and the stencil are one of the most common findings.',
        'The specification plate is usually stamped on the tank head or on a plate near the manway. Photograph it in the Markings step.',
        'If you are inspecting a highway tanker or ISO tank, use the same flow — the fitting names differ but the sequence does not.'
      ],
      fields: [
        {
          key: 'inspectionType', type: 'select', label: 'Type of inspection', required: true,
          options: [
            'Pre-load (empty / clean verification)',
            'Post-load (outbound, loaded)',
            'Pre-unload (inbound receipt)',
            'Post-unload (residue / empty release)',
            'In-transit or spot check',
            'Post-cleaning certification',
            'Damage / incident investigation'
          ]
        },
        {
          key: 'equipmentType', type: 'select', label: 'Equipment type', required: true,
          options: ['Rail tank car', 'Highway tank trailer', 'ISO tank container', 'Covered hopper railcar', 'Other']
        },
        { key: 'reportingMark', type: 'text', label: 'Reporting mark & number', placeholder: 'e.g. GATX 123456', required: true,
          help: 'Owner initials plus car number, exactly as stencilled on the car.' },
        { key: 'specPlate', type: 'text', label: 'Tank specification', placeholder: 'e.g. DOT-117J100W / TC-117R',
          help: 'From the spec plate or tank stencil.' },
        { key: 'commodity', type: 'text', label: 'Commodity / product', placeholder: 'e.g. Sodium hydroxide solution', required: true },
        { key: 'unNumber', type: 'text', label: 'UN / NA number', placeholder: 'e.g. UN1824' },
        { key: 'previousLading', type: 'text', label: 'Previous lading (if known)',
          help: 'Critical for compatibility and residue questions on a pre-load inspection.' },
        { key: 'billOfLading', type: 'text', label: 'BOL / work order number' },
        { key: 'facility', type: 'text', label: 'Facility / location', required: true },
        { key: 'trackSpot', type: 'text', label: 'Track & spot', placeholder: 'e.g. Track 4, spot 12' },
        { key: 'inspector', type: 'text', label: 'Inspector name', required: true },
        { key: 'inspectorId', type: 'text', label: 'Inspector ID / company' },
        { key: 'date', type: 'date', label: 'Date', required: true, default: 'today' },
        { key: 'startTime', type: 'time', label: 'Start time', default: 'now' },
        { key: 'weather', type: 'text', label: 'Weather / ambient temp', placeholder: 'e.g. Clear, 41°F, light wind' }
      ]
    },

    /* ------------------------------------------------------------------ 2 */
    {
      id: 'safety',
      title: 'Safety & Access',
      short: 'Safety',
      icon: '🦺',
      intro:
        'Prove the car is protected and the atmosphere is safe before you climb. ' +
        'Photograph the protection in place — it is the part of the record that ' +
        'matters most if something goes wrong.',
      notes: [
        { tone: 'warn', text: 'Never climb on or open a car that is not protected by blue flag / derail (rail) or chocked and braked (highway). If protection is missing, stop and get it applied before continuing.' }
      ],
      guidance: [
        'Blue flag or blue light must be applied at the point of access to the track, and only the person who applied it may remove it.',
        'Confirm the derail is lined and locked between the car and the approach end of the track.',
        'For highway tankers: wheels chocked, parking brake set, keys controlled, and the unit bonded/grounded before opening any fitting.',
        'Test the atmosphere at the hatch before opening if the previous lading was flammable or toxic. Record the reading.'
      ],
      fields: [
        {
          key: 'protection', type: 'checklist', label: 'Protection & isolation',
          items: [
            { key: 'blueFlag', label: 'Blue flag / blue light applied and locked', help: 'Rail only. Applied by you or by an identified person.' },
            { key: 'derail', label: 'Derail in place, lined and locked' },
            { key: 'chocks', label: 'Wheel chocks / brakes applied' },
            { key: 'handbrake', label: 'Hand brake set' },
            { key: 'grounding', label: 'Grounding / bonding connected' },
            { key: 'loto', label: 'Loading arms disconnected, lines isolated (LOTO)' },
            { key: 'fallProtection', label: 'Fall protection — cage, gangway or harness with anchor' },
            { key: 'ppe', label: 'PPE correct for the commodity (SDS reviewed)' },
            { key: 'eyewash', label: 'Emergency eyewash / shower accessible' }
          ]
        },
        { key: 'gasTest', type: 'text', label: 'Atmospheric reading at hatch', placeholder: 'e.g. O₂ 20.9%, LEL 0%, H₂S 0 ppm' },
        {
          key: 'photos', type: 'photos', label: 'Protection photos', min: 1, max: 8,
          shots: ['Blue flag / blue light at track entry', 'Derail applied and locked', 'Wheel chocks and hand brake', 'Grounding cable connected', 'Gas meter display showing reading']
        },
        { key: 'notes', type: 'textarea', label: 'Safety notes', rows: 3 }
      ]
    },

    /* ------------------------------------------------------------------ 3 */
    {
      id: 'exterior',
      title: 'Overall Condition',
      short: 'Exterior',
      icon: '🚃',
      intro:
        'Walk the car and photograph it as a whole before you look at anything ' +
        'specific. These wide shots establish the state of the car on arrival and ' +
        'give context to every close-up that follows.',
      guidance: [
        'Shoot all four sides. Stand back far enough that the whole car is in frame, then take a second shot of each side from the opposite end so the light changes.',
        'Get the reporting mark legible in at least one photo — that photo ties the whole report to this car.',
        'Photograph damage as you find it: one wide shot for location, one close shot for detail. A close-up with no context is hard to defend later.',
        'Note anything that looks recent — bright metal, fresh scrape, disturbed paint or dirt.'
      ],
      fields: [
        {
          key: 'photos', type: 'photos', label: 'Overall condition photos', min: 4, max: 24, required: true,
          shots: [
            'Full car — left side (A side), whole length in frame',
            'Full car — right side (B side)',
            'A end (hand brake end)',
            'B end',
            'Reporting mark and number, legible',
            'Three-quarter view showing top and side',
            'Top of car from the platform / gangway'
          ]
        },
        {
          key: 'condition', type: 'checklist', label: 'Exterior condition',
          items: [
            { key: 'shell', label: 'Tank shell — no dents, gouges, cracks or bulges' },
            { key: 'heads', label: 'Tank heads and head shields sound' },
            { key: 'jacket', label: 'Jacket / insulation intact, no crushed or open seams' },
            { key: 'coating', label: 'Paint and coating intact, no significant corrosion' },
            { key: 'weldSeams', label: 'Weld seams sound, no cracks or repairs in question' },
            { key: 'ladders', label: 'Ladders, platforms, walkways and handrails secure' },
            { key: 'stencilLegible', label: 'All stencils and markings legible' },
            { key: 'debris', label: 'No debris, ice or product residue on the car' }
          ]
        },
        { key: 'notes', type: 'textarea', label: 'Observations', rows: 3, placeholder: 'Describe any damage: what, where, how big, how old it looks.' }
      ]
    },

    /* ------------------------------------------------------------------ 4 */
    {
      id: 'markings',
      title: 'Placards, Stencils & Test Dates',
      short: 'Markings',
      icon: '🔶',
      intro:
        'The car has to say what it is and prove it is still in qualification. ' +
        'Photograph every marking so the dates can be verified off the report.',
      guidance: [
        'Placards are required on all four sides. Photograph each one, and check that it matches the commodity on the bill of lading.',
        'The spec plate and the stencilled test dates are the proof the tank is still qualified. Shoot them close and square so the numbers read clearly.',
        'Check the tank test (hydrostatic), service equipment test, and pressure relief valve dates. Any one of them expired takes the car out of service.',
        'Look for the correct UN number panel, the shipping name, and any residue or reportable-quantity markings.'
      ],
      fields: [
        {
          key: 'photos', type: 'photos', label: 'Marking photos', min: 2, max: 20, required: true,
          shots: [
            'Placard — side 1', 'Placard — side 2', 'Placard — end 1', 'Placard — end 2',
            'Specification plate / stencil',
            'Tank test date stencil',
            'Service equipment test date stencil',
            'PRV / safety valve test date',
            'Capacity and light weight stencils',
            'Consignee / shipper stencils'
          ]
        },
        {
          key: 'checks', type: 'checklist', label: 'Marking checks',
          items: [
            { key: 'placards4', label: 'Placards on all four sides, correct for the lading' },
            { key: 'placardCondition', label: 'Placards clean, legible, not faded or torn' },
            { key: 'unNumber', label: 'UN/NA number displayed and correct' },
            { key: 'specStencil', label: 'Specification marking present and legible' },
            { key: 'tankTest', label: 'Tank (hydrostatic) test date in date' },
            { key: 'serviceEquip', label: 'Service equipment test date in date' },
            { key: 'prvTest', label: 'Pressure relief valve test date in date' },
            { key: 'liningTest', label: 'Lining / coating inspection date in date (if lined)' },
            { key: 'capacity', label: 'Capacity, light weight and load limit legible' }
          ]
        },
        { key: 'tankTestDate', type: 'text', label: 'Tank test date (as stencilled)', placeholder: 'e.g. 06-2021' },
        { key: 'serviceEquipDate', type: 'text', label: 'Service equipment test date' },
        { key: 'prvDate', type: 'text', label: 'PRV test date' },
        { key: 'notes', type: 'textarea', label: 'Notes', rows: 2 }
      ]
    },

    /* ------------------------------------------------------------------ 5 */
    {
      id: 'sealsExisting',
      title: 'Existing Seals — As Found',
      short: 'Seals found',
      icon: '🔒',
      intro:
        'Photograph and record every seal on the car BEFORE you break any of them. ' +
        'Once a seal is cut, this record is the only evidence of how the car arrived.',
      notes: [
        { tone: 'warn', text: 'Do not cut, remove or disturb any seal until it has been photographed with its number readable and logged below.' }
      ],
      guidance: [
        'Work around the car in a fixed order — manway, then each top fitting, then the bottom outlet — so nothing gets missed.',
        'For each seal take two photos: one showing where the seal is on the car, one close enough that the seal number is readable.',
        'Record the number exactly as printed, including any letter prefix. Transposed digits are the most common error on the whole report.',
        'If a seal is broken, missing, or the number does not match the paperwork, mark it and photograph it before touching anything else — then notify the shipper before continuing.'
      ],
      fields: [
        {
          key: 'anySeals', type: 'radio', label: 'Were seals present on arrival?',
          options: ['Yes — logged below', 'No seals present', 'Not applicable to this inspection']
        },
        {
          key: 'seals', type: 'repeater', label: 'Seals found', itemLabel: 'Seal', addLabel: 'Add a seal',
          fields: [
            {
              key: 'location', type: 'select', label: 'Location',
              options: ['Manway / hatch cover', 'Protective housing', 'Liquid line valve — A', 'Liquid line valve — B',
                'Vapor / vent valve', 'Gauging device', 'Sample line', 'Bottom outlet valve', 'Bottom outlet cap', 'Other']
            },
            { key: 'number', type: 'text', label: 'Seal number', placeholder: 'Exactly as printed' },
            { key: 'condition', type: 'select', label: 'Condition', options: ['Intact', 'Broken', 'Missing', 'Tampered / suspect', 'Number illegible'] },
            { key: 'matchesBol', type: 'select', label: 'Matches BOL?', options: ['Yes', 'No', 'BOL not available'] },
            { key: 'photos', type: 'photos', label: 'Seal photos', min: 1, max: 4, shots: ['Seal in place on the car', 'Close-up — number readable'] },
            { key: 'notes', type: 'text', label: 'Notes' }
          ]
        },
        { key: 'discrepancy', type: 'textarea', label: 'Seal discrepancies and who was notified', rows: 3 }
      ]
    },

    /* ------------------------------------------------------------------ 6 */
    {
      id: 'manway',
      title: 'Manway / Hatch Cover',
      short: 'Manway',
      icon: '⭕',
      intro:
        'The manway is the most frequent source of leaks and the most frequent ' +
        'finding on a loaded car. Document it closed, then open, then closed again.',
      notes: [
        { tone: 'warn', text: 'Relieve any internal pressure before loosening the cover. Stand upwind and to the side, and open the bolt farthest from you first.' }
      ],
      guidance: [
        'Photograph the cover closed with all eyebolts and nuts in place before you loosen anything.',
        'Check every eyebolt: present, seated in its slot, swung fully in, and the nut run down. A bolt that is merely resting in the slot is a finding.',
        'The gasket is the item to look hardest at — check for flat spots, cuts, cracking, swelling, extrusion, or product attack. Photograph it out of the groove if you remove it.',
        'Look at the sealing surface of the flange for scoring, pitting or dried product that will keep the gasket from seating.',
        'On reassembly, tighten in a star pattern, not around the circle.'
      ],
      fields: [
        {
          key: 'photos', type: 'photos', label: 'Manway photos', min: 3, max: 16, required: true,
          shots: [
            'Cover closed — all eyebolts visible',
            'Hinge and hinge pin',
            'Eyebolt / nut detail',
            'Gasket in place (cover open)',
            'Gasket removed — full circumference',
            'Flange sealing surface',
            'Cover underside',
            'Cover closed and resealed at the end'
          ]
        },
        {
          key: 'checks', type: 'checklist', label: 'Manway condition',
          items: [
            { key: 'coverSecure', label: 'Cover closed, square and fully seated' },
            { key: 'eyebolts', label: 'All eyebolts present, swung in and nuts tight' },
            { key: 'hinge', label: 'Hinge and pin sound, no wear or elongation' },
            { key: 'gasketPresent', label: 'Gasket present and correct material for the lading' },
            { key: 'gasketCondition', label: 'Gasket free of cuts, cracks, flat spots or swelling' },
            { key: 'sealingFace', label: 'Flange sealing surface clean, no pitting or scoring' },
            { key: 'threads', label: 'Threads and studs undamaged' },
            { key: 'noLeak', label: 'No product weeping or staining around the cover' }
          ]
        },
        { key: 'gasketMaterial', type: 'text', label: 'Gasket material', placeholder: 'e.g. PTFE envelope, Viton, EPDM' },
        { key: 'gasketReplaced', type: 'radio', label: 'Gasket replaced this visit?', options: ['No', 'Yes'] },
        { key: 'notes', type: 'textarea', label: 'Notes', rows: 3 }
      ]
    },

    /* ------------------------------------------------------------------ 7 */
    {
      id: 'topFittings',
      title: 'Top Fittings & Protective Housing',
      short: 'Top fittings',
      icon: '🔧',
      intro:
        'Everything inside the protective housing, one fitting at a time. Photograph ' +
        'the housing open with all fittings visible first, then work through each item.',
      guidance: [
        'Start with a single wide photo of the open housing — it proves what was there and in what condition, and gives you a reference if a count is questioned later.',
        'The pressure relief valve is the safety-critical item: check the test date tag, that the valve is the right setting for the car, and that nothing is painted over, corroded shut or obstructed.',
        'Vacuum relief must move freely. A stuck vacuum breaker collapses tanks during unloading.',
        'Check the gauging device (magnetic gauge or gauge rod) for free movement and that it reads plausibly against the load.',
        'Every plug, cap and blind flange must be present, tight, and chained if the car is fitted for chains.'
      ],
      fields: [
        {
          key: 'photos', type: 'photos', label: 'Top fitting photos', min: 2, max: 20, required: true,
          shots: [
            'Protective housing closed',
            'Housing open — all fittings in one frame',
            'Pressure relief valve',
            'PRV test date tag / stamping',
            'Vacuum relief valve',
            'Gauging device',
            'Thermometer well',
            'Sample line and cap',
            'Air / vapor line valve and cap'
          ]
        },
        {
          key: 'checks', type: 'checklist', label: 'Top fitting condition',
          items: [
            { key: 'housing', label: 'Protective housing sound, hinges and latch working' },
            { key: 'housingGasket', label: 'Housing gasket present, drain holes clear' },
            { key: 'prvPresent', label: 'Pressure relief valve present and correct type' },
            { key: 'prvTag', label: 'PRV test date tag legible and in date' },
            { key: 'prvClear', label: 'PRV not painted over, corroded or obstructed' },
            { key: 'vacuum', label: 'Vacuum relief operates freely' },
            { key: 'gauging', label: 'Gauging device present, moves freely, reads plausibly' },
            { key: 'thermowell', label: 'Thermometer well present, capped, not bent' },
            { key: 'sampleLine', label: 'Sample line valve closed and capped' },
            { key: 'plugsCaps', label: 'All plugs, caps and blind flanges present and tight' },
            { key: 'chains', label: 'Caps chained where fitted' },
            { key: 'noLeakTop', label: 'No weeping, staining or residue in the housing' }
          ]
        },
        { key: 'prvSetting', type: 'text', label: 'PRV start-to-discharge setting', placeholder: 'e.g. 75 psi' },
        { key: 'gaugeReading', type: 'text', label: 'Gauge / outage reading' },
        { key: 'notes', type: 'textarea', label: 'Notes', rows: 3 }
      ]
    },

    /* ------------------------------------------------------------------ 8 */
    {
      id: 'valves',
      title: 'Liquid & Vapor Valves',
      short: 'Valves',
      icon: '🎚️',
      intro:
        'Each loading and unloading valve, its cap, and the position it is left in. ' +
        'Photograph handle positions — "closed" is a claim until there is a picture of it.',
      guidance: [
        'Photograph each valve handle in its final position so the position is unarguable.',
        'Check the cap or plug on every valve: present, threads engaged fully, and tight. A valve closed with no cap is still a finding.',
        'Look for weeping at the stem packing and at the flange joints — a dry rag wiped across the joint will show it.',
        'Verify the valve turns to the stop. A valve that binds or turns past its stop needs to be written up.'
      ],
      fields: [
        {
          key: 'photos', type: 'photos', label: 'Valve photos', min: 1, max: 16,
          shots: ['Liquid valve A — handle position', 'Liquid valve B — handle position', 'Vapor / air line valve', 'Caps and plugs in place', 'Stem packing area', 'Flange joints']
        },
        {
          key: 'checks', type: 'checklist', label: 'Valve condition',
          items: [
            { key: 'closed', label: 'All valves fully closed' },
            { key: 'operate', label: 'Valves operate smoothly to the stop, no binding' },
            { key: 'caps', label: 'Caps / plugs present and tight on every valve' },
            { key: 'packing', label: 'No weeping at stem packing' },
            { key: 'flanges', label: 'Flange bolts complete and tight, no leaks' },
            { key: 'handles', label: 'Handles present and secure' },
            { key: 'excessFlow', label: 'Excess flow / internal valve seats correctly (if fitted)' }
          ]
        },
        { key: 'notes', type: 'textarea', label: 'Notes', rows: 2 }
      ]
    },

    /* ------------------------------------------------------------------ 9 */
    {
      id: 'bottomOutlet',
      title: 'Bottom Outlet & Underframe',
      short: 'Bottom outlet',
      icon: '⬇️',
      intro:
        'The bottom outlet is the highest-consequence leak point on a moving car. ' +
        'Check the valve, the cap, and the protective skid, and photograph all three.',
      notes: [
        { tone: 'warn', text: 'Assume the line below the valve holds product. Loosen the cap slowly, from the side, with a container ready.' }
      ],
      guidance: [
        'Confirm the internal valve is closed and the operating handle is in the closed position and secured.',
        'The outlet cap or plug must be present and tight — this is the secondary containment for the valve.',
        'Check the skid / protective housing under the valve for impact damage. Bent skids mean the car has been struck and the valve may be compromised.',
        'Look up into the underframe while you are there: bolster, draft sill, and any product staining running down the tank bottom.'
      ],
      fields: [
        {
          key: 'photos', type: 'photos', label: 'Bottom outlet photos', min: 2, max: 12,
          shots: ['Operating handle in closed position', 'Outlet cap / plug in place', 'Valve body and flange', 'Protective skid from the side', 'Underframe below the outlet', 'Tank bottom — any staining']
        },
        {
          key: 'checks', type: 'checklist', label: 'Bottom outlet condition',
          items: [
            { key: 'valveClosed', label: 'Internal valve closed, handle secured in closed position' },
            { key: 'capOn', label: 'Outlet cap / plug present and tight' },
            { key: 'capChain', label: 'Cap chain or retainer present (if fitted)' },
            { key: 'noLeakBottom', label: 'No drip, weep or fresh staining' },
            { key: 'skid', label: 'Protective skid / housing undamaged' },
            { key: 'reducer', label: 'Reducer / adapter removed and stowed' },
            { key: 'underframe', label: 'Underframe, bolsters and draft sill sound' }
          ]
        },
        { key: 'notes', type: 'textarea', label: 'Notes', rows: 2 }
      ]
    },

    /* ----------------------------------------------------------------- 10 */
    {
      id: 'interior',
      title: 'Interior Condition',
      short: 'Interior',
      icon: '🔦',
      intro:
        'Visual check of the tank interior from outside the manway — cleanliness, ' +
        'residue, coating and shell condition.',
      notes: [
        { tone: 'danger', text: 'CONFINED SPACE. Do not enter the tank. This step is a visual inspection from the manway with a light. Entry requires a permit, atmospheric monitoring, an attendant, rescue provisions and a separate procedure.' }
      ],
      guidance: [
        'Use an intrinsically safe light. Look at the shell, the heads, the bottom sump and around every nozzle penetration.',
        'Photograph any heel or residue with something in frame for scale, and estimate the depth.',
        'On a lined car look for blisters, cracks, holidays, chalking or disbonding of the coating — especially at welds and around fittings.',
        'Note whether the interior is wet, and with what. A car that is "clean and dry" and a car that is "clean and wet" are different cars for the next load.',
        'If the car fails the cleanliness standard for the next commodity, stop here and mark it for cleaning.'
      ],
      fields: [
        {
          key: 'opened', type: 'radio', label: 'Was the tank opened for interior inspection?',
          options: ['Yes', 'No — closed inspection only', 'No — not applicable']
        },
        {
          key: 'photos', type: 'photos', label: 'Interior photos', min: 0, max: 16,
          shots: ['Down through the manway', 'Shell — A end', 'Shell — B end', 'Bottom / sump area', 'Any residue or heel with scale reference', 'Coating condition at a weld seam', 'Nozzle penetrations']
        },
        {
          key: 'checks', type: 'checklist', label: 'Interior condition',
          items: [
            { key: 'clean', label: 'Interior clean and free of previous product' },
            { key: 'dry', label: 'Interior dry — no standing water or heel' },
            { key: 'odor', label: 'No odor of previous lading' },
            { key: 'coating', label: 'Lining / coating intact — no blisters, cracks or disbonding' },
            { key: 'shellInt', label: 'Interior shell free of corrosion, pitting or scale' },
            { key: 'noForeign', label: 'No foreign objects, tools, rags or debris' },
            { key: 'noWeldDefect', label: 'Interior welds sound' },
            { key: 'suitable', label: 'Suitable to load the intended commodity' }
          ]
        },
        { key: 'heelAmount', type: 'text', label: 'Heel / residue quantity', placeholder: 'e.g. approx. 2 in. in sump, ~40 gal' },
        { key: 'heelType', type: 'text', label: 'Heel / residue description' },
        { key: 'notes', type: 'textarea', label: 'Notes', rows: 3 }
      ]
    },

    /* ----------------------------------------------------------------- 11 */
    {
      id: 'runningGear',
      title: 'Running Gear & Structure',
      short: 'Running gear',
      icon: '⚙️',
      intro:
        'The car has to roll safely, not just hold product. Walk both sides and ' +
        'look at wheels, trucks, brakes and couplers.',
      guidance: [
        'Wheels: look for thin flanges, built-up tread, shelling, flat spots over 2 inches, and any crack in the rim or plate.',
        'Trucks: springs upright and unbroken, no missing or shifted components, side frames and bolsters not cracked.',
        'Brakes: rigging complete and pinned, hoses connected and not dragging, hand brake chain not slack or kinked.',
        'Couplers and draft gear: knuckle and pin present, no cracks, coupler at the right height.',
        'Anything dragging, hanging or missing is an immediate bad-order condition — write it up and tag the car.'
      ],
      fields: [
        {
          key: 'photos', type: 'photos', label: 'Running gear photos', min: 0, max: 16,
          shots: ['Truck — A end', 'Truck — B end', 'Wheel tread and flange', 'Brake rigging', 'Hand brake', 'Coupler — A end', 'Coupler — B end', 'Air hose connections']
        },
        {
          key: 'checks', type: 'checklist', label: 'Running gear condition',
          items: [
            { key: 'wheels', label: 'Wheels free of cracks, flat spots, shelling or thin flanges' },
            { key: 'bearings', label: 'Roller bearings — no heat marks, leaks or loose caps' },
            { key: 'springs', label: 'Springs complete, upright, none broken' },
            { key: 'sideFrames', label: 'Side frames and bolsters free of cracks' },
            { key: 'brakeRigging', label: 'Brake rigging complete, pinned and not dragging' },
            { key: 'handBrakeOp', label: 'Hand brake operates and releases' },
            { key: 'airHoses', label: 'Air hoses connected, supported, not damaged' },
            { key: 'couplers', label: 'Couplers, knuckles and pins sound, correct height' },
            { key: 'nothingDragging', label: 'Nothing loose, hanging or dragging' }
          ]
        },
        { key: 'notes', type: 'textarea', label: 'Notes', rows: 2 }
      ]
    },

    /* ----------------------------------------------------------------- 12 */
    {
      id: 'leakCheck',
      title: 'Leak Check & Final Walkaround',
      short: 'Leak check',
      icon: '💧',
      intro:
        'Last pass around the car with everything closed. This is the step that ' +
        'catches what got missed.',
      guidance: [
        'Walk the full perimeter once more with the car fully closed and every cap on.',
        'Check every joint you disturbed: manway, each valve, the bottom outlet, and the housing.',
        'Look at the ground under the car and at the tank bottom for anything fresh.',
        'On a loaded car, a soap solution or leak detector on gasketed joints will find what the eye misses.',
        'Take one final wide photo of the closed, sealed car — it is the closing statement of the report.'
      ],
      fields: [
        {
          key: 'photos', type: 'photos', label: 'Final photos', min: 1, max: 10, required: true,
          shots: ['Car fully closed — wide shot', 'Manway closed and sealed', 'Housing closed and sealed', 'Bottom outlet capped and sealed', 'Ground beneath the car']
        },
        {
          key: 'checks', type: 'checklist', label: 'Final checks',
          items: [
            { key: 'allClosed', label: 'All fittings closed, capped and secured' },
            { key: 'housingClosed', label: 'Protective housing closed and latched' },
            { key: 'noLeaks', label: 'No leaks at any joint or fitting' },
            { key: 'groundClear', label: 'No product on the ground or the car body' },
            { key: 'toolsRemoved', label: 'All tools and equipment removed from the car' },
            { key: 'placardsFinal', label: 'Placards correct and secure for movement' },
            { key: 'protectionRemoved', label: 'Blue flag / derail removed by the applier when clear' }
          ]
        },
        { key: 'leakMethod', type: 'text', label: 'Leak check method', placeholder: 'e.g. visual + soap solution on gasketed joints' },
        { key: 'notes', type: 'textarea', label: 'Notes', rows: 2 }
      ]
    },

    /* ----------------------------------------------------------------- 13 */
    {
      id: 'sealsNew',
      title: 'New Seals Applied',
      short: 'Seals applied',
      icon: '🔐',
      intro:
        'Record every seal you apply, with a photo showing the number. These numbers ' +
        'go on the bill of lading.',
      guidance: [
        'Apply seals only after the fitting is fully closed and checked — a seal on a loose cap is worse than no seal, because it says the cap was checked.',
        'Photograph each seal with the number readable, in place on the car.',
        'Read the number back off the photo when you enter it, not off the seal in your hand.',
        'Seal every opening the shipper requires: manway, housing, each loading valve, and the bottom outlet.'
      ],
      fields: [
        {
          key: 'seals', type: 'repeater', label: 'Seals applied', itemLabel: 'Seal', addLabel: 'Add a seal',
          fields: [
            {
              key: 'location', type: 'select', label: 'Location',
              options: ['Manway / hatch cover', 'Protective housing', 'Liquid line valve — A', 'Liquid line valve — B',
                'Vapor / vent valve', 'Gauging device', 'Sample line', 'Bottom outlet valve', 'Bottom outlet cap', 'Other']
            },
            { key: 'number', type: 'text', label: 'Seal number' },
            { key: 'type', type: 'text', label: 'Seal type', placeholder: 'e.g. bolt seal, cable seal, plastic' },
            { key: 'photos', type: 'photos', label: 'Seal photo', min: 1, max: 3, shots: ['Seal applied — number readable'] }
          ]
        },
        { key: 'sealsOnBol', type: 'radio', label: 'Seal numbers recorded on the bill of lading?', options: ['Yes', 'No', 'N/A'] },
        { key: 'notes', type: 'textarea', label: 'Notes', rows: 2 }
      ]
    },

    /* ----------------------------------------------------------------- 14 */
    {
      id: 'defects',
      title: 'Defects & Disposition',
      short: 'Defects',
      icon: '⚠️',
      intro:
        'Anything marked as a defect earlier belongs here with a decision attached. ' +
        'A finding with no disposition is an open loop.',
      guidance: [
        'Write each defect as what it is, where it is, and how big it is — "3 in. gouge, left side, 4 ft from B end, 1/8 in. deep" beats "damage on side".',
        'Attach the photo that shows it. If you did not photograph it earlier, go back and photograph it now.',
        'Severity drives the disposition: anything affecting containment or safe movement is a hold, not a note.',
        'Name who you notified and when. That is what closes the loop.'
      ],
      fields: [
        {
          key: 'items', type: 'repeater', label: 'Defects found', itemLabel: 'Defect', addLabel: 'Add a defect',
          fields: [
            { key: 'area', type: 'select', label: 'Area', options: ['Tank shell / heads', 'Manway', 'Top fittings / PRV', 'Valves', 'Bottom outlet', 'Interior / lining', 'Markings / placards', 'Running gear', 'Seals', 'Other'] },
            { key: 'description', type: 'textarea', label: 'Description', rows: 3, placeholder: 'What, where, how big.' },
            { key: 'severity', type: 'select', label: 'Severity', options: ['Minor — monitor', 'Moderate — repair at next opportunity', 'Major — repair before loading', 'Critical — car out of service now'] },
            { key: 'action', type: 'select', label: 'Action', options: ['Corrected on site', 'Repair required', 'Car rejected', 'Sent for cleaning', 'Reported — no action taken', 'Monitor'] },
            { key: 'photos', type: 'photos', label: 'Defect photos', min: 0, max: 6, shots: ['Wide shot showing location', 'Close-up showing detail', 'Measurement or scale reference'] },
            { key: 'notifiedWho', type: 'text', label: 'Notified (name / role / time)' }
          ]
        },
        {
          key: 'disposition', type: 'radio', label: 'Overall disposition', required: true,
          options: [
            'Accepted — car is suitable for service',
            'Accepted with noted exceptions',
            'Held — repair required before release',
            'Rejected — returned to shipper / carrier',
            'Sent for cleaning'
          ]
        },
        { key: 'dispositionNotes', type: 'textarea', label: 'Disposition rationale', rows: 3 }
      ]
    },

    /* ----------------------------------------------------------------- 15 */
    {
      id: 'signoff',
      title: 'Review & Sign-off',
      short: 'Sign-off',
      icon: '✍️',
      intro:
        'Check the summary for anything missing, then sign. After signing, generate ' +
        'the report and export it.',
      guidance: [
        'Review the completeness summary below and go back for anything flagged. It is far cheaper to take a photo now than to come back to the car.',
        'Read your own defect descriptions once more — they will be read by someone who was not standing there.',
        'Sign with your finger or a stylus. The signature is stored with the report.'
      ],
      fields: [
        { key: 'endTime', type: 'time', label: 'Completion time', default: 'now' },
        { key: 'summary', type: 'textarea', label: 'Inspection summary', rows: 4, placeholder: 'Two or three sentences on the overall state of the car and the outcome.' },
        { key: 'certify', type: 'checklist', label: 'Certification',
          items: [
            { key: 'accurate', label: 'I performed this inspection and the record above is accurate' },
            { key: 'photosTrue', label: 'The photographs are of this car, taken during this inspection' },
            { key: 'defectsReported', label: 'All defects found have been recorded and reported' }
          ]
        },
        { key: 'inspectorSig', type: 'signature', label: 'Inspector signature' },
        { key: 'witnessName', type: 'text', label: 'Witness / supervisor name' },
        { key: 'witnessSig', type: 'signature', label: 'Witness signature' }
      ]
    }
  ]
};

/* Convenience lookups used across the app. */
SCHEMA.stepById = Object.fromEntries(SCHEMA.steps.map(s => [s.id, s]));
SCHEMA.stepIndex = Object.fromEntries(SCHEMA.steps.map((s, i) => [s.id, i]));
