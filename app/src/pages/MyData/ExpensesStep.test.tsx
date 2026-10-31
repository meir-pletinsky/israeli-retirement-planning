import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { clearAllData, loadProfileFromDb, saveProfileToDb } from "../../storage/db";
import { buildTestProfile } from "../../test/domainFixtures";
import { renderWithProviders } from "../../test/renderWithProviders";
import { ExpensesStep } from "./ExpensesStep";
import { MyDataLayout } from "./MyDataLayout";

beforeEach(async () => {
  await clearAllData();
});

type User = ReturnType<typeof userEvent.setup>;

function renderStep() {
  return renderWithProviders(<ExpensesStep />, { route: "/my-data/expenses" });
}

async function chooseItemised(user: User) {
  await user.click(await screen.findByRole("radio", { name: "Itemised list" }));
}

const planned = () => screen.getByRole("region", { name: "Planned monthly spending in retirement" });
/** The large figure at the top of the box: the whole itemised total. */
const plannedTotal = () => planned().querySelector("p span")?.textContent;

describe("ExpensesStep — one total", () => {
  it("has no field legend on the page, and the mode question sits above the switch", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/my-data" element={<MyDataLayout />}>
          <Route path="expenses" element={<ExpensesStep />} />
          <Route path="personal" element={<p>personal step</p>} />
        </Route>
      </Routes>,
      { route: "/my-data/expenses" },
    );

    const group = await screen.findByRole("radiogroup", { name: "How do you want to enter your spending?" });
    expect(screen.queryByRole("region", { name: "Which fields matter?" })).not.toBeInTheDocument();
    const label = document.getElementById("expenses-mode-label");
    // A block element, so the switch never shares a line with the question.
    expect(label).toHaveClass("block");
    expect(group.previousElementSibling).toBe(label);
  });

  it("starts on one total, with only the retirement figure to fill in", async () => {
    renderStep();

    expect(await screen.findByRole("radio", { name: "One total" })).toBeChecked();
    expect(screen.getByLabelText(/^Expected monthly expenses in retirement/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Current monthly expenses/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add expense" })).not.toBeInTheDocument();
  });

  it("saves the typed retirement figure", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.type(await screen.findByLabelText(/^Expected monthly expenses in retirement/), "12000");

    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.expenses).toMatchObject({ mode: "totals", retirementMonthly: 12_000 });
    });
  });
});

