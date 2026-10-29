import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";

import { clearAllData, loadProfileFromDb, saveProfileToDb } from "../../storage/db";
import { buildTestProfile } from "../../test/domainFixtures";
import {
  activePension,
  EMPLOYER_NAME,
  HOLDER_ID,
  PROVIDER_NAME,
  policy,
  product,
  report,
  toXml,
} from "../../test/fixtures/clearingHouse/builders";
import { renderWithProviders } from "../../test/renderWithProviders";
import { ClearingHouseImportPage } from "./ClearingHouseImportPage";

const PASSWORD = "Invented-Pass-123";
const POLICY_NUMBER = "7770001";

beforeEach(async () => {
  await clearAllData();
});

function xmlFile(text: string, name = "report.xml"): File {
  return new File([text], name, { type: "text/xml" });
}

async function zipFile(entries: { name: string; content: string }[], password?: string): Promise<File> {
  const zip = await import("@zip.js/zip.js");
  zip.configure({ useWebWorkers: false });
  const writer = new zip.ZipWriter(new zip.Uint8ArrayWriter(), { password });
  for (const entry of entries) await writer.add(entry.name, new zip.TextReader(entry.content));
  const bytes = await writer.close();
  return new File([bytes as BlobPart], "report.zip", { type: "application/zip" });
}

const REPORT_XML = toXml(
  report({}, product({}, activePension({ number: POLICY_NUMBER, plan: "תוכנית לדוגמה" }))),
);

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/import/clearing-house" element={<ClearingHouseImportPage />} />
      <Route path="/my-data/pension-savings" element={<p>Accounts page</p>} />
    </Routes>,
    { route: "/import/clearing-house" },
  );
}

