# Pension Clearing House XML import — schema analysis and mapping

**Status:** **implemented** (importer and review screen at `/import/clearing-house`;
see "Implementation notes" below for where the code departs from this spec).
**Analysed:** 2026-10-28. **Implemented:** 2026-10-29.
**Related research (parked):** [`ai-statement-import-design.md`](./ai-statement-import-design.md)
(Track B / decision D1a there is now **confirmed feasible** by this analysis;
the AI route is not needed for now).

This document records what a real Pension Clearing House (המסלקה הפנסיונית)
consolidated report contains, how consistent its XML is, and how it maps onto
the app's `PensionAccount` model. It is the spec for a deterministic, no-AI,
no-network importer.

> **Privacy rule for this repo.** The analysis used the project owner's own
> report (8 XML files). **No real value from it appears in this document, in
> tests, or anywhere else in the repository.** Every example below is invented
> or structural. Real files must never be committed, even anonymised; tests use
> synthetic fixtures.
>
> **Evidence tags.** **[V]** = verified in the 8 real files and/or the official
> schema documentation. **[I]** = my inference, consistent with the data but not
> stated by a source. **[?]** = could not be verified.

## Implementation notes (what was built, and where it differs from the sections below)

Code: `app/src/domain/clearingHouseImport/` (pure logic, tested with invented
fixtures in `app/src/test/fixtures/clearingHouse/`) and
`app/src/pages/ClearingHouseImport/` (UI). Entry: "Import report" button on the
Pension & savings step, route `/import/clearing-house`.

**Flow.** instructions (with a link to swiftness.co.il) -> choose the zip or the
XML files -> password prompt if the zip is protected -> review -> apply -> done
screen. The zip is first tried without a password; the prompt appears only when
needed, a wrong password is reported separately, and the field is cleared after
each attempt. The password lives in component state only.

**Zip handling supersedes "unzip first" in sections 2 and 11.** The zip is read
in the browser with `@zip.js/zip.js` (lazy-loaded, about 217 kB, its own chunk;
web workers off). ZipCrypto and AES both work. Limits: 50 files, 25 MB per entry,
100 MB in total; non-XML entries (Excel, PDF) are counted and ignored. File
names are never kept.

**Deviations from the spec.**

| Spec | Built |
|---|---|
| Section 8: compare `ReshumatSgira` counts | Only `KAMUT-MUTZARIM` and `KAMUT-YATZRANIM` are compared against what was found. `KAMUT-POLISOT` is **not** compared: it was 1 in every real file regardless of how many policies the file held, so it is unreliable. |
| Section 8: rate x salary reconciliation | Dropped. The rates are *derived* from deposit / salary, so the check was circular. The importer instead warns when the salary is missing (`contributionRatesMissingSalary`) and labels derived rates `derived`. |
| Section 8: monthly fee x 12 vs annual fee | Kept as `feeAccumulationMismatch`, a warning only. |
| Section 7.11: assign each account to self or spouse | One choice per report ("Mine" / "My partner's"), shown only when the user is married or already has partner accounts. A report covers one holder, so a per-account choice only invites mistakes. A partner receives gender, age and salary, but no marital status. |
| Section 7.10: duplicate import | `matchCandidates`: same owner and same policy number (and the same provider, unless the number has 6 or more digits); otherwise a lone same-provider, same-category account with no policy number. A policy number that equals the holder's ID is not distinctive: it matches only an account of the same provider and category, and only when exactly one candidate and one account fit. A match defaults to "update", with "add as new" as the alternative. |
| Section 6.3 / 6.4 | The pre-2008, post-2008 and section-190 balance split is **not imported**; the mapping of the breakdown was an interpretation. The annuity **is** imported (see 6.4.1), because without it the engine treats every pension fund and managers insurance as capital: the nearest projection supplies a conversion factor or, for old pension funds, the projected monthly pension. Every annuity value is a suggestion for the user's retirement age and is unticked when the report's age differs. |

**Rules the tests pin down.**

- A report whose fees are all zero means "not reported", so fees are not
  imported (`feesAllZero`), for every product type. A negative balance is not
  imported (`negativeBalance`). A policy number equal to the holder's ID is
  **kept** and flagged (`policyNumberIsHolderId`, info): it is stored in the
  profile on this device only, so the user can recognise the account against
  their own statements, and it is left out of the verification pack (the
  redaction key file maps it back). Because every new pension fund of the
  holder carries the same number, it never counts as distinctive for matching:
  it only matches an account of the same provider and category, and only when
  one candidate and one account fit.
- **Empty-element gotcha:** `SCHUM-KITZVAT-ZIKNA` (pension with premiums) can be
  an *empty element* rather than absent or nil. The projection falls back to
  `KITZVAT-HODSHIT-TZFUYA` when the first has no number, not only when it is
  absent. A unit test caught this.
- Review defaults: certain values that fill an empty field are ticked;
  `uncertain` values (marital status always, other inferred values) and
  values that would overwrite something the user already entered start unticked.
  A value identical to the current one is locked. Applying is disabled until
  something is ticked.
- Unknown codes become empty fields plus a localized warning, never an error.
  Newer schema versions give a warning (`newerSchemaVersion`), and reports older
  than the staleness threshold give another (`staleReport`).
- Privacy: nothing from the holder block (ID, name, address) is carried into the
  candidates, except that a policy number which equals the holder's ID is kept
  as the policy number (see above). The only other use of the block is the
  person record in 6.7: first name, age and fingerprints, kept per import, not
  per candidate. The employer name is shown during review
  only and is not written to the profile.

**Local real-file check.** `realFiles.local.test.ts` (gitignored through
`*.local.test.ts`) runs the importer over a folder of real files named by the
`CH_REAL_DIR` environment variable and writes only counts and warning codes to the
file named by `CH_OUT`. It skips itself when the variable is unset.

**Still open** (carried from section 9): the v009 XSD, `ACHOZ-HATAVA` semantics,
paying-annuity samples, whether the projections are in nominal or real terms
(the importer reads them as today's money, like the rest of the engine), and
whether the user's own zip is ZipCrypto or AES (both are supported).

---

## 1. Verdict

| Question | Answer |
|---|---|
| Is the XML consistent enough to parse deterministically? | **Yes [V].** All 8 files share one skeleton; only product-specific subtrees differ. |
| Is there an official, public schema? | **Yes [V].** The CMA "uniform structure" (מבנה אחיד) Holdings XSD, v008, is public (section 13). Our files declare **v009**, which I could not obtain; see 9. |
| Are the code values documented? | **Yes [V].** The XSD carries Hebrew `documentation` and enumerations for almost every coded field (section 4). The mapping rests on documented codes, not guesses. |
| Do the numbers reconcile? | **Yes [V].** Declared contribution rates equal (deposit ÷ salary) from the monthly rows; the monthly actual fee × 12 equals the contractual annual fee for every file; the official pension projection implies a standard annuity factor. |
| Best import input? | **XML first.** It is complete, typed, free, and local. The Excel file is a flat, lossy summary of the same data on three sheets (section 12): convenient, but it lacks the salary, the balance by tax layer and the investment tracks the app needs. The PDFs add nothing the importer needs. The AI-from-PDF route researched in the companion doc is parked: it is not needed for now. |

**Decision for the delivery plan:** the clearing-house XML is the import route.
It needs no network, no key, no consent screen about third-party AI, and has no
hallucination risk.

---

## 2. What the report is and how it arrives

- Requested from the clearing-house operator's site (swiftness.co.il, linked
  from gov.il), after identity verification and a small fee (roughly ₪14–19
  as last checked **[S]**; user guide in section 11).
- Delivered **by email, about one business day later**, as a **password-protected
  zip**. The email says which password to use.
