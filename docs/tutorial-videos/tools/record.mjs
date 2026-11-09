// Records the tutorial in a real browser against a running copy of the app, once per language.
//
//   node tools/record.mjs                      all languages, full recording
//   node tools/record.mjs --lang he            one language
//   node tools/record.mjs --fast               dry run: no video, near-zero pauses, only checks that the flow works
//   node tools/record.mjs --shots              also save a PNG at key moments (output/<lang>/shots)
//   node tools/record.mjs --base http://127.0.0.1:5180
//
// Writes output/<lang>/NN-<scene>.mp4 (one clip per scene), output/<lang>/full-<lang>.mp4 and timeline.json.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, createSession, encodeSegment, setTimeScale } from "./lib.mjs";
import { FILES, SCENES, narrationSeconds } from "./scenario.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const base = option("base", process.env.APP_URL ?? "http://127.0.0.1:5180").replace(/\/$/, "");
const languages = option("lang", "en,ru,he").split(",");
const fast = flag("fast");
const shots = flag("shots") || fast;
const csv = readFileSync(FILES.csv, "utf8");

if (fast) setTimeScale(0.05);

async function recordLanguage(lang) {
  const outDir = join(ROOT, "output", lang);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const log = (message) => console.log(`[${lang}] ${message}`);

  const s = await createSession({ lang, baseUrl: base, outDir, record: !fast, shots, log });
  const context = { s, t: s.t, page: s.page, lang, base, csv };
  let recording;
  try {
    for (const scene of SCENES) {
      log(`scene ${scene.id}`);
      s.startScene(scene.id);
      for (const step of scene.steps) {
        const narration = step.say[lang];
        const entry = s.startStep(step.id, narration);
        const began = Date.now();
        const needed = narrationSeconds(narration, lang) * 1000;
        // Lets a step spread its actions across the narration: await c.at(0.5) waits until half of it has been spoken.
        context.at = async (fraction) => {
          if (fast) return;
          const wait = began + fraction * needed - Date.now();
          if (wait > 0) await s.pause(wait);
        };
        try {
          await step.run(context);
        } catch (error) {
          await s.page.screenshot({ path: join(outDir, `error-${scene.id}-${step.id}.png` ) }).catch(() => {});
          throw new Error(`${scene.id}/${step.id} failed: ${error.message}`);
        }
        const spent = Date.now() - began;
        if (!fast && spent < needed) await s.pause(needed - spent);
        s.endStep(entry);
        log(`  ${step.id}: ${(entry.end - entry.start).toFixed(1)} s (actions ${(spent / 1000).toFixed(1)} s, narration ${(needed / 1000).toFixed(1)} s)`);
      }
      s.endScene();
    }
  } finally {
    recording = await s.finish();
  }
  if (fast) return;

  const workDir = join(outDir, "work");
  const clips = [];
  for (const [index, scene] of s.timeline.scenes.entries()) {
    const file = `${String(index + 1).padStart(2, "0")}-${scene.id}.mp4`;
    log(`encoding ${file}`);
    await encodeSegment({ ...recording, from: scene.start, to: scene.end, outFile: join(outDir, file), workDir });
    clips.push({ file, id: scene.id, seconds: scene.end - scene.start });
  }
  const first = s.timeline.scenes[0].start;
  const last = s.timeline.scenes.at(-1).end;
  const full = `full-${lang}.mp4`;
  log(`encoding ${full}`);
  await encodeSegment({ ...recording, from: first, to: last, outFile: join(outDir, full), workDir });

  const timeline = {
    lang,
    base,
    recordedAt: new Date().toISOString(),
    full: { file: full, seconds: last - first },
    scenes: s.timeline.scenes.map((scene, index) => ({
      id: scene.id,
      file: clips[index].file,
      seconds: scene.end - scene.start,
      steps: scene.steps.map((step) => ({
        id: step.id,
        start: step.start - scene.start,
        end: step.end - scene.start,
      })),
    })),
  };
  writeFileSync(join(outDir, "timeline.json"), JSON.stringify(timeline, null, 2));
  rmSync(workDir, { recursive: true, force: true });
  rmSync(join(outDir, "frames"), { recursive: true, force: true });
  log(`done: ${(last - first).toFixed(0)} s in total`);
}

for (const lang of languages) await recordLanguage(lang);
