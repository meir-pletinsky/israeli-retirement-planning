import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LogoMark } from "./LogoMark";

function gradientIds(svg: Element): string[] {
  return [...svg.querySelectorAll("linearGradient")].map((g) => g.id);
}

describe("LogoMark", () => {
  it("renders as a decorative square mark of the requested size", () => {
    const { getByTestId } = render(<LogoMark size={48} />);
    const svg = getByTestId("logo-mark");

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "48");
    expect(svg).toHaveAttribute("height", "48");
  });

  it("gives each instance its own gradient ids so several marks can share a page", () => {
    const { getAllByTestId } = render(
      <>
        <LogoMark />
        <LogoMark />
      </>,
    );
    const [first, second] = getAllByTestId("logo-mark");
    const firstIds = gradientIds(first);
    const secondIds = gradientIds(second);

    expect(firstIds).toHaveLength(3);
    expect(firstIds.every((id) => /^[\w-]+$/.test(id))).toBe(true);
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
  });

  it("only references gradients that it defines", () => {
    const { getByTestId } = render(<LogoMark />);
    const svg = getByTestId("logo-mark");
    const ids = new Set(gradientIds(svg));
    const referenced = [...svg.querySelectorAll("[fill^='url(#'], [stroke^='url(#']")].flatMap((el) =>
      [el.getAttribute("fill"), el.getAttribute("stroke")]
        .filter((v): v is string => !!v?.startsWith("url(#"))
        .map((v) => v.slice(5, -1)),
    );

    expect(referenced.length).toBeGreaterThan(0);
    expect(referenced.every((id) => ids.has(id))).toBe(true);
  });
});
