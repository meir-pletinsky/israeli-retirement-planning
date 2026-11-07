import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouteScrollManager } from "./RouteScrollManager";

function Back() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>back</button>;
}

function Page({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h1>{title}</h1>
      <Link to="/second">to second</Link>
      <Link to="/second#details">to details</Link>
      <Link to="/second#late">to late section</Link>
      <Link to="/second#missing">to missing section</Link>
      <Back />
      {children}
    </div>
  );
}

function SecondPage() {
  const [lateVisible, setLateVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLateVisible(true), 40);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Page title="Second">
      <section id="details">Details</section>
      {lateVisible && <section id="late">Late</section>}
    </Page>
  );
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/first"]}>
      <RouteScrollManager />
      <Routes>
        <Route path="/first" element={<Page title="First" />} />
        <Route path="/second" element={<SecondPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RouteScrollManager", () => {
  const scrollTo = vi.fn();
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollTo.mockClear();
    scrollIntoView.mockClear();
    vi.spyOn(window, "scrollTo").mockImplementation(scrollTo);
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves the first screen alone", () => {
    renderApp();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "First" })).not.toHaveFocus();
  });

  it("opens a new screen at the top and focuses its heading", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("link", { name: "to second" }));

    expect(await screen.findByRole("heading", { name: "Second" })).toHaveFocus();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("keeps the browser's own position on back", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("link", { name: "to second" }));
    await screen.findByRole("heading", { name: "Second" });
    scrollTo.mockClear();

    await userEvent.click(screen.getByRole("button", { name: "back" }));

    expect(await screen.findByRole("heading", { name: "First" })).toBeInTheDocument();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls to a linked section instead of the top", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("link", { name: "to details" }));

    const section = await screen.findByText("Details");
    expect(scrollIntoView.mock.contexts).toContain(section);
    expect(section).toHaveFocus();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("waits for a section the new screen renders a moment later", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("link", { name: "to late section" }));

    const section = await screen.findByText("Late");
    await vi.waitFor(() => expect(scrollIntoView.mock.contexts).toContain(section));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("falls back to the top when the linked section never appears", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("link", { name: "to missing section" }));

    await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 0), { timeout: 2000 });
    expect(await screen.findByRole("heading", { name: "Second" })).toHaveFocus();
  });

  it("does not re-scroll when the screen re-renders without navigating", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("link", { name: "to second" }));
    await screen.findByRole("heading", { name: "Second" });
    scrollTo.mockClear();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
