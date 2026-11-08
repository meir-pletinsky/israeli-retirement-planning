import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Stepper } from "./Stepper";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Stepper active-step scrolling", () => {
  it("reveals the current step on phones without changing completion status", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const scroll = vi.fn();
    const prior = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      const steps = [{ key: "first", label: "First" }, { key: "last", label: "Last", done: true }];
      const { rerender } = render(<Stepper steps={steps} currentKey="first" />);
      expect(scroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
      expect(screen.getByRole("button", { name: "First" })).toHaveAttribute("aria-current", "step");
      expect(screen.getByRole("button", { name: "First" }).querySelector("svg")).toBeNull();
      scroll.mockClear();
      rerender(<Stepper steps={steps} currentKey="last" />);
      expect(scroll).toHaveBeenCalledOnce();
      expect(screen.getByRole("button", { name: "Last" })).toHaveAttribute("aria-current", "step");
      expect(screen.getByRole("button", { name: "Last" }).querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    } finally {
      HTMLElement.prototype.scrollIntoView = prior;
    }
  });
});
