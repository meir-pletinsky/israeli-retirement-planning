// Browser session helpers for the tutorial recorder: a visible cursor and click ripple, smooth scrolling,
// typing that looks human, element highlights, and a CDP screencast that is later encoded with ffmpeg.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "..");
export const APP_DIR = join(ROOT, "..", "..", "app");
export const DEMO_DIR = join(ROOT, "demo-data");

// 1536x864 CSS pixels at 1.25x gives a crisp 1920x1080 frame with comfortably large text.
export const VIEWPORT = { width: 1536, height: 864 };
export const SCALE = 1.25;
export const FPS = 30;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms * timeScale));

let timeScale = 1;
/** Scales every pause and animation. 1 is real time; a small value makes a quick dry run of the whole flow. */
export function setTimeScale(value) {
  timeScale = value;
}

const OVERLAY_SCRIPT = () => {
  const install = () => {
    if (document.getElementById("__tour-cursor")) return;
    const style = document.createElement("style");
    style.textContent = `
      #__tour-cursor{position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;
        transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));will-change:transform}
      .__tour-ripple{position:fixed;z-index:2147483646;pointer-events:none;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;
        border:3px solid #0e7aa8;background:rgba(14,122,168,.25);animation:__tour-ripple .55s ease-out forwards}
      @keyframes __tour-ripple{to{transform:scale(5);opacity:0}}
      .__tour-ring{position:fixed;z-index:2147483645;pointer-events:none;border:4px solid #f59e0b;border-radius:14px;
        box-shadow:0 0 0 6px rgba(245,158,11,.25);animation:__tour-pulse 1.1s ease-in-out infinite}
      @keyframes __tour-pulse{50%{box-shadow:0 0 0 12px rgba(245,158,11,.1)}}
      html{scroll-behavior:auto!important}`;
    document.documentElement.appendChild(style);
    const cursor = document.createElement("div");
    cursor.id = "__tour-cursor";
    cursor.innerHTML =
      '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M3 2l7.6 19 2.6-7.8L21 10.6z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cursor);
    addEventListener(
      "mousemove",
      (event) => {
        cursor.style.transform = `translate(${event.clientX - 3}px,${event.clientY - 2}px)`;
      },
      true,
    );
    addEventListener(
      "mousedown",
      (event) => {
        const ripple = document.createElement("div");
        ripple.className = "__tour-ripple";
        ripple.style.left = `${event.clientX}px`;
        ripple.style.top = `${event.clientY}px`;
        document.documentElement.appendChild(ripple);
        setTimeout(() => ripple.remove(), 700);
      },
      true,
    );
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
};

function interpolate(text, params) {
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, name) => String(params?.[name] ?? ""));
}

export function loadLocale(lang) {
  const file = join(APP_DIR, "src", "i18n", "locales", `${lang}.json`);
  const json = JSON.parse(readFileSync(file, "utf8"));
  return (key, params) => {
    const value = key.split(".").reduce((node, part) => node?.[part], json);
    if (typeof value !== "string") throw new Error(`Missing ${lang} string: ${key}`);
    return interpolate(value, params);
  };
}

