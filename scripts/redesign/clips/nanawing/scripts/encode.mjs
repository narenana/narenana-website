// Encode a rendered frame set:  node encode.mjs <shot> [--frames N] [--loop L] [--crf 22] [--maxrate 2500] [--av1max 2300] [--keep]
// Loop: frames 0..N+L-1 were rendered; output frame i < L is a smoothstep cross-fade from frame N+i into frame i, so
// the last output frame (N-1) flows straight into output frame 0 (= rendered frame N) with no seam.
// Writes ../out/<shot>.mp4 (H.264 yuv420p, faststart, no audio), <shot>.webm (AV1), <shot>-poster.jpg, <shot>-contact.png.
import { SCRATCH, sharp } from "./lib.mjs";
import { SHOTS } from "./shots.mjs";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, readdirSync, statSync, copyFileSync, writeFileSync } from "node:fs";

const name = process.argv[2];
const arg = (k, def) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : def; };
const shot = SHOTS[name] ?? {};
const src = `${SCRATCH}/frames/${name}`;
const have = readdirSync(src).filter((f) => /^f\d{5}\.png$/.test(f)).length;
const L = arg("--loop", shot.loopFrames ?? 0);
const N = arg("--frames", Math.min(shot.frames ?? have, have - L));
if (N + L > have) throw new Error(`need ${N + L} frames, have ${have}`);
const seq = `${SCRATCH}/frames/${name}-seq`;
rmSync(seq, { recursive: true, force: true });
mkdirSync(seq, { recursive: true });
const f = (i) => `${src}/f${String(i).padStart(5, "0")}.png`;
const o = (i) => `${seq}/f${String(i).padStart(5, "0")}.png`;
for (let i = 0; i < N; i++) {
  if (i >= L) { copyFileSync(f(i), o(i)); continue; }
  const w = i / L, s = w * w * (3 - 2 * w); // smoothstep weight of the head frame
  const [a, b] = await Promise.all([f(N + i), f(i)].map((p) => sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true })));
  const out = Buffer.alloc(a.data.length);
  for (let k = 0; k < out.length; k++) out[k] = Math.round(a.data[k] * (1 - s) + b.data[k] * s);
  await sharp(out, { raw: a.info }).png({ compressionLevel: 3 }).toFile(o(i));
}
const OUT = `${SCRATCH}/out`;
mkdirSync(OUT, { recursive: true });
const ff = (args) => execFileSync(process.env.FFMPEG ?? "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
const crf = arg("--crf", 22), maxrate = arg("--maxrate", 2500);
ff(["-framerate", "30", "-i", `${seq}/f%05d.png`, "-c:v", "libx264", "-preset", "slow", "-crf", String(crf),
  "-maxrate", `${maxrate}k`, "-bufsize", `${maxrate * 2}k`, "-pix_fmt", "yuv420p", "-profile:v", "high", "-g", "60",
  "-movflags", "+faststart", "-an", `${OUT}/${name}.mp4`]);
// AV1 in VBR to a target (--av1max, kbit/s). Capped CRF (crf + mbr) gave displaced blocks on the train shot with SVT-AV1 4.2.
const av1max = arg("--av1max", 2300);
ff(["-framerate", "30", "-i", `${seq}/f%05d.png`, "-c:v", "libsvtav1", "-preset", "5", "-b:v", `${av1max}k`, "-g", "300",
  "-pix_fmt", "yuv420p10le", "-an", `${OUT}/${name}.webm`]); // 10-bit, as the Nanawing 2 clips: codecs=av01.0.08M.10
// poster = output frame 0, as the video's first frame
let q = 82, poster;
do { poster = await sharp(o(0)).jpeg({ quality: q, mozjpeg: true }).toBuffer(); q -= 6; } while (poster.length > 195_000 && q > 40);
writeFileSync(`${OUT}/${name}-poster.jpg`, poster);
await sharp(o(0)).webp({ quality: 80 }).toFile(`${OUT}/${name}-poster.webp`); // the site's poster
// contact sheet: 6 frames evenly over the clip, 3 x 2 at 640 x 360
const picks = [0, 1, 2, 3, 4, 5].map((k) => Math.round((k * (N - 1)) / 5));
const tiles = await Promise.all(picks.map((i) => sharp(o(i)).resize(640, 360).png().toBuffer()));
await sharp({ create: { width: 1920, height: 720, channels: 3, background: "#000" } })
  .composite(tiles.map((t, k) => ({ input: t, left: (k % 3) * 640, top: Math.floor(k / 3) * 360 }))).png().toFile(`${OUT}/${name}-contact.png`);
for (const ext of [".mp4", ".webm", "-poster.jpg", "-poster.webp", "-contact.png"]) console.log(`${OUT}/${name}${ext}  ${(statSync(`${OUT}/${name}${ext}`).size / 1024).toFixed(0)} KB`);
console.log(`contact frames: ${picks.join(", ")} of ${N} (${(N / 30).toFixed(1)} s, loop crossfade ${L} frames)`);
if (!process.argv.includes("--keep")) { rmSync(seq, { recursive: true, force: true }); }
