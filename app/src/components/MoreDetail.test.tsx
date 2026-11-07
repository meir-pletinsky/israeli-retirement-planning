import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MoreDetail } from "./MoreDetail";

function renderBlock() {
  render(
    <>
      <p id="outside">Outside</p>
      <MoreDetail summary="More detail">
        <p id="inside">Inside</p>
      </MoreDetail>
    </>,
  );
  return screen.getByText("More detail").closest("details") as HTMLDetailsElement;
}

describe("MoreDetail", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  it("starts closed", () => {
    expect(renderBlock().open).toBe(false);
  });

  it("opens when the address already points at something inside it", () => {
    window.location.hash = "#inside";
    expect(renderBlock().open).toBe(true);
  });

  it("opens when a link to something inside it is followed", async () => {
    const details = renderBlock();
    expect(details.open).toBe(false);

    window.location.hash = "#inside";
    await waitFor(() => expect(details.open).toBe(true));
  });

  it("stays closed for an address that points elsewhere", async () => {
    const details = renderBlock();

    window.location.hash = "#outside";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(details.open).toBe(false);
  });
});
