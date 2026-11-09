// Builds what goes into Clipchamp, per language, from the same scenario the recorder plays:
//   scripts/prompt-<lang>.txt     the text to paste into Clipchamp's Copilot (instructions + narration with timings)
//   scripts/script-<lang>.md      the same narration laid out clip by clip, to read and to copy from
//   scripts/subtitles-<lang>.srt  the same narration as timed captions for the full video (for other tools: Clipchamp cannot import SRT)
//
// Timings come from output/<lang>/timeline.json when that language has been recorded; otherwise they are estimated
// from the reading speed that the recorder uses.
//
// Usage: node tools/build-scripts.mjs [--lang en,ru,he]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib.mjs";
import { SCENES, narrationSeconds } from "./scenario.mjs";

const LANGUAGES = {
  en: { name: "English", locale: "en-US", app: "Israeli Retirement Planning", subtitle: '"Daniel and Noa plan their retirement"', rtl: false },
  ru: { name: "Russian", locale: "ru-RU", app: "Планирование пенсии в Израиле", subtitle: '"Даниэль и Ноа планируют выход на пенсию"', rtl: false },
  he: { name: "Hebrew", locale: "he-IL", app: "תכנון פרישה בישראל", subtitle: '"דניאל ונועה מתכננים את הפרישה שלהם"', rtl: true },
};

const argument = process.argv.indexOf("--lang");
const languages = argument >= 0 ? process.argv[argument + 1].split(",") : Object.keys(LANGUAGES);
const outDir = join(ROOT, "scripts");
mkdirSync(outDir, { recursive: true });

const BOM = "\uFEFF";
const pad = (n) => String(n).padStart(2, "0");
const clock = (seconds) => `${Math.floor(seconds / 60)}:${pad(Math.floor(seconds % 60))}`;
const srtClock = (seconds) => {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(ms % 1000).padStart(3, "0")}`;
};

/** Scenes with their clip file, length and the start and end of every step inside the clip. */
function plan(lang) {
  const path = join(ROOT, "output", lang, "timeline.json");
  const measured = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  let offset = 0;
  const scenes = SCENES.map((scene, index) => {
    const recorded = measured?.scenes.find((item) => item.id === scene.id);
    let cursor = 0;
    const steps = scene.steps.map((step) => {
      const text = step.say[lang];
      const recordedStep = recorded?.steps.find((item) => item.id === step.id);
      const start = recordedStep?.start ?? cursor;
      const end = recordedStep?.end ?? start + narrationSeconds(text, lang);
      cursor = end;
      return { id: step.id, text, start, end };
    });
    const seconds = recorded?.seconds ?? cursor;
    const entry = {
      id: scene.id,
      title: scene.title[lang],
      file: recorded?.file ?? `${pad(index + 1)}-${scene.id}.mp4`,
      offset,
      seconds,
      steps,
    };
    offset += seconds;
    return entry;
  });
  return { scenes, total: offset, measured: Boolean(measured) };
}

/** Splits narration into caption-sized pieces (at most about two lines of 42 characters). */
function captionPieces(text, limit = 76) {
  const raw = text.split(/(?<=[.!?؟])\s+/);
  const sentences = [];
  for (const sentence of raw) {
    // A very short sentence ("Done.") would flash by, so it joins the next one.
    if (sentences.length && sentences.at(-1).length < 24) sentences[sentences.length - 1] += ` ${sentence}`;
    else sentences.push(sentence);
  }
  const pieces = [];
  for (const sentence of sentences) {
    // Break a long sentence into equal-sized pieces instead of a full one and a short leftover.
    const target = Math.ceil(sentence.length / Math.ceil(sentence.length / limit));
    let line = "";
    for (const word of sentence.trim().split(/\s+/)) {
      if (line && line.length + 1 + word.length > target + 4) {
        pieces.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) pieces.push(line);
  }
  return pieces;
}

function wrapCaption(text, width = 42) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

function buildSrt({ scenes }, lang) {
  const cues = [];
  for (const scene of scenes) {
    for (const step of scene.steps) {
      const pieces = captionPieces(step.text);
      const weight = pieces.reduce((sum, piece) => sum + piece.length, 0);
      // Captions last as long as the voice does; a step can run longer while the cursor is still working.
      const window = Math.min(step.end - step.start, narrationSeconds(step.text, lang));
      let cursor = scene.offset + step.start;
      for (const piece of pieces) {
        const length = (window * piece.length) / weight;
        cues.push({ start: cursor, end: cursor + length - 0.05, text: wrapCaption(piece) });
        cursor += length;
      }
    }
  }
  return cues.map((cue, index) => `${index + 1}\n${srtClock(cue.start)} --> ${srtClock(cue.end)}\n${cue.text}\n`).join("\n");
}

function buildPrompt(lang, { scenes, total }) {
  const info = LANGUAGES[lang];
  const clips = scenes.map((scene, index) => `${index + 1}. ${scene.file}`).join("\n");
  const narration = scenes
    .map((scene) => {
      const lines = scene.steps.map((step) => `[${clock(step.start)}] ${step.text}`).join("\n");
      return `=== CLIP ${scene.file} | on-screen title: ${scene.title} | ${clock(scene.seconds)} ===\n${lines}`;
    })
    .join("\n\n");

  return `Create a tutorial video of about ${Math.round(total / 60)} minutes, 16:9, 1080p, for the web app "${info.app}". The video shows a fictional couple, Daniel and Noa, planning their retirement.

