import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearAllData, saveOnboardedToDb, saveProfileToDb } from "../storage/db";
import { buildTraceCouple } from "../test/traceFixtures";
import { renderWithProviders } from "../test/renderWithProviders";
import { VerificationExport } from "./VerificationExport";

const download = vi.hoisted(() => vi.fn());

vi.mock("../storage/profileIO", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../storage/profileIO")>()),
  downloadJsonFile: download,
}));

async function seed() {
  const profile = buildTraceCouple();
  await saveProfileToDb({
    ...profile,
    pensionSavings: {
      ...profile.pensionSavings,
      accounts: profile.pensionSavings.accounts.map((account, index) => ({
        ...account,
        providerName: `Fictional Provider ${index}`,
        policyNumber: `99900012${index}`,
      })),
    },
  });
  await saveOnboardedToDb(true);
}

beforeEach(async () => {
  download.mockClear();
  await clearAllData();
  await seed();
});

describe("VerificationExport", () => {
  it("exports a redacted pack, then offers the redaction key", async () => {
    const user = userEvent.setup();
    const notify = vi.fn();
    renderWithProviders(<VerificationExport onNotify={notify} />);

    expect(screen.queryByRole("button", { name: "Export redaction key" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Export verification pack" }));

    expect(download).toHaveBeenCalledTimes(1);
    const [json, suffix] = download.mock.calls[0] as [string, string];
    expect(suffix).toBe("-verification-pack");
    const pack = JSON.parse(json);
    expect(pack.format).toBe("retirement-planning-verification-pack");
    expect(pack.target).toEqual({ kind: "scenario", scenario: "standard" });
    expect(pack.selfCheck.issues).toEqual([]);
    expect(json).not.toContain("Fictional Provider");
    expect(json).not.toContain("999000120");
    expect(notify).toHaveBeenCalledWith("Verification pack exported.", "default");

    await user.click(screen.getByRole("button", { name: "Export redaction key" }));
    expect(download).toHaveBeenCalledTimes(2);
    const [keyJson, keySuffix] = download.mock.calls[1] as [string, string];
    expect(keySuffix).toBe("-verification-key");
    expect(keyJson).toContain("Fictional Provider 0");
    expect(notify).toHaveBeenLastCalledWith("Redaction key exported.", "default");
  });

  it("traces the chosen scenario", async () => {
    const user = userEvent.setup();
    renderWithProviders(<VerificationExport onNotify={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Early" }));
    await user.click(screen.getByRole("button", { name: "Export verification pack" }));

    const pack = JSON.parse(download.mock.calls[0][0] as string);
    expect(pack.target).toEqual({ kind: "scenario", scenario: "early" });
  });

  it("traces a specific age and refuses an age outside the allowed range", async () => {
    const user = userEvent.setup();
    renderWithProviders(<VerificationExport onNotify={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Specific age" }));
    const input = screen.getByLabelText("Your retirement age");
    expect(input).toHaveValue(62);

    await user.clear(input);
    await user.type(input, "30");
    expect(screen.getByRole("button", { name: "Export verification pack" })).toBeDisabled();

    await user.clear(input);
    await user.type(input, "58");
    await user.click(screen.getByRole("button", { name: "Export verification pack" }));

    const pack = JSON.parse(download.mock.calls[0][0] as string);
    expect(pack.target).toEqual({ kind: "age", age: 58 });
    expect(pack.timing.selfAge).toBe(58);
  });

  it("explains that redacted is not anonymous", async () => {
    renderWithProviders(<VerificationExport onNotify={vi.fn()} />);
    expect(await screen.findByText(/Redacted is not anonymous/)).toBeInTheDocument();
  });
});