describe("ClearingHouseImportPage", () => {
  it("shows how to get the report before any file is chosen", async () => {
    renderPage();
    expect(await screen.findByText("How to get your report")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open swiftness.co.il" });
    expect(link).toHaveAttribute("href", "https://swiftness.co.il");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("imports an XML file into an empty profile", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.upload(await screen.findByLabelText("Choose zip or XML files"), xmlFile(REPORT_XML));

    expect(await screen.findByText("Review before importing")).toBeInTheDocument();
    expect(screen.getAllByText(PROVIDER_NAME).length).toBeGreaterThan(0);
    expect(screen.getByText(`Employer: ${EMPLOYER_NAME}`)).toBeInTheDocument();
    // Someone who has not said they are married is not asked whose report it is.
    expect(screen.queryByText("Whose report is this?")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Import selected values" }));

    expect(await screen.findByText("Import complete")).toBeInTheDocument();
    const saved = await waitFor(async () => {
      const profile = await loadProfileFromDb();
      expect(profile?.pensionSavings.accounts).toHaveLength(1);
      return profile!;
    });
    const [account] = saved.pensionSavings.accounts;
    expect(account.owner).toBe("self");
    expect(account.providerName).toBe(PROVIDER_NAME);
    expect(account.totalAccumulatedBalance).toBe(120000);
    expect(saved.personal.age).toBe(46);

    await user.click(screen.getByRole("button", { name: "Go to pension & savings" }));
    expect(await screen.findByText("Accounts page")).toBeInTheDocument();
  });

  it("asks for the zip password, tells a wrong one apart, and then continues", async () => {
    const user = userEvent.setup();
    renderPage();
    const zip = await zipFile([{ name: "a.xml", content: REPORT_XML }], PASSWORD);

    await user.upload(await screen.findByLabelText("Choose zip or XML files"), zip);
    expect(await screen.findByText("This file is password protected")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Zip file password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Open file" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That password did not open the file");
    // The field is emptied after each attempt.
    expect(screen.getByLabelText("Zip file password")).toHaveValue("");

    await user.type(screen.getByLabelText("Zip file password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Open file" }));
    expect(await screen.findByText("Review before importing")).toBeInTheDocument();
    expect(screen.getAllByText(PROVIDER_NAME).length).toBeGreaterThan(0);
  });

  it("lets the user go back from the password prompt", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.upload(
      await screen.findByLabelText("Choose zip or XML files"),
      await zipFile([{ name: "a.xml", content: REPORT_XML }], PASSWORD),
    );
    await user.click(await screen.findByRole("button", { name: "Choose different files" }));
    expect(await screen.findByLabelText("Choose zip or XML files")).toBeInTheDocument();
  });

  it("explains a file that is not a report", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderPage();

    await user.upload(await screen.findByLabelText("Choose zip or XML files"), new File(["x"], "statement.pdf"));
    expect(await screen.findByRole("alert")).toHaveTextContent("No XML report files were found");

    await user.upload(screen.getByLabelText("Choose zip or XML files"), xmlFile("<Other/>"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("do not look like a Pension Clearing House report"),
    );
  });

  it("asks whose report it is for a married user and saves under the partner", async () => {
    await saveProfileToDb(buildTestProfile({ maritalStatus: "married", spouse: { age: 44 } }));
    const user = userEvent.setup();
    renderPage();

    await user.upload(await screen.findByLabelText("Choose zip or XML files"), xmlFile(REPORT_XML));
    expect(await screen.findByText("Whose report is this?")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "My partner's" }));
    expect(await screen.findByText("About your partner")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Import selected values" }));

    expect(await screen.findByText("Import complete")).toBeInTheDocument();
    const saved = await waitFor(async () => {
      const profile = await loadProfileFromDb();
      expect(profile?.pensionSavings.accounts).toHaveLength(1);
      return profile!;
    });
    expect(saved.pensionSavings.accounts[0].owner).toBe("spouse");
    // The partner's age on file differs from the report's, so it is not ticked and stays as it was.
    expect(saved.spouse.age).toBe(44);
    expect(saved.personal.age).toBeNull();
  });

  it("offers to update a matching account instead of adding a duplicate", async () => {
    const base = buildTestProfile({ pensionBalances: [50000] });
    await saveProfileToDb({
      ...base,
      pensionSavings: {
        accounts: [{ ...base.pensionSavings.accounts[0], policyNumber: POLICY_NUMBER }],
      },
    });
    const user = userEvent.setup();
    renderPage();

    await user.upload(await screen.findByLabelText("Choose zip or XML files"), xmlFile(REPORT_XML));
    expect(await screen.findByText("This looks like an account you already entered.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Update my existing account" })).toBeChecked();

    // A value that differs from what is on file starts unticked; the user opts in.
    const balance = screen.getByRole("checkbox", { name: /Total accumulated balance/ });
    expect(balance).not.toBeChecked();
    await user.click(balance);

    await user.click(screen.getByRole("button", { name: "Import selected values" }));
    expect(await screen.findByText("Import complete")).toBeInTheDocument();

    const saved = await waitFor(async () => {
      const profile = await loadProfileFromDb();
      expect(profile?.pensionSavings.accounts[0].totalAccumulatedBalance).toBe(120000);
      return profile!;
    });
    expect(saved.pensionSavings.accounts).toHaveLength(1);
  });

  it("disables importing when every value is unticked", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.upload(await screen.findByLabelText("Choose zip or XML files"), xmlFile(REPORT_XML));
    await screen.findByText("Review before importing");

    await user.click(screen.getByRole("checkbox", { name: /Import this account/ }));
    for (const box of screen.getAllByRole("checkbox")) {
      if (!(box as HTMLInputElement).disabled && (box as HTMLInputElement).checked) await user.click(box);
    }
    expect(screen.getByRole("button", { name: "Import selected values" })).toBeDisabled();
    expect(screen.getByText("Tick at least one value to import.")).toBeInTheDocument();
  });

  it("lists records that hold no savings instead of importing them", async () => {
    const user = userEvent.setup();
    renderPage();
    const xml = toXml(
      report(
        {},
        product({}, activePension({ number: POLICY_NUMBER })),
        product({ type: 6 }, policy({ number: "123" })),
      ),
    );
    await user.upload(await screen.findByLabelText("Choose zip or XML files"), xmlFile(xml));

    const skipped = await screen.findByText("Records skipped");
    expect(within(skipped.parentElement!).getByText("Risk insurance: holds no retirement savings.")).toBeInTheDocument();
    expect(screen.getByText("Accounts found: 1. Other records skipped: 1.")).toBeInTheDocument();
  });

  it("never shows the holder ID number", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.upload(await screen.findByLabelText("Choose zip or XML files"), xmlFile(REPORT_XML));
    await screen.findByText("Review before importing");
    expect(document.body.textContent).not.toContain(HOLDER_ID);
  });
});