- The zip held **one XML per product provider**, **one Excel file**, and
  **several PDFs** **[V]**. The Excel file (three sheets) is analysed in section
  12 (from the header rows of all three sheets, one data row of sheet 1 and the
  coverage-type column of sheet 3); the PDFs were not analysed.

**File-name pattern [V]:** `<holderId>_<providerCompanyId>_<TYPE>_<yyyyMMddHHmm>_<seq>.xml`

| `TYPE` | Meaning (`SUG-MUTZAR` family) |
|---|---|
| `PNN` | new pension fund (קרן פנסיה חדשה) |
| `PNO` | old pension fund (קרן פנסיה ותיקה) |
| `KGM` | provident fund (gemel) and study fund (hishtalmut) |
| `ING` | insurance (managers' insurance, risk policies) |

The first number in the file name is the **holder's ID number** and the second
is the provider's legal company ID. **The importer must never persist or log
the file name** (it contains the ID number).

The zip itself is encrypted with an ordinary zip password. **Built:** the app
reads the zip directly in the browser (zip.js) and prompts for the password; the
user does not need to unzip anything. Choosing the XML files directly still works.

---

## 3. Schema consistency across the 8 files

Root element `<Mimshak>`, UTF-8, `KoteretKovetz` header (schema version `009`,
run timestamp `yyyyMMddHHmmss`).

### 3.1 Conventions [V]

| Convention | Detail | Parser rule |
|---|---|---|
| Latin element names, Hebrew meaning | Names are transliterated Hebrew (`SHEUR-DMEI-NIHUL` = "rate of management fee"). Hebrew **values** (plan names, provider names) are UTF-8 Hebrew. | Match by element name; keep Hebrew text as-is. |
| Dates | `yyyyMMdd`; deposit months `yyyyMM` | Parse with an explicit regex, not `Date.parse`. |
| Null | `xsi:nil="true"` on an empty element | Treat as `null`. An empty element is also `null`. |
| Numbers | Plain decimals with `.`; trailing zeros vary (`0.0500`, `0.4`, `0`) | `Number()`, reject NaN. |
| Percents | Percent units, not fractions (`6` means 6 %) | Do not divide by 100 until display. |
| Repetition | Many elements repeat (policies, deposit types, balance types, tracks) | Always collect arrays; never assume a single child. |

### 3.2 Hierarchy [V]

Indentation shows containment approximately; confirm exact paths against the
XSD before writing the parser (`BlockItrot` also groups several balance
elements).

```text
Mimshak
  KoteretKovetz                      (version, run timestamp)
  YeshutYatzran                      (the product provider: name, id, contact)
    Mutzarim / Mutzar                (one per product)
      NetuneiMutzar
        SUG-MUTZAR                   (product type, section 4)
        YeshutLakoach                (the customer: SENSITIVE; read only for a first name, age and a one-way fingerprint, see 6.7)
        YeshutMaasik                 (the employer: SENSITIVE, never import)
        HeshbonotOPolisot
          HeshbonOPolisa             (one per account or policy; repeats)
            STATUS-POLISA-O-CHESHBON, SHEM-TOCHNIT, TAARICH-HITZTARFUT-MUTZAR, TIKUN-190, ...
            PirteiTaktziv            (the money)
              BlockItrot/Yitrot/PerutYitrot       current balance by deposit type
              PerutYitraLeTkufa                   balance by tax layer
              PerutYitrotLesofShanaKodemet        prior year-end balance
              PerutHafrashotLePolisa              contribution rates
              PerutHafkadotMetchilatShana         monthly deposit rows (optional)
              PirteiHafkadaAchrona                last deposit
              PirteiHaasaka                       policy salary
              PerutHotzaot                        fees (actual month + contract)
              PerutMasluleiHashkaa                investment tracks
            Tsua                                  net return
            YitraLefiGilPrisha                    official projection
            Kisuim / ZihuiKisui                   coverages
            Halvaa, PirteyTvia, PerutMitryot, NetuneiSheerim, ...
    ReshumatSgira                    (control counts)
```

### 3.3 What varies by product type [V]

| Subtree | Present in |
|---|---|
| `KisuiBKerenPensia` (disability %, widow %, orphan %) | pension funds only |
| `PirteiKisuiBeMutzar`, `SchumeiBituahYesodi`, `hitpatchut*` | insurance only |
| `PerutHafkadotMetchilatShana` (monthly deposit rows) | some files |
| `Sheer` (survivor details) | some files |
| `PerutYitrot` | absent for a pure-risk policy |

A file may contain **several policies** (`HeshbonOPolisa`); one old-pension
file held three, and one insurance file held three with different policy types.

### 3.4 Integrity check [V]

`ReshumatSgira` holds control counts (`KAMUT-*`). In all 8 files they were 1.
The importer should compare each count with the number of parsed records and
warn (not fail) on mismatch.

---

## 4. Official code tables (from the XSD documentation) [V]

Hebrew meaning in brackets where useful.

**`SUG-MUTZAR` (product type):** 1 savings-linked life insurance · 2 pension
fund · 3 provident fund (gemel) · 4 study fund · 5 pure savings policy · 6 pure
risk · 7 mortgage life insurance · 8 collective risk · 9 investment gemel · 10
child savings.

**`PENSIA-VATIKA-O-HADASHA`:** 1 old · 2 new. **`SUG-KEREN-PENSIA`:** 1 basic
(יסוד) · 2 comprehensive (מקיפה) · 3 general (כללית).

**`STATUS-POLISA-O-CHESHBON` (account status):** 1 active · 2 frozen / paid-up /
inactive · 3 cancelled · 4 temporary risk · 6 blocked for deposits (gemel only)
· 7 end of term · 8, 9 coverage-retention · 10 collective risk only.

> `STATUS-RESHOMA` is **not** the account status. It is the status of the
> response record (1 first response, 2 correcting, 3 replacing). I misread this
> early in the analysis; the parser must use `STATUS-POLISA-O-CHESHBON`.

**`SUG-POLISA`:** 1 classic · 2 preferred (עדיף) · 3 policies from 2004 · 4
risk or disability only. **`SUG-TOCHNIT-O-CHESHBON`:** 1 employee · 2
self-employed · 3 controlling shareholder · 4 other · 5 individual.

**`SUG-HAFRASHA` / `OFEN-HAFRASHA` / `KOD-SUG-HAFRASHA` (deposit type):** 1
severance · 2 employee contributions · 3 employer contributions · 4 section-47
contributions · 5 loss-of-work-capacity · 6 misc employee · 7 misc employer · 8
study-fund employee · 9 study-fund employer · 10 personal · 11 pure death risk ·
12 child savings.

**`SUG-HAMAFKID` / `SUG-MAFKID` (who deposited):** 1 employee · 2 current
employer · 3 former employer · 4 National Insurance · 5 parents · 6 fund transfer.

**`KOD-SUG-ITRA` / `SUG-ITRA-LETKUFA` (balance kind):** 1 capital · 2 paying
annuity · 3 non-paying annuity · 4 client's choice. **`SUG-KUPA`:** 1 paying
· 2 non-paying · 3 study fund.

**`KOD-TECHULAT-SHICHVA` (tax layer by deposit date):** 1 until the
1997-2000 Arrangements Law · 2 after it · 3-6 various dates up to 2007 · 7 from
2008 · 8 until 2002 · 9 severance · 10 manual calculation needed · 11, 12, 13
from 2003 / 2006 / 2012 (gemel and study funds) · 14 new account.

**`KOD-CHISHUV-SACHAR-POLISA-O-HESHBON` (which deposit the policy salary
drives):** 1 severance · 2 employee · 3 employer · 4 employee + employer · 5
contributions + severance · 6 section 47 · 7 misc employee · 8 misc employer · 9
study fund.

**`KOD-SUG-MASLUL` (investment track role):** 1 for accumulation · 2 for current
deposits. **`SUG-HOTZAA` (fee basis):** 0 n/a · 1 from accumulation · 2 from
deposit.

**`MEAFYENEI-MASLUL-DMEI-NIHUL`:** 0 n/a · 1 fixed rate · 2-5 from deposit
(variable by seniority / accumulation / lower-of) · 6-9 from accumulation
(participating policies to 2004 / by accumulation / by age / by seniority) ·
10 several parameters.

**`MATZAV-MISHPACHTI`:** 0 n/a · 1 single · 2 married · 3 divorced · 4 widowed ·
5 unknown · 6 common-law. **`MIN`:** 1 male · 2 female · 3 unknown. (Both live in
the customer block; see 6.7.)

**`SUG-KISUY-BITOCHI` (insurance coverage type):** 1 death · 2 occupational
disability · 3 accidental death · 4 accidental disability · 5 loss of work
capacity · 6 release from premiums · 7 critical illness · 8 combined savings
plan · 9 death + work capacity (old pension only) · 10 other.
**`SUG-KISUI-ETZEL-YATZRAN`:** 1 basic insurance · 2 rider.
**`SCHUM-BITUH-KAVOA-MISHTANE`** is a **flag** (1 fixed, 2 variable), **not an
amount**; the insured amount is `SCHUM-BITUACH`.

> **Code-table trap: `SUG-ZIKA` has two meanings.** Under `Mutav` (beneficiary)
> it is the relationship: 1 parents · 2 spouse · 3 child · 4 sibling · 5 gift
> giver · 6 guardian · 7 employer · 8 other · 9-11 lenders. Under
> `NetuneiSheerim/Sheer` (survivors) it is the survivor type: 1 spouse · 2
> dependent parent · 3 orphans. Resolve code tables by **full path**, never by
> element name alone. **`SUG-ZIHUY-MUTAV`:** 1 private · 2 corporate · 3 legal
> heirs · 4 will · 5 survivor · 6 other · 7 not determined by the customer.
> **`MAHUT-MUTAV`:** 1 beneficiary in life · 2 beneficiary on death.

---

## 5. Field-level semantics that matter

| Field | Meaning | Unit and period |
|---|---|---|
| `TOTAL-CHISACHON-MTZBR` | total accumulated balance of the row | NIS, at `TAARICH-ERECH-TZVIROT` **[V]** |
| `TOTAL-ERKEI-PIDION` | redemption value | NIS |
| `SHEUR-DMEI-NIHUL-TZVIRA` | fee charged **this reporting month**, from accumulation | **monthly** percent **[V]** (XSD: "monthly rate of fees charged in the reporting month") |
| `SHEUR-DMEI-NIHUL-HAFKADA` | fee from deposits | percent, current rate **[V]** |
| `MEMOTZA-SHEUR-DMEI-NIHUL-HAFKADA` | average deposit fee over the last 12 months | percent **[V]** |
| `SHEUR-DMEI-NIHUL` (in `MivneDmeiNihul`) | contractual fee for `SUG-HOTZAA` | **annual** percent **[V]** |
| `ACHOZ-HATAVA`, `SUG-HATAVA` | fee discount structure | no XSD documentation for `ACHOZ-HATAVA` **[?]**; the contractual fee already matches the actual charge, so the discount is **already applied [I]**; do not apply it again |
| `SACH-DMEI-BITUAH-SHENIGBOO` | insurance cost charged, incl. temporary risk | NIS **per month [V]**: in the sample, the last deposit total equals the sum of the per-type deposits minus this value, i.e. the same month. The risk cost is therefore taken out of the deposits before they reach savings |
| `TOTAL-HAFKADA-ACHRONA` | last deposit total | NIS; **net** of the insurance cost above **[V]**, so it is *not* the sum of the per-type deposit rows |
| `SHEUR-TSUA-NETO` | net return | **from the start of the calendar year, not the last month** (XSD) **[V]**; not annual |
| `SACHAR-POLISA` | total salary for the product | NIS per month **[I]** (matches deposit ÷ rate) |
| `ACHUZ-HAFRASHA` | contribution rate | percent of salary; either a percent or an amount `SCHUM-HAFRASHA` must be present |
| `GIL-PRISHA` | projection age | years; 0 means balance at end of term |
| `TOTAL-CHISACHON-MITZTABER-TZAFUY` | projected accumulation **with** future premiums | NIS, at `GIL-PRISHA` |
| `TZVIRAT-CHISACHON-CHAZUYA-LELO-PREMIYOT` | projected accumulation **without** future premiums | NIS |
| `SCHUM-KITZVAT-ZIKNA` | projected monthly old-age pension **with** premiums | NIS per month |
| `KITZVAT-HODSHIT-TZFUYA` | projected monthly pension **without** premiums ("if payments stop") | NIS per month |
| `SHEUR-PNS-ZIKNA-TZFUYA` | (old pension funds) computed at **2 % a year** | percent |
| `SEIF-14` | section-14 arrangement | 1 yes, 2 no, 3 unknown |
| `SACH-PENSIAT-NECHUT` | disability pension, **full disability** | NIS per month |
| `ALUT-KISUI-NECHUT` | cost of disability cover, **at the last deposit** | NIS |
| `SCHUM-BITUAH-LEMAVET` | death cover (paid-up policies: paid-up sum; preferred policies: the frozen accumulation) | NIS |

**Reconciliation results (all [V]):** in every file the monthly actual
accumulation fee × 12 matches the contractual annual fee to within about 2 %
(invented illustration: a monthly 0.0417 against an annual 0.50; the actual is
a ratio over a changing balance, so exact equality is not expected). Declared
employee, employer and severance rates equal (deposit ÷ salary) from the
monthly rows; study-fund balances split in the declared employee : employer
ratio; one insurance policy carries a 1 % loss-of-work-capacity component
(type 5).

**Projection factor.** Projected accumulation ÷ projected monthly pension is a
stable annuity factor: roughly **190 at age 67** and **235 at age 60** in the
sample **[V]**. This is useful twice: as the `conversionFactor` for an account,
and as an independent benchmark to compare against the app's own projection.
Note the regulator prescribes the assumptions behind the projection (return,
wage growth, and 2 % for old funds); the app's assumptions differ by design, so
the UI should show the projection as "official statement figure" beside the
app's figure and never overwrite one with the other.

---

## 6. Mapping to the app

Target: `PensionAccount` in `app/src/types/index.ts`. Paths below are relative
to `Mutzar/NetuneiMutzar` unless stated.

### 6.1 Account level

| App field | Source | Rule |
|---|---|---|
| `providerName` | `/Mimshak/YeshutYatzran/SHEM-YATZRAN` | text as-is |
| `policyNumber` | `HeshbonOPolisa/MISPAR-POLISA-O-HESHBON` | reference only. **Privacy trap [V]:** for a new pension fund the "policy number" **is the holder's ID number** (found in the sample, and in the Excel column too). Original rule: if the value is 9 digits and passes the Israeli ID check digit, do not store or export it. **Decision changed (the user's request):** the number is stored anyway, on this device only, so the account can be matched against the user's annual statements; it is flagged (`policyNumberIsHolderId`), is not a distinctive matching key, and is redacted from the calculation verification pack. In the 8 sample files the flag caught exactly the one pension fund and none of the other 8 policy numbers |
| `fundId` | no equivalent field **[?]** | closest is the investment-track code `KOD-MASLUL-HASHKAA` (a 30-digit code: 9-digit provider legal ID + zeros + product/track number; see the gov.il code table). Not secret. Treat as optional |
| `productCategory` | `SUG-MUTZAR` (+ `SUG-KEREN-PENSIA`) | 2 + comprehensive -> `comprehensivePension`; 2 + general -> `generalPension`; 2 + basic **[I]** -> `generalPension`, flag for review; 1, 5 -> `managersInsurance`; 3 -> `providentFund`; 9 -> `investmentProvidentFund`; 4 -> `studyFund`; **6, 7, 8, 10: no retirement balance; skip** (offer "import as note" later) |
| `legacyPolicyModel` | `SUG-POLISA` (insurance) | 2 -> `adif`; otherwise `none`; old-pension specifics are not in the file, so leave null and let the user choose |
| `accountStatus` | `STATUS-POLISA-O-CHESHBON` | 1 -> `activeContributing`; 2, 6, 7 -> `paidUpFrozen`; 3, 4, 10 -> skip the record with a warning; `payingAnnuity` is **never inferred** (no sample; **[?]**) |
| `joinDate` | `TAARICH-HITZTARFUT-MUTZAR` | `yyyyMMdd` to ISO. A separate `TAARICH-HITZTARFUT-RISHON` (first joining the fund, can be earlier) also exists; the Excel shows both, labelled "first join date" and "program opening date". Use the product join date, keep the first-join date as informational |
| `totalAccumulatedBalance` | sum of `PerutYitrot/TOTAL-CHISACHON-MTZBR` per policy | group by policy first, then sum all rows (deposit type x balance type) |

