// Round 2 shots. Trace rows: [time, phase, leg, x, y, z, airspeed, pitch, bank, heading] at 30 Hz.
// Field: pilot at (10, 1.72, 8) facing -X; runway |x| < 9, z -69.5..85.5 (+Z = pilot's right);
// windsock (-12, 0, -10), 4.2 m pole. Only the eight selectable aircraft are filmed.
const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
const firstContact = (trace) => {
  let flown = false;
  for (const r of trace) {
    if (r[1] === 'flying') flown = true;
    else if (flown && (r[1] === 'rolling' || r[1] === 'landed' || r[1] === 'crashed')) return r[0];
  }
  return trace.at(-1)[0];
};
// Seamless-loop window: among starts on `leg` with z in [zMin, zMax], after `settle` s on the leg,
// choose the one whose state at start and start + duration match best (the crossfade then only
// blends the background).
export function loopPick({ leg, zMin, zMax, settle = 6 }) {
  return (trace, shot) => {
    const step = trace[1][0] - trace[0][0];
    const k = Math.round(shot.duration / step);
    const firstOnLeg = trace.find((r) => r[2] === leg)?.[0] ?? 0;
    let best = null;
    for (let i = 0; i + k < trace.length; i++) {
      const a = trace[i], b = trace[i + k];
      if (a[2] !== leg || b[2] !== leg || a[0] < firstOnLeg + settle) continue;
      if (a[5] < zMin || a[5] > zMax) continue;
      const cost =
        Math.abs(a[3] - b[3]) + Math.abs(a[4] - b[4]) +
        20 * (Math.abs(a[7] - b[7]) + Math.abs(a[8] - b[8]) + Math.abs(wrap(a[9] - b[9])));
      if (!best || cost < best.cost) best = { t: a[0], cost };
    }
    if (!best) throw Error('No loop window found');
    console.log(`  loop match cost ${best.cost.toFixed(3)} at t=${best.t}`);
    // Land on a frame boundary from launch.
    return Math.round(best.t * 30) / 30;
  };
}

// The hero flight: NanaTrainer takes off, turns back and makes a long, low pass down the strip
// (heading -Z, i.e. right-to-left for a camera facing -X) at 4.5 m.
const heroFlight = {
  aircraft: 'nanatrainer',
  land: false,
  // Turn-around stays inside the clear runway-extension corridor (|x| < 70) at 12 m; the descent
  // to 4.5 m starts only once established on the line.
  route: [
    { to: [0, 110], alt: 5 },
    { to: [28, 175], alt: 5, radius: 10 },
    { to: [-4, 0], line: Math.PI, alt: 5, align: [2, 0.08] },
    { to: [-4, -500], line: Math.PI, alt: 4.5 },
  ],
  maxSeconds: 80,
  duration: 10,
  loopFade: 1,
  // Established and level by t = 33 s (z = 22.6): over the next 10 s heading changes ~1 deg, height 1.4 cm.
  // The windsock passes ~2.4 s in.
  pick: () => 34.0,
};

