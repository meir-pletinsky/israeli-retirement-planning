import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HeavyRequest, HeavyResponse } from "../domain/heavyTasks";
import { runHeavyTask } from "../domain/heavyTasks";
import { clearAllData, saveOnboardedToDb, saveProfileToDb } from "../storage/db";
import { buildTestProfile } from "../test/domainFixtures";
import { renderWithProviders } from "../test/renderWithProviders";
import { Dashboard } from "./Dashboard";
import { Projections } from "./Projections";

// The browser runs the slow simulations in a Web Worker; jsdom has none, so the other suites
// compute them inline. Here a stand-in worker holds the answers back, as a busy worker would.
const workers: FakeWorker[] = [];

class FakeWorker {
  posted: HeavyRequest[] = [];
  answered = new Set<number>();
  terminated = false;
  onmessage: ((event: MessageEvent<HeavyResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  constructor() {
    workers.push(this);
  }
  postMessage(request: HeavyRequest) {
    this.posted.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  /** The request the worker is still busy with, if any. */
  pending(): HeavyRequest | undefined {
    return this.terminated ? undefined : this.posted.find((request) => !this.answered.has(request.id));
  }
  answer(request: HeavyRequest) {
    const result = runHeavyTask(request.task, request.profile, request.args as never);
    this.answered.add(request.id);
    act(() => this.onmessage?.({ data: { id: request.id, ok: true, result } } as MessageEvent<HeavyResponse>));
  }
}

const pendingTasks = () => workers.flatMap((worker) => worker.pending() ?? []).map((request) => request.task);

/** Answers whatever the worker is busy with, until it has nothing left. */
async function answerAll() {
  for (let round = 0; round < 6; round++) {
    await waitFor(() => expect(workers.length).toBeGreaterThan(0));
    const worker = workers.find((candidate) => candidate.pending());
    if (!worker) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (!workers.some((candidate) => candidate.pending())) return;
      continue;
    }
    worker.answer(worker.pending()!);
  }
}

const plan = (retirementMonthlyExpenses: number) =>
  buildTestProfile({
    age: 40,
    retirementAge: 67,
    gender: "male",
    monthlyGrossSalary: 20_000,
    investmentReturnPct: 5,
    inflationPct: 2,
    pensionBalances: [900_000, 300_000],
    retirementMonthlyExpenses,
  });

beforeEach(async () => {
  vi.stubGlobal("Worker", FakeWorker);
  await clearAllData();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Projections while the simulations run in a worker", () => {
  it("shows the page at once and fills in the risk analysis when the worker answers", async () => {
    await saveProfileToDb(plan(4_000));
    await saveOnboardedToDb(true);
    renderWithProviders(<Projections />);

    const card = await screen.findByRole("region", { name: "Risk analysis" });
    expect(card).toHaveAttribute("aria-busy", "true");
    expect(within(card).getByRole("status")).toHaveTextContent("Simulating possible markets");
    expect(within(card).queryByText(/There are no retirement years to test/)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Retirement timeline" })).toBeInTheDocument();

    await waitFor(() => expect(pendingTasks()).toContain("riskAnalysis"));
    await answerAll();

    await waitFor(() =>
      expect(within(card).getByText("Chance your desired spending lasts to age 90")).toBeInTheDocument(),
    );
    expect(card).toHaveAttribute("aria-busy", "false");
    expect(within(card).queryByRole("status")).not.toBeInTheDocument();
  });

  it("says the earliest confident age is being checked, then shows it", async () => {
    await saveProfileToDb(plan(4_000));
    await saveOnboardedToDb(true);
    renderWithProviders(<Projections />);

    expect(await screen.findByText(/Checking the earliest age with 90% confidence/)).toBeInTheDocument();
    await answerAll();

    await waitFor(() =>
      expect(screen.queryByText(/Checking the earliest age with 90% confidence/)).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText(/With 90% confidence: age \d+|The same age holds with 90% confidence/),
    ).toBeInTheDocument();
  });
});

describe("Dashboard while the simulations run in a worker", () => {
  it("shows a neutral checking status instead of an on-track claim until the risk run is back", async () => {
    await saveProfileToDb(plan(2_500));
    await saveOnboardedToDb(true);
    renderWithProviders(<Dashboard />);

    expect(await screen.findByText("Checking your plan against simulated markets…")).toBeInTheDocument();
    expect(screen.queryByText(/You're on track/)).not.toBeInTheDocument();

    await answerAll();

    await waitFor(() =>
      expect(screen.queryByText("Checking your plan against simulated markets…")).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/You're on track/)).toBeInTheDocument();
  });
});