### 6.2 Contributions

| App field | Source | Rule |
|---|---|---|
| `contributions.employeeRatePercent` | `PerutHafrashotLePolisa`, `SUG-HAFRASHA` 2 (and 8 in study funds) | sum `ACHUZ-HAFRASHA` |
| `contributions.employerRatePercent` | `SUG-HAFRASHA` 3 (and 9 in study funds) | sum |
| `contributions.severanceRatePercent` | `SUG-HAFRASHA` 1 | sum |
| `contributions.monthlySalaryBase` | `PirteiHaasaka/SACHAR-POLISA` of the same policy | official; set only for an active policy with a positive salary and at least one positive rate. The engine applies the account's rates to this salary, not to the personal one (see 6.2.1) |
| (not modelled) | types 4, 5, 6, 7, 10, 11, 12 | 4 is a section-47 balance: informational; 5 is a premium for loss-of-work-capacity cover: informational; others: warn "extra deposit type not modelled" |
| `PersonalData.monthlyGrossSalary` | `PirteiHaasaka/SACHAR-POLISA` | **suggestion only**, take the largest value among active accounts, show source, user confirms. A zero or missing salary (closed or frozen account) is ignored |

When only an amount `SCHUM-HAFRASHA` is given (no percent), derive percent =
amount ÷ `SACHAR-POLISA` if the salary is positive, else warn.

