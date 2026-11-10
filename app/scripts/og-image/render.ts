/**
 * Renders the link-preview card (`public/og-image.jpg`, 1200x630) from `scripts/og-image/og-image.html`.
 * It is the image that Facebook, WhatsApp, Telegram and other apps show when https://gimlai.app is
 * shared. Run it from the `app` folder after editing the HTML; it needs Microsoft Edge or Chrome:
 *
 *   npm run og-image -- [--browser <path to msedge/chrome>]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const WIDTH = 1200;
const HEIGHT = 630;
const DEBUG_PORT = 9333;

const SOURCE = fileURLToPath(new URL("./og-image.html", import.meta.url));
const DEFAULT_OUT = fileURLToPath(new URL("../../public/og-image.jpg", import.meta.url));

const BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/microsoft-edge",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

type CdpResponse = { id: number; result?: Record<string, unknown>; error?: { message: string } };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPage(): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()) as {
        type: string;
        webSocketDebuggerUrl: string;
      }[];
      const page = targets.find((target) => target.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // The browser is still starting.
    }
    await sleep(500);
  }
  throw new Error("The browser did not start.");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { browser: { type: "string" }, out: { type: "string", default: DEFAULT_OUT } },
  });
  const browser = values.browser ?? BROWSERS.find((path) => existsSync(path));
  if (!browser) throw new Error("No Edge or Chrome found. Pass its path with --browser.");

  const profile = await mkdtemp(join(tmpdir(), "og-image-"));
  const child = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      "--allow-file-access-from-files",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    const socket = new WebSocket(await waitForPage());
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    let nextId = 0;
    const pending = new Map<number, (response: CdpResponse) => void>();
    socket.onmessage = (event) => {
      const response = JSON.parse(String(event.data)) as CdpResponse;
      pending.get(response.id)?.(response);
    };
    const send = (method: string, params: object = {}) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, (response) => (response.error ? reject(new Error(response.error.message)) : resolve(response.result ?? {})));
        socket.send(JSON.stringify({ id, method, params }));
      });

    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: pathToFileURL(SOURCE).href });
    await sleep(1500);
    await send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
    const shot = await send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 90,
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
    });
    await writeFile(values.out, Buffer.from(String(shot.data), "base64"));
    socket.close();
    console.log(`Wrote '${values.out}'.`);
  } finally {
    child.kill();
    await sleep(500);
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
