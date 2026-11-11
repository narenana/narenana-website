// Shot definitions. Trace rows: [time, phase, leg, x, y, z, airspeed] at 30 Hz from launch.
// Field: pilot at (10, 1.72, 8) facing -X; runway |x| < 9, z -69.5..85.5 (+Z is to the pilot's
// right); windsock at (-12, 0, -10). Only the eight selectable aircraft
// (lib/aircraft-availability.ts ORIGINAL_AIRCRAFT_IDS) are filmed.
const firstTime = (trace, test) => trace.find(test)?.[0];
const firstContact = (trace) => {
  let flown = false;
  for (const r of trace) {
    if (r[1] === 'flying') flown = true;
    else if (flown && (r[1] === 'rolling' || r[1] === 'landed' || r[1] === 'crashed')) return r[0];
  }
  return trace.at(-1)[0];
};

export const SHOTS = {
  // 1. Low pass along the strip, seen from the pilot station with the game's own tracking camera.
  pass: {
    aircraft: 'nanatrainer',
    duration: 8,
    land: false,
    route: [
      { to: [0, 110] },
      { to: [-70, 140] },
      { to: [-80, -130], alt: 18 },
      { to: [-10, -170], alt: 10, radius: 25 },
      { to: [-5, 220], line: 0, alt: 5 },
    ],
    // Start when the aircraft is ~50 m to the pilot's left on the pass line (pilot z = 8).
    pick: (trace) => firstTime(trace, (r) => r[2] === 4 && r[5] > -42),
    loopFade: 1,
    camera: { mode: 'game' },
    maxSeconds: 90,
  },
  // 2. Runway take-off and climb-out (game camera).
  takeoff: {
    aircraft: 'nanatrainer',
    duration: 6,
    pick: () => 0.4,
    camera: { mode: 'game' },
    maxSeconds: 30,
    land: false,
  },
  // 2b. Hand launch (Sky Surfer X8).
  handlaunch: {
    aircraft: 'sky-surfer',
    duration: 8,
    pick: () => 0,
    camera: { mode: 'game' },
    maxSeconds: 30,
    land: false,
  },
  // 3. Approach and touchdown from the ordinary powered-fleet circuit.
  landing: {
    aircraft: 'nanatrainer',
    duration: 9,
    // Same pilot and circuit; only its aim point moves 30 m up the strip so the touchdown and
    // rollout happen nearer the pilot (default touchdownZ is runway.minZ + 24 = -45.5).
    gains: { touchdownZ: -15 },
    pick: (trace) => Math.max(0, firstContact(trace) - 5.5),
    camera: { mode: 'game' },
    maxSeconds: 240,
  },
  // 4. Low, close pass of the NanaEdge aerobat.
  closepass: {
    aircraft: 'nanaedge',
    duration: 7,
    land: false,
    route: [
      { to: [0, 200] },
      { to: [-140, 240] },
      { to: [-150, -240], alt: 25 },
      { to: [-10, -300], alt: 10, radius: 40 },
      { to: [1, 400], line: 0, alt: 3.5 },
    ],
    pick: (trace) => firstTime(trace, (r) => r[2] === 4 && r[5] > -70 + 8),
    camera: { mode: 'game' },
    maxSeconds: 120,
  },
};
