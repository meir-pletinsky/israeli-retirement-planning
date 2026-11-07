import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { engineNowMs } from "../domain";
import { clearAllData } from "../storage/db";

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
