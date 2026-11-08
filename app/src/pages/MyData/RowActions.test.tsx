import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "../../i18n";
import { RowActions } from "./RowActions";

afterEach(async () => { await i18n.changeLanguage("en"); });

describe("RowActions", () => {
  it.each(["en", "ru", "he"])("names icon actions and describes their row in %s", async (language) => {
    await i18n.changeLanguage(language);
    const edit = vi.fn();
    const remove = vi.fn();
    const user = userEvent.setup();
    render(<><span id="account-name">Pension account</span><RowActions describedBy="account-name" onEdit={edit} onRemove={remove} /></>);
    const editButton = screen.getByRole("button", { name: i18n.t("common.edit") });
    const removeButton = screen.getByRole("button", { name: i18n.t("common.remove") });
    for (const button of [editButton, removeButton]) {
      expect(button).toHaveAccessibleDescription("Pension account");
      expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(button).toHaveClass("h-8", "w-8");
    }
    await user.click(editButton);
    await user.click(removeButton);
    expect(edit).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });
});