MEDIA
Use ONLY the screen recordings I uploaded, in exactly this order, each one in full. Do not use stock footage, do not re-order, crop, zoom or trim them, and do not change their speed. The clips have no sound.
${clips}

VOICE-OVER
Add a natural, calm, friendly ${info.name} voice-over (${info.locale}) that reads the narration below word for word. The narration is grouped by clip. The first line of each clip starts when that clip starts; the time in square brackets is the moment, counted from the start of that clip, at which the line should begin, so the voice stays in step with what happens on screen. If the voice is slightly too fast or too slow for a clip, adjust the voice speed a little, never the clip. Do not read the times aloud.

CAPTIONS
Show the same narration as captions at the bottom of the screen, at most two lines at a time, in ${info.name}${info.rtl ? ", right-to-left" : ""}.

EXTRAS
- A title card at the start with "${info.app}" and the subtitle ${info.subtitle}.
- At the start of every clip, for three seconds, show the clip's on-screen title as a small lower-third.
- Simple fade transitions between clips.
- Soft instrumental background music, well below the voice level, fading out at the end.
- Export in 1080p.

NARRATION
${narration}
`;
}

function buildScript(lang, { scenes, total, measured }) {
  const info = LANGUAGES[lang];
  const rows = scenes
    .map((scene, index) => `| ${index + 1} | \`${scene.file}\` | ${clock(scene.seconds)} | ${scene.title} |`)
    .join("\n");
  const sections = scenes
    .map((scene, index) => {
      const lines = scene.steps.map((step) => `- **${clock(step.start)}** — ${step.text}`).join("\n");
      const whole = scene.steps.map((step) => step.text).join(" ");
      return `### ${index + 1}. ${scene.title}\n\nClip: \`${scene.file}\` (${clock(scene.seconds)})\n\nLine by line, with the time inside the clip at which each line starts:\n\n${lines}\n\nThe same as one block, for text-to-speech:\n\n> ${whole}\n`;
    })
    .join("\n");

  return `# ${info.app} — tutorial video script (${info.name})

Total length: about ${clock(total)}${measured ? " (measured from the recording)" : " (estimated: this language has not been recorded yet)"}.

## How to use it in Clipchamp

Do step 1 first. Then choose **one** of steps 2 and 3, not both, or there will be two voice-overs.

1. Create a new video in Clipchamp and import the clips from \`output/${lang}/\` (see the table below). Add them to the timeline in that order.
2. Route A, ask Copilot: open the Generate a video panel, paste the whole of \`prompt-${lang}.txt\` and check that the result uses these clips and this narration, not stock footage. If it does not, use Route B.
3. Route B, by hand: in Record & create → Text to speech, choose the voice for ${info.locale} and paste the "one block" text of each clip below, one per clip, placing each at the start of its clip. Then turn on captions in the Captions tab (choose the spoken language, Transcribe media).

Clipchamp cannot import an SRT file. \`subtitles-${lang}.srt\` holds the same narration with timings, for other tools such as YouTube.

The README in the tutorial-videos folder explains each step in more detail.

## Clips

| # | File | Length | On-screen title |
|---|------|--------|-----------------|
${rows}

## Narration

${sections}`;
}

for (const lang of languages) {
  if (!LANGUAGES[lang]) throw new Error(`Unknown language "${lang}"; use en, ru or he.`);
  const result = plan(lang);
  writeFileSync(join(outDir, `prompt-${lang}.txt`), BOM + buildPrompt(lang, result));
  writeFileSync(join(outDir, `script-${lang}.md`), BOM + buildScript(lang, result));
  writeFileSync(join(outDir, `subtitles-${lang}.srt`), BOM + buildSrt(result, lang));
  console.log(`[${lang}] ${result.measured ? "measured" : "estimated"} timings, ${clock(result.total)} in total`);
}
