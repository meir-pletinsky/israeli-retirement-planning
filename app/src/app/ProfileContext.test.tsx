import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { engineNowMs } from "../domain";
import {
  clearAllData,
  loadBackupSnoozedUntilFromDb,
  loadLastExportedAtFromDb,
  loadProfileFromDb,
} from "../storage/db";
import { buildTestProfile } from "../test/domainFixtures";

import { useBackupStatus } from "./backupStatus";
import { ProfileProvider, useProfile } from "./ProfileContext";

const START = new Date("2026-11-07T08:00:00Z");

function Probe() {
  const { evaluatedAt, updateProfile } = useProfile();
  return (
    <>
      <output data-testid="evaluated">{evaluatedAt.toISOString()}</output>
      <output data-testid="engine">{new Date(engineNowMs()).toISOString()}</output>
      <button
        type="button"
        onClick={() => updateProfile({ pensionSavings: { otherAssets: 1 } as never })}
      >
        edit
      </button>
    </>
  );
}

beforeEach(async () => {
  await clearAllData();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ProfileProvider calculation moment", () => {
  it("pins the engine clock to one moment while the profile stays the same", async () => {
    const view = render(
      <ProfileProvider>
        <Probe />
      </ProfileProvider>,
    );
    expect(await screen.findByTestId("evaluated")).toHaveTextContent(START.toISOString());

    vi.setSystemTime(new Date(START.getTime() + 3 * 24 * 3600 * 1000));
    view.rerender(
      <ProfileProvider>
        <Probe />
      </ProfileProvider>,
    );

    expect(screen.getByTestId("evaluated")).toHaveTextContent(START.toISOString());
    expect(screen.getByTestId("engine")).toHaveTextContent(START.toISOString());
  });

  it("takes a new moment when the profile changes", async () => {
    render(
      <ProfileProvider>
        <Probe />
      </ProfileProvider>,
    );
    await screen.findByTestId("evaluated");

    const later = new Date(START.getTime() + 2 * 3600 * 1000);
    vi.setSystemTime(later);
    await act(async () => {
      screen.getByRole("button", { name: "edit" }).click();
    });

    expect(screen.getByTestId("evaluated")).toHaveTextContent(later.toISOString());
    expect(screen.getByTestId("engine")).toHaveTextContent(later.toISOString());
  });

  it("releases the pin when it unmounts", async () => {
    const view = render(
      <ProfileProvider>
        <Probe />
      </ProfileProvider>,
    );
    await screen.findByTestId("evaluated");
    view.unmount();

    const later = new Date(START.getTime() + 5 * 3600 * 1000);
    vi.setSystemTime(later);
    expect(engineNowMs()).toBe(later.getTime());
  });
});

describe("ProfileProvider backup and storage bookkeeping", () => {
  const persist = vi.fn(() => Promise.resolve(true));

  function BackupProbe() {
    const { profile, updateProfile, resetProfile } = useProfile();
    const { lastExportedAt, snoozedUntil, recordExport, snoozePrompt } = useBackupStatus();
    return (
      <>
        <output data-testid="age">{profile.personal.age ?? "none"}</output>
        <output data-testid="exported">{lastExportedAt ?? "never"}</output>
        <output data-testid="snoozed">{snoozedUntil ?? "no"}</output>
        <button type="button" onClick={() => updateProfile(buildTestProfile({ age: 41 }))}>
          add data
        </button>
        <button type="button" onClick={recordExport}>
          export
        </button>
        <button type="button" onClick={snoozePrompt}>
          snooze
        </button>
        <button type="button" onClick={resetProfile}>
          reset
        </button>
      </>
    );
  }

  const renderProbe = () =>
    render(
      <ProfileProvider>
        <BackupProbe />
      </ProfileProvider>,
    );

  const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 30)));

  beforeEach(() => {
    persist.mockClear();
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { persisted: () => Promise.resolve(false), persist },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "storage");
  });

  it("asks the browser to keep the plan once it holds data, and never asks twice", async () => {
    renderProbe();
    await screen.findByTestId("age");
    await settle();
    expect(persist).not.toHaveBeenCalled();

    await act(async () => screen.getByRole("button", { name: "add data" }).click());
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));

    await act(async () => screen.getByRole("button", { name: "add data" }).click());
    await settle();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does not ask again on a later visit", async () => {
    const first = renderProbe();
    await screen.findByTestId("age");
    await act(async () => screen.getByRole("button", { name: "add data" }).click());
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect((await loadProfileFromDb())?.personal.age).toBe(41));
    first.unmount();

    renderProbe();
    expect(await screen.findByTestId("age")).toHaveTextContent("41");
    await settle();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("remembers the last export and the snooze, and forgets both when the plan is reset", async () => {
    renderProbe();
    expect(await screen.findByTestId("exported")).toHaveTextContent("never");

    await act(async () => screen.getByRole("button", { name: "export" }).click());
    await act(async () => screen.getByRole("button", { name: "snooze" }).click());

    expect(screen.getByTestId("exported")).toHaveTextContent(START.toISOString());
    expect(screen.getByTestId("snoozed")).toHaveTextContent(
      new Date(START.getTime() + 7 * 24 * 3600 * 1000).toISOString(),
    );
    await waitFor(async () => expect(await loadLastExportedAtFromDb()).toBe(START.toISOString()));
    await waitFor(async () => expect(await loadBackupSnoozedUntilFromDb()).not.toBeNull());

    await act(async () => screen.getByRole("button", { name: "reset" }).click());

    expect(screen.getByTestId("exported")).toHaveTextContent("never");
    expect(screen.getByTestId("snoozed")).toHaveTextContent("no");
    await waitFor(async () => expect(await loadLastExportedAtFromDb()).toBeNull());
    expect(await loadBackupSnoozedUntilFromDb()).toBeNull();
  });

  it("loads the stored export date on the next visit", async () => {
    const first = renderProbe();
    await screen.findByTestId("exported");
    await act(async () => screen.getByRole("button", { name: "export" }).click());
    await waitFor(async () => expect(await loadLastExportedAtFromDb()).toBe(START.toISOString()));
    first.unmount();

    renderProbe();

    expect(await screen.findByTestId("exported")).toHaveTextContent(START.toISOString());
  });
});