export async function createSession({ lang, baseUrl, outDir, record = true, shots = false, log = console.log }) {
  const t = loadLocale(lang);
  mkdirSync(outDir, { recursive: true });
  const framesDir = join(outDir, "frames");
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--hide-scrollbars"] });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    locale: lang === "he" ? "he-IL" : lang === "ru" ? "ru-RU" : "en-US",
    timezoneId: "Asia/Jerusalem",
  });
  await context.addInitScript((value) => localStorage.setItem("irp_language", value), lang);
  await context.addInitScript(OVERLAY_SCRIPT);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => log(`  [page error] ${error.message}`));

  // Load the app before filming so the recording does not open on a blank page.
  await page.goto(baseUrl);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});

  const frames = [];
  let cdp = null;
  if (record) {
    cdp = await context.newCDPSession(page);
    cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
      const index = frames.length;
      const file = join(framesDir, `${String(index).padStart(6, "0")}.jpg`);
      writeFileSync(file, Buffer.from(data, "base64"));
      frames.push({ ts: metadata.timestamp, file });
      cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 92,
      maxWidth: VIEWPORT.width * SCALE,
      maxHeight: VIEWPORT.height * SCALE,
      everyNthFrame: 1,
    });
  }

  const startedAt = Date.now() / 1000;
  const timeline = { lang, scenes: [] };
  let mouse = { x: VIEWPORT.width * 0.6, y: VIEWPORT.height * 0.5 };
  let shotIndex = 0;
  const now = () => Date.now() / 1000;

  const api = {
    page,
    t,
    lang,
    sleep,
    timeline,

    async pause(ms) {
      await sleep(ms);
    },

    async settle(extra = 350) {
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 60000 }).catch(() => {});
      await sleep(extra);
    },

    async shot(name) {
      if (!shots) return;
      shotIndex += 1;
      await page.screenshot({ path: join(outDir, "shots", `${String(shotIndex).padStart(3, "0")}-${name}.png`) });
    },

    async moveTo(x, y, duration = 650) {
      const steps = Math.max(8, Math.round(duration / 16));
      const from = mouse;
      for (let i = 1; i <= steps; i++) {
        const p = i / steps;
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        await page.mouse.move(from.x + (x - from.x) * eased, from.y + (y - from.y) * eased);
        await sleep(duration / steps);
      }
      mouse = { x, y };
    },

    /** Brings an element into the comfortable middle of the screen with an eased scroll. */
    async reveal(locator, { block = "center" } = {}) {
      const el = locator.first();
      await el.waitFor({ state: "attached" });
      const info = await el.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: innerHeight };
      });
      const margin = 110;
      const visible = info.top >= margin && info.bottom <= info.height - 150;
      if (visible) return;
      await el.evaluate((node, where) => node.scrollIntoView({ block: where, behavior: "smooth" }), block);
      // Wait for the smooth scroll to come to rest instead of guessing its length.
      let last = null;
      for (let i = 0; i < 60; i++) {
        await sleep(60);
        const top = await el.evaluate((node) => Math.round(node.getBoundingClientRect().top));
        if (top === last) break;
        last = top;
      }
      await sleep(250);
    },

    /** Scrolls the window so the element's top sits `top` pixels below the top edge, easing in and out. */
    async glideTo(locator, { top = 90, duration = 1300 } = {}) {
      await locator.first().waitFor({ state: "attached" });
      await locator.first().evaluate(
        (node, { top, duration }) =>
          new Promise((resolve) => {
            const startY = scrollY;
            const target = Math.max(0, startY + node.getBoundingClientRect().top - top);
            const began = performance.now();
            const frame = (now) => {
              const p = duration <= 0 ? 1 : Math.min(1, (now - began) / duration);
              const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
              scrollTo(0, startY + (target - startY) * eased);
              if (p < 1) requestAnimationFrame(frame);
              else resolve();
            };
            requestAnimationFrame(frame);
          }),
        { top, duration: duration * timeScale },
      );
      await sleep(300);
    },

    /** Scrolls the window by a distance with an easing curve; a long distance takes proportionally longer. */
    async scrollBy(dy, duration = 1400) {
      await page.evaluate(
        ({ dy, duration }) =>
          new Promise((resolve) => {
            const startY = scrollY;
            const began = performance.now();
            const frame = (now) => {
              const p = duration <= 0 ? 1 : Math.min(1, (now - began) / duration);
              const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
              scrollTo(0, startY + dy * eased);
              if (p < 1) requestAnimationFrame(frame);
              else resolve();
            };
            requestAnimationFrame(frame);
          }),
        { dy, duration: duration * timeScale },
      );
      await sleep(250);
    },

    async scrollToTop() {
      await page.evaluate(() => scrollTo({ top: 0, behavior: "smooth" }));
      await sleep(900);
    },

    /** Eased scroll of the scrollable list inside a dialog (the window does not move behind it). */
    async scrollInner(container, dy, duration = 1400) {
      await container.first().evaluate(
        (root, { dy, duration }) =>
          new Promise((resolve) => {
            const scrollable = [root, ...root.querySelectorAll("*")].find(
              (node) => node.scrollHeight > node.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(node).overflowY),
            );
            if (!scrollable) return resolve();
            const startY = scrollable.scrollTop;
            const began = performance.now();
            const frame = (now) => {
              const p = duration <= 0 ? 1 : Math.min(1, (now - began) / duration);
              const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
              scrollable.scrollTop = startY + dy * eased;
              if (p < 1) requestAnimationFrame(frame);
              else resolve();
            };
            requestAnimationFrame(frame);
          }),
        { dy, duration: duration * timeScale },
      );
      await sleep(250);
    },

    async point(locator, { dx = 0, dy = 0, duration = 650 } = {}) {
      await api.reveal(locator);
      const box = await locator.first().boundingBox();
      if (!box) throw new Error("Element has no box");
      await api.moveTo(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, duration);
    },

    async click(locator, options = {}) {
      await api.point(locator, options);
      await sleep(220);
      await locator.first().click();
      await sleep(options.after ?? 450);
    },

    /** Clicks the visible label of a form control (checkbox and radio inputs are often visually hidden). */
    async check(locator, checked = true, { duration = 600 } = {}) {
      const el = locator.first();
      if ((await el.isChecked()) === checked) return;
      await api.point(el.locator("xpath=ancestor-or-self::label[1]").or(el), { duration });
      await sleep(200);
      await el.click({ force: true });
      await sleep(400);
    },

    async type(locator, text, { delay = 70, clear = true, duration } = {}) {
      await api.click(locator, { after: 150, duration });
      if (clear) {
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Delete");
      }
      await locator.first().pressSequentially(String(text), { delay: Math.round(delay * timeScale) });
      await sleep(300);
    },

    /** Pasting is instant, so the text appears at once. */
    async paste(locator, text) {
      await api.click(locator, { after: 200 });
      await locator.first().fill(text);
      await sleep(500);
    },

    async select(locator, label) {
      await api.click(locator, { after: 200 });
      await locator.first().selectOption({ label });
      await sleep(450);
    },

    async highlight(locator, ms = 2200, pad = 8) {
      await api.reveal(locator);
      const box = await locator.first().boundingBox();
      if (!box) return;
      const id = `__ring-${Math.random().toString(36).slice(2)}`;
      await page.evaluate(
        ({ id, box, pad }) => {
          const ring = document.createElement("div");
          ring.id = id;
          ring.className = "__tour-ring";
          ring.style.left = `${box.x - pad}px`;
          ring.style.top = `${box.y - pad}px`;
          ring.style.width = `${box.width + pad * 2}px`;
          ring.style.height = `${box.height + pad * 2}px`;
          document.documentElement.appendChild(ring);
        },
        { id, box, pad },
      );
      await sleep(ms);
      await page.evaluate((value) => document.getElementById(value)?.remove(), id);
    },

    async upload(selector, file) {
      await page.setInputFiles(selector, file);
    },

    startScene(id) {
      const scene = { id, start: now() - startedAt, end: null, steps: [] };
      timeline.scenes.push(scene);
      return scene;
    },
    endScene() {
      const scene = timeline.scenes.at(-1);
      if (scene) scene.end = now() - startedAt;
    },
    startStep(id, narration) {
      const scene = timeline.scenes.at(-1);
      const step = { id, narration, start: now() - startedAt, end: null };
      scene.steps.push(step);
      return step;
    },
    endStep(step) {
      step.end = now() - startedAt;
    },

    async finish() {
      if (cdp) await cdp.send("Page.stopScreencast").catch(() => {});
      await sleep(300);
      const endAt = now();
      await browser.close();
      return { frames, startedAt, endedAt: endAt };
    },
  };

  if (shots) mkdirSync(join(outDir, "shots"), { recursive: true });
  return api;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}\n${stderr.slice(-1500)}`))));
  });
}

/** Encodes the part of the recording between two timestamps (seconds since the recording began) as an MP4. */
export async function encodeSegment({ frames, startedAt, from, to, outFile, workDir }) {
  if (frames.length === 0) throw new Error("No frames were captured");
  const t0 = startedAt + from;
  const t1 = startedAt + to;
  let first = frames.findLastIndex((frame) => frame.ts <= t0);
  if (first < 0) first = 0;
  const entries = [];
  for (let i = first; i < frames.length && frames[i].ts < t1; i++) {
    const begin = Math.max(frames[i].ts, t0);
    const nextTs = i + 1 < frames.length ? frames[i + 1].ts : t1;
    const end = Math.min(nextTs, t1);
    const duration = end - begin;
    if (duration > 0.0005) entries.push({ file: frames[i].file, duration });
  }
  if (entries.length === 0) throw new Error(`Segment ${from}-${to} holds no frames`);
  const list = entries
    .map((entry) => `file '${entry.file.replaceAll("\\", "/")}'\nduration ${entry.duration.toFixed(4)}`)
    .concat(`file '${entries.at(-1).file.replaceAll("\\", "/")}'`)
    .join("\n");
  mkdirSync(workDir, { recursive: true });
  const listFile = join(workDir, `${outFile.split(/[\\/]/).pop()}.txt`);
  writeFileSync(listFile, list);
  await runFfmpeg([
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listFile,
    "-vf", `fps=${FPS},scale=1920:1080:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "17",
    "-movflags", "+faststart",
    outFile,
  ]);
  rmSync(listFile, { force: true });
}

export { dirname };
