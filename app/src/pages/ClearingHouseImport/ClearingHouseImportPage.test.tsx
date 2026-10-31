import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes, useLocation } from "react-router-dom";

import {
  importClearingHouseFiles,
  SAMPLE_REPORT_DATE,
  SAMPLE_REPORT_FILE_NAME,
  SAMPLE_REPORT_PATH,
} from "../../domain/clearingHouseImport";
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

afterEach(() => {
  vi.unstubAllGlobals();
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

function AccountsPage() {
  const { search } = useLocation();
  return <p>Accounts page {search}</p>;
}

function renderPage(route = "/import/clearing-house") {
  return renderWithProviders(
    <Routes>
      <Route path="/import/clearing-house" element={<ClearingHouseImportPage />} />
      <Route path="/my-data/pension-savings" element={<AccountsPage />} />
    </Routes>,
    { route },
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
    // 2,000,000 projected at 67 over a 10,000 monthly pension: an estimate, so not flagged as guaranteed.
    expect(account.annuityParameters).toMatchObject({
      conversionFactor: 200,
      hasGuaranteedFactor: false,
      estimatedMonthlyAnnuity: null,
    });

    await user.click(screen.getByRole("button", { name: "Go to pension & savings" }));
    expect(await screen.findByText("Accounts page ?person=self")).toBeInTheDocument();
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

  it("imports a guaranteed factor, an estimated factor and an old pension fund's projected pension", async () => {
    const user = userEvent.setup();
    renderPage();
    const xml = toXml(
      report(
        {},
        product(
          { type: 1 },
          policy({
            number: "1110001",
            projections: [{ age: 67, accumulation: 1500000, guaranteedFactor: 150, kupot: [{ zikna: 10000 }] }],
          }),
          policy({
            number: "1110002",
            projections: [{ age: 67, accumulation: 1500000, kupot: [{ zikna: 7500 }] }],
          }),
        ),
        product(
          {},
          policy({
            number: "2220001",
            kerenType: 1,
            vatika: 1,
            projections: [{ age: 67, accumulation: null, kupot: [{ zikna: null, hodshit: 3100 }] }],
          }),
        ),
      ),
    );
    await user.upload(await screen.findByLabelText("Choose zip or XML files"), xmlFile(xml));
    await screen.findByText("Review before importing");

    // Only the managers insurance with an estimated factor needs the reminder that the app will not use it yet.
    expect(screen.getAllByText(/This factor is an estimate, not a guarantee/)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Import selected values" }));
    expect(await screen.findByText("Import complete")).toBeInTheDocument();

    const saved = await waitFor(async () => {
      const profile = await loadProfileFromDb();
      expect(profile?.pensionSavings.accounts).toHaveLength(3);
      return profile!;
    });
    const byNumber = (number: string) => saved.pensionSavings.accounts.find((entry) => entry.policyNumber === number)!;
    expect(byNumber("1110001").annuityParameters).toMatchObject({ hasGuaranteedFactor: true, conversionFactor: 150 });
    expect(byNumber("1110002").annuityParameters).toMatchObject({ hasGuaranteedFactor: false, conversionFactor: 200 });
    expect(byNumber("2220001").annuityParameters).toMatchObject({
      estimatedMonthlyAnnuity: 3100,
      conversionFactor: null,
    });
  });

  it("never shows the holder ID number", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.upload(await screen.findByLabelText("Choose zip or XML files"), xmlFile(REPORT_XML));
    await screen.findByText("Review before importing");
    expect(document.body.textContent).not.toContain(HOLDER_ID);
  });
});

describe("whose report it is", () => {
  async function openReport(file: File = xmlFile(REPORT_XML), route?: string) {
    const user = userEvent.setup();
    renderPage(route);
    await user.upload(await screen.findByLabelText("Choose zip or XML files"), file);
    await screen.findByText("Review before importing");
    return user;
  }

  it("asks for confirmation before a report that does not fit the profile is imported", async () => {
    await saveProfileToDb(buildTestProfile({ age: 30, gender: "female" }));
    const user = await openReport();

    expect(screen.getByText("This report may be about someone else")).toBeInTheDocument();
    expect(screen.getByText("The gender in the report differs from the one in your details.")).toBeInTheDocument();
    expect(screen.getByText("The report is for someone aged 46, but your age is entered as 30.")).toBeInTheDocument();
    const apply = screen.getByRole("button", { name: "Import selected values" });
    expect(apply).toBeDisabled();
    expect(screen.getByText("Tick the confirmation above to continue.")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "I confirm this is my report" }));
    expect(apply).toBeEnabled();
    await user.click(apply);

    expect(await screen.findByText("Import complete")).toBeInTheDocument();
    const saved = await waitFor(async () => {
      const profile = await loadProfileFromDb();
      expect(profile?.pensionSavings.accounts).toHaveLength(1);
      return profile!;
    });
    expect(saved.pensionSavings.accounts[0].owner).toBe("self");
  });

  it("does not ask when the report fits the profile", async () => {
    await saveProfileToDb(buildTestProfile({ age: 45, gender: "male" }));
    await openReport();
    expect(screen.queryByText("This report may be about someone else")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import selected values" })).toBeEnabled();
  });

  it("sets the owner to the partner when the report fits the partner's details", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 30,
        gender: "female",
        maritalStatus: "married",
        spouse: { age: 46, gender: "male" },
      }),
    );
    const user = await openReport();

    expect(screen.getByRole("radio", { name: "My partner's" })).toBeChecked();
    expect(screen.getByText(/set to your partner because the report fits/)).toBeInTheDocument();
    expect(screen.queryByText("This report may be about someone else")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Import selected values" }));
    expect(await screen.findByText("Import complete")).toBeInTheDocument();
    const saved = await waitFor(async () => {
      const profile = await loadProfileFromDb();
      expect(profile?.pensionSavings.accounts).toHaveLength(1);
      return profile!;
    });
    expect(saved.pensionSavings.accounts[0].owner).toBe("spouse");
    expect(saved.personal.age).toBe(30);
  });

  it("imports for the partner when opened from the partner's tab, and returns to that tab", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 30,
        gender: "female",
        maritalStatus: "married",
        spouse: { age: 46, gender: "male" },
      }),
    );
    const user = await openReport(xmlFile(REPORT_XML), "/import/clearing-house?owner=spouse");

    expect(screen.getByText("Importing for: Partner")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "My partner's" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Import selected values" }));
    expect(await screen.findByText("Import complete")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go to pension & savings" }));

    expect(await screen.findByText("Accounts page ?person=spouse")).toBeInTheDocument();
    const saved = await loadProfileFromDb();
    expect(saved?.pensionSavings.accounts[0].owner).toBe("spouse");
  });

  it("keeps the owner chosen by the tab even when the report fits the other person", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 30,
        gender: "female",
        maritalStatus: "married",
        spouse: { age: 46, gender: "male" },
      }),
    );
    await openReport(xmlFile(REPORT_XML), "/import/clearing-house?owner=self");

    expect(screen.getByText("Importing for: Me")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Mine" })).toBeChecked();
    expect(screen.queryByText(/set to your partner because the report fits/)).not.toBeInTheDocument();
    // The report does not fit the user, so it is still checked with them.
    expect(screen.getByText("This report may be about someone else")).toBeInTheDocument();
  });

  it("asks again when the owner is changed to someone the report does not fit", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 46,
        gender: "male",
        maritalStatus: "married",
        spouse: { age: 30, gender: "female" },
      }),
    );
    const user = await openReport();
    expect(screen.queryByText("This report may be about someone else")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "My partner's" }));
    expect(screen.getByText("This report may be about someone else")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import selected values" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "I confirm this is my partner's report" }));
    expect(screen.getByRole("button", { name: "Import selected values" })).toBeEnabled();

    // Going back to the owner it does fit removes the question and the old confirmation.
    await user.click(screen.getByRole("radio", { name: "Mine" }));
    expect(screen.queryByText("This report may be about someone else")).not.toBeInTheDocument();
  });

  it("says a partner's accounts are not counted until the household is set up", async () => {
    await saveProfileToDb(buildTestProfile({ age: 30, gender: "female" }));
    const user = await openReport();
    expect(screen.queryByText(/will be saved but not counted in your plan/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "My partner's" }));
    expect(screen.getByText(/will be saved but not counted in your plan/)).toBeInTheDocument();
    expect(screen.getByText("About your partner")).toBeInTheDocument();
  });

  it("warns when the files are about more than one person", async () => {
    const xml = toXml(
      report(
        {},
        product({}, activePension({ number: POLICY_NUMBER })),
        product({ holder: { id: "000000026" } }, activePension({ number: "7770002" })),
      ),
    );
    const user = await openReport(xmlFile(xml));
    expect(screen.getByText("These files are about different people")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("000000026");

    expect(screen.getByRole("button", { name: "Import selected values" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "I confirm all of these files should be saved as mine" }));
    expect(screen.getByRole("button", { name: "Import selected values" })).toBeEnabled();
  });

  it("shows whose report it is by first name and age, without the ID or family name", async () => {
    const xml = toXml(
      report({}, product({ holder: { firstName: "Dana", familyName: "Demo" } }, activePension({ number: POLICY_NUMBER }))),
    );
    await openReport(xmlFile(xml));
    expect(screen.getByText("Report of Dana, age 46.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Demo");
    expect(document.body.textContent).not.toContain(HOLDER_ID);
  });

  it("keeps a record of the report with a fingerprint, not the ID or family name", async () => {
    const xml = toXml(
      report({}, product({ holder: { firstName: "Dana", familyName: "Demo" } }, activePension({ number: POLICY_NUMBER }))),
    );
    const user = await openReport(xmlFile(xml));
    await user.click(screen.getByRole("button", { name: "Import selected values" }));
    expect(await screen.findByText("Import complete")).toBeInTheDocument();

    const saved = await waitFor(async () => {
      const profile = await loadProfileFromDb();
      expect(profile?.pensionSavings.reports).toHaveLength(1);
      return profile!;
    });
    const [record] = saved.pensionSavings.reports;
    expect(record).toMatchObject({ owner: "self", firstName: "Dana", ageAtImport: 46, sample: false });
    expect(record.personKeys.length).toBeGreaterThan(0);
    expect(saved.pensionSavings.accounts[0].reportId).toBe(record.id);
    const stored = JSON.stringify(record);
    expect(stored).not.toContain("Demo");
    expect(stored).not.toContain("000000018");
  });

  async function importAndLeave(xml: string) {
    const user = await openReport(xmlFile(xml));
    await user.click(screen.getByRole("button", { name: "Import selected values" }));
    expect(await screen.findByText("Import complete")).toBeInTheDocument();
    await waitFor(async () => {
      expect((await loadProfileFromDb())?.pensionSavings.reports.length).toBeGreaterThan(0);
    });
    cleanup();
  }

  it("recognises the same person when the report is imported again", async () => {
    const xml = toXml(
      report({}, product({ holder: { firstName: "Dana", familyName: "Demo" } }, activePension({ number: POLICY_NUMBER }))),
    );
    await importAndLeave(xml);

    await openReport(xmlFile(xml));
    expect(await screen.findByText(/This is the same person as the report you imported on/)).toBeInTheDocument();
    expect(screen.queryByText("This report may be about someone else")).not.toBeInTheDocument();
  });

  it("questions a report about a different person than the one imported before", async () => {
    await importAndLeave(
      toXml(
        report({}, product({ holder: { firstName: "Dana", familyName: "Demo" } }, activePension({ number: POLICY_NUMBER }))),
      ),
    );

    const other = toXml(
      report(
        {},
        product(
          { holder: { id: "000000026", firstName: "Omer", familyName: "Other" } },
          activePension({ number: "7770002" }),
        ),
      ),
    );
    await openReport(xmlFile(other));
    expect(await screen.findByText("This report may be about someone else")).toBeInTheDocument();
    expect(
      screen.getByText("This report is about a different person than the report you imported earlier as yours."),
    ).toBeInTheDocument();
  });
});

