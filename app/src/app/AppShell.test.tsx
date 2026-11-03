import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { clearAllData } from "../storage/db";
import { renderWithProviders } from "../test/renderWithProviders";
import { AppShell } from "./AppShell";

function renderShell(route: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<p>Dashboard page</p>} />
        <Route path="/settings" element={<p>Settings page</p>} />
      </Route>
    </Routes>,
    { route },
  );
}

beforeEach(async () => {
  await clearAllData();
});

describe("AppShell — home link and build info", () => {
  it("takes the logo and title back to the home page", async () => {
    renderShell("/settings");

    const links = await screen.findAllByRole("link", { name: "Israeli Retirement Planning" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute("href", "/");
  });

  it("shows which version is deployed and when it was built", async () => {
    renderShell("/dashboard");

    expect(await screen.findByText(/built \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getByText(/^Version [0-9a-f]{7}$|^Development build$/)).toBeInTheDocument();
  });
});

describe("AppShell — privacy banner", () => {
  it("shows the full privacy note next to the navigation and a one-line version for phones", async () => {
    renderShell("/dashboard");

    const note = await screen.findByRole("note", { name: "Private by design" });
    expect(note).toHaveTextContent("Your data stays on this device. Nothing is uploaded to a server");
    expect(within(note).getByRole("link", { name: "How it works" })).toHaveAttribute("href", "/settings");

    const strip = screen.getByRole("link", { name: "Your data stays on this device. Nothing is uploaded." });
    expect(strip).toHaveAttribute("href", "/settings");
  });

  it("keeps the note on every page", async () => {
    renderShell("/settings");

    expect(await screen.findByText("Settings page")).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "Private by design" })).toBeInTheDocument();
  });
});
