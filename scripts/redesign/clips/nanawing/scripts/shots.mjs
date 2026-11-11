// Shot definitions. `opts` go to window.__clipSetup (pageRuntime.js); `extras` is page-side code (a string, evaluated in
// the page) with optional start / target / camera hooks. Frames: 30 fps; `loopFrames` extra frames are rendered past
// the end and cross-faded into the head of the clip by encode.mjs so the loop has no seam.

// Fast-forward the world (no rendering, exact 1/30 s steps) until a named mesh is within r m of (x, z).
const waitNear = async ({ actor, near, maxFrames = 9000 }) => {
  const d = window.__dbg;
  for (let i = 0; i < maxFrames; i++) {
    const n = d.scene.getMeshByName(actor);
    if (n && Math.hypot(n.position.x - near[0], n.position.z - near[1]) < near[2]) return { frames: i, at: [n.position.x, n.position.y, n.position.z].map((v) => +v.toFixed(1)) };
    window.__clock.advance(1000 / 30);
    d.engine.beginFrame(); d.scene.onBeforeRenderObservable.notifyObservers(d.scene); d.engine.endFrame();
  }
  return "never reached";
};

// Station-keeping beside freight train 0 of the south loop (stock0 = loco, stock1..11 = wagons). The station slides
// from B0 to B1 metres behind the loco's nose over the clip (the wing slowly overtakes the wagons), S m to the screen-
// right of the rails and H m above them. The pilot aims at a point `lead` m further up the train, ON the track, so it
// follows the rails' curvature like a pilot flying the line.
const trainExtras = ({ base = 0, B0, B1, S, H, lead, T, vTrain, cam, look, follow = "train" }) => `({
  backs: [10, 30.6, 48.2, 65.8, 83.4, 101, 118.6, 136.2, 153.8, 171.4, 189, 206.6],
  along(d, B) {
    const c = []; for (let i = 0; i < 12; i++) c.push(d.scene.getMeshByName("stock" + (${base} + i)));
    const b = this.backs;
    if (B <= b[0]) { const p = c[0].position, y = c[0].rotation.y, e = b[0] - B; return [p.x + Math.sin(y) * e, p.y, p.z + Math.cos(y) * e]; }
    for (let i = 0; i < 11; i++) if (B <= b[i + 1]) {
      const k = (B - b[i]) / (b[i + 1] - b[i]), p = c[i].position, q = c[i + 1].position;
      return [p.x + (q.x - p.x) * k, p.y + (q.y - p.y) * k, p.z + (q.z - p.z) * k];
    }
    const p = c[11].position; return [p.x, p.y, p.z];
  },
  frame(d, B) {
    const a = this.along(d, B - 6), b = this.along(d, B + 6);
    let fx = a[0] - b[0], fz = a[2] - b[2]; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
    return { fx, fz, rx: -fz, rz: fx };
  },
  station(d, t) {
    const B = ${B0} + (${B1} - ${B0}) * Math.min(1, t / ${T});
    const p = this.along(d, B), f = this.frame(d, B);
    return { B, f, x: p[0] + f.rx * ${S}, y: p[1] + ${H}, z: p[2] + f.rz * ${S} };
  },
  start(c) { const s = this.station(c.d, 0); return { x: s.x, y: s.y, z: s.z, hdg: Math.atan2(s.f.fx, s.f.fz) }; },
  ${follow === "path" ? "_target" : "target"}(c) {
    const s = this.station(c.d, c.t), st = c.state.position;
    const a = this.along(c.d, s.B - ${lead});
    const err = (s.x - st[0]) * s.f.fx + (s.z - st[2]) * s.f.fz; // + = the station is ahead of the wing
    return { x: a[0] + s.f.rx * ${S}, z: a[2] + s.f.rz * ${S}, y: s.y, speed: ${vTrain} + Math.max(-8, Math.min(8, err * 0.35)) };
  },
  camera(c, k) {
    const o = ${JSON.stringify(cam)}, la = ${JSON.stringify(look)}, p = k.p;
    return { pos: [p.x + k.rx * o[0] + k.fx * o[2], p.y + o[1], p.z + k.rz * o[0] + k.fz * o[2]],
             look: [p.x + k.rx * la[0] + k.fx * la[2], p.y + la[1], p.z + k.rz * la[0] + k.fz * la[2]] };
  },
})`;

// `over` (from the control file after a rehearsal): { opts: {...}, train: {...} } merged over these defaults.
// The south loop's waypoints (src/world/trackRoutes.ts TRACK_ROUTES[0]); the train runs them in this order on a closed
// uniform Catmull-Rom spline, which pageRuntime's path sampler reproduces.
const SOUTH_LOOP = [[-1150, -820], [-1050, -1200], [-350, -1450], [450, -1420], [1100, -1150], [1300, -750], [750, -700], [0, -760], [-700, -780]];
const islandTrain = (base, over = {}) => ({
  path: SOUTH_LOOP, pathClosed: true, pathOffset: 10, agl: 14, l1: 2.4, lookS: 2.5,
  speed: 35, maxBank: 45, hideParticles: ["trainSmoke"], hideClouds: true, thrBase: 0.5, kThr: 0.06, yTau: 0.6, kAlt: 0.03,
  fov: 0.55, camPosTau: 0.001, camLookTau: 0.001, camHeadTau: 0.7, // rigid follow, only the heading frame is smoothed
  ...(over.opts ?? {}),
  extras: trainExtras({ B0: 40, B1: 40, S: 10, H: 14, follow: "path", lead: 55, T: (60 + 198) / 30, vTrain: 35, cam: [-0.4, 0.9, -4.0], look: [-1.5, -1.5, 30], ...(over.train ?? {}), base }),
});

export const SHOTS = {
  // 1. The Island: the WUDFLY Spectre low beside a freight train on the south loop, heading west with the river to the north.
  //    Rehearsed on train 1 (stock12..23: same loop, same speed, half a loop away), rendered on train 0 (stock0..11).
  "island-train": {
    map: "island", aircraft: "spectre", frames: 180, loopFrames: 18, preroll: 60, ss: 1,
    knobs: { treeMeshDist: 220, treeRadius: 1500, grassRadius: 60 },
    rehearse: { prepareArgs: { actor: "stock12", near: [1295, -868, 30] }, opts: (o) => islandTrain(12, o), stills: [99] },
    prepare: waitNear, prepareArgs: { actor: "stock0", near: [1295, -868, 30] },
    opts: (o) => islandTrain(0, o),
  },
};
