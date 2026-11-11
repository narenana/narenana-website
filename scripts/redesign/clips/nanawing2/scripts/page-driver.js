// Injected into tests/fixtures/flight-motion.html after window.ready. Development capture only.
//
// window.clip.setup(opts)   select aircraft/physics, hide the transmitter, stub GPU submission
// window.clip.fly(seconds)  advance the REAL Simulator (s.frame()) at a fixed 1/120 s, with a
//                           closed-loop CPU pilot supplying the four ordinary channels each tick
// window.clip.shoot()       apply the shot camera, draw one frame and return it as a PNG data URL
//
// The pilot is a port of scripts/powered-fleet-pilot.mjs (flyPoweredCircuit): same telemetry,
// same gains and the same take-off / flare / rollout logic. Only the route is configurable, so a
// shot can ask for a low pass instead of a landing. Nothing here touches forces, geometry or the
// aircraft's parameters; the pilot only moves sticks.
(() => {
  const { Vector3, Matrix } = window.geometry;
  const { FIELD_SITE, AIRCRAFT, fieldHeight } = window.fieldCheck;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
  const STEP = 1 / 120;
  const s = window.sim;

  function telemetry(m) {
    const rot = Matrix.Identity();
    m.attitude.toRotationMatrix(rot);
    const f = Vector3.TransformNormal(Vector3.Forward(), rot);
    const u = Vector3.TransformNormal(Vector3.Up(), rot);
    const r = Vector3.TransformNormal(Vector3.Right(), rot);
    return {
      x: m.position.x,
      h: m.position.y,
      z: m.position.z,
      speed: m.velocity.subtract(m.wind).length(),
      pitch: Math.asin(clamp(f.y, -1, 1)),
      bank: -Math.atan2(r.y, u.y),
      heading: Math.atan2(f.x, f.z),
      climb: m.velocity.y,
      pitchRate: -m.rates.x,
      rollRate: -m.rates.z,
    };
  }

  // route: [{ to: [x, z], alt: metres AGL (cruise if omitted), radius, speed: factor }]
  // land: true makes the last leg the ordinary flyPoweredCircuit final + flare + rollout.
  function makePilot({ aircraft, trim, gains = {}, route, land = true }) {
    const spec = AIRCRAFT[aircraft];
    const scale = Math.max(1, (trim.airspeed / 14) ** 2);
    const p = {
      rollP: 2,
      rollD: 0.35,
      pitchP: 2.5,
      pitchD: 0.4,
      verticalP: 0.1,
      speedP: 0.13,
      bankMax: 0.55,
      approachSpeedFactor: 0.92,
      flareSink: 0.25,
      cutHeight: 0.8,
      flareHeight: 1.2,
      flarePitch: 0,
      circuitScale: scale,
      cruiseHeight: 24 * Math.sqrt(scale),
      touchdownZ: FIELD_SITE.runway.minZ + 24,
      rotationSpeed: 0.85 * trim.airspeed,
      rotationElevator: 0.3,
      tailHoldElevator: 0,
      tailReleaseSpeed: 0.7 * trim.airspeed,
      groundPitch: 0.05,
      courseNavigation: true,
      yawP: 0.6,
      groundYawP: 2,
      groundYawD: 0.3,
      groundXGain: 0.05,
      groundRudderLimit: 0.4,
      ...gains,
    };
    // Default route = the powered-fleet-pilot circuit, including its terrain clearance pass.
    if (!route) {
      const routeFor = () => {
        const finalDistance = Math.max(
          160 * p.circuitScale,
          p.cruiseHeight / 0.085 + 40,
        );
        return [
          [0, 120 * p.circuitScale],
          [-120 * p.circuitScale, 120 * p.circuitScale],
          [-120 * p.circuitScale, -finalDistance],
          [0, -finalDistance],
          [0, 60],
        ];
      };
      let w = routeFor();
      for (let pass = 0; pass < 2; pass++) {
        let prev = [0, 0];
        for (const pt of w) {
          for (let k = 0; k <= 40; k++) {
            const fr = k / 40;
            p.cruiseHeight = Math.max(
              p.cruiseHeight,
              fieldHeight(prev[0] + (pt[0] - prev[0]) * fr, prev[1] + (pt[1] - prev[1]) * fr) + 25,
            );
          }
          prev = pt;
        }
        w = routeFor();
      }
      route = w.map((to) => ({ to }));
    }
    const last = route.length - 1;
    const state = { leg: 0, motorCut: false, firstContact: false, departed: false, loopAngle: 0 };
    const zero = { throttle: 0, elevator: 0, aileron: 0, rudder: 0 };
    function sample() {
      const m = s.model;
      if (m.phase === 'ready') return { ...zero, throttle: spec.launchMode === 'hand' ? 0.65 : 0 };
      const t = telemetry(m);
      const agl = t.h - fieldHeight(t.x, t.z);
      const leg = route[state.leg];
      const radius = leg.radius ?? 32 * p.circuitScale;
      if (state.leg < last) {
        if (leg.loop) {
          if (state.loopAngle >= 2 * Math.PI - (leg.exitEarly ?? 0.3)) state.leg++;
        } else if (leg.passZ !== undefined) {
          // Advance once the aircraft passes z = passZ in its direction of travel along the line.
          if ((t.z - leg.passZ) * Math.sign(Math.cos(leg.line ?? 0) || 1) > 0) state.leg++;
        } else if (leg.align) {
          // Advance once established on the line: cross-track and heading both small.
          const hx = Math.sin(leg.line), hz = Math.cos(leg.line);
          const cross = (t.x - leg.to[0]) * hz - (t.z - leg.to[1]) * hx;
          if (Math.abs(cross) < leg.align[0] && Math.abs(wrap(t.heading - leg.line)) < leg.align[1]) state.leg++;
        } else if (Math.hypot(t.x - leg.to[0], t.z - leg.to[1]) < radius) state.leg++;
      }
      const cur = route[state.leg];
      if (cur.loop && m.phase === 'flying') {
        // Inside loop: full power, a steady pull, wings held level by roll damping (bank is only
        // trusted while the nose is within 50 deg of the horizon). Ends after 360 deg of pitch.
        if (state.loopLeg !== state.leg) {
          state.loopLeg = state.leg; // a new loop: restart the pitch count
          state.loopAngle = 0;
        }
        state.loopAngle += t.pitchRate / 120;
        const w = Math.abs(t.pitch) < 0.87 && Math.abs(t.bank) < 1.4 ? 1 : 0;
        return {
          throttle: cur.throttle ?? 1,
          elevator: cur.elevator ?? 0.6,
          aileron: clamp(-p.rollD * t.rollRate - w * p.rollP * 0.5 * t.bank, -1, 1),
          rudder: 0,
        };
      }
      const final = land && state.leg === last;
      let desiredHeading = Math.atan2(cur.to[0] - t.x, cur.to[1] - t.z);
      const dir = p.finalDir ?? 1;
      if (final) desiredHeading = Math.atan2(-t.x, dir * Math.max(22, t.speed * 2.5));
      else if (cur.line !== undefined) {
        // Track a straight line through `to` along heading cur.line (a pass), not a point.
        const hx = Math.sin(cur.line), hz = Math.cos(cur.line);
        const cross = (t.x - cur.to[0]) * hz - (t.z - cur.to[1]) * hx;
        desiredHeading = cur.line + clamp(-cross / Math.max(22, t.speed * 2.5), -0.8, 0.8);
      }
      const course = Math.atan2(m.velocity.x, m.velocity.z);
      const desiredBank = clamp(
        wrap(desiredHeading - (p.courseNavigation ? course : t.heading)) * 1.3,
        -(cur.bankMax ?? p.bankMax),
        cur.bankMax ?? p.bankMax,
      );
      const ground = fieldHeight(t.x, t.z);
      const altitude = final
        ? Math.max(0.12, dir * (p.touchdownZ - t.z) * 0.09)
        : cur.alt !== undefined
          ? ground + cur.alt
          : Math.max(p.cruiseHeight, ground + 20);
      const glideClimb = final && altitude > 0.12 ? -0.09 * dir * m.velocity.z : 0;
      let desiredClimb = clamp(glideClimb + (altitude - t.h) * 0.45, -2.2, 3);
      if (final && agl < p.flareHeight) desiredClimb = -p.flareSink;
      const desiredSpeed = trim.airspeed * (final ? p.approachSpeedFactor : (cur.speed ?? 1));
      let desiredPitch = clamp(
        trim.pitchRadians +
          Math.asin(clamp(desiredClimb / Math.max(t.speed, 6), -0.35, 0.35)) +
          p.verticalP * (desiredClimb - t.climb) +
          0.14 * (1 / Math.cos(t.bank) - 1),
        -0.3,
        0.3,
      );
      if (final && agl < p.flareHeight) desiredPitch = Math.max(p.flarePitch, desiredPitch);
      let c = {
        throttle: trim.controls.throttle + p.speedP * (desiredSpeed - t.speed) + 0.13 * desiredClimb,
        elevator: trim.controls.elevator + p.pitchP * (desiredPitch - t.pitch) - p.pitchD * t.pitchRate,
        aileron: trim.controls.aileron + p.rollP * (desiredBank - t.bank) - p.rollD * t.rollRate,
        rudder: spec.activeAxes[2] ? trim.controls.rudder + p.yawP * wrap(course - t.heading) : 0,
      };
      if (final && agl < p.cutHeight) state.motorCut = true;
      if (state.motorCut) c.throttle = 0;
      if (m.phase === 'taxi') {
        c.throttle = Math.min(1, m.time / 2);
        c.elevator =
          t.speed < p.tailReleaseSpeed ? p.tailHoldElevator : t.speed > p.rotationSpeed ? p.rotationElevator : 0;
        c.aileron = clamp(-p.rollP * t.bank - p.rollD * t.rollRate, -1, 1);
        c.rudder = clamp(
          -p.groundYawP * t.heading - p.groundYawD * m.rates.y + 0.1 * (FIELD_SITE.runwayStart[0] - t.x),
          -0.4,
          0.4,
        );
      } else if ((m.phase === 'rolling' || (state.firstContact && agl < 0.9)) && !m.landing?.contact?.flags) {
        c.throttle = 0;
        c.elevator = clamp(
          trim.controls.elevator + p.pitchP * (p.groundPitch - t.pitch) - p.pitchD * t.pitchRate,
          -0.5,
          0.5,
        );
        c.aileron = clamp(-p.rollP * t.bank - p.rollD * t.rollRate, -1, 1);
        c.rudder = clamp(
          -p.groundYawP * wrap(t.heading - (dir > 0 ? 0 : Math.PI)) - p.groundYawD * m.rates.y - dir * p.groundXGain * t.x,
          -p.groundRudderLimit,
          p.groundRudderLimit,
        );
      } else if (m.phase !== 'flying') c = { ...zero };
      if (m.phase === 'flying') state.departed = true;
      if (!state.firstContact && state.departed && m.landing) state.firstContact = true;
      for (const k of ['elevator', 'aileron', 'rudder']) c[k] = clamp(c[k], -1, 1);
      c.throttle = clamp(c.throttle, 0, 1);
      return c;
    }
    return { sample, state, gains: p, route };
  }

  // ---- camera modes ----------------------------------------------------------------------------
  // 'game'   : the Simulator's own pilot camera (fixed eye, PilotTracker aim, auto zoom, larger view)
  // 'fixed'  : fixed eye/aim/fov
  // 'follow' : fixed eye; aim = blend of a fixed composition point and the aircraft, smoothed
  let cam = { mode: 'game' };
  let followAim = null;
  let chaseRot = null;
  let frameFov = null;
  // Put `target` at screen (u, v) in NDC (-1..1, +v up). Own maths (Babylon's FreeCamera:
  // rotation.y = yaw, rotation.x = pitch, +x looks down, left-handed), so no matrix cache is involved.
  function ndcOf(c, target) {
    const yaw = c.rotation.y, pitch = c.rotation.x;
    const dx = target.x - c.position.x, dy = target.y - c.position.y, dz = target.z - c.position.z;
    const fwd = [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const up = [Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)];
    const dot = (a) => a[0] * dx + a[1] * dy + a[2] * dz;
    const z = dot(fwd);
    const tanV = Math.tan(c.fov / 2);
    const tanH = tanV * (s.engine.getRenderWidth() / s.engine.getRenderHeight());
    return { x: dot(right) / z / tanH, y: dot(up) / z / tanV };
  }
  function aimAtScreen(c, target, u, v) {
    for (let i = 0; i < 40; i++) {
      const p = ndcOf(c, target);
      const tanV = Math.tan(c.fov / 2);
      const tanH = tanV * (s.engine.getRenderWidth() / s.engine.getRenderHeight());
      c.rotation.y += 0.8 * (Math.atan(p.x * tanH) - Math.atan(u * tanH));
      c.rotation.x -= 0.8 * (Math.atan(p.y * tanV) - Math.atan(v * tanV));
    }
  }
  function applyCamera(dt) {
    const c = s.camera;
    if (cam.mode === 'game') return;
    const plane = s.aircraft.root.position;
    if (cam.mode === 'chase') {
      // A camera car: fixed x/height, travels with the aircraft along z, fixed orientation chosen
      // once so the aircraft starts at screen (u, v). The aircraft's own wander stays visible.
      c.fov = cam.fov;
      // pin: the car also follows the aircraft's small x/y wander, so the aircraft stays on exactly
      // the same pixels and a loop crossfade only blends the background.
      const pin = cam.pin && cam.aimXY;
      if (!chaseRot) c.position.set(cam.eye[0], cam.eye[1], plane.z + cam.dz); // aim from the nominal eye
      else
        c.position.set(
          cam.eye[0] + (pin ? plane.x - cam.aimXY[0] : 0),
          cam.eye[1] + (pin ? plane.y - cam.aimXY[1] : 0),
          plane.z + cam.dz,
        );
      if (!chaseRot) {
        // Aim at the aircraft's MEAN x/y over the window (from the dry run), not wherever it happens
        // to be when the camera is first placed.
        const t = cam.aimXY ? new Vector3(cam.aimXY[0], cam.aimXY[1], plane.z) : plane;
        c.rotation.set(0, Math.atan2(t.x - c.position.x, t.z - c.position.z), 0);
        aimAtScreen(c, t, cam.screen[0], cam.screen[1]);
        chaseRot = c.rotation.clone();
      }
      c.rotation.copyFrom(chaseRot);
      return;
    }
    if (cam.mode === 'frame') {
      // Fixed eye; smoothed aim with a little lead; a lens that keeps the span at a set share of
      // the frame width (an operator zooming to hold the aircraft size), clamped.
      c.position.set(...cam.eye);
      const m = s.model;
      const want = plane.add(m.velocity.scale(cam.lead ?? 0.15));
      if (cam.aimOffset) want.addInPlace(new Vector3(...cam.aimOffset));
      if (!followAim || dt === 0 && !followAim) followAim = want.clone();
      else if (dt > 0) Vector3.LerpToRef(followAim, want, 1 - Math.exp(-dt * (cam.rate ?? 4)), followAim);
      const x = followAim.x - c.position.x, y = followAim.y - c.position.y, z = followAim.z - c.position.z;
      c.rotation.set(-Math.atan2(y, Math.hypot(x, z)), Math.atan2(x, z), 0);
      const aspect = s.engine.getRenderWidth() / s.engine.getRenderHeight();
      const d = Vector3.Distance(plane, c.position);
      const span = AIRCRAFT[s.aircraftId].span;
      const target = Math.min(cam.maxFov ?? 1.0, Math.max(cam.minFov ?? 0.08,
        2 * Math.atan(span / (2 * d * cam.widthFraction * aspect))));
      if (frameFov === null) frameFov = target;
      else if (dt > 0) frameFov += (target - frameFov) * (1 - Math.exp(-dt * (cam.zoomRate ?? 2)));
      c.fov = frameFov;
      return;
    }
    if (cam.eye) c.position.set(...cam.eye);
    const aim = new Vector3(...(cam.aim ?? FIELD_SITE.lookAt));
    if (cam.mode === 'follow') {
      const a = s.aircraft.root.position;
      const k = cam.weight ?? 0.6;
      const want = aim.scale(1 - k).add(a.scale(k));
      if (cam.aimOffset) want.addInPlace(new Vector3(...cam.aimOffset));
      if (!followAim) followAim = want.clone();
      else Vector3.LerpToRef(followAim, want, 1 - Math.exp(-dt * (cam.rate ?? 2)), followAim);
      aim.copyFrom(followAim);
    }
    const x = aim.x - c.position.x, y = aim.y - c.position.y, z = aim.z - c.position.z;
    c.rotation.set(-Math.atan2(y, Math.hypot(x, z)), Math.atan2(x, z), 0);
    if (cam.fov) c.fov = cam.fov;
  }

  let pilot = null;
  let draw = null;
  const log = [];
  window.clip = {
    telemetry,
    async setup({ aircraft, physics, trim, gains, route, land, smoke = false, radio = false, scale = 1 }) {
      // Stub GPU submission first: setAircraft's warmup (prepareFlightView) would otherwise draw
      // 32 full frames under SwiftShader (~4.5 min at 1080p). Shaders compile on the first real draw.
      if (!draw) {
        draw = s.scene.render.bind(s.scene);
        s.scene.render = () => {};
      }
      if (s.aircraftId !== aircraft) await s.setAircraft(aircraft);
      s.setPhysics(physics ?? AIRCRAFT[aircraft].defaultPhysics);
      s.setMenu(false);
      s.resetControlTuning(); // identity tuning: the pilot's channels reach the model unchanged
      if (s.smokeOn !== smoke) s.toggleSmoke();
      const tx = s.scene.getTransformNodeByName('RadioMaster-style transmitter');
      tx?.setEnabled(radio);
      s.setSound(false);
      s.engine.setHardwareScalingLevel(scale);
      s.engine.resize();
      // A custom camera may have moved the shared camera; the game's pilot view assumes the station.
      s.camera.position.set(...FIELD_SITE.pilot);
      s.reset();
      pilot = makePilot({ aircraft, trim, gains, route, land });
      s.setInput({ sample: () => pilot.sample(), reset() {}, dispose() {} });
      s.engine.getDeltaTime = () => 1000 / 120;
      if (!draw) {
        draw = s.scene.render.bind(s.scene);
        s.scene.render = () => {};
      }
      followAim = null;
      log.length = 0;
      s.launch();
      return {
        buffer: [s.engine.getRenderWidth(), s.engine.getRenderHeight()],
        phase: s.model.phase,
        physics: s.physics,
        gains: pilot.gains,
        route: pilot.route,
      };
    },
    setCamera(c) {
      cam = c;
      followAim = null;
      chaseRot = null;
      frameFov = null;
    },
    // Advance `seconds` of simulated time; log a 30 Hz trace.
    fly(seconds) {
      const n = Math.round(seconds * 120);
      for (let i = 0; i < n; i++) {
        s.frame();
        if (cam.mode !== 'game') applyCamera(STEP);
        if (s.error) throw Error(s.error);
        const m = s.model;
        if (Math.round(m.time * 120) % 4 === 0) {
          const t = telemetry(m);
          log.push([
            +m.time.toFixed(4),
            m.phase,
            pilot.state.leg,
            +m.position.x.toFixed(3),
            +m.position.y.toFixed(3),
            +m.position.z.toFixed(3),
            +m.velocity.subtract(m.wind).length().toFixed(2),
            +t.pitch.toFixed(4),
            +t.bank.toFixed(4),
            +t.heading.toFixed(4),
          ]);
        }
      }
      return { time: s.model.time, phase: s.model.phase, leg: pilot.state.leg, landing: s.model.landing };
    },
    trace() {
      return log.slice();
    },
    // Advance one output frame (stepsPerFrame physics ticks), then draw and capture.
    shoot(stepsPerFrame = 4, type = 'image/png', quality) {
      for (let i = 0; i < stepsPerFrame; i++) {
        s.frame();
        applyCamera(STEP);
      }
      applyCamera(0);
      const t0 = performance.now();
      draw();
      const gl = s.engine._gl;
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); // wait for the GPU
      const t1 = performance.now();
      const url = s.engine.getRenderingCanvas().toDataURL(type, quality);
      window.clip.lastTiming = { drawMs: t1 - t0, encodeMs: performance.now() - t1 };
      return url;
    },
    // Studio still of one aircraft: everything else hidden, clear colour `clear` (alpha 0 for a
    // transparent PNG), one fixed camera direction for every aircraft (azimuth off the nose,
    // elevation above), distance fitted so the aircraft spans `fill` of the frame width.
    async studio({ aircraft, fill = 0.7, azimuth = 0.62, elevation = 0.33, clear = [0, 0, 0, 0], at = [0, 40, 0], heading = 2.4 }) {
      if (!draw) {
        draw = s.scene.render.bind(s.scene);
        s.scene.render = () => {};
      }
      if (s.aircraftId !== aircraft) await s.setAircraft(aircraft);
      s.setMenu(true);
      if (s.smokeOn) s.toggleSmoke();
      const root = s.aircraft.root;
      const mine = new Set([root, ...root.getDescendants(false)]);
      for (const m of s.scene.meshes) if (!mine.has(m)) m.setEnabled(false);
      for (const ps of s.scene.particleSystems) ps.stop();
      s.scene.getTransformNodeByName('RadioMaster-style transmitter')?.setEnabled(false);
      const { Color4, Quaternion } = { Color4: s.scene.clearColor.constructor, Quaternion: root.rotationQuaternion.constructor };
      s.scene.clearColor = new Color4(...clear);
      root.position.set(...at);
      root.rotationQuaternion = Quaternion.RotationYawPitchRoll(heading, 0, 0);
      s.aircraft.animate({ throttle: 0.3, elevator: 0, aileron: 0, rudder: 0 }, 0, 0);
      root.computeWorldMatrix(true);
      const meshes = root.getChildMeshes(false).filter((m) => m.isEnabled() && m.getTotalVertices() > 0);
      const pts = [];
      // Fit to the real vertices (bounding-box corners overstate a slender wing's outline).
      for (const m of meshes) {
        const wm = m.computeWorldMatrix(true);
        const pos = m.getVerticesData('position');
        if (!pos) continue;
        const stride = Math.max(1, Math.floor(pos.length / 3 / 4000));
        for (let i = 0; i < pos.length / 3; i += stride)
          pts.push(Vector3.TransformCoordinates(new Vector3(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]), wm));
      }
      const lo = pts.reduce((a, v) => Vector3.Minimize(a, v)), hi = pts.reduce((a, v) => Vector3.Maximize(a, v));
      const center = lo.add(hi).scale(0.5);
      // Camera direction: from the aircraft's nose, `azimuth` round to its left, `elevation` up.
      const h = heading - azimuth;
      const dir = new Vector3(Math.sin(h) * Math.cos(elevation), Math.sin(elevation), Math.cos(h) * Math.cos(elevation));
      const c = s.camera;
      c.fov = 0.5;
      let dist = 5;
      for (let i = 0; i < 30; i++) {
        c.position.copyFrom(center.add(dir.scale(dist)));
        const x = center.x - c.position.x, y = center.y - c.position.y, z = center.z - c.position.z;
        c.rotation.set(-Math.atan2(y, Math.hypot(x, z)), Math.atan2(x, z), 0);
        let minX = 9, maxX = -9, minY = 9, maxY = -9;
        for (const v of pts) {
          const q = ndcOf(c, v);
          minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
        }
        // Centre the projected box, then scale distance so the width is `fill`.
        aimAtScreen(c, center, -(minX + maxX) / 2 + 0, -(minY + maxY) / 2 + 0);
        const width = (maxX - minX) / 2;
        dist *= width / fill;
      }
      c.rotation.set(-Math.atan2(center.y - c.position.y, Math.hypot(center.x - c.position.x, center.z - c.position.z)), Math.atan2(center.x - c.position.x, center.z - c.position.z), 0);
      // Recentre once more on the projected box.
      let minX = 9, maxX = -9, minY = 9, maxY = -9;
      for (const v of pts) { const q = ndcOf(c, v); minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); }
      aimAtScreen(c, center, -(minX + maxX) / 2, -(minY + maxY) / 2);
      for (let i = 0; i < 3; i++) draw();
      const gl = s.engine._gl;
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      return {
        url: s.engine.getRenderingCanvas().toDataURL('image/png'),
        dist, box: [minX, maxX, minY, maxY].map((v) => +v.toFixed(3)), size: hi.subtract(lo).asArray().map((v) => +v.toFixed(2)),
        meshes: meshes.length,
      };
    },
    state() {
      const m = s.model;
      const c = s.camera;
      const vp = c.getViewMatrix(true).multiply(c.getProjectionMatrix(true));
      const ndc = Vector3.TransformCoordinates(s.aircraft.root.position, vp);
      return {
        ndc: [+ndc.x.toFixed(3), +ndc.y.toFixed(3)],
        myNdc: (() => { const q = ndcOf(c, s.aircraft.root.position); return [+q.x.toFixed(3), +q.y.toFixed(3)]; })(),
        rot: [c.rotation.x, c.rotation.y, c.rotation.z].map((v) => +v.toFixed(4)),
        chaseRot: chaseRot && [chaseRot.x, chaseRot.y].map((v) => +v.toFixed(4)),
        quat: !!c.rotationQuaternion,
        camPos: c.position.asArray().map((v) => +v.toFixed(2)),
        aspect: s.engine.getAspectRatio(c),
        fovMode: c.fovMode,
        time: m.time,
        phase: m.phase,
        leg: pilot.state.leg,
        position: m.position.asArray(),
        fov: s.camera.fov,
        camera: [s.camera.position.asArray(), s.camera.rotation.asArray()],
        distance: Vector3.Distance(m.position, s.camera.position),
        landing: m.landing,
      };
    },
  };
})();
