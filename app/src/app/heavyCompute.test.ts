import { describe, expect, it } from "vitest";

import { runHeavyTask, type HeavyRequest, type HeavyResponse } from "../domain/heavyTasks";
import { buildTestProfile } from "../test/domainFixtures";
import { HeavyCompute, type HeavyWorker } from "./heavyCompute";

class FakeWorker implements HeavyWorker {
  posted: HeavyRequest[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<HeavyResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(request: HeavyRequest) {
    this.posted.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  reply(request: HeavyRequest, result: unknown) {
    this.onmessage?.({ data: { id: request.id, ok: true, result } } as MessageEvent<HeavyResponse>);
  }
  fail(request: HeavyRequest, error: string) {
    this.onmessage?.({ data: { id: request.id, ok: false, error } } as MessageEvent<HeavyResponse>);
  }
  crash() {
    this.onerror?.(new ErrorEvent("error"));
  }
}

function setup(options: { inline?: boolean; workerAvailable?: boolean } = {}) {
  const workers: FakeWorker[] = [];
  const compute = new HeavyCompute({
    inline: () => options.inline ?? false,
    createWorker: () => {
      if (options.workerAvailable === false) return null;
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
  });
  return { compute, workers };
}

/** A plan with no desired spending: the Dashboard's risk task answers null at once. */
const cheapProfile = () => buildTestProfile({ age: 40, retirementAge: 67, retirementMonthlyExpenses: 0 });

const later = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe("HeavyCompute with a worker", () => {
  it("is pending until the worker answers, then tells the listener", () => {
    const { compute, workers } = setup();
    const profile = cheapProfile();
    let changes = 0;
    expect(compute.read(profile, "dashboardRisk", {})).toBeNull();
    compute.subscribe(profile, "dashboardRisk", {}, () => changes++);

    expect(workers).toHaveLength(1);
    const [request] = workers[0].posted;
    expect(request).toMatchObject({ task: "dashboardRisk", profile, args: {} });
    expect(compute.read(profile, "dashboardRisk", {})).toBeNull();

    workers[0].reply(request, { answer: 42 });
    expect(changes).toBe(1);
    expect(compute.read(profile, "dashboardRisk", {})).toMatchObject({ state: "ready", value: { answer: 42 } });
  });

  it("remembers a result for the same profile and arguments, but not for another profile", () => {
    const { compute, workers } = setup();
    const profile = cheapProfile();
    compute.subscribe(profile, "confidentAge", { fromAge: 60 }, () => {});
    workers[0].reply(workers[0].posted[0], "sixty");

    compute.subscribe(profile, "confidentAge", { fromAge: 60 }, () => {});
    expect(workers[0].posted).toHaveLength(1);
    expect(compute.read(profile, "confidentAge", { fromAge: 60 })?.value).toBe("sixty");

    compute.subscribe(profile, "confidentAge", { fromAge: 61 }, () => {});
    expect(workers[0].posted).toHaveLength(2);

    compute.subscribe(cheapProfile(), "confidentAge", { fromAge: 60 }, () => {});
    expect(workers[0].posted).toHaveLength(2);
    workers[0].reply(workers[0].posted[1], "sixty-one");
    expect(workers[0].posted).toHaveLength(3);
  });

  it("runs one request at a time, in the order asked", () => {
    const { compute, workers } = setup();
    const profile = cheapProfile();
    compute.subscribe(profile, "riskAnalysis", { scenario: "standard" }, () => {});
    compute.subscribe(profile, "confidentAge", { fromAge: 60 }, () => {});
    expect(workers[0].posted.map((request) => request.task)).toEqual(["riskAnalysis"]);

    workers[0].reply(workers[0].posted[0], null);
    expect(workers[0].posted.map((request) => request.task)).toEqual(["riskAnalysis", "confidentAge"]);
    expect(workers).toHaveLength(1);
  });

  it("ignores an answer that is not for the running request", () => {
    const { compute, workers } = setup();
    const profile = cheapProfile();
    let changes = 0;
    compute.subscribe(profile, "dashboardRisk", {}, () => changes++);
    workers[0].reply({ ...workers[0].posted[0], id: 999 }, "wrong");
    expect(changes).toBe(0);
    expect(compute.read(profile, "dashboardRisk", {})).toBeNull();
  });

  it("stops a running request nobody waits for and starts the next one on a fresh worker", async () => {
    const { compute, workers } = setup();
    const first = cheapProfile();
    const second = cheapProfile();
    const stop = compute.subscribe(first, "dashboardRisk", {}, () => {});
    compute.subscribe(second, "riskAnalysis", { scenario: "standard" }, () => {});
    expect(workers[0].posted).toHaveLength(1);

    stop();
    await later();

    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
    expect(workers[1].posted.map((request) => request.task)).toEqual(["riskAnalysis"]);
    expect(compute.read(first, "dashboardRisk", {})).toBeNull();
  });

  it("drops a queued request nobody waits for", async () => {
    const { compute, workers } = setup();
    const profile = cheapProfile();
    compute.subscribe(profile, "dashboardRisk", {}, () => {});
    const stop = compute.subscribe(profile, "confidentAge", { fromAge: 60 }, () => {});
    stop();
    await later();

    workers[0].reply(workers[0].posted[0], null);
    expect(workers[0].posted).toHaveLength(1);
    expect(workers[0].terminated).toBe(false);
  });

  it("keeps a request that is unsubscribed and subscribed again straight away", async () => {
    const { compute, workers } = setup();
    const profile = cheapProfile();
    let changes = 0;
    compute.subscribe(profile, "dashboardRisk", {}, () => {})();
    compute.subscribe(profile, "dashboardRisk", {}, () => changes++);
    await later();

    expect(workers[0].terminated).toBe(false);
    workers[0].reply(workers[0].posted[0], "kept");
    expect(changes).toBe(1);
  });

  it("keeps a finished result after everyone stopped waiting", async () => {
    const { compute, workers } = setup();
    const profile = cheapProfile();
    const stop = compute.subscribe(profile, "dashboardRisk", {}, () => {});
    workers[0].reply(workers[0].posted[0], "done");
    stop();
    await later();
    expect(compute.read(profile, "dashboardRisk", {})?.value).toBe("done");
  });

  it("reports a task that failed in the worker", () => {
    const { compute, workers } = setup();
    const profile = cheapProfile();
    compute.subscribe(profile, "dashboardRisk", {}, () => {});
    workers[0].fail(workers[0].posted[0], "boom");
    const entry = compute.read(profile, "dashboardRisk", {});
    expect(entry?.state).toBe("failed");
    expect(entry?.error?.message).toBe("boom");
  });

  it("calculates on the main thread after the worker crashed, and does not start another", async () => {
    const { compute, workers } = setup();
    const first = cheapProfile();
    const second = cheapProfile();
    let changes = 0;
    compute.subscribe(first, "dashboardRisk", {}, () => changes++);
    compute.subscribe(second, "dashboardRisk", {}, () => changes++);
    workers[0].crash();
    expect(workers[0].terminated).toBe(true);

    await later();
    await later();

    expect(changes).toBe(2);
    expect(compute.read(first, "dashboardRisk", {})?.value).toEqual(runHeavyTask("dashboardRisk", first, {}));
    expect(compute.read(second, "dashboardRisk", {})?.state).toBe("ready");
    expect(workers).toHaveLength(1);
  });
});

describe("HeavyCompute without a usable worker", () => {
  it("calculates on the main thread, after the caller has had its turn, when there is no worker", async () => {
    const { compute } = setup({ workerAvailable: false });
    const profile = cheapProfile();
    let changes = 0;
    compute.subscribe(profile, "dashboardRisk", {}, () => changes++);
    expect(compute.read(profile, "dashboardRisk", {})).toBeNull();

    await later();

    expect(changes).toBe(1);
    expect(compute.read(profile, "dashboardRisk", {})?.value).toBeNull();
    expect(compute.read(profile, "dashboardRisk", {})?.state).toBe("ready");
  });

  it("does the same when starting the worker throws", async () => {
    const compute = new HeavyCompute({
      inline: () => false,
      createWorker: () => {
        throw new Error("blocked");
      },
    });
    const profile = cheapProfile();
    compute.subscribe(profile, "dashboardRisk", {}, () => {});
    await later();
    expect(compute.read(profile, "dashboardRisk", {})?.state).toBe("ready");
  });

  it("skips a main-thread request that nobody waits for any more", async () => {
    const { compute } = setup({ workerAvailable: false });
    const kept = cheapProfile();
    const dropped = cheapProfile();
    compute.subscribe(kept, "dashboardRisk", {}, () => {});
    compute.subscribe(dropped, "dashboardRisk", {}, () => {})();
    await later();
    await later();
    await later();
    expect(compute.read(kept, "dashboardRisk", {})?.state).toBe("ready");
    expect(compute.read(dropped, "dashboardRisk", {})).toBeNull();
  });
});

describe("HeavyCompute where workers do not exist", () => {
  it("answers on the spot and never starts a worker", () => {
    const { compute, workers } = setup({ inline: true });
    const profile = cheapProfile();
    const entry = compute.read(profile, "dashboardRisk", {});
    expect(entry).toMatchObject({ state: "ready", value: null });
    expect(compute.read(profile, "dashboardRisk", {})).toBe(entry);
    expect(workers).toHaveLength(0);
    expect(compute.subscribe(profile, "dashboardRisk", {}, () => {})).toBeTypeOf("function");
    expect(workers).toHaveLength(0);
  });
});
