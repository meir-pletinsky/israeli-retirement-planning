import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmModal } from "./ConfirmModal";
import { FormModal } from "./FormModal";

function Harness({ onSave = () => {} }: { onSave?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <button type="button" onClick={() => setOpen(true)}>
        Edit account
      </button>
      <FormModal
        open={open}
        title="Edit pension account"
        closeLabel="Close"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" onClick={onSave}>
              Save
            </button>
          </>
        }
      >
        <input aria-label="Provider" />
      </FormModal>
    </main>
  );
}

describe("FormModal", () => {
  it("is an accessible modal dialog named by its title", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit account" }));

    const dialog = screen.getByRole("dialog", { name: "Edit pension account" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("moves focus into the dialog and gives it back to the trigger on close", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Edit account" });

    await user.click(trigger);
    expect(screen.getByRole("dialog")).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Edit account" });
    await user.click(trigger);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps Tab and Shift+Tab inside the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Edit account" }));
    const close = screen.getByRole("button", { name: "Close" });
    const save = screen.getByRole("button", { name: "Save" });

    await user.tab({ shift: true });
    expect(save).toHaveFocus();

    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Provider" })).toHaveFocus();
  });

  it("makes the page behind it inert while it is open", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Edit account" });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("inert");
    expect(screen.getByRole("dialog").closest("[inert]")).toBeNull();

    await user.keyboard("{Escape}");
    expect(document.querySelector("[inert]")).toBeNull();
  });
});

describe("ConfirmModal", () => {
  function renderConfirm(onConfirm = vi.fn(), onCancel = vi.fn()) {
    render(
      <ConfirmModal
        open
        title="Reset all data?"
        body="This permanently removes your plan."
        confirmLabel="Reset"
        cancelLabel="Keep my data"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    return { onConfirm, onCancel };
  }

  it("is a labelled, described modal dialog", () => {
    renderConfirm();

    const dialog = screen.getByRole("dialog", { name: "Reset all data?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("This permanently removes your plan.");
  });

  it("starts on the safe choice, not the destructive one", () => {
    renderConfirm();

    expect(screen.getByRole("button", { name: "Keep my data" })).toHaveFocus();
  });

  it("cancels on Escape without confirming", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderConfirm();

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("stacked dialogs", () => {
  it("lets only the topmost dialog react to Escape", async () => {
    const user = userEvent.setup();
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    render(
      <>
        <FormModal open title="Outer" closeLabel="Close outer" onClose={closeOuter} footer={null}>
          <p>outer</p>
        </FormModal>
        <FormModal open title="Inner" closeLabel="Close inner" onClose={closeInner} footer={null}>
          <p>inner</p>
        </FormModal>
      </>,
    );

    await user.keyboard("{Escape}");

    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });
});