describe("ExpensesStep — itemised list", () => {
  it("switches to the list, which starts empty, and remembers the choice", async () => {
    const user = userEvent.setup();
    renderStep();

    await chooseItemised(user);

    expect(screen.getByRole("radio", { name: "Itemised list" })).toBeChecked();
    expect(screen.getByText(/^No expenses yet/)).toBeInTheDocument();
    expect(plannedTotal()).toBe("₪0");
    expect(screen.queryByLabelText(/^Expected monthly expenses in retirement/)).not.toBeInTheDocument();
    await waitFor(async () => {
      expect((await loadProfileFromDb())?.expenses.mode).toBe("detailed");
    });
  });

  it("adds an expense, shows what it costs per month, and sums it into the plan", async () => {
    const user = userEvent.setup();
    renderStep();
    await chooseItemised(user);

    await user.click(screen.getByRole("button", { name: "Add expense" }));
    await user.type(screen.getByLabelText(/^Name/), "Arnona");
    await user.selectOptions(screen.getByLabelText(/^Category/), "housing");
    await user.type(screen.getByLabelText(/^Amount each time/), "1800");
    await user.selectOptions(screen.getByLabelText(/^How often/), "bimonthly");
    expect(screen.getByText("About ₪900 per month")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    const housing = await screen.findByRole("region", { name: "Housing" });
    expect(within(housing).getByText("Arnona")).toBeInTheDocument();
    expect(within(housing).getByText("Every 2 months")).toBeInTheDocument();
    expect(within(housing).getAllByText("₪900")).toHaveLength(2);
    expect(plannedTotal()).toBe("₪900");
    expect(within(planned()).getByText("Essential (minimum budget):")).toBeInTheDocument();

    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.expenses.items).toHaveLength(1);
      expect(stored?.expenses.items[0]).toMatchObject({
        name: "Arnona",
        category: "housing",
        amount: 1_800,
        frequency: "bimonthly",
        necessity: "essential",
        catalogKey: null,
      });
    });
  });

  it("asks for the number of years only for a purchase every few years", async () => {
    const user = userEvent.setup();
    renderStep();
    await chooseItemised(user);

    await user.click(screen.getByRole("button", { name: "Add expense" }));
    expect(screen.queryByLabelText(/^Years between payments/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Amount each time/), "120000");
    await user.selectOptions(screen.getByLabelText(/^How often/), "everyYears");
    await user.type(screen.getByLabelText(/^Years between payments/), "8");
    expect(screen.getByText("About ₪1,250 per month")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/^Type/), "discretionary");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Every 8 years")).toBeInTheDocument();
    expect(within(planned()).getByText("Discretionary:").nextElementSibling).toHaveTextContent("₪1,250");
  });

  it("splits the minimum budget from the discretionary part", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        expenseItems: [
          { name: "Rent", amount: 6_000, category: "housing", necessity: "essential" },
          { name: "Holiday", amount: 24_000, frequency: "yearly", category: "travel", necessity: "discretionary" },
        ],
      }),
    );
    renderStep();

    const box = await screen.findByRole("region", { name: "Planned monthly spending in retirement" });
    expect(within(box).getByText("₪8,000")).toBeInTheDocument();
    expect(within(box).getByText("Essential (minimum budget):").nextElementSibling).toHaveTextContent("₪6,000");
    expect(within(box).getByText("Discretionary:").nextElementSibling).toHaveTextContent("₪2,000");
    expect(screen.getByRole("region", { name: "Housing" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Travel and leisure" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Healthcare" })).not.toBeInTheDocument();
  });

  it("shows a dash instead of a monthly amount while the amount is missing", async () => {
    await saveProfileToDb(
      buildTestProfile({ age: 50, expenseItems: [{ name: "Gas", amount: null, category: "housing" }] }),
    );
    renderStep();

    const housing = await screen.findByRole("region", { name: "Housing" });
    expect(within(housing).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("edits an expense", async () => {
    await saveProfileToDb(
      buildTestProfile({ age: 50, expenseItems: [{ name: "Internet", amount: 100, category: "communication" }] }),
    );
    const user = userEvent.setup();
    renderStep();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const amount = screen.getByLabelText(/^Amount each time/);
    await user.clear(amount);
    await user.type(amount, "130");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.expenses.items).toHaveLength(1);
      expect(stored?.expenses.items[0]).toMatchObject({ name: "Internet", amount: 130 });
    });
    expect(plannedTotal()).toBe("₪130");
  });

  it("shows a suggested expense under its catalog name until the user types their own", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        expenseItems: [{ catalogKey: "arnona", name: "", amount: 500, category: "housing" }],
      }),
    );
    const user = userEvent.setup();
    renderStep();

    const housing = await screen.findByRole("region", { name: "Housing" });
    expect(within(housing).getByText("Arnona (municipal property tax)")).toBeInTheDocument();

    await user.click(within(housing).getByRole("button", { name: "Edit" }));
    const name = screen.getByLabelText(/^Name/);
    expect(name).toHaveValue("");
    expect(name).toHaveAttribute("placeholder", "Arnona (municipal property tax)");
    await user.type(name, "Arnona for the flat");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await within(housing).findByText("Arnona for the flat")).toBeInTheDocument();
  });

  it("removes an expense only after confirming", async () => {
    await saveProfileToDb(
      buildTestProfile({ age: 50, expenseItems: [{ name: "Internet", amount: 100, category: "communication" }] }),
    );
    const user = userEvent.setup();
    renderStep();

    await user.click(await screen.findByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Internet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(async () => {
      expect((await loadProfileFromDb())?.expenses.items).toEqual([]);
    });
    expect(screen.getByText(/^No expenses yet/)).toBeInTheDocument();
  });

  it("keeps the typed total and the list when switching between the two ways", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        retirementMonthlyExpenses: 15_000,
        expenseItems: [{ name: "Internet", amount: 100, category: "communication" }],
      }),
    );
    const user = userEvent.setup();
    renderStep();

    expect(await screen.findByText(/The total you typed \(₪15,000\) is kept/)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "One total" }));
    expect(screen.getByLabelText(/^Expected monthly expenses in retirement/)).toHaveValue(15_000);

    await user.click(screen.getByRole("radio", { name: "Itemised list" }));
    expect(screen.getByText("Internet")).toBeInTheDocument();
    const stored = await loadProfileFromDb();
    expect(stored?.expenses.retirementMonthly).toBe(15_000);
  });
});

