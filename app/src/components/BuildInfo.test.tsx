import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "../i18n";
import { BuildInfo } from "./BuildInfo";

vi.mock("../buildInfo", () => ({
  BUILD_COMMIT: "f24c949a1b2c3d4e5f60718293a4b5c6d7e8f901",
  BUILD_TIME: new Date(2026, 10, 9, 11, 33).toISOString(),
}));

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("BuildInfo", () => {
  it("links the commit and shows the build date and time", () => {
    render(<BuildInfo />);

    expect(screen.getByRole("link", { name: "Version f24c949" })).toHaveAttribute(
      "href",
      "https://github.com/meir-pletinsky/israeli-retirement-planning/commit/f24c949a1b2c3d4e5f60718293a4b5c6d7e8f901",
    );
    expect(screen.getByText(/built \u206609\/11\/2026 11:33\u2069/)).toBeInTheDocument();
  });

  // A left-to-right wrapper around the Hebrew "built" word reorders it with the numbers after it
  // and removes the gap before the version, so only the date and time are isolated.
  it("keeps the Hebrew sentence in reading order, with only the date and time left to right", async () => {
    await i18n.changeLanguage("he");
    const { container } = render(<BuildInfo />);

    const footer = container.querySelector("p")!;
    expect(footer.textContent).toBe(`${i18n.t("common.buildVersion", { commit: "f24c949" })} \u00b7 ${i18n.t("common.buildTime", { time: "\u206609/11/2026 11:33\u2069" })}`);
    expect(footer.querySelector("[dir='ltr']")).toBeNull();
  });
});
