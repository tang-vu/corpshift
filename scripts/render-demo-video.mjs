#!/usr/bin/env node
/** Assemble the visual demo with a personal-voice VoiceTake WAV supplied locally. */
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const work = resolve(root, "data/demo-video-render");
const voice = process.env.DEMO_VOICE_WAV;
const captions = process.env.DEMO_CAPTIONS_SRT;
const dryRun = process.env.DEMO_DRY_RUN === "1";
if (!voice && !dryRun) throw new Error("Set DEMO_VOICE_WAV to a VoiceTake narration WAV.");
const output = resolve(process.env.DEMO_VIDEO_OUT ?? resolve(root, "submission/demo-video.mp4"));

function run(program, args) {
  return new Promise((done, reject) => {
    const child = spawn(program, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? done(stdout.trim())
        : reject(new Error(`${program} exited ${code}\n${stderr.slice(-3000)}`)),
    );
  });
}

console.log(await run("python", [resolve(root, "scripts/render-demo-slides.py")]));
if (dryRun) process.exit(0);

const duration = Number(
  await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    voice,
  ]),
);
if (!Number.isFinite(duration) || duration < 15) throw new Error("Invalid narration duration.");
const scenes = JSON.parse(await readFile(resolve(work, "slides-manifest.json"), "utf8"));
const totalWeight = scenes.reduce((sum, scene) => sum + scene.weight, 0);
const suppliedCuts = process.env.DEMO_CUTS?.split(",").map(Number);
if (
  suppliedCuts &&
  (suppliedCuts.length !== scenes.length + 1 ||
    suppliedCuts[0] !== 0 ||
    suppliedCuts.some((cut, i) => !Number.isFinite(cut) || (i > 0 && cut <= suppliedCuts[i - 1])))
) {
  throw new Error("DEMO_CUTS must contain 10 increasing times, starting at 0.");
}
const segments = [];
for (let i = 0; i < scenes.length; i++) {
  const seconds = suppliedCuts
    ? suppliedCuts[i + 1] - suppliedCuts[i]
    : ((duration + 1.2) * scenes[i].weight) / totalWeight;
  const segment = resolve(work, `segment-${String(i).padStart(2, "0")}.mp4`);
  segments.push(segment);
  await run("ffmpeg", [
    "-y",
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    resolve(work, `slide-${String(i).padStart(2, "0")}.png`),
    "-t",
    seconds.toFixed(3),
    "-vf",
    "zoompan=z='min(zoom+0.00017,1.045)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-an",
    segment,
  ]);
  console.log(`Rendered scene ${i + 1}/${scenes.length}`);
}
const listPath = resolve(work, "segments.txt");
await writeFile(
  listPath,
  segments.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join("\n"),
);
const muxArgs = ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-i", voice];
if (captions) muxArgs.push("-i", captions);
muxArgs.push("-map", "0:v:0", "-map", "1:a:0");
if (captions) muxArgs.push("-map", "2:s:0", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng");
muxArgs.push(
  "-c:v",
  "copy",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-af",
  `afade=t=in:st=0:d=0.3,afade=t=out:st=${Math.max(0, duration - 0.5).toFixed(3)}:d=0.5`,
  "-movflags",
  "+faststart",
  "-t",
  (duration + 1.2).toFixed(3),
  output,
);
await run("ffmpeg", muxArgs);
await writeFile(
  resolve(work, "render-manifest.json"),
  JSON.stringify(
    { narrationSeconds: duration, output, cuts: suppliedCuts, captions: Boolean(captions), scenes },
    null,
    2,
  ),
);
console.log(`Rendered ${output} (${duration.toFixed(1)}s narration)`);
