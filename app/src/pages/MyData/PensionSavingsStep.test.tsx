import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { clearAllData, loadProfileFromDb, saveProfileToDb } from "../../storage/db";
import { buildTestProfile } from "../../test/domainFixtures";
import { renderWithProviders } from "../../test/renderWithProviders";
import { PensionSavingsStep } from "./PensionSavingsStep";

beforeEach(async () => {
  await clearAllData();
});

describe("PensionSavingsStep — accounts repeater", () => {
  it("supports adding, editing, and removing a pension account", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PensionSavingsStep />, {
      route: "/my-data/pension-savings",
    });

    // Initially empty.
    expect(
      await screen.findByText(/no accounts added yet/i),
    ).toBeInTheDocument();

    // Add an account.
    await user.click(screen.getByRole("button", { name: "Add account" }));
    await user.type(screen.getByLabelText(/^Provider name/), "Menora Mivtachim");
    // NumberField's label wraps a currency-suffix span alongside the input,
    // so its computed label text is "Total accumulated balance₪" — match by
    // substring rather than exact string.
    await user.type(
      screen.getByLabelText(/Total accumulated balance/),
      "150000",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    // The name and balance show on both the summary table and the card.
    expect(await screen.findAllByText("Menora Mivtachim")).not.toHaveLength(0);
    expect(screen.getAllByText("\u20aa150,000")).not.toHaveLength(0);
    expect(screen.queryByText(/no accounts added yet/i)).not.toBeInTheDocument();

    // Edit it.
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const balanceInput = screen.getByLabelText(/Total accumulated balance/);
    await user.clear(balanceInput);
    await user.type(balanceInput, "175000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findAllByText("\u20aa175,000")).not.toHaveLength(0);

    // Remove it (through the confirm modal).
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(screen.queryByText("Menora Mivtachim")).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/no accounts added yet/i)).toBeInTheDocument();
  });

  it("saves contribution rates entered in the Ongoing contributions section", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PensionSavingsStep />, {
      route: "/my-data/pension-savings",
    });

    await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.type(screen.getByLabelText(/^Provider name/), "Clal");
    await user.click(screen.getByRole("button", { name: /ongoing contributions/i }));
    await user.type(screen.getByLabelText(/Monthly gross salary these rates apply to/), "27000");
    await user.type(screen.getByLabelText(/Employee contribution rate/), "6");
    await user.type(screen.getByLabelText(/Employer contribution rate/), "6.5");
    await user.type(screen.getByLabelText(/Severance contribution rate/), "6");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findAllByText("Clal")).not.toHaveLength(0);
    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.pensionSavings.accounts[0].contributions).toEqual({
        monthlySalaryBase: 27000,
        employeeRatePercent: 6,
        employerRatePercent: 6.5,
        severanceRatePercent: 6,
      });
    });
  });
  it("links to the Pension Clearing House import", async () => {
    renderWithProviders(<PensionSavingsStep />, {
      route: "/my-data/pension-savings",
    });

    expect(await screen.findByRole("link", { name: "Import Clearing House report" })).toHaveAttribute(
      "href",
      "/import/clearing-house",
    );
    expect(screen.getByText("Have a Pension Clearing House report?")).toBeInTheDocument();
  });

  it("saves the policy number and fund ID and shows them on the account card", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PensionSavingsStep />, {
      route: "/my-data/pension-savings",
    });

    await user.click(await screen.findByRole("button", { name: "Add account" }));
    await user.type(screen.getByLabelText(/^Provider name/), "Clal");
    await user.type(screen.getByLabelText(/^Policy \/ account number/), "CLAL-9255621");
    await user.type(screen.getByLabelText(/^Fund \/ program ID/), "12345");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findAllByText("Policy CLAL-9255621 · Fund 12345")).not.toHaveLength(0);
    await waitFor(async () => {
      const [account] = (await loadProfileFromDb())!.pensionSavings.accounts;
      expect(account).toMatchObject({ policyNumber: "CLAL-9255621", fundId: "12345" });
    });
  });

  it("tags what the calculation uses and what is for reference only", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PensionSavingsStep />, {
      route: "/my-data/pension-savings",
    });

    await user.click(await screen.findByRole("button", { name: "Add account" }));

    const labelOf = (name: RegExp) => screen.getByLabelText(name).closest("label");
    expect(labelOf(/^Product category/)).toHaveTextContent("Recommended");
    expect(labelOf(/^Account status/)).toHaveTextContent("Recommended");
    expect(labelOf(/^Total accumulated balance/)).toHaveTextContent("Recommended");
    expect(labelOf(/^Policy \/ account number/)).toHaveTextContent("Reference only");
    expect(labelOf(/^Fund \/ program ID/)).toHaveTextContent("Reference only");
    expect(labelOf(/^Provider name/)).toHaveTextContent("Reference only");
    // The dates only matter for a study fund.
    expect(labelOf(/^Join date/)).toHaveTextContent("Reference only");
    await user.selectOptions(screen.getByLabelText(/^Product category/), "studyFund");
    expect(labelOf(/^Join date/)).toHaveTextContent("Recommended");
    expect(labelOf(/^Liquidity date/)).toHaveTextContent("Recommended");
  });
});