describe("the sample report", () => {
  const SAMPLE_ZIP = resolve(process.cwd(), "public", SAMPLE_REPORT_PATH);

  function stubSampleFetch(ok = true) {
    const fetchMock = vi.fn(async () =>
      ok ? new Response(readFileSync(SAMPLE_ZIP), { status: 200 }) : new Response(null, { status: 404 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function sampleCandidates() {
    const file = new File([readFileSync(SAMPLE_ZIP)], SAMPLE_REPORT_FILE_NAME, { type: "application/zip" });
    return (await importClearingHouseFiles([file], { now: SAMPLE_REPORT_DATE })).result;
  }

  it("ships a readable report for one made-up person", async () => {
    const result = await sampleCandidates();
    expect(result.candidates.length).toBeGreaterThan(3);
    expect(result.holderIds).toHaveLength(1);
    expect(result.people).toHaveLength(1);
    expect(result.people[0]).toMatchObject({ firstName: "דנה", age: 54 });
    // Parsing fingerprints everyone; only the record saved for the sample drops its keys.
    expect(result.people[0].keys.length).toBeGreaterThan(0);
    expect(result.personal.age?.value).toBe(54);
  });

  it("is offered on the first screen and marked as a sample", async () => {
    renderPage();
    expect(await screen.findByText("Want to see how it works first?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try the sample report" })).toBeEnabled();
  });

  it("loads into an empty plan with a clear sample banner and no confirmation needed", async () => {
    const fetchMock = stubSampleFetch();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Try the sample report" }));
    expect(await screen.findByText("Review before importing")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(SAMPLE_REPORT_PATH));
    expect(screen.getByText("Sample report: made-up data")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /made-up accounts to the plan/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import selected values" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add sample accounts to my plan" }));
    expect(await screen.findByText("Sample accounts added")).toBeInTheDocument();
    expect(screen.getByText(/for demonstration only/)).toBeInTheDocument();

    const expected = (await sampleCandidates()).candidates.length;
    const saved = await waitFor(async () => {
      const profile = await loadProfileFromDb();
      expect(profile?.pensionSavings.accounts.length).toBeGreaterThan(0);
      return profile!;
    });
    expect(saved.pensionSavings.accounts).toHaveLength(expected);
    expect(saved.personal.age).toBe(54);
    expect(saved.pensionSavings.reports).toEqual([
      expect.objectContaining({ sample: true, personKeys: [], firstName: "דנה", owner: "self" }),
    ]);
    expect(saved.pensionSavings.accounts.every((account) => account.reportId === saved.pensionSavings.reports[0].id)).toBe(true);
  });

  it("needs a confirmation before it is added to a plan that already has data", async () => {
    stubSampleFetch();
    await saveProfileToDb(buildTestProfile({ age: 30, gender: "female", pensionBalances: [50000] }));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Try the sample report" }));
    await screen.findByText("Review before importing");
    const apply = screen.getByRole("button", { name: "Add sample accounts to my plan" });
    expect(apply).toBeDisabled();
    expect(screen.getByText("Tick the confirmation above to continue.")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /made-up accounts to the plan/ }));
    expect(apply).toBeEnabled();
    await user.click(apply);
    expect(await screen.findByText("Sample accounts added")).toBeInTheDocument();

    const expected = (await sampleCandidates()).candidates.length;
    const saved = await waitFor(async () => {
      const profile = await loadProfileFromDb();
      expect(profile?.pensionSavings.accounts.length).toBeGreaterThan(1);
      return profile!;
    });
    // Added beside the real account; nothing of the person's own was replaced.
    expect(saved.pensionSavings.accounts).toHaveLength(expected + 1);
    expect(saved.pensionSavings.accounts[0].totalAccumulatedBalance).toBe(50000);
    expect(saved.personal.age).toBe(30);
    expect(saved.personal.gender).toBe("female");
  });

  it("never offers to update an account the user already has", async () => {
    stubSampleFetch();
    const [first] = (await sampleCandidates()).candidates;
    const base = buildTestProfile({ pensionBalances: [50000] });
    await saveProfileToDb({
      ...base,
      pensionSavings: {
        accounts: [{ ...base.pensionSavings.accounts[0], policyNumber: first.fields.policyNumber!.value }],
      },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Try the sample report" }));
    await screen.findByText("Review before importing");
    expect(screen.queryByText("This looks like an account you already entered.")).not.toBeInTheDocument();
  });

  it("explains when the sample cannot be loaded", async () => {
    stubSampleFetch(false);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Try the sample report" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The sample report could not be loaded"));
    expect(screen.getByRole("button", { name: "Try the sample report" })).toBeEnabled();
  });
});
