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

    expect(await screen.findByText("Menora Mivtachim")).toBeInTheDocument();
    expect(screen.getByText("\u20aa150,000")).toBeInTheDocument();
    expect(screen.queryByText(/no accounts added yet/i)).not.toBeInTheDocument();

    // Edit it.
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const balanceInput = screen.getByLabelText(/Total accumulated balance/);
    await user.clear(balanceInput);
    await user.type(balanceInput, "175000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("\u20aa175,000")).toBeInTheDocument();

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
    await user.type(screen.getByLabelText(/Employee contribution rate/), "6");
    await user.type(screen.getByLabelText(/Employer contribution rate/), "6.5");
    await user.type(screen.getByLabelText(/Severance contribution rate/), "6");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Clal");
    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.pensionSavings.accounts[0].contributions).toEqual({
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

    expect(await screen.findByRole("link", { name: "Import report" })).toHaveAttribute(
      "href",
      "/import/clearing-house",
    );
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

    expect(await screen.findByText("Policy CLAL-9255621 · Fund 12345")).toBeInTheDocument();
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

  it("does not ask who owns an account for a single person", async () => {
    const user = userEvent.setup();
    await seed(buildTestProfile({ age: 50, pensionBalances: [100_000] }));
    renderWithProviders(<PensionSavingsStep />, { route: "/my-data/pension-savings" });

    await screen.findByText("Test Provider");
    expect(screen.queryByText("Me")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByLabelText("Account owner")).not.toBeInTheDocument();
  });

  it("lets a married user assign an account to their spouse", async () => {
    const user = userEvent.setup();
    await seed(buildTestProfile({ age: 50, ...married, pensionBalances: [100_000] }));
    renderWithProviders(<PensionSavingsStep />, { route: "/my-data/pension-savings" });

    expect(await screen.findByText("Me")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.selectOptions(screen.getByLabelText("Account owner"), "spouse");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("My spouse")).toBeInTheDocument();
    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.pensionSavings.accounts[0].owner).toBe("spouse");
    });
  });

  it("defaults a new account to the user", async () => {
    const user = userEvent.setup();
    await seed(buildTestProfile({ age: 50, ...married }));
    renderWithProviders(<PensionSavingsStep />, { route: "/my-data/pension-savings" });

    await user.click(await screen.findByRole("button", { name: "Add account" }));
    expect(screen.getByLabelText("Account owner")).toHaveValue("self");
  });

  it("warns that a spouse's account is not counted until the spouse's age is entered", async () => {
    const profile = buildTestProfile({
      age: 50,
      maritalStatus: "married",
      pensionBalances: [100_000],
      pensionAccountOverrides: [{ owner: "spouse" }],
    });
    await seed(profile);
    renderWithProviders(<PensionSavingsStep />, { route: "/my-data/pension-savings" });

    expect(await screen.findByText("Not counted \u2014 add your spouse's age")).toBeInTheDocument();
  });

  it("keeps showing the owner after the user is no longer married", async () => {
    const profile = buildTestProfile({
      age: 50,
      maritalStatus: "divorced",
      pensionBalances: [100_000],
      pensionAccountOverrides: [{ owner: "spouse" }],
    });
    await seed(profile);
    renderWithProviders(<PensionSavingsStep />, { route: "/my-data/pension-savings" });

    expect(await screen.findByText("Not counted \u2014 add your spouse's age")).toBeInTheDocument();
  });

  it("counts a spouse's account once the household is active", async () => {
    await seed(
      buildTestProfile({
        age: 50,
        ...married,
        pensionBalances: [100_000],
        pensionAccountOverrides: [{ owner: "spouse" }],
      }),
    );
    renderWithProviders(<PensionSavingsStep />, { route: "/my-data/pension-savings" });

    expect(await screen.findByText("My spouse")).toBeInTheDocument();
    expect(screen.queryByText(/Not counted/)).not.toBeInTheDocument();
  });
});