#### 6.2.1 One salary per account (found by auditing a real import)

`SACHAR-POLISA` is the salary **of that product**, and it differs between
products of the same person: in the audited report a pension and a managers
insurance (two employment lines) each carried their own salary, while the study
fund carried their sum. The engine used to apply the single personal salary
(the largest of them, which is the sum) to every active account, so deposits
were overstated by about two thirds in that report.

Fix: `AccountContributions.monthlySalaryBase` (empty: fall back to the personal
salary). `monthlyContributionForAccount` uses it when positive, so a spouse's
accounts are covered the same way. The importer fills it from `SACHAR-POLISA`,
the account form has a field for it, and the data-gap hints no longer ask for the
personal salary when every contributing account has its own base. The personal
`monthlyGrossSalary` suggestion (largest value) is unchanged, and is now only the
fallback. Accounts imported before this change get the base when the report is
imported again (it shows as "fills empty", ticked by default).

Known remaining gap: a policy with a fixed deposit amount, no percent and no
salary (seen once, on an employee-only provident-fund deposit of type 11) still
gets no rate, as before.

### 6.3 Balances

| App field | Source | Rule |
|---|---|---|
| `balanceBreakdown.severanceBalance` | rows of deposit type 1 | sum |
| `balanceBreakdown.pre2008CapitalBalance` | `PerutYitraLeTkufa` rows with `KOD-TECHULAT-SHICHVA` 1-6, 8, 11 | **[I]** proposal; the tax-layer codes are documented but the app's pre/post-2008 split is a product-specific interpretation; show as a suggestion on the review screen |
| `balanceBreakdown.post2008AnnuityBalance` | tax layers 7, 12, 13 and balance kind 2/3 | **[I]** as above |
| `balanceBreakdown.tikun190CapitalBalance` | `TIKUN-190` = 1 with the capital balance | **[I]**; confirm the exact semantics before relying on it |
| code 10 ("manual calculation needed"), 14 | - | leave the breakdown null and warn |

### 6.4 Annuity

| App field | Source | Rule |
|---|---|---|
| `annuityParameters.estimatedMonthlyAnnuity` | `YitraLefiGilPrisha/Kupot/Kupa/SCHUM-KITZVAT-ZIKNA`, else `KITZVAT-HODSHIT-TZFUYA` | **old pension funds only** (`PENSIA-VATIKA-O-HADASHA` = 1), see 6.4.1 |
| `annuityParameters.conversionFactor` | `MEKADEM-MOVTACH-LEPRISHA` when positive, else derived: projected accumulation ÷ projected monthly pension | managers insurance and new pension funds only |
| `annuityParameters.hasGuaranteedFactor` | `true` only when `MEKADEM-MOVTACH-LEPRISHA` is positive | otherwise left as it is |

#### 6.4.1 How the annuity import works

The mapper does not know the user's retirement age, so it keeps every
projection (`ReportProjection`: age, accumulation, monthly pension, guaranteed
factor, implied factor) and an `annuityBasis` per candidate. The review stage
calls `withAnnuityFields(candidates, retirementAge)` to turn the projection
nearest the user's retirement age into importable fields.

| Product | Basis | Imported |
|---|---|---|
| Old pension fund (frozen, balance-independent rules) | `pension` | `estimatedMonthlyAnnuity`: the projected pension of the nearest age. A balance-based factor makes no sense here: the implied ratio is far below any real factor. |
| Managers insurance with a positive `MEKADEM-MOVTACH-LEPRISHA` | `factor` | the guaranteed factor and `hasGuaranteedFactor = true`, confidence official |
| New pension fund, newer managers insurance (no guaranteed factor) | `factor` | the implied factor, confidence derived, `hasGuaranteedFactor` left alone |
| Provident and study funds, anything else | none | nothing: the report states no pension for them |

