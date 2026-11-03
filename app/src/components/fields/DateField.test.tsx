import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import "../../i18n";
import { DateField } from "./DateField";

function Harness({ initial = null }: { initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <>
      <DateField label="Start" value={value} onChange={setValue} />
      <output data-testid="value">{value ?? "none"}</output>
    </>
  );
}

const input = () => screen.getByLabelText("Start");
const stored = () => screen.getByTestId("value").textContent;

describe("DateField", () => {
  it("shows the ISO value as dd/mm/yyyy", () => {
    render(<Harness initial="2024-03-05" />);
    expect(input()).toHaveValue("05/03/2024");
  });

  it("reads a typed dd/mm/yyyy date day first", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), "03/04/2024");
    expect(stored()).toBe("2024-04-03");
  });

  it("understands other ways of writing a date when the field is left", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), "5 Mar 2024");
    await user.tab();
    expect(stored()).toBe("2024-03-05");
    expect(input()).toHaveValue("05/03/2024");
  });

  it("flags text that is not a date and drops it when the field is left", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2024-03-05" />);
    await user.clear(input());
    await user.type(input(), "31/02/2024");
    expect(input()).toHaveAttribute("aria-invalid", "true");
    await user.tab();
    expect(input()).not.toHaveAttribute("aria-invalid");
  });

  it("clears the value when the text is emptied", async () => {
    const user = userEvent.setup();
    render(<Harness initial="2024-03-05" />);
    await user.clear(input());
    expect(stored()).toBe("none");
  });

  it("has a calendar button for picking the date", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /Start/ })).toBeInTheDocument();
  });
});
