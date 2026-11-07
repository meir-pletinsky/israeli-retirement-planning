import type { ProfileData } from "../types";
import {
  runHeavyTask,
  type HeavyArgs,
  type HeavyRequest,
  type HeavyResponse,
  type HeavyTaskName,
} from "../domain/heavyTasks";

/** The part of a Web Worker this module uses; tests supply a stand-in. */
export interface HeavyWorker {
  postMessage(request: HeavyRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<HeavyResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

/** One calculation for one profile: queued, running, then ready (or failed). */
export interface HeavyEntry {
  readonly id: number;
  readonly key: string;
  readonly profile: ProfileData;
  readonly task: HeavyTaskName;
  readonly args: unknown;
  state: "queued" | "running" | "ready" | "failed";
  value?: unknown;
  error?: Error;
  listeners: Set<() => void>;
}

interface HeavyComputeOptions {
  /** Starts the worker; null when there is none. */
  createWorker: () => HeavyWorker | null;
  /** True when there is no worker support at all: results are then computed on the spot. */
  inline: () => boolean;
}

/**
 * Runs the slow simulations (see `HEAVY_TASKS`) in a Web Worker, so the page keeps answering
 * clicks while they run, and remembers each result for the profile object it was computed from,
 * so going back to a page does not run them again.
 *
 * Requests run one at a time. A request that no component waits for any more is dropped, and if it
 * is already running its worker is stopped, so the next page's request is not stuck behind it.
 * Without worker support (old browsers, the test environment) every result is computed on the
 * spot, which keeps rendering synchronous. If the worker cannot start, the calculations run on the
 * main thread one per task, after the page has painted.
 */
export class HeavyCompute {
  private readonly options: HeavyComputeOptions;
  private readonly cache = new WeakMap<ProfileData, Map<string, HeavyEntry>>();
  private readonly queue: HeavyEntry[] = [];
  private running: HeavyEntry | null = null;
  private worker: HeavyWorker | null = null;
  private workerFailed = false;
  private nextId = 1;

  constructor(options: HeavyComputeOptions) {
    this.options = options;
  }

  /** The finished entry for these inputs, or null while it is still being calculated. */
  read<N extends HeavyTaskName>(profile: ProfileData, task: N, args: HeavyArgs<N>): HeavyEntry | null {
    if (this.options.inline()) return this.ensure(profile, task, args);
    const entry = this.cache.get(profile)?.get(heavyKey(task, args));
    return entry && (entry.state === "ready" || entry.state === "failed") ? entry : null;
  }

  /** Asks for the result and calls `onChange` when it is ready. Returns the way to stop waiting. */
  subscribe<N extends HeavyTaskName>(
    profile: ProfileData,
    task: N,
    args: HeavyArgs<N>,
    onChange: () => void,
  ): () => void {
    if (this.options.inline()) return () => {};
    const entry = this.ensure(profile, task, args);
    entry.listeners.add(onChange);
    return () => {
      entry.listeners.delete(onChange);
      // Deferred, so a component that unmounts and mounts again straight away keeps its request.
      setTimeout(() => this.release(entry), 0);
    };
  }

  private ensure<N extends HeavyTaskName>(profile: ProfileData, task: N, args: HeavyArgs<N>): HeavyEntry {
    let entries = this.cache.get(profile);
    if (!entries) {
      entries = new Map();
      this.cache.set(profile, entries);
    }
    const key = heavyKey(task, args);
    let entry = entries.get(key);
    if (!entry) {
      entry = { id: this.nextId++, key, profile, task, args, state: "queued", listeners: new Set() };
      entries.set(key, entry);
      if (this.options.inline()) {
        this.settle(entry, () => runHeavyTask(task, profile, args));
      } else {
        this.queue.push(entry);
        this.pump();
      }
    }
    return entry;
  }

  private release(entry: HeavyEntry): void {
    if (entry.listeners.size > 0 || entry.state === "ready" || entry.state === "failed") return;
    this.cache.get(entry.profile)?.delete(entry.key);
    if (entry.state === "queued") {
      const index = this.queue.indexOf(entry);
      if (index >= 0) this.queue.splice(index, 1);
    } else if (this.running === entry && this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.running = null;
      this.pump();
    }
  }

  private pump(): void {
    if (this.running) return;
    const next = this.queue.shift();
    if (!next) return;
    this.running = next;
    next.state = "running";
    const worker = this.startWorker();
    if (worker) {
      worker.postMessage({ id: next.id, task: next.task, profile: next.profile, args: next.args });
      return;
    }
    setTimeout(() => {
      // Dropped by `release` while waiting for its turn on the main thread.
      if (this.cache.get(next.profile)?.get(next.key) === next) {
        this.settle(next, () => runHeavyTask(next.task, next.profile, next.args as never));
      }
      if (this.running === next) this.running = null;
      this.pump();
    }, 0);
  }

  private startWorker(): HeavyWorker | null {
    if (this.worker) return this.worker;
    if (this.workerFailed) return null;
    try {
      const worker = this.options.createWorker();
      if (!worker) {
        this.workerFailed = true;
        return null;
      }
      worker.onmessage = (event) => this.onMessage(worker, event.data);
      worker.onerror = () => this.onError(worker);
      this.worker = worker;
      return worker;
    } catch {
      this.workerFailed = true;
      return null;
    }
  }

  private onMessage(worker: HeavyWorker, response: HeavyResponse): void {
    const entry = this.running;
    if (worker !== this.worker || !entry || entry.id !== response.id) return;
    this.running = null;
    if (response.ok) {
      this.settle(entry, () => response.result);
    } else {
      this.settle(entry, () => {
        throw new Error(response.error);
      });
    }
    this.pump();
  }

  /** The worker could not start or crashed: this and the following requests run on the main thread. */
  private onError(worker: HeavyWorker): void {
    if (worker !== this.worker) return;
    worker.terminate();
    this.worker = null;
    this.workerFailed = true;
    const entry = this.running;
    this.running = null;
    if (entry) {
      entry.state = "queued";
      this.queue.unshift(entry);
    }
    this.pump();
  }

  private settle(entry: HeavyEntry, compute: () => unknown): void {
    try {
      entry.value = compute();
      entry.state = "ready";
    } catch (error) {
      entry.error = error instanceof Error ? error : new Error(String(error));
      entry.state = "failed";
    }
    for (const listener of [...entry.listeners]) listener();
  }
}

function heavyKey(task: HeavyTaskName, args: unknown): string {
  return `${task}:${JSON.stringify(args)}`;
}

function createBrowserWorker(): HeavyWorker | null {
  if (typeof Worker === "undefined") return null;
  return new Worker(new URL("./heavyCompute.worker.ts", import.meta.url), { type: "module" });
}

/** The app's one calculator, shared by every page. */
export const heavyCompute = new HeavyCompute({
  createWorker: createBrowserWorker,
  inline: () => typeof Worker === "undefined",
});