describe("PensionSavingsStep — account owner", () => {
  const married = { maritalStatus: "married" as const, spouse: { age: 48 } };

  async function seed(profile: ReturnType<typeof buildTestProfile>) {
    await saveProfileToDb(profile);
  }

  it("does not show person tabs or ask who owns an account for a single person", async () => {
    const user = userEvent.setup();
    await seed(buildTestProfile({ age: 50, pensionBalances: [100_000] }));
    renderWithProviders(<PensionSavingsStep />, { route: "/my-data/pension-savings" });

    await screen.findAllByText("Test Provider");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByLabelText("Account owner")).not.toBeInTheDocument();
  });

  it("shows each person's accounts on their own tab", async () => {
    const user = userEvent.setup();
    await seed(
      buildTestProfile({
        age: 50,
        ...married,
        pensionBalances: [100_000, 40_000],
        pensionAccountOverrides: [
          { owner: "self", providerName: "My Fund" },
          { owner: "spouse", providerName: "Partner Fund" },
        ],
      }),
    );
    renderWithProviders(<PensionSavingsStep />, { route: "/my-data/pension-savings" });

    const meTab = await screen.findByRole("tab", { name: /^Me/ });
    const partnerTab = screen.getByRole("tab", { name: /^Partner/ });
    expect(meTab).toHaveAttribute("aria-selected", "true");
    expect(meTab).toHaveTextContent("\u20aa100,000");
    expect(partnerTab).toHaveTextContent("\u20aa40,000");
    expect(screen.getAllByText("My Fund")).not.toHaveLength(0);
    expect(screen.queryByText("Partner Fund")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "My accounts" })).toBeInTheDocument();

    await user.click(partnerTab);
    expect(partnerTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("Partner Fund")).not.toHaveLength(0);
    expect(screen.queryByText("My Fund")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Partner's accounts" })).toBeInTheDocument();
  });

  it("opens on the partner's tab when asked to by the page address", async () => {
    await seed(
      buildTestProfile({
        age: 50,
        ...married,
        pensionBalances: [100_000],
        pensionAccountOverrides: [{ owner: "spouse" }],
      }),
    );
    renderWithProviders(<PensionSavingsStep />, { route: "/my-data/pension-savings?person=spouse" });

    expect(await screen.findByRole("tab", { name: /^Partner/ })).toHaveAttribute("aria-selected", "true");
  });

  it("lets a married user assign an account to their partner and follows it to their tab", async () => {
    const user = userEvent.setup();
    await seed(buildTestProfile({ age: 50, ...married, pensionBalances: [100_000] }));
    renderWithProviders(<PensionSavingsStep />, { route: "/my-data/pension-savings" });

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Pension / savings account \u2014 Me" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Account owner"), "spouse");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("tab", { name: /^Partner/ })).toHaveAttribute("aria-selected", "true");
    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.pensionSavings.accounts[0].owner).toBe("spouse");
    });
  });

  it("presets a new account's owner to the person whose tab is open", async () => {
    const user = userEvent.setup();
    await seed(buildTestProfile({ age: 50, ...married }));
    renderWithProviders(<PensionSavingsStep />, { route: "/my-data/pension-savings" });

    await user.click(await screen.findByRole("button", { name: "Add account" }));
    expect(screen.getByLabelText("Account owner")).toHaveValue("self");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("tab", { name: /^Partner/ }));
    await user.click(screen.getByRole("button", { name: "Add account" }));
    expect(screen.getByLabelText("Account owner")).toHaveValue("spouse");
  });

  it("points the import at the person whose tab is open", async () => {
    const user = userEvent.setup();
    await seed(buildTestProfile({ age: 50, ...married }));
    renderWithProviders(<PensionSavingsStep />, { route: "/my-data/pension-savings" });

    expect(await screen.findByRole("link", { name: "Import my Clearing House report" })).toHaveAttribute(
      "href",
      "/import/clearing-house?owner=self",
    );
    await user.click(screen.getByRole("tab", { name: /^Partner/ }));
    expect(screen.getByRole("link", { name: "Import my partner's Clearing House report" })).toHaveAttribute(
      "href",
      "/import/clearing-house?owner=spouse",
    );
  });

  it("warns that the partner's accounts are not counted until the partner's age is entered", async () => {
    const user = userEvent.setup();
    await seed(
      buildTestProfile({
        age: 50,
        maritalStatus: "married",
        pensionBalances: [100_000],
        pensionAccountOverrides: [{ owner: "spouse" }],
      }),
    );
    renderWithProviders(<PensionSavingsStep />, { route: "/my-data/pension-savings" });

    await user.click(await screen.findByRole("tab", { name: /^Partner/ }));
    expect(await screen.findByRole("note")).toHaveTextContent("Enter your partner's age on the Personal tab");
  });

  it("keeps the partner's tab, with a married-couples note, once the user is no longer married", async () => {
    const user = userEvent.setup();
    await seed(
      buildTestProfile({
        age: 50,
        maritalStatus: "divorced",
        pensionBalances: [100_000],
        pensionAccountOverrides: [{ owner: "spouse" }],
      }),
    );
    renderWithProviders(<PensionSavingsStep />, { route: "/my-data/pension-savings" });

    await user.click(await screen.findByRole("tab", { name: /^Partner/ }));
    expect(await screen.findByRole("note")).toHaveTextContent("only for married couples");
  });

  it("counts a partner's account once the household is active", async () => {
    const user = userEvent.setup();
    await seed(
      buildTestProfile({
        age: 50,
        ...married,
        pensionBalances: [100_000],
        pensionAccountOverrides: [{ owner: "spouse" }],
      }),
    );
    renderWithProviders(<PensionSavingsStep />, { route: "/my-data/pension-savings" });

    await user.click(await screen.findByRole("tab", { name: /^Partner/ }));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByText(/Household total counted in your plan:/)).toHaveTextContent("\u20aa100,000");
  });
});