describe("ExpensesStep — suggestions", () => {
  async function openSuggestions(user: User) {
    await chooseItemised(user);
    await user.click(screen.getByRole("button", { name: "Choose from suggestions" }));
  }

  it("adds the ticked suggestions with their usual frequency, named by the language of the screen", async () => {
    const user = userEvent.setup();
    renderStep();
    await openSuggestions(user);

    await user.click(screen.getByRole("checkbox", { name: /^Rent or mortgage/ }));
    expect(screen.getByRole("button", { name: "Add selected (1)" })).toBeEnabled();
    // Typing an amount ticks the row.
    await user.type(screen.getByLabelText("Amount for Arnona (municipal property tax)"), "1800");
    expect(screen.getByRole("checkbox", { name: /^Arnona/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Add selected (2)" }));

    await waitFor(async () => {
      const items = (await loadProfileFromDb())?.expenses.items ?? [];
      expect(items.map((item) => item.catalogKey)).toEqual(["rentOrMortgage", "arnona"]);
      expect(items[0]).toMatchObject({
        name: "",
        category: "housing",
        amount: null,
        frequency: "monthly",
        necessity: "essential",
      });
      expect(items[1]).toMatchObject({ amount: 1_800, frequency: "bimonthly" });
    });
    expect(screen.queryByRole("button", { name: /^Add selected/ })).not.toBeInTheDocument();
    expect(plannedTotal()).toBe("₪900");
  });

  it("cannot add nothing", async () => {
    const user = userEvent.setup();
    renderStep();
    await openSuggestions(user);

    expect(screen.getByRole("button", { name: "Add selected (0)" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: /^Add selected/ })).not.toBeInTheDocument();
    expect((await loadProfileFromDb())?.expenses.items ?? []).toEqual([]);
  });

  it("marks a suggestion that is already in the list and does not add it twice", async () => {
    const user = userEvent.setup();
    renderStep();
    await openSuggestions(user);
    await user.click(screen.getByRole("checkbox", { name: /^Water/ }));
    await user.click(screen.getByRole("button", { name: "Add selected (1)" }));
    await screen.findByRole("region", { name: "Housing" });

    await user.click(screen.getByRole("button", { name: "Choose from suggestions" }));
    const water = screen.getByRole("checkbox", { name: /^Water/ });
    expect(water).toBeDisabled();
    expect(water).toBeChecked();
    expect(screen.getAllByText("Already in your list")).toHaveLength(1);
    expect(screen.queryByLabelText("Amount for Water")).not.toBeInTheDocument();
  });

  it("starts each time from nothing ticked", async () => {
    const user = userEvent.setup();
    renderStep();
    await openSuggestions(user);
    await user.click(screen.getByRole("checkbox", { name: /^Groceries/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Choose from suggestions" }));
    expect(screen.getByRole("checkbox", { name: /^Groceries/ })).not.toBeChecked();
  });
});
