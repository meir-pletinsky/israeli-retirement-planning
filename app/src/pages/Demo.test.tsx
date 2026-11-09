import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAllData } from "../storage/db";
import { renderWithProviders } from "../test/renderWithProviders";
import i18n from "../i18n";
import { Demo } from "./Demo";
import { demoVideoUrl } from "./demoVideos";

const videoIn = (container: HTMLElement) => container.querySelector("video") as HTMLVideoElement;

beforeEach(async () => {
  await clearAllData();
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("Demo page", () => {
  it("points each language at its own video", () => {
    expect(demoVideoUrl("en")).toBe("https://demos.gimlai.app/gimlai_en.mp4");
    expect(demoVideoUrl("ru")).toBe("https://demos.gimlai.app/gimlai_ru.mp4");
    expect(demoVideoUrl("he")).toBe("https://demos.gimlai.app/gimlai_he.mp4");
  });

  it("plays the video for the current language in the main player, and the other two small, below it", async () => {
    renderWithProviders(<Demo />);

    expect(await screen.findByRole("heading", { level: 1, name: "Demo" })).toBeInTheDocument();
    const main = screen.getByRole("region", { name: "English" });
    expect(videoIn(main)).toHaveAttribute("src", demoVideoUrl("en"));
    expect(videoIn(main)).toHaveAttribute("controls");
    expect(videoIn(main)).toHaveAccessibleName("Demo video: English");

    const others = screen.getByRole("region", { name: "Other languages" });
    const small = within(others).getAllByLabelText(/^Demo video:/);
    expect(small.map((video) => video.getAttribute("src"))).toEqual([demoVideoUrl("ru"), demoVideoUrl("he")]);
    expect(small.map((video) => video.getAttribute("aria-label"))).toEqual([
      "Demo video: Русский",
      "Demo video: עברית",
    ]);
    // The main player precedes the small ones.
    expect(
      main.compareDocumentPosition(others) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it.each([
    ["ru", "Русский", ["en", "he"]],
    ["he", "עברית", ["en", "ru"]],
  ] as const)("promotes the %s video to the main player when the app is in that language", async (language, label, rest) => {
    await i18n.changeLanguage(language);
    renderWithProviders(<Demo />);

    const main = await screen.findByRole("region", { name: label });
    expect(videoIn(main)).toHaveAttribute("src", demoVideoUrl(language));
    const others = screen.getAllByRole("region").find((region) => region !== main)!;
    expect(Array.from(others.querySelectorAll("video")).map((video) => video.getAttribute("src"))).toEqual(
      rest.map(demoVideoUrl),
    );
  });

  it("stops the other videos when one starts playing", async () => {
    renderWithProviders(<Demo />);
    await screen.findByRole("heading", { level: 1, name: "Demo" });
    const videos = Array.from(document.querySelectorAll("video"));
    expect(videos).toHaveLength(3);
    const pause = vi.fn();
    for (const video of videos) video.pause = pause;

    videos[1].dispatchEvent(new Event("play"));

    expect(pause).toHaveBeenCalledTimes(2);
    expect(pause.mock.contexts).not.toContain(videos[1]);
  });

  it("says where the videos come from and that nothing of the plan is sent", async () => {
    renderWithProviders(<Demo />);

    expect(await screen.findByText(/streamed from demos\.gimlai\.app/)).toHaveTextContent(
      "Nothing from your plan is sent.",
    );
  });
});
