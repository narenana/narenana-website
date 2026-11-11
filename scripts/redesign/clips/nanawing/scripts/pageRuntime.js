// Page-side clip runtime (evaluated in the game page, DEV build). Flies the selected aircraft with the GAME'S OWN
// physics (FlightState.update at the game's 120 Hz step) under an angle-mode pilot that follows a path or a moving
// target, poses the real airframe, drives a smoothed cinematic camera and renders exactly one frame per call with the
// virtual clock advanced by 1/fps. Nothing in src/ is changed: modules are imported from the dev server as-is.
window.__clipSetup = async (opts) => {
  const d = window.__dbg;
  const FS = await import("/src/state/flightState.ts");
  const { angleModeControl } = await import("/src/physics/angleMode.ts");
  const { flightConfigFor } = await import("/src/config/flightConfig.ts");
  const rot = await import("/src/math/rotation.ts");
  const { mixElevons } = await import("/src/physics/elevonMixer.ts");
  const V3 = d.scene.activeCamera.position.constructor; // Babylon Vector3 without importing it
  const Q = d.aircraft.root.rotationQuaternion?.constructor;

  const cfg = flightConfigFor(opts.aircraft);
  const FIXED_DT = 1 / 120;
  const fps = opts.fps ?? 30;
  const subs = Math.round(1 / fps / FIXED_DT);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ground = (x, z) => Math.max(d.scenery.heightAt(x, z), opts.waterY ?? -1e9);

  // ---- hide everything that is not the world: DOM overlays + named meshes (race beacons, …) ----
  for (const el of document.body.children) if (el.tagName !== "CANVAS") el.style.display = "none";
  const hidePrefixes = opts.hide ?? ["raceMarker"];
  const hideMeshes = () => {
    if (opts.hideClouds) for (const sm of d.scene.spriteManagers ?? []) for (const sp of sm.sprites ?? []) sp.isVisible = false;
    for (const m of d.scene.meshes) if (hidePrefixes.some((p) => m.name.startsWith(p)) && m.isEnabled()) { m.isVisible = false; m.setEnabled(false); }
  };
  hideMeshes();
  // NOTHING MILITARY in a marketing frame: the Island's ambient planes include the Spitfire flyover (allowed in the game,
  // not in these clips) — disable the whole ambient-plane group and its smoke ribbons.
  d.scene.getTransformNodeByName?.("planes")?.setEnabled(false);
  for (const ps of d.scene.particleSystems) if (ps.name.startsWith("planeSmoke")) { ps.stop(); ps.reset(); }
  // particle systems left out of the frame by name prefix (the trains' diesel smoke renders as near-black blobs here)
  for (const ps of d.scene.particleSystems) if ((opts.hideParticles ?? []).some((p) => ps.name.startsWith(p))) { ps.stop(); ps.reset(); ps.emitRate = 0; }
  if (opts.hideClouds) for (const sm of d.scene.spriteManagers ?? []) { sm.isVisible = false; for (const sp of sm.sprites ?? []) sp.isVisible = false; }
  // film grain is animated noise: in a video it costs bitrate and reads as compression mush
  if (d.postPipe) { d.postPipe.grainEnabled = !!opts.grain; }
  // shadows every frame (the stills tool does the same)
  d.scene.shadowsEnabled = true;
  for (const l of d.scene.lights) { const sm = l.getShadowGenerator?.()?.getShadowMap?.(); if (sm) { l.shadowEnabled = true; sm.refreshRate = 1; } }
  if (opts.ss) { d.engine.setHardwareScalingLevel(1 / opts.ss); d.engine.resize(); }

  // ---- path: closed or open Catmull-Rom through [x, z] waypoints, sampled every ~2 m with arc length ----
  let path = null;
  if (opts.path) {
    const P = opts.path, n = P.length, closed = !!opts.pathClosed, pts = [];
    const get = (i) => closed ? P[(i + n) % n] : P[clamp(i, 0, n - 1)];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const steps = Math.max(4, Math.ceil(len / 2));
      for (let s = 0; s < steps; s++) {
        const t = s / steps, t2 = t * t, t3 = t2 * t;
        const cr = (a, b, c, e) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - e) * t2 + (-a + 3 * b - 3 * c + e) * t3);
        pts.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    if (!closed) pts.push(P[n - 1]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    path = { pts, cum, total: cum[cum.length - 1], closed };
  }
  const pathAt = (s) => {
    const { pts, cum, total, closed } = path;
    s = closed ? ((s % total) + total) % total : clamp(s, 0, total);
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const k = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    return [lerp(pts[lo][0], pts[hi][0], k), lerp(pts[lo][1], pts[hi][1], k)];
  };
  let sHint = null;
  const closestS = (x, z) => { // global search once, then local around the last hit (paths can come close to themselves)
    let best = sHint ?? 0, bd = Infinity;
    const [lo, hi, step] = sHint === null ? [0, path.total, 2] : [sHint - 30, sHint + 60, 1];
    for (let s = lo; s <= hi; s += step) { const p = pathAt(s); const dd = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (dd < bd) { bd = dd; best = s; } }
    sHint = best; return best;
  };

  // ---- initial state: on the path (or given, or from the shot's own page code), level, at speed ----
  const user = opts.extras ? (0, eval)(`(${opts.extras})`) : null; // shot-specific page code (start/target/camera hooks)
  const start = user?.start?.({ d, opts, ground }) ?? opts.start ?? (() => { const a = pathAt(0), b = pathAt(4); return { x: a[0], z: a[1], hdg: Math.atan2(b[0] - a[0], b[1] - a[1]) }; })();
  const startY = start.y ?? ground(start.x, start.z) + (opts.agl ?? 30);
  const ori = [0, Math.sin(start.hdg / 2), 0, Math.cos(start.hdg / 2)];
  const v0 = opts.speed ?? 24;
  let state = {
    position: new Float32Array([start.x, startY, start.z]), velocity: new Float32Array([Math.sin(start.hdg) * v0, 0, Math.cos(start.hdg) * v0]),
    orientation: new Float32Array(ori), angularVel: new Float32Array(3), throttle: 0.5, airspeed: v0, phase: "FLYING",
  };
  let ctl = { roll: 0, pitch: 0, throttle: 0.5, yaw: 0, launch: false, reset: false };
  let tSim = 0;
  const G = 9.81;
  // a smoothed altitude target: the highest ground over the next `lookS` s of the path, so it climbs early
  let yTarget = startY;
  const ctx = { d, opts, pathAt, ground, closestS, get state() { return state; }, get t() { return tSim; }, V3, mem: {} };
  if (user?.init) user.init(ctx);

  const pilot = (dt) => {
    const [x, y, z] = state.position;
    const V = Math.max(8, state.airspeed);
    const hdg = rot.headingAngle(state.orientation);
    let aimX, aimZ, wantY, wantV = opts.speed ?? 24;
    if (user?.target) { // a moving target supplied by the shot (e.g. a station beside a freight train)
      const tg = user.target(ctx);
      aimX = tg.x; aimZ = tg.z; wantY = tg.y; wantV = tg.speed ?? wantV;
    } else {
      const s = closestS(x, z);
      const L1 = V * (opts.l1 ?? 2.2);
      // the path offset sideways by pathOffset m (to the screen-right of travel: (-fz, fx) in this right-handed world)
      const off = (u) => { const a = pathAt(u), b = pathAt(u + 2); let fx = b[0] - a[0], fz = b[1] - a[1]; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l; const o = opts.pathOffset ?? 0; return [a[0] - fz * o, a[1] + fx * o]; };
      const a = off(s + L1);
      aimX = a[0]; aimZ = a[1];
      let gmax = -1e9; // terrain ahead along the (offset) path (anticipate rises)
      for (let k = 0; k <= 6; k++) { const p = off(s + (k / 6) * V * (opts.lookS ?? 3)); gmax = Math.max(gmax, ground(p[0], p[1])); }
      const agl = typeof opts.agl === "function" ? opts.agl(s) : (opts.aglAt ? (0, eval)(`(${opts.aglAt})`)(s, path.total) : (opts.agl ?? 30));
      wantY = gmax + agl;
    }
    // L1 lateral guidance: a = 2V²/L1 · sin(eta), bank = atan(a / g) — smooth, coordinated tracking
    const dx = aimX - x, dz = aimZ - z, dist = Math.hypot(dx, dz) || 1;
    const eta = wrapPi(Math.atan2(dx, dz) - hdg);
    const aLat = 2 * V * V / Math.max(dist, 20) * Math.sin(eta);
    const maxBank = (opts.maxBank ?? 50) * Math.PI / 180;
    const bankRight = clamp(Math.atan2(aLat, G), -maxBank, maxBank);
    yTarget += (wantY - yTarget) * (1 - Math.exp(-dt / (opts.yTau ?? 0.8)));
    const climb = state.velocity[1];
    const maxPitch = (opts.maxPitch ?? 14) * Math.PI / 180;
    const pitch = clamp((yTarget - y) * (opts.kAlt ?? 0.025) - climb * 0.06, -maxPitch, maxPitch) + (opts.pitchTrim ?? 0) * Math.PI / 180;
    const att = angleModeControl(state, { bankRight, pitch });
    const thr = clamp((opts.thrBase ?? 0.45) + (wantV - V) * (opts.kThr ?? 0.08), 0.05, 1);
    ctl = { roll: att.roll, pitch: att.pitch, throttle: thr, yaw: 0, launch: false, reset: false };
  };

  // ---- cameras: all driven explicitly; one critically-damped smoother per quantity ----
  const smooth = (cur, want, dt, tau) => cur + (want - cur) * (1 - Math.exp(-dt / tau));
  const cam = d.cams.chase;
  d.scene.activeCamera = cam;
  cam.rotationQuaternion = null;
  cam.fov = opts.fov ?? 0.75;
  cam.minZ = opts.minZ ?? 0.1;
  const camS = { init: false, hx: 0, hz: 1, px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0 };
  const placeCamera = (dt) => {
    const p = d.aircraft.root.position;
    const vx = state.velocity[0], vz = state.velocity[2], vh = Math.hypot(vx, vz) || 1;
    if (!camS.init) { camS.hx = vx / vh; camS.hz = vz / vh; }
    camS.hx = smooth(camS.hx, vx / vh, dt, opts.camHeadTau ?? 0.9);
    camS.hz = smooth(camS.hz, vz / vh, dt, opts.camHeadTau ?? 0.9);
    const hl = Math.hypot(camS.hx, camS.hz) || 1, fx = camS.hx / hl, fz = camS.hz / hl;
    const rx = -fz, rz = fx; // screen-right of a camera looking along (fx, fz) in this right-handed Y-up world
    let want;
    if (user?.camera) want = user.camera(ctx, { p, fx, fz, rx, rz, dt });
    else if (opts.cam === "fpv") {
      const f = rot.bodyForward(state.orientation), u = rot.bodyUp(state.orientation);
      const e = [p.x + f[0] * 0.4 + u[0] * 0.05, p.y + f[1] * 0.4 + u[1] * 0.05, p.z + f[2] * 0.4 + u[2] * 0.05];
      cam.position.set(e[0], e[1], e[2]);
      cam.upVector.set(u[0], u[1], u[2]);
      cam.setTarget(new V3(e[0] + f[0], e[1] + f[1], e[2] + f[2]));
      return;
    } else {
      const o = opts.camOffset ?? [6, 2, -10]; // [right, up, ahead] in the smoothed heading frame
      const la = opts.camLook ?? [0, 0, 6];
      want = {
        pos: [p.x + rx * o[0] + fx * o[2], p.y + o[1], p.z + rz * o[0] + fz * o[2]],
        look: [p.x + rx * la[0] + fx * la[2], p.y + la[1], p.z + rz * la[0] + fz * la[2]],
      };
    }
    if (!camS.init) { [camS.px, camS.py, camS.pz] = want.pos; [camS.lx, camS.ly, camS.lz] = want.look; camS.init = true; }
    const tp = want.posTau ?? opts.camPosTau ?? 0.12, tl = want.lookTau ?? opts.camLookTau ?? 0.08;
    camS.px = smooth(camS.px, want.pos[0], dt, tp); camS.py = smooth(camS.py, want.pos[1], dt, tp); camS.pz = smooth(camS.pz, want.pos[2], dt, tp);
    camS.lx = smooth(camS.lx, want.look[0], dt, tl); camS.ly = smooth(camS.ly, want.look[1], dt, tl); camS.lz = smooth(camS.lz, want.look[2], dt, tl);
    // never under the ground
    camS.py = Math.max(camS.py, ground(camS.px, camS.pz) + (opts.camMinAgl ?? 1.5));
    cam.position.set(camS.px, camS.py, camS.pz);
    cam.upVector.set(0, 1, 0);
    cam.setTarget(new V3(camS.lx, camS.ly, camS.lz));
    if (want.fov) cam.fov = want.fov;
  };

  const poseAircraft = (dt) => {
    const [x, y, z] = state.position, o = state.orientation;
    d.aircraft.root.position.set(x, y, z);
    if (!d.aircraft.root.rotationQuaternion) d.aircraft.root.rotationQuaternion = new Q(0, 0, 0, 1);
    d.aircraft.root.rotationQuaternion.set(o[0], o[1], o[2], o[3]);
    const e = mixElevons(ctl.pitch, -ctl.roll);
    d.aircraft.setElevons?.(e.left, e.right);
    d.aircraft.update(dt, state.throttle, 0, state.airspeed);
    const shown = opts.cam !== "fpv";
    for (const m of d.aircraft.meshes) m.layerMask = shown ? 0x0fffffff : 0; // FPV: hidden from the camera, still casts its shadow
  };

  const log = [];
  // Advance the world one video frame WITHOUT rendering (warm-up / pre-roll) or WITH (render = true).
  window.__clipStep = (render) => {
    const dt = 1 / fps;
    for (let i = 0; i < subs; i++) {
      pilot(FIXED_DT);
      state = FS.update(state, ctl, FIXED_DT, (x, z) => ground(x, z) - 50 /* never "crash" on a contact we did not plan */, cfg);
      tSim += FIXED_DT;
    }
    window.__clock.advance(1000 / fps);
    poseAircraft(dt);
    d.scenery.update?.(dt);
    placeCamera(dt);
    const c = d.scene.activeCamera, f = c.getForwardRay().direction, h = Math.hypot(f.x, f.z) || 1;
    d.scenery.updateCulling(c.position.x, c.position.z, f.x / h, f.z / h);
    d.fogAz?.update?.(f.x / h, f.z / h, dt);
    hideMeshes();
    d.engine.beginFrame();
    if (render) d.scene.render(); else d.scene.onBeforeRenderObservable.notifyObservers(d.scene);
    d.engine.endFrame();
    const [x, y, z] = state.position;
    const rec = { t: +tSim.toFixed(3), x: +x.toFixed(1), y: +y.toFixed(1), z: +z.toFixed(1), agl: +(y - ground(x, z)).toFixed(1),
      cd: +Math.hypot(d.scene.activeCamera.globalPosition.x - x, d.scene.activeCamera.globalPosition.y - y, d.scene.activeCamera.globalPosition.z - z).toFixed(1),
      v: +state.airspeed.toFixed(1), bank: +(-rot.bankAngle(state.orientation) * 57.3).toFixed(1), thr: +state.throttle.toFixed(2), phase: state.phase };
    log.push(rec);
    return rec;
  };
  window.__clipLog = () => log;
  window.__clipDiag = () => {
    const c = d.scene.activeCamera, r = d.aircraft.root, ra = r.getAbsolutePosition();
    const ms = d.aircraft.meshes.slice(0, 3).map((m) => { const a = m.getAbsolutePosition(); const bb = m.getBoundingInfo?.().boundingSphere; return { n: m.name, en: m.isEnabled(), vis: m.isVisible, lm: m.layerMask, at: [a.x, a.y, a.z].map((v) => +v.toFixed(1)), rad: bb ? +bb.radiusWorld.toFixed(2) : null }; });
    return { cam: c.name, activeCameras: (d.scene.activeCameras ?? []).map((k) => k.name), camPos: [c.position.x, c.position.y, c.position.z].map((v) => +v.toFixed(1)),
      camGlobal: [c.globalPosition.x, c.globalPosition.y, c.globalPosition.z].map((v) => +v.toFixed(1)), camParent: c.parent?.name ?? null, locked: !!c.lockedTarget,
      root: [r.position.x, r.position.y, r.position.z].map((v) => +v.toFixed(1)), rootAbs: [ra.x, ra.y, ra.z].map((v) => +v.toFixed(1)), rootParent: r.parent?.name ?? null,
      rootScale: [r.scaling.x, r.scaling.y, r.scaling.z], rootEnabled: r.isEnabled(), meshes: ms, nMeshes: d.aircraft.meshes.length,
      camToWing: +Math.hypot(c.globalPosition.x - ra.x, c.globalPosition.y - ra.y, c.globalPosition.z - ra.z).toFixed(1) };
  };
  return { subs, cfgOk: !!cfg, start: [start.x, startY, start.z] };
};
