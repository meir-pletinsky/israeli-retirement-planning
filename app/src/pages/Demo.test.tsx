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
    const others = screen.getByRole("region", { name: i18n.t("demo.otherTitle") });
    expect(Array.from(others.querySelectorAll("video")).map((video) => video.getAttribute("src"))).toEqual(
      rest.map(demoVideoUrl),
    );
  });

  it("embeds the two Hebrew swiftness.co.il tutorials from YouTube below the demo videos", async () => {
    renderWithProviders(<Demo />);

    const section = await screen.findByRole("region", { name: "swiftness.co.il tutorials" });
    expect(section).toHaveTextContent("The videos are in Hebrew only.");
    const frames = Array.from(section.querySelectorAll("iframe"));
    expect(frames.map((frame) => frame.getAttribute("src"))).toEqual([
      "https://www.youtube-nocookie.com/embed/jmVEs4GDEcM?rel=0",
      "https://www.youtube-nocookie.com/embed/toAxoB2qgog?rel=0",
    ]);
    expect(frames.map((frame) => frame.getAttribute("title"))).toEqual([
      "YouTube tutorial (Hebrew): Signing up to the service",
      "YouTube tutorial (Hebrew): Submitting a report request",
    ]);
    for (const frame of frames) {
      expect(frame).toHaveAttribute("loading", "lazy");
      expect(frame).toHaveAttribute("allowfullscreen");
    }
    expect(within(section).getByText("Signing up to the service").tagName).toBe("FIGCAPTION");
    expect(within(section).getByText("Submitting a report request").tagName).toBe("FIGCAPTION");
    expect(section).toHaveTextContent("YouTube may receive your IP address. Nothing from your plan is sent.");

    const others = screen.getByRole("region", { name: "Other languages" });
    expect(others.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the swiftness.co.il tutorials in every language, and translates their captions", async () => {
    await i18n.changeLanguage("he");
    renderWithProviders(<Demo />);

    const section = await screen.findByRole("region", { name: "מדריכי וידאו לאתר swiftness.co.il" });
    expect(section.querySelectorAll("iframe")).toHaveLength(2);
    expect(within(section).getByText("הרשמה לשירות")).toBeInTheDocument();
    expect(within(section).getByText("הגשת בקשה לדוח")).toBeInTheDocument();
  });

  it("stops the other demo videos when one starts playing", async () => {
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
