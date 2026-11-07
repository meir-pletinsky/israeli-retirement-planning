import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetCpiCache } from "../../cpi/client";
import { clearAllData, db, loadOnboardedFromDb } from "../../storage/db";
import { renderWithProviders } from "../../test/renderWithProviders";
import { AssumptionsStep } from "./AssumptionsStep";

beforeEach(async () => {
  await clearAllData();
  resetCpiCache();
  vi.stubGlobal("fetch", () => Promise.reject(new TypeError("offline")));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderLastStep() {
  renderWithProviders(
    <Routes>
      <Route path="/my-data/assumptions" element={<AssumptionsStep />} />
      <Route path="/dashboard" element={<p>Results page</p>} />
    </Routes>,
    { route: "/my-data/assumptions" },
  );
  await screen.findByText("Saved");
}

describe("step footer", () => {
  it("says that changes are saved automatically on this device", async () => {
    await renderLastStep();

    expect(screen.getByText(/Changes save automatically on this device\./)).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("says that the plan was never exported", async () => {
    await renderLastStep();

    expect(screen.getByText("Last exported: never")).toBeInTheDocument();
  });

  it("offers View my results rather than Save on the last step", async () => {
    const user = userEvent.setup();
    await renderLastStep();

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View my results" }));

    expect(await screen.findByText("Results page")).toBeInTheDocument();
    await waitFor(async () => expect(await loadOnboardedFromDb()).toBe(true));
  });

  it("shows Saving while a change is being written and Saved once it is stored", async () => {
    const user = userEvent.setup();
    await renderLastStep();
    let finishWrite: () => void = () => {};
    const pendingWrite = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    vi.spyOn(db.profile, "put").mockImplementationOnce((() => pendingWrite) as never);

    await user.click(screen.getByRole("button", { name: "Conservative" }));

    expect(await screen.findByText("Saving\u2026")).toBeInTheDocument();
    finishWrite();
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("warns when the change could not be stored and recovers on the next successful write", async () => {
    const user = userEvent.setup();
    await renderLastStep();
    vi.spyOn(db.profile, "put").mockRejectedValueOnce(new Error("QuotaExceededError"));

    await user.click(screen.getByRole("button", { name: "Conservative" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not be saved on this device/i);
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Optimistic" }));

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