const cands = {
  c1: { mode: 'chase', eye: [6, 3.0], dz: -14, screen: [0.4, 0.2], fov: 0.22 },
  c2: { mode: 'chase', eye: [6, 1.8], dz: -14, screen: [0.4, 0.15], fov: 0.22 },
  c3: { mode: 'chase', eye: [14, 2.0], dz: -12, screen: [0.4, 0.1], fov: 0.22 },
  c4: { mode: 'chase', eye: [3, 2.4], dz: -20, screen: [0.4, 0.2], fov: 0.17 },
};
export const SHOTS = {
  ...Object.fromEntries(Object.entries(cands).map(([k, camera]) => [`hero-${k}`, { ...heroFlight, viewport: [1920, 1080], camera }])),
  // 1. Camera car on the runway (x = 6, 1.8 m up) running 14 m ahead of the aircraft and looking
  //    back at it: front-quarter view against the clouds, fixed orientation (sky static, distant
  //    tree line drifts), aircraft held at 70% across / slightly above centre.
  hero: {
    ...heroFlight,
    viewport: [1920, 1080],
    camera: { mode: 'chase', eye: [6, 1.8], dz: -14, screen: [0.4, 0.1], fov: 0.2, pin: true },
  },
  // 2. Same flight and camera car, native portrait, lower and looking up: aircraft upper-middle.
  'hero-portrait': {
    ...heroFlight,
    viewport: [720, 1280],
    camera: { mode: 'chase', eye: [6, 1.0], dz: -14, screen: [0.0, 0.35], fov: 0.317, pin: true },
  },
  // 3. Take-off, the game's own pilot camera, rendered 1080p and downscaled to 720p.
  'takeoff-short': {
    aircraft: 'nanatrainer',
    land: false,
    maxSeconds: 12,
    duration: 3,
    loopFade: 0.5,
    pick: () => 0.4,
    camera: { mode: 'game' },
    viewport: [1920, 1080],
    out: [1280, 720],
  },
  // 4. Landing heading -Z (the background toward +Z is open field and sky; the usual +Z landing is
  //    framed against a hazy ridge). Same low turn-around as the hero, then the repo pilot's
  //    ordinary final/flare/rollout logic mirrored (finalDir -1). Pilot-station camera with a zoom
  //    that holds the aircraft at ~20% of frame width.
  landing: {
    aircraft: 'nanatrainer',
    route: [
      { to: [0, 110], alt: 5 },
      { to: [28, 175], alt: 5, radius: 10 },
      { to: [-1, 0], line: Math.PI, alt: 6, align: [2, 0.08] },
      { to: [0, -100] },
    ],
    gains: { finalDir: -1, touchdownZ: 20 },
    maxSeconds: 90,
    duration: 5.5,
    pick: (trace) => Math.round((firstContact(trace) - 3.9) * 30) / 30,
    camera: { mode: 'frame', eye: [10, 1.72, 8], widthFraction: 0.2, lead: 0.12, rate: 4, zoomRate: 1.5, minFov: 0.08, maxFov: 0.75 },
    viewport: [1920, 1080],
    out: [1280, 720],
  },
  // 5. NanaEdge (2 m aerobat) inside loop, side-on from the pilot station 30 m away, zoom holding
  //    the aircraft at ~22% of frame width. Turn-around at 30 m (its turns are wider than the clear
  //    corridor), then down to 15 m on a line 30 m out, loop abeam the pilot, level off.
  aerobatic: {
    aircraft: 'nanaedge',
    land: false,
    route: [
      { to: [0, 160], alt: 30 },
      { to: [60, 260], alt: 30, radius: 20 },
      { to: [-20, 0], line: Math.PI, alt: 30, align: [3, 0.1] },
      { to: [-20, 0], line: Math.PI, alt: 15, passZ: 22 },
      { loop: true, elevator: 0.6 },
      { loop: true, elevator: 0.6 },
      { to: [-20, -800], line: Math.PI, alt: 15 },
    ],
    maxSeconds: 110,
    duration: 8,
    loopFade: 0.5,
    pick: (trace) => {
      const a = trace.find((r) => r[2] === 4)?.[0];
      const b = trace.find((r) => r[2] === 6)?.[0];
      if (a === undefined || b === undefined) throw Error('no loop in trace');
      // Two loops back to back: from just before the first pull-up to just after the second
      // recovery, so the end (level, heading -Z, centred against sky) dissolves into the start.
      // Start at the pull-up and end ~1.1 s after the second loop, once level again, so the
      // end-to-start dissolve blends two level attitudes.
      const start = Math.round(a * 30) / 30;
      return { start, duration: Math.min(8 - 0.5, Math.round((b + 0.6 - start) * 30) / 30) };
    },
    // lead = 1 / rate cancels the aim smoothing's lag, so the aircraft stays centred on a long lens.
    camera: { mode: 'frame', eye: [10, 1.72, 8], widthFraction: 0.22, lead: 0.2, rate: 5, zoomRate: 2, minFov: 0.08, maxFov: 0.9 },
    viewport: [1920, 1080],
    out: [1280, 720],
  },
  // 6. NanaSoar (3 m powered sailplane) on a slow pass down the strip at 7 m, camera car well
  //    ahead and low so the long wing reads against the sky.
  soar: {
    aircraft: 'nanasoar',
    land: false,
    route: [
      { to: [0, 110], alt: 8 },
      { to: [24, 170], alt: 8, radius: 10 },
      { to: [-4, 0], line: Math.PI, alt: 8, align: [2, 0.08] },
      { to: [-4, -500], line: Math.PI, alt: 7 },
    ],
    gains: {},
    maxSeconds: 80,
    duration: 6,
    loopFade: 0.75,
    pick: loopPick({ leg: 3, zMin: -40, zMax: 60, settle: 5 }),
    camera: { mode: 'chase', eye: [5, 1.4], dz: -24, screen: [0.25, 0.15], fov: 0.24, pin: true },
    viewport: [1920, 1080],
    out: [1280, 720],
  },
  // 6b. NanaSoar slow pass seen from the pilot station: a line 60 m out at 12 m, the camera tracks
  //     smoothly and zooms to hold the 3 m wing at ~18% of frame width, so the sky pans behind it.
  soar2: {
    aircraft: 'nanasoar',
    land: false,
    route: [
      { to: [0, 110], alt: 10 },
      { to: [10, 175], alt: 12, radius: 12 },
      { to: [-50, 0], line: Math.PI, alt: 12, align: [2, 0.08] },
      { to: [-50, -500], line: Math.PI, alt: 12 },
    ],
    maxSeconds: 90,
    duration: 6,
    // Centre the window on the moment the glider is abeam the pilot (z = 8).
    pick: (trace) => {
      const r = trace.find((x) => x[2] === 3 && x[5] < 8);
      if (!r) throw Error('never abeam');
      return Math.round((r[0] - 3) * 30) / 30;
    },
    camera: { mode: 'frame', eye: [10, 1.72, 8], widthFraction: 0.18, lead: 0.25, rate: 4, zoomRate: 1.5, minFov: 0.08, maxFov: 0.75 },
    viewport: [1920, 1080],
    out: [1280, 720],
  },
  // 6c. NanaSoar, camera car raised to 4 m so a tree line drifts along the bottom of frame (the
  //     all-sky version reads as a still image).
  soar3: {
    aircraft: 'nanasoar',
    land: false,
    route: [
      { to: [0, 110], alt: 8 },
      { to: [24, 170], alt: 8, radius: 10 },
      { to: [-4, 0], line: Math.PI, alt: 8, align: [2, 0.08] },
      { to: [-4, -500], line: Math.PI, alt: 7 },
    ],
    maxSeconds: 80,
    duration: 6,
    loopFade: 0.75,
    pick: loopPick({ leg: 3, zMin: -40, zMax: 60, settle: 5 }),
    camera: { mode: 'chase', eye: [6, 4.0], dz: -20, screen: [0.3, 0.2], fov: 0.26, pin: true },
    viewport: [1920, 1080],
    out: [1280, 720],
  },
};