- The implied factor is the same with or without premiums at a given age (the
  report's own pairs agree), and for old managers-insurance policies it equals
  the guaranteed factor. It is **not constant across ages** for newer policies
  (it falls as the retirement age rises), which is why the nearest age matters.
- A figure from an age other than the retirement age, and a factor outside the
  form's 100 to 300 range, are `uncertain`, so they start unticked.
- **Engine rule:** a pension fund uses its `conversionFactor` whether or not it
  is marked guaranteed; managers insurance uses it only when
  `hasGuaranteedFactor` is true. An implied factor on managers insurance is
  therefore stored but not used until the user ticks the guarantee, and the
  review card says so.
- An unticked `hasGuaranteedFactor` counts as empty when matching an existing
  account, so an imported guarantee is offered as "fills an empty field".

### 6.5 Coverages

| App field | Source |
|---|---|
| `insuranceCoverages.deathCoverageAmount` | `SchumeiBituahYesodi/SCHUM-BITUAH-LEMAVET` (insurance) |
| `insuranceCoverages.monthlyDisabilityAmount` | `KisuiBKerenPensia/SACH-PENSIAT-NECHUT` (pension) or `SCHUM-BITUACH-LEMASLUL` |
| `insuranceCoverages.monthlyRiskDeduction` | `SACH-DMEI-BITUAH-SHENIGBOO` (monthly **[V]**, section 5) |

An insurance block (`PirteiKisuiBeMutzar`) feeds a different target depending on
its `SUG-KISUY-BITOCHI` (section 4): 1 and 3 feed the death amount; 2, 4 and 5
feed the disability amount (5 also carries a percent of salary); 6 (release from
premiums) and 7, 8, 10 have no home in the model. **Skip blocks whose amounts are
all zero** (three such code-10 blocks occur in the sample). The coverage
information appears twice, as typed XML blocks and as the Excel's third sheet;
the XML is the one to parse (12.6). The `Mutav` (beneficiary) and
`NetuneiSheerim` (survivor) blocks hold names, IDs and birth dates and are never
read.

Survivor percentages (`SHEUR-KISUY-ALMAN-O-ALMANA`, `SHIUR-KISUY-YATOM`) have
no home in the model; the owner said survivor analysis is out of scope, so
ignore them for now.

### 6.6 Fees and track

| App field | Source | Rule |
|---|---|---|
| `investmentAndFees.feeFromAccumulationPercent` | `MivneDmeiNihul/PerutMivneDmeiNihul` with `SUG-HOTZAA` 1 | `SHEUR-DMEI-NIHUL` (annual). Cross-check against actual monthly × 12 and warn if they differ by more than the reporting precision |
| `investmentAndFees.feeFromDepositPercent` | `PerutMivneDmeiNihul` with `SUG-HOTZAA` 2, else `SHEUR-DMEI-NIHUL-HAFKADA` | percent |
| `investmentAndFees.investmentTrackName` | `PerutMasluleiHashkaa/SHEM-MASLUL-HASHKAA` | choose the track with `KOD-SUG-MASLUL` = 1 and the largest `SCHUM-TZVIRA-BAMASLUL`; if the deposit track (2) differs, mention it in a warning |
| `investmentAndFees.profitSharingFeePercent` | not in the file | leave null |
| `investmentAndFees.hasStateYieldGuarantee` | not in the file | leave default |
| net return | `Tsua/SHEUR-TSUA-NETO` | **year-to-date**, not annual; keep as an informational field, never feed it into the return assumption |

### 6.7 Personal data

The customer block carries gender (`MIN`), marital status
(`MATZAV-MISHPACHTI`), number of children (`MISPAR-YELADIM`) and date of birth
(`TAARICH-LEYDA`) **[V]**. These could pre-fill `PersonalData.gender`,
`maritalStatus` and `age`. **Do this only as an explicit, per-field opt-in**,
never silently; and never read the holder's ID, name, address or phone. Age is
computed from the date of birth at import time; the date of birth itself is not
stored. A marital-status code of 2 (married) or 6 (common-law) may also be used
to *suggest* turning on the partner plan, but never to create partner data.

**Decision changed (the user's request): the customer block is read, minimally,
to recognise the person.** The importer now reads `SHEM-PRATI`,
`SHEM-MISHPACHA`, `TAARICH-LEYDA` and `MISPAR-ZIHUY-LAKOACH` from the customer
block, and uses them for three things only:

- **One person per import.** Products whose blocks describe different people
  are detected (`samePerson`: the ID number decides when both carry one,
  ignoring leading zeros and formatting; otherwise the names and birth date
  decide, and a part missing on either side does not count against a match).
  The review screen says so and asks the user to confirm before importing.
- **Recognising the person again.** Per person, up to two one-way fingerprints
  are made: of the significant ID (`id:<digits without leading zeros>`) and of
  the first name, family name and birth date (`nd:<first>|<family>|<birth>`).
  Each is PBKDF2 (SHA-256, 100,000 iterations, 160 bits, hex) with a fixed
  salt. A later report that shares a fingerprint with a saved one is the same
  person, so the owner is suggested, and the age, gender and
  "this looks like the other person" concerns are not repeated.
- **Showing where data came from.** The profile keeps one `ImportedReport`
  record per import: the owner, the fingerprints, the **first name**, the
  **age at import**, the report date and the import date. Each imported account
  carries the record's `reportId`; an account added by hand has `reportId =
  null`. My Data shows "Added manually", "Report of Dana, age 46 · 2026-05-01"
  or "Sample report (made-up data)" in a Source column and on each account card.

**What is not stored:** the ID number, the family name, the birth date, the
address and the phone number. The record is removed with the last account that
came from it, and a re-import that replaces all the accounts of an earlier
report replaces its record.

**The fingerprint is a pseudonym, not anonymisation.** A 9-digit ID with a
check digit has roughly 10^8 possible values, so someone with the profile
export could test every ID against a fingerprint, even with 100,000 iterations.
It is less sensitive than the policy number that equals the holder's ID, which
the app already stores (6.1), and the first name is stored in clear text. Both
are in the manual profile export, and neither is in the verification pack (the
first name, fingerprints, report ids and dates are redacted). The import page
states exactly what is kept.

**The sample report is the exception.** Its record is marked `sample` and
stores **no fingerprints**, so importing the sample can never be taken for the
user's own data and is never recognised on a later import. Where the browser
has no Web Crypto the fingerprints stay empty, and the importer falls back to
the age and gender checks.

### 6.8 Not in the app's model (gaps)

1. **Balance "as of" date.** The report states the valuation date for every
   balance (all 8 files were valued at the month-end before the run date). The
   app has no such field; the design doc already proposes a provenance record.
   Until then, show the valuation date on the review screen.
2. **Per-account annual deposits.** Available only for some products
   (`PerutHafkadotMetchilatShana`); useful for checking the user's salary
   assumption.
3. **Loans against the policy (`Halvaa`)**, **claims (`PirteyTvia`)** and
   **blocked deposits.** Worth a warning ("this policy has a loan"), not worth
   a field.

---

## 7. Edge cases the importer must handle [V unless noted]

1. **Several policies per file.** Group `PerutYitrot` by policy; never sum
   across policies unless producing a per-product total.
2. **Balance split by deposit type and balance type.** The same deposit type
   can appear twice (different balance types). Sum within a type.
3. **Frozen or closed accounts.** Salary 0, projection 0, contribution rates
   0 %. Do not create "0 % contribution" overrides that look like data; mark
   the account `paidUpFrozen`.
4. **Pure-risk policy.** No balance and no `PerutYitrot`. Skip, or import as a
   coverage-only note later.
5. **Section-47 balance** (type 4) can be large and is a separate track; it
   must not be added to the employee or employer rate.
6. **Two fee scales** in one subtree (monthly actual vs annual structure);
   always pick by element name, never by magnitude.
7. **Nil everywhere.** Any element may be nil or absent. A missing mandatory
   value yields an *empty* app field, not 0.
8. **Same provider, several files** (e.g. one file per product family). The
   provider name repeats; accounts are distinguished by policy number.
9. **Versions.** The files are v009; the public XSD is v008. Unknown elements
   are ignored; missing known elements are null (section 9).
10. **Duplicate import.** Re-importing the same report must update, not
    duplicate: match on provider + policy number (reference only fields are
    still useful here).
11. **Spouse.** The report is for one holder. The importer must let the user
    assign each imported account to `self` or `spouse` (the model supports
    both), defaulting to `self`.

---

## 8. Parser design

- **Location:** `app/src/domain/clearingHouseImport/` — pure TypeScript, no
  React, no DOM types in the logic.
- **XML reading:** `DOMParser` is available in browsers but not in the plain
  node vitest environment. Either run those tests under jsdom (the project
  already uses it for component tests) or keep the tree-walking code behind a
  tiny interface (`child(name)`, `children(name)`, `text()`, `isNil()`), with
  an adapter for `DOMParser`. Prefer the adapter: the mapping stays unit-testable.
- **Dependency:** none for XML (`DOMParser` is enough: plain, well-formed XML;
  parse with `application/xml` and check for `parsererror`). The only dependency
  is `@zip.js/zip.js`, loaded lazily for password-protected zips.
- **Encoding:** read the `File` as `ArrayBuffer`, decode with `TextDecoder("utf-8")`
  (files are UTF-8). Do not rely on `File.text()` charset guessing.
- **Limits:** reject files above a size bound (the 8 samples are small) and cap
  the number of records, to keep the UI responsive.
- **Output:** an `ImportedAccountCandidate[]` with, per field, the value, a
  `source` (file role + element name, **no values, no file name**), and a list
  of warnings. The same review screen design (research doc 6.4) consumes it,
  with `confidence = "official"`.
- **Pipeline:** `files -> parse -> normalise records -> map to candidates ->
  validate (section 7 rules, reconciliation) -> review screen -> apply`.
- **Reconciliation checks to ship** (these are deterministic and catch format
  drift): rate x salary approximates the monthly deposit within rounding;
  monthly fee x 12 approximates the annual fee; `ReshumatSgira` counts match;
  balances are non-negative; valuation date is within the last 13 months.
- **Never store:** the holder's family name, ID number, birth date, address,
  phone, e-mail, employer ID, employer name, file names. Two things from the
  customer block **are** kept, by the user's request (section 6.7): the first
  name and age at import, and a one-way fingerprint of the ID and of the name
  with the birth date. The holder ID is not stored as such, but a policy
  number that equals it (section 6.1) **is** stored, locally, by the user's
  choice; it appears in the manual profile export and never in the verification
  pack. The employer *name* is arguably useful to the user
  (to recognise accounts); keep it only in memory on the review screen, and
  do not write it to Dexie or to exports.

### Interaction with other plan items

- **Import into existing data:** show a diff per account (new / changed /
  unchanged) before applying.
- **Export:** profile export already omits secrets; confirm imported accounts
  carry no identifiers (a test).
- **i18n:** the Hebrew strings in the file (plan names, provider names) are
  user data, not UI strings; the app's en/he/ru UI strings stay in the locale
  files.

---

## 9. What is not confirmed

| Item | Why it matters | How to close it |
|---|---|---|
| **v009 vs v008** | The files are v009; I only have the v008 XSD. Differences could rename or add elements. | Obtain the current XSD from the Capital Market Authority; run a field-by-field diff on the profiled element list. Meanwhile the parser tolerates unknown and missing elements, and a fixture test covers it. |
| `ACHOZ-HATAVA` semantics | Whether the discount is already included in the contractual fee | Ask a provider or read the CMA circular; current behaviour (use the contractual fee, ignore the discount) matches the actual charges in all 8 files. |
| `KOD-TECHULAT-SHICHVA` -> app's pre/post-2008 split | Proposed mapping is an interpretation | Review with a pension adviser; then fix the mapping table and tests. |
| `payingAnnuity` accounts | No sample file | Ask the owner or another user for a sample of a paying pension. |
| Excel: sample coverage and what remains | All three sheets' headers are known; only one data row (sheet 1) and the coverage-type column (sheet 3) were seen. Open: the payee, lump-sum and monthly columns of sheet 3, the rules behind its row counts (12.6), the deposit types beyond three on sheet 2 (12.5), other product types, numeric versus text cells | See section 12; share the items listed in 12.9 before any decision to parse it. |
| PDFs in the zip | Not analysed | Not needed for the importer; they are the human-readable copy. |
| Changes in how the clearing house issues reports | Fees, delivery format and channels may change | Re-check yearly; keep the parser tolerant. |

---

## 10. Test plan

- **Synthetic fixtures** in `app/src/test/fixtures/clearingHouse/`: small,
  hand-written XML, one per product shape (new pension, old pension with
  multiple policies, study fund, gemel, savings insurance with risk
  components, pure risk with no balance), **invented values only**. Include
  `xsi:nil`, absent optional subtrees, and unknown extra elements.
- **Unit tests:** each mapping rule in section 6; edge cases in section 7;
  rate derivation from deposit rows; fee reconciliation; code-table fallbacks
  (unknown code -> null plus warning, never a throw); date and number parsing;
  control-count warning.
- **Privacy tests:** the candidate list contains no field equal to the holder's
  name, employer ID or employer name in the fixtures (the one deliberate
  exception is a policy number equal to the holder's ID, which is kept and
  flagged); the verification pack contains none of them either, nor any policy
  number, nor the first name, fingerprints or report ids of an imported report.
  The saved report record holds no family name and no ID number (a page test
  reads it back from IndexedDB).
- **Property-style test:** random shuffling of sibling elements must not change
  the result (order independence).
- **A local, uncommitted smoke script** (outside the repo) that runs the real
  files and prints only counts and warnings, so a real-file regression can be
  checked without committing the data.

---

## 11. User guide notes (for the app's import screen)

1. Request the **consolidated report** from the clearing house (identity
   verification, small fee, about one business day). A licensed adviser with a
   power of attorney can request it too.
2. Open the email and note the password it states. In the app, choose the **zip
   file** as it came (or the XML files from inside it) and type that password
   when asked; you do not need to unzip anything yourself.
3. The app reads them **on your device**. Nothing is uploaded.
4. Review each account; tick what to import. Values from the report are marked
   as official figures.
5. Excel and PDF files in the package are not needed.

---

## 12. The Excel file in the package

Analysed on 2026-10-29 from what the project owner pasted: the **header row of
all three sheets**, one data row of the first, and the coverage-type column of
the third. The workbook has **three sheets** (English names for the Hebrew tab
names):

| Tab (Hebrew) | Meaning | What was seen | Analysed in |
|---|---|---|---|
| פרטי המוצרים שלי | my product details (30 columns) | header + 1 pension-fund row | 12.1 to 12.4 |
| מעקב הפקדות | deposit tracking (9 columns) | header only | 12.5 |
| כיסויים ביטוחיים | insurance coverages (7 columns) | header + the coverage-type column | 12.6 |

Every example below is structural; no real value is reproduced.

### 12.1 What it is

A **flat, one-row-per-policy summary of the same clearing-house data**, in
Hebrew, with **30 columns** on the product-details sheet. It is one file for
all providers (the XML is one file per provider). Cell values arrive as
formatted text in the pasted sample
(`₪ 1,234.00`, `0.05%`, dates as `M/D/YYYY`); whether the real cells are numbers
with a display format or text was not visible. **[?]**

### 12.2 Column to XML mapping

Every checked column matched the XML for the same policy to the agora **[V]**.

| Excel column (Hebrew) | Meaning | XML source | Note |
|---|---|---|---|
| שם מוצר | product name (text) | `SUG-MUTZAR` + `SUG-KEREN-PENSIA` (codes) | Excel is human-readable; the XML needs the code table |
| שם חברה מנהלת | managing company | `SHEM-YATZRAN` | |
| מספר פוליסה | policy number | `MISPAR-POLISA-O-HESHBON` | **Equals the holder's ID for pension funds** (6.1) |
| סטטוס | status text | `STATUS-POLISA-O-CHESHBON` | |
| סך הכל חיסכון | total savings | sum of `PerutYitrot/TOTAL-CHISACHON-MTZBR` | equals the sum of the four rows **[V]** |
| חיסכון צפוי ... לא כולל פרמיות / כולל | projected accumulation without / with premiums | `TZVIRAT-CHISACHON-CHAZUYA-LELO-PREMIYOT` / `TOTAL-CHISACHON-MITZTABER-TZAFUY` | at the single retirement age shown **[V]** |
| קיצבה חודשית ... לא כולל / כולל | projected monthly pension without / with premiums | `KITZVAT-HODSHIT-TZFUYA` / `SCHUM-KITZVAT-ZIKNA` | |
| שיעור פנסיה זקנה צפויה | expected old-age pension rate | `SHEUR-PNS-ZIKNA-TZFUYA` | 0 or empty for new funds |
| שיעור דמי ניהול מהפקדות | deposit fee % | `SHEUR-DMEI-NIHUL-HAFKADA` | |
| שיעור דמי ניהול שנתי מחיסכון צבור | annual accumulation fee % | contractual `SHEUR-DMEI-NIHUL` | the **annual** figure, not the monthly actual |
| תשואה מתחילת השנה | year-to-date net return | `SHEUR-TSUA-NETO` | |
| הפקדות חוסך / מעסיק | last monthly deposit, employee / employer | `PirteiHafkadaAchrona` rows by type | **"Employer" = employer + severance** (they add up exactly) **[V]** |
| פנסיית נכות | disability pension, full disability | `SACH-PENSIAT-NECHUT` | |
| שארים (בן/בת זוג, הורה נתמך, ילדים) | survivors' monthly pensions, NIS | `KITZBAT-SHEERIM-LEALMAN-O-ALMANA / -LEHORE-NITMACH / -LEYATOM` | see 12.3: two columns appear swapped |
| סכום ביטוח אובדן כושר עבודה / מוות (חודשי, חד פעמי) | disability and death cover amounts | not literal XML values **[V]** | the monthly disability figure is the disability pension rounded to a whole shekel; the monthly death figure is about twice the spouse's pension. Derived or rounded: do not use them as primary data |
| תאריך הצטרפות לראשונה | first join date | `TAARICH-HITZTARFUT-RISHON` | |
| תאריך פתיחת תוכנית | program opening date | `TAARICH-HITZTARFUT-MUTZAR` | |
| תאריך נכונות נתונים | **data valid as of** | `TAARICH-ERECH-TZVIROT` / `TAARICH-ERECH-LANENTUNIM` | the "balance as of" date the app lacks (6.8) |
| מוטבים (בן/בת זוג, ילדים) | beneficiaries | `Mutav` block | seen as 0; semantics unconfirmed **[?]** |
| תחנת משיכה קרובה, סוג מוצר | nearest withdrawal point, product type | not located | empty in the sample **[?]** |

### 12.3 Anomaly: two survivor columns look swapped

For the sample, the amounts follow the XML percentages exactly: spouse 51 %,
orphan 34 %, dependent parent 17 % of the pension base. The Excel header says
"supported parent" over the amount that is **34 %** (the orphan figure in the
XML) and "children" over the **17 %** amount (the parent figure in the XML). So
the Excel's *labels* for those two columns disagree with the XML's *element
names*. I cannot tell which side is mislabelled from one row; the percentages
suggest the XML is right **[I]**. Survivor analysis is out of scope for now, but
this is a concrete reason to prefer the typed XML over header-matched
spreadsheet columns.

**A plausible mechanism [I]:** the Excel column order (spouse, supported
parent, children) is the code order of the survivor-type table in the XML
(`NetuneiSheerim/Sheer/SUG-ZIKA`: 1 spouse, 2 dependent parent, 3 orphans), while
the XML's amount elements come in the order spouse (`...LEALMAN-O-ALMANA`),
orphan (`...LEYATOM`), parent (`...LEHORE-NITMACH`). Filling the columns by
position instead of by name would produce exactly the swap observed. The
parser must therefore map by **element name**, never by position.

### 12.4 What the product-details sheet lacks (all present in the XML)

The other two sheets (12.5, 12.6) close the deposit-history and, in part, the
coverage gaps, but **not** the three that matter most: the **salary**, the
**balance by deposit type / tax layer**, and the **investment tracks**. None of
the three sheets has a column for them **[V]**.

| Missing in Excel | Why the app needs it |
|---|---|
| **Policy salary** (`SACHAR-POLISA`) | basis for projecting contributions (`monthlyGrossSalary`) |
| **Contribution percentages** (only NIS of the last deposit) | `contributions.*RatePercent`; deriving them needs the salary, and the employer column mixes in severance |
| **Balance by deposit type and by tax layer** | `severanceBalance`, pre/post-2008 split, section 47, Tikun 190: the tax module's inputs |
| **Investment tracks** (names, codes, balance per track) | `investmentTrackName`, track-level return |
| **Policy status codes, policy type, tax layers, fee structure, loans, claims** | warnings and edge cases (section 7) |
| Per-policy detail inside multi-policy files | the Excel is one row per policy but without the sub-structure |

### 12.5 Sheet 2, deposit tracking (מעקב הפקדות)

Nine columns. The mapping is by **header name** (no data row was seen) **[I]**;
the XML side is **[V]**.

| Excel column | Meaning | XML source | Note |
|---|---|---|---|
| סוג מוצר | product type | `SUG-MUTZAR` | |
| שם חברה מנהלת | managing company | `SHEM-YATZRAN` | |
| מספר פוליסה | policy number | `MISPAR-POLISA-O-HESHBON` | same ID-equals-policy-number rule as 6.1 |
| תאריך ערך | value date | `PerutHafkadotMetchilatShana/TAARICH-ERECH-HAFKADA` | |
| חודש שכר | salary month | `CHODESH-SACHAR` | |
| שם מעסיק | employer name | **no per-row field**; the employer is per account (`PirteiOved/MPR-MAASIK-BE-YATZRAN`, `YeshutMaasik/SHEM-MAASIK`) | the Excel attaches a name to every row **[I]** |
| הפקדות עובד | employee deposit | `SUG-HAFRASHA` 2 (8 in study funds) | |
| הפקדות מעסיק | employer deposit | `SUG-HAFRASHA` 3 (9 in study funds) | |
| הפקדות מעסיק לפיצויים | employer severance deposit | `SUG-HAFRASHA` 1 | the split sheet 1 could not give |

What the XML holds for the same data **[V]**, structure only:

- **Row grain.** One row per (deposit type, depositor, month): three or four
  rows per month for a pension fund or insurance policy, two for a study fund.
  The Excel pivots them into three columns **[I]**.
- **Window.** A rolling 12 to 13 salary months ending at the latest deposit,
  despite the element's name (`...MetchilatShana`, "from the start of the
  year"). Only accounts with active deposits have it: 3 of the 12 accounts in
  the 8 files. The last-deposit block equals the latest month of this history
  to the agora in all 3 cases, so it adds no information.
- **Salary at deposit** (`SACHAR-BERAMAT-HAFKADA`) is on every row. The Excel
  has no salary column, so rates cannot be derived from it; the XML gives the
  exact rate (deposit divided by salary matched the declared percentage).
- **Value date versus salary month is not a fixed lag.** The sample shows the
  value date 0 or 1 month after the salary month for two providers and 1 month
  **before** it for the pension fund. Never assume a lag; read both fields.
- **Transfer rows.** A fund-transfer depositor (`SUG-MAFKID` 6) appears as an
  extra group with **no salary month**. These are not regular contributions and
  must be excluded when deriving rates.
- **A fourth deposit type** exists: one insurance policy carries
  loss-of-work-capacity deposits (`SUG-HAFRASHA` 5) and the transfer rows carry
  section 47 (4). The Excel's three columns cannot show them, so they are
  either dropped or folded into "employer" **[?]**. Test: for that provider, do
  the three Excel columns sum to the provider's total deposit for the month?

Verdict for this sheet: it is the XML history **minus the salary and the
deposit types beyond three**, **plus an employer name per row**. It is useful
as a **cross-check** and as the way to separate employer from severance for the
last deposit (which sheet 1 merges), not as a primary source.

### 12.6 Sheet 3, insurance coverages (כיסויים ביטוחיים)

Seven columns, one row per coverage (and probably per payee) **[I]**.

| Excel column | Meaning | XML source |
|---|---|---|
| סוג הכיסוי הביטוחי | coverage type | `PirteiKisuiBeMutzar/SUG-KISUY-BITOCHI` (1 death, 2 occupational disability, 3 accidental death, 4 accidental disability, 5 loss of work capacity, 6 release from premiums, 7 critical illness, 8 combined savings plan, 9 death + work capacity (old pension only), 10 other), or the pension-fund block `KisuiBKerenPensia` |
| שם התוכנית | plan name | `SHEM-KISUI-YATZRAN` (free Hebrew text) |
| שם חברה מנהלת/מבטחת | managing or insuring company | `SHEM-YATZRAN` |
| מקבל התשלום | payee | beneficiary block `Mutav`, or the implied payee (the member, spouse, orphans, dependent parent) **[?]** |
| סכום חד פעמי | lump sum | `SCHUM-BITUACH` / `SchumeiBituahYesodi/SCHUM-BITUAH-LEMAVET` |
| קצבה חודשית | monthly pension | `SACH-PENSIAT-NECHUT`, `KITZBAT-SHEERIM-*` |
| מס' פוליסה/חשבון | policy or account number | `MISPAR-POLISA-O-HESHBON` (same ID rule) |

**Reconciliation against the XML.** The owner shared the coverage-type column:
10 filled rows (death x4, combined savings plan x3, pension disability x1, loss
of work capacity x1, release x1) followed by 7 empty cells. The text values are
the official `SUG-KISUY-BITOCHI` names plus the pension-fund disability row, so
the sheet is built from the same coverage data **[V]**. The counts only
partly match the 8 files:

| Type | Excel rows | XML blocks that could produce them | Match |
|---|---|---|---|
| Pension disability | 1 | 1 (the only pension block with a non-zero disability pension) | yes |
| Loss of work capacity | 1 | 1 (type 5) | yes |
| Death | 4 | 1 insurance block of type 1, plus 3 basic-sum blocks with a non-zero death sum | yes, if basic sums are listed as death rows **[I]** |
| Combined savings plan | 3 | 2 (type 8) | **no** |
| Release | 1 | none (no type 6 block) | **no** |
| Other | 0 | 3 (type 10, all amounts zero) | not shown |

So the coverage sheet applies filtering and relabelling rules that cannot be
recovered from its headers. The three zero-amount blocks are absent, and the
combined-savings and release rows do not trace back to one XML block each. The 7
empty rows may be payee-only rows (for example the pension fund's survivor
pensions) or padding **[?]**.

**Beneficiaries (`Mutav`).** In these files most coverages name no specific
beneficiary (identity type "other" or "not determined by the customer"); three
study-fund or insurance coverages name one, with a percentage. The block holds a
name, ID and birth date, so it is **never imported**.

**Code-table trap.** The element `SUG-ZIKA` appears twice with **different code
tables**: under `Mutav` it is the beneficiary's relationship (1 parents, 2
spouse, 3 child, 4 sibling, 5 gift giver, 6 guardian, 7 employer, 8 other, 9 to
11 lenders), under `NetuneiSheerim/Sheer` it is the survivor type (1 spouse, 2
dependent parent, 3 orphans) **[V]**. A parser that resolves codes by element
name alone would mislabel one of them. Resolve codes by **full path**.

Verdict for this sheet: a readable but **lossy, partly unreconcilable**
presentation of the coverages. The XML (typed amounts, codes, per-block
structure) is the reliable source.

### 12.7 What the Excel offers that the XML does not

- **One file** for all providers: the user selects one thing instead of eight.
- **One row per account**: no grouping or summing logic.
- **Human-readable product and status** text and an **annual fee already
  stated**.
- A single, clearly labelled **"data valid as of"** date.
- An **employer name on every deposit row** (12.5) and employer versus
  severance split by month.

### 12.8 Parsing cost and risks

- An `.xlsx` is a zip of XML. Reading it in the browser needs a library
  (an unzip such as `fflate`, plus a small sheet reader; or a spreadsheet
  library, which is far larger). Prefer a minimal reader over a full
  spreadsheet engine, and audit any library's maintenance and licence.
- **Hebrew headers** are the schema: a renamed or reordered column breaks the
  mapping silently. Match by header text with a tolerant normaliser, and fail
  loudly on a missing mandatory column.
- **Dates** appear as `M/D/YYYY` in the paste (the sample includes a 30th, which
  proves month-first). In a real `.xlsx`, dates are serial numbers: read the
  serial, never parse the display string, or the 1st of October and the 10th of
  January get confused.
- **Percent and currency** may be text; strip the symbol, separators and `%`
  deliberately, and treat empty as null.
- **Privacy:** the policy-number column carries the holder's ID for pension
  funds on sheets 1 to 3, so the same redaction rule applies (6.1). Sheet 3's
  beneficiary information and sheet 2's employer names are personal data too:
  keep them in memory on the review screen only.
- **Three sheets, three header sets.** Sheet 1 has 30 columns, sheet 2 has 9,
  sheet 3 has 7. A reader must pick sheets by their Hebrew tab name, tolerate a
  different tab order, and tolerate a missing sheet.

### 12.9 Verdict and recommendation

1. **Build the XML importer first and treat it as the system of record.**
   Reasons: complete (salary, rates, balance splits, tracks, typed codes), an
   official schema, tolerance by design and arithmetic cross-checks. None of
   the three sheets carries the salary, the balance by tax layer or the
   investment tracks, and the coverage sheet cannot be reconciled with the XML.
2. **Do not build an Excel importer in v1.** All three sheets are lossy views of
   the XML, with presentation rules I cannot reconstruct (12.3, 12.6).
3. **Optional later, small:** use the Excel as a **cross-check** (total savings
   per policy, last deposit by type, valid-as-of date) and, if wanted, a "quick
   import" of totals. Decide after the XML importer exists; both would feed the
   same review screen.
4. **Packaging:** because the XML is one file per provider, the UI should accept
   **multiple files at once**, and a zip with a password prompt (built), so the
   user does not have to unpack and pick eight files by hand.
5. To close the open items (12.1, 12.2, 12.3, 12.5, 12.6) the owner can share,
   with ID, names and policy numbers blanked: one **data row per product type**
   on sheet 1, a few rows of sheet 2 for the provider with the extra deposit
   type, and the **payee, lump-sum and monthly columns** of sheet 3 (amounts
   may be rounded or masked).

---

## 13. Sources

- **Official XSD, v008 (public mirror, MIT):**
  `https://raw.githubusercontent.com/nzig/pension-checker/master/MivneAchid_Holdings_KarnotPensiaHadashot_XSD_Schema_008.xsd`
  (repository `nzig/pension-checker`). Our files declare v009. The XSD is cited
  by URL only and is not copied into this repository.
- **CMA unified-structure circular (22 Apr 2018)** and the interface pages
  (Hebrew: "מבנה אחיד להעברת מידע ונתונים בשוק החיסכון הפנסיוני"), mirrored at
  `https://www.funder.co.il/article/100347` (returns 403 to scripts; open in a
  browser).
- **gov.il code table for investment and insurance tracks:**
  `https://www.gov.il/he/pages/pension-fund-cod`.
- **The 8 real files supplied by the project owner** (not in the repository;
  profiled with scripts kept outside the repository).
