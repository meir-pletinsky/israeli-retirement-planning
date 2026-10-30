# Session Handoff — Israeli Retirement Planning

Portable summary of project state, written so work can resume on a
**different machine and/or GitHub account**. Pair this file with the git
history (everything described here is already committed and pushed to
`main` unless explicitly marked otherwise).

## Repo

- URL: https://github.com/meir-pletinsky/israeli-retirement-planning
- Visibility: **public** (changed from private — see "Deviations" in
  `docs/implementation-progress.md` for why: GitHub Pages on a private repo
  needs a paid plan, this account is Free).
- Default branch: `main`.
- Live app (GitHub Pages, auto-deployed from `main`):
  https://meir-pletinsky.github.io/israeli-retirement-planning/

## To resume on a new machine/account

```powershell
git clone https://github.com/meir-pletinsky/israeli-retirement-planning.git
cd israeli-retirement-planning/app
npm ci
npm run dev        # http://localhost:5173/
```

Other commands (all run from `app/`):

| Command | Purpose |
|---|---|
| `npm run build` | `tsc -b && vite build` → `app/dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | `oxlint` |
| `npm run typecheck` | `tsc -b` (no emit check) |
| `npm test` | `vitest run` (all unit tests) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Vitest with coverage |

Requires **Node 22** (matches the CI workflow's `setup-node` version).

If working from a different GitHub account than `meir-pletinsky`, you'll
need either collaborator access to this repo or to fork it — CI/deploy
workflows run the same way either way, but Pages deploy only publishes from
the canonical repo/branch combo configured in GitHub's Pages settings.

## What's done vs. in progress

Full authoritative checklist: [`docs/implementation-progress.md`](implementation-progress.md).
Snapshot as of this handoff: **Phases A–E are done** (Phase 1 MVP and its
two logged gaps), **Phase F (Bituach Leumi module) is done**, **Phase G
(per-source access rules, annuities and timeline) is done**, **Phase H
(couples/household) is done**, **Phase I (Phase 3 tax module) is
done**, **Phase J (retirement scenario comparison) is done**, **Phase K
(input guidance, single-person checks, UI polish) is done**, **Phase L
(tax refinements) is done**, **Phase M (Section 102 employer stock tax)
is done**, and **Phase N (Section 102 follow-ups: contributions, vesting
batches, constants check) is done**, and **Phase O (Pension Clearing House
import) is done**, and **Phase P (calculation trace and offline verification
pack) is done**, and **Phase Q (read-only summary tables on My Data) is done**,
and **Phase S (simple purchase / grant entry, per-category equity tables) is done**,
and **Phase T (stock price files, ticker suggestions and price autofill) is done**.
Phases A–K are committed and pushed to
`main`; Phases L, M, N, O, P, Q, S and T are committed and pushed only if `git log` shows
them.

- **Welcome page only for new visitors.** `useProfile().onboarded` is true when the
  saved flag is set **or** the profile differs from `EMPTY_PROFILE` (`hasProfileData`), so
  returning visitors with saved data land on the Dashboard. See "Welcome page for returning
  visitors" in `docs/implementation-progress.md`.

- **App logo and colour scheme: DONE.** A pomegranate mark (`components/LogoMark.tsx`,
  `public/favicon.svg`) and a Mediterranean palette. Tailwind 4 `@theme` in `src/index.css`
  defines `brand-50…950` and `surface`; the old `teal-*` classes are gone, so use
  `brand-*` for anything new. The provident-fund chart colour changed to turquoise so it
  differs from the blue pension-fund colour. No `apple-touch-icon` or manifest yet (they need
  PNGs). See "App logo and Mediterranean colour scheme" in `docs/implementation-progress.md`.

- **Phase T (stock price data and autofill): DONE.** A daily job
  (`app/scripts/stock-data/`, `npm run stock-data`, scheduled in
  `.github/workflows/deploy.yml`) turns the Kaggle S&P 500 dataset into one JSON file
  per stock under `public/stock-data/` (gitignored, deployed with the app, last good
  set kept in the Actions cache). The app (`src/stockPrices/`,
  `MyData/useStockPriceAutofill.ts`) suggests tickers and fills the price on the
  purchase or grant date, today's price and the company name; typed values always
  win and nothing happens when the files cannot be loaded. **Prices are
  dividend-adjusted, so older prices of dividend payers are too low** (the dialog
  says so). No calculation changed. The workflow ran successfully on its first push
  (503 stocks published to the live site). Verify the dataset's license. Details and open items:
  `docs/stock-price-data-design.md` and Phase T in `docs/implementation-progress.md`.

- **Phase S (simple entry and per-category equity tables): DONE.** The "Stock /
  equity holding" dialog leads with category, ticker, quantity, purchase or grant
  date, the share price on that date (always shown, even before a category is
  chosen) and the current price; the old detail fields
  sit under a collapsed "More details" (open when they already hold a value).
  `MyData/holdingEntry.ts` maps the date and price onto the existing fields (ESOP:
  `grantDate` / `costBasisAtGrantUSD`; ESPP: `purchaseDate` /
  `fairMarketValueAtPurchaseUSD`; private: `purchaseDate` / `averageCostBasisUSD`),
  so no calculation changed. `EquitySummaryTable.tsx` now renders one table per
  category (ESOP / RSU, ESPP, private, no category) with totals and a total across
  categories. Details and open items: Phase S in `docs/implementation-progress.md`.

- **Phase Q (read-only summary tables on My Data): DONE.** The Pension & Savings
  and Equity & Investments steps show a table of every item above the "Which
  fields matter?" card (`MyDataLayout` picks it by step; the step pages, cards,
  Add, Import, Edit and Remove are unchanged). Files: `MyData/SummaryTable.tsx`
  (shared read-only table with a totals row), `PensionSummaryTable.tsx`,
  `EquitySummaryTable.tsx`, `summaryFormat.ts`; texts under `myData.summary`. The
  pension total is `aggregatePensionBalance`, so a spouse's account that is not
  yet counted is flagged and left out; equity shows USD and ILS at the fixed
  rate (Phase S split the equity table per category). To add a column, add an entry to the `columns` list of that table and
  reuse the existing `fields` label for its header.

- **Phase P (calculation trace and verification pack): DONE.** See
  `docs/calculation-trace.md` (usage, pack format, design, redaction, how to
  instrument) and `docs/implementation-progress.md`. Settings has a "Calculation
  verification" section that exports every calculation step for a scenario or a
  retirement age as one JSON file, with ids aliased and free text removed, plus a
  separate local-only redaction key. The engine records steps only inside
  `runTraced` (a module-level context, a no-op otherwise) and reads "now" only
  through `engineNowMs` / `engineCurrentYear` (`domain/trace.ts`); **never call
  `Date.now()` or `new Date()` for "today" inside the engine**. New calculations
  should record steps (`recordStep`, with an `expr` where the output is
  arithmetic) and a test in `tracePipeline.test.ts`. Real files and values never
  go into the repo or tests.

- **Phase O (Pension Clearing House import): DONE.** See
  `docs/implementation-progress.md` and `docs/clearing-house-import-analysis.md`
  ("Implementation notes"). `@zip.js/zip.js` was added with a **hand-edited
  `package.json` / `package-lock.json`** (the npm proxy 404ed); run
  `npm install` on a machine that reaches the registry to regenerate the
  lockfile. A real-file smoke test is gitignored (`*.local.test.ts`, env
  `CH_REAL_DIR` / `CH_OUT`).

- **Phase N (Section 102 follow-ups): ALL DONE.** The user asked for "only
  what applies to RSUs", so ESPP and option strike prices stayed out.
  - **Bituach Leumi and health on the ordinary part**
    (`domain/tax.ts`, `employerShareContributions`; constants in
    `taxRates.ts`). Section 102 ordinary income now pays health tax at any age
    and Bituach Leumi before the statutory retirement age: reduced rates
    (1.04% + 3.23%) up to ₪7,703 a month, full rates (7% + 5.17%) above it, and
    nothing above ₪51,910. The slice is stacked on the early pension.
    `PersonTax.nationalInsuranceMonthly` is new; `healthTaxApplies` was
    renamed `beforeStatutoryAge`. The retirement-age row of the BTL table lost
    its label in extraction, so "health only from the statutory age" is
    **interpreted** (rule Q). Contributions are not deducted from taxable
    income.
  - **Vesting batches** (`types`: `VestingTranche`,
    `EmployerGrantDetails.vestingTranches`; `domain/sources.ts`: `stockRoute`,
    `employerLots`). Each batch has a vest date, a quantity and an optional
    price at grant. A batch's vest date starts its own 24 months
    (**interpreted** from the supplement's "acquisition", rule P); the shares
    not covered by batches follow the holding's grant date and trustee box.
    Batches only split the tax route (net worth and drawdown are unchanged);
    they are scaled down if they exceed the quantity. A batch with no date
    counts as met; one that vests after retirement is ordinary income.
    `EquitySplit.nonTrustee` now carries Section 3(i) value and grant value, and
    `grantValueIls` is gone. UI: `pages/MyData/VestingTranchesEditor.tsx`
    replaces the unused vested/unvested quantity fields (the type fields are kept
    for stored data); strings in en/he/ru under
    `myData.steps.equity.tranches`.
  - **Constants check** (`docs/constants-to-verify.md`): rows 14-16 are
    **confirmed** from the Tax Authority's guideline letter of 2 Feb 2026
    (read at a payroll company's mirror). Brackets, surtax, the 2% capital
    surtax and 25%/30% are matched by PwC's Israel tax summary (last reviewed
    29 Jun 2026); the credit point and 2.25/2.75 points agree across secondary
    sources. Gov.il, taxes.gov.il and kolzchut still refuse automated requests,
    so the Tax Authority's own tables were not read. Row 17 (severance offset)
    is still Low and unchecked. No code value had to change.
  - Tests: 396 total (9 new in `sources.test.ts`, 1 in `normalizeProfile.test.ts`,
    2 in the new `EquityStep.test.tsx`, plus the contribution tests in
    `tax.test.ts` and `netIncome.test.ts`).
  - Still not modeled: the 30% rate for a 10%+ holder, options with a strike
    price, ESPP, unvested shares, deducting employee contributions from taxable
    income, inflation/currency adjustment of the grant value.

- **Phase M (Section 102 employer stock tax): ALL DONE.** The user pasted
  their employer's Section 102 plan supplement (capital-gains route) and
  asked that it be used where relevant. It was **not covered**: the engine
  ignored `employerGrantDetails` and taxed every holding at a flat 25% on the
  declared gain only (so employer shares defaulted to no tax).
  - **Routing** (`domain/sources.ts`, `employerStockRoute`): employer-granted
    stock leaves the `other-investments` bucket by tax track. Capital route
    (a missing track counts as this): new `employer-stock-section-102`
    source, `capitalGains`, cost basis 0, `ordinaryLayer` = Σ min(grant-date
    value, current value). Ordinary-income track, or a capital-route grant
    under 24 months old at retirement (a disqualifying disposal): new
    `employer-stock-ordinary-income` source (`ordinaryIncome` treatment).
    Section 3(i): stays in `other-investments` with the grant value as basis.
    All keep `kind: "otherInvestments"`, so charts and cards are unchanged.
  - **Holding period:** met when the trustee box is ticked, the grant date is
    missing, or retirement (the sale date) is ≥ 24 months after the grant
    (`TAX_RATES.section102HoldingPeriodYears`).
  - **Grant value** = quantity × per-share price at grant × the fallback
    USD/ILS rate. `costBasisAtGrantUSD` is now the **per-share** price
    (relabelled "Share price at grant"). Missing = 0, so the whole value is
    a capital gain. Acquisition cost is taken as 0.
  - **Drawdown:** `DrawdownHolding.ordinaryFraction`; the ordinary layer is
    fixed while the balance grows and shrinks pro rata with withdrawals.
  - **Tax:** `PersonTaxInput.ordinaryInvestmentMonthly` is stacked on the
    taxable pension for the brackets (credit points once), with no pension
    exemption (Phase N later added health tax and Bituach Leumi). It counts
    toward the 3% surtax; the extra 2% stays on the capital part.
  - UI: the grant section explains the use, marks grant date, tax track and
    share price "Recommended"; `TaxCard` takes `hasEmployerStock` and adds
    the Section 102 lines (en/he/ru).
  - Not modeled in Phase M (rules N-Q and the "not modeled" paragraph in
    `docs/constants-to-verify.md`): the 30% rate for a 10%+ holder, unvested
    shares, options with a strike price, ESPP (unchanged), inflation/currency
    adjustment of the grant value. Bituach Leumi/health on the ordinary part
    and separate vesting batches were added in Phase N. The rules come from
    the employer's supplement, not the Tax Authority (rows 21-25, Medium).
  - Behavior change: profiles with employer shares now show tax on them.

- **Phase L (tax refinements): ALL DONE.** The user declined survivor
  analysis and the real-estate module for now and asked for further tax
  refinements; scope agreed: the verified core only.
  - **Exemption by calendar year.** `TAX_RATES.qualifyingAnnuityFixedExemptionSchedule`
    (22% 2025, 22.5% 2026, 27.5% 2027, 32% from 2028) plus the 35%
    conditional share = 57% / 57.5% / 62.5% / 67%. `domain/tax.ts`:
    `fixedExemptionRate(year)`, `totalExemptionRate(year)`,
    `qualifyingAnnuityExemption(pension, severance, cap, taxYear)`.
    The ceiling (₪9,430) and a user-entered exemption allowance stay flat.
    **The +0.5-point 2026 step looks odd: check it first** (row 15 in
    `docs/constants-to-verify.md`).
  - **One clock source.** `Household.baseYear` and `NetIncomeEstimate.baseYear`;
    `buildHousehold(profile, timing, baseYear = new Date().getFullYear())`
    is the only place the clock is read for the plan. Each retirement year is
    taxed in `baseYear + yearsFromNow`. `src/test/setup.ts` pins `Date` to
    2026-06-15 (only `Date`, so timers still run); tests that need another
    year pass `baseYear` explicitly.
  - **Early-retirement health tax.** Before the statutory retirement age,
    pension-taxed income bears 3.23% up to ₪7,703/month and 5.17% above
    (verified on btl.gov.il on 2026-10-27). `PersonTaxInput.beforeStatutoryAge`
    (named `healthTaxApplies` in Phase L)
    / `taxYear`, `PersonTax.healthTaxMonthly`, `earlyPensionHealthTax()`.
    No health tax from the statutory age (secondary source, Medium). A man
    retiring at 62 with ₪17,857 now pays ₪2,917 a month instead of ₪2,143
    until 67, so profiles that retire early show lower after-tax income and
    can retire later in the feasibility result.
  - UI: `TaxCard` shows the base year's exemption and the rise to 67%, a
    health-tax line and a shorter "not included" list (en/he/ru).
  - Not modeled, listed in `docs/constants-to-verify.md` rule M: the
    health-tax exceptions (survivors' allowance, ≥75% disability, non-working
    married woman with an insured husband), its income cap, health tax on
    non-pension income, and Bituach Leumi contributions of early retirees.
    Also left out on purpose: a credit-points breakdown helper, tax-aware
    withdrawal splitting between spouses, the gemel-to-annuity exemption.

- **Phase K (input guidance, single-person support, UI polish): ALL DONE.**
  The user asked which inputs are essential, which are only for
  cross-reference (policy / fund ID), how to make mandatory values obvious,
  and whether the app works for a person without a partner. Scope: UI only;
  "mandatory" stays strict (only age and desired retirement age block).
  - Field tiers: each label carries a **Required**, **Recommended** or
    **Reference only** badge (`components/fields/FieldLabel.tsx`; every
    field component and `CollapsibleSection` take an `importance` prop); a
    "Which fields matter?" legend (`pages/MyData/FieldLegend.tsx`) heads each
    My Data step. Untagged fields are optional refinements with a default.
    The full tier list is in `docs/implementation-progress.md` → Phase K.
  - New data: `PensionAccount.policyNumber` and `fundId` (reference only,
    backfilled `""` in `normalizeProfile()`), and `ProfileData.comparisonAges`
    (the three compared retirement ages, `null` until the user changes them;
    dropped by `normalizeProfile()` when malformed).
  - `domain/inputGuidance.ts` `findDataGaps(profile)` feeds the Dashboard's
    "Improve your estimate" card (`components/DataGapsCard.tsx`). Without
    desired spending the Funding Gap KPI shows "—" and the status banner is
    hidden.
  - Single person: nothing beyond the two ages is needed. Married without a
    spouse age is still a single-person plan (flagged by the `spouseMissing`
    gap); spouse content appears only for an active household
    (`isHouseholdActive`). Covered by tests on the Personal step, Dashboard
    and Projections for no status, single, divorced, widowed and married
    without a spouse age.
  - Polish: `charts/formatAxisMoney.ts` (compact ₪1.5M / ₪2.5k axis labels);
    `.recharts-surface { direction: ltr }` in `index.css` fixes the Hebrew
    y-axis overlap (SVG `text-anchor` flips under RTL);
    `charts/ComparisonChart.tsx`; `FeasibilityCard` on Projections;
    `ScenarioComparison` saves its three ages.
  - Reference-only fields are saved and exported but used by no calculation.
  - Known and left alone: an all-zero plan shows a 0–4 chart axis.

- **Phase J (Phase 3 — retirement scenario comparison): ALL DONE.**
  Projections has a "Compare retirement ages" card: any three retirement
  ages for the primary user, side by side.
  - Design: a spouse's retirement moves by the same number of years from
    the age they entered (never before their current age), so the user's own
    entered age equals the Dashboard and the standard scenario. This is
    `retirementTimingShiftedTo` in `domain/household.ts`, not
    `retirementTimingAtAge` (both retire at the same moment; used by the
    feasibility solver).
  - `domain/scenarioComparison.ts`: `compareRetirementAge(s)`,
    `defaultComparisonAges` (Early / Standard / Delayed ages),
    `initialComparisonAges` (saved ages, else the defaults; Phase K),
    `isValidComparisonAge` (from today, 50–80). Rows use the same
    after-tax headline (the lowest after-tax year) as the Dashboard.
  - UI: `components/ScenarioComparison.tsx` (the Early / Standard / Delayed
    toggle still drives the charts and is independent of the card); i18n
    `projections.compare.*` en/ru/he. The comparison chart and saving the
    chosen ages were added in Phase K.
  - Known quirk (not mine): with a standard age under 65 the Early scenario
    is floored at 60 and can exceed the standard age; the card's default
    early age is capped at the standard age.

- **Phase I (Phase 3 — tax module): ALL DONE.** Tax constants were
  cross-checked against secondary sources (gov.il returned 403) and are in
  `docs/plan.md` → "Open Items" item 3 (the 35% bracket ceiling is 46,690).
  The full list of unconfirmed figures, with confidence and what to look up
  officially, is in `docs/constants-to-verify.md`; log each check there.
  - Design: a post-hoc tax on the level-gross plan, per person per year;
    net = gross − tax, and net drives the funding gap and feasibility.
    The headline is the lowest after-tax year.
  - `domain/taxRates.ts` (2026 `TAX_RATES`, `ratesAsOf`, source link),
    `domain/tax.ts` (brackets, credit points, Section 9A exemption from the
    statutory age, 3%/2% surtax, 25% real-gain rate),
    `domain/netIncome.ts` (`estimateNetIncome`: drawdown with holdings and
    cost basis, tax per member per year). `sources.ts` tags tax treatment,
    `drawdown.ts` tracks holdings and basis, `household.ts` supplies the
    per-member credit points.
  - Treatment: pension, regular and IRA provident funds = pension income;
    investment provident fund and other investments = 25% on the real gain
    only; study fund and the Bituach Leumi pension = tax-free.
  - Data: `SpouseData.creditPoints` (backfilled `null` = default 2.25 man /
    2.75 woman); `personal.creditPoints` already existed.
  - UI: `components/TaxCard.tsx` on the Dashboard (the income KPI is now
    after tax), `components/charts/NetIncomeChart.tsx` on Projections,
    credit-point fields in `PersonalStep` and `SpouseSection`
    (`NumberField` gained a `step` prop); i18n en/ru/he.
  - Limitations: pro rata draws taxed per owner with no spouse tax
    coordination; investment basis = today's balance + deposits (existing
    gains are understated); the severance basket applies to the primary
    only; no Bituach Leumi contributions, other credit points
    (children), gemel-to-annuity exemption or old gemel lump-sum rules;
    `annuityTaxType` is unused. (The 2027-28 exemption steps and health tax
    on an early pension were added in Phase L.) Medium confidence on the
    severance offset (1.35/180) and the conditional-exemption treatment.
  - Behavior change: the headline income, funding gap and feasibility are
    now after tax, so existing profiles show lower income than before.

- **Phase H (Phase 2 — couples/household): ALL DONE.** Pre-phase validation
  of the spouse-supplement rules is in `docs/plan.md` → "Open Items" item 6
  (btl.gov.il).
  - Data: `profile.spouse` (`age`, `gender`, `retirementAge`,
    `monthlyGrossSalary`, `bituachLeumi`) and `PensionAccount.owner`
    (`self` | `spouse`), both backfilled in `normalizeProfile()`. The
    household is active only when `maritalStatus` is `married` **and**
    `spouse.age` is set (`isHouseholdActive` in `domain/profileBasics.ts`);
    otherwise spouse-owned accounts are ignored and results equal the
    single-person ones. Other assets, equity, expenses and assumptions stay
    household-level.
  - `domain/household.ts` (`buildHousehold`, `resolveRetirementTiming`,
    `retirementTimingAtAge`, `spouseAgeAt`): per-member views and timing.
    The clock counts years from today and the displayed age is yours; the
    plan runs until the youngest member is 90. Withdrawals start when the
    later spouse retires; each member contributes until their own
    retirement age and claims their own Bituach Leumi at their own age.
    "Earliest feasible" = the earliest age at which both can retire
    together (the spouse's age is linked through the age gap).
  - ₪924 spouse supplement: paid to a member with an eligible, included
    pension while the spouse has none; it starts once the spouse stops
    working (income-test threshold unconfirmed) and ends when the spouse's
    own pension starts. Couple income-supplement hint uses ₪6,912.
  - UI: `MyData/SpouseSection.tsx`, owner select/badge on pension accounts,
    `BituachLeumiCard` per member, `FeasibilityCard` "both retire" line,
    `RetirementTimeline` spouse ages, household notes on Dashboard and
    Projections; i18n en/ru/he.
  - To plan a spouse with no pension: 0 insured years and a retirement age
    equal to their current age.
  - Not modeled: survivor analysis, the working spouse's salary after
    the first spouse retires, payments that start before the household
    retires (counted from retirement), the child supplement.

- **Phase G (Phase 2 — per-source model): ALL DONE.** Pre-phase validation of
  the access rules is in `docs/plan.md` → "Open Items" item 5 (secondary
  sources only — re-check edge cases against the Capital Market Authority).
  - `domain/accessRules.ts` (sourced constants), `domain/sources.ts`
    (`buildSources`: each account → kind, unlock age, annuity),
    `domain/profileBasics.ts` (age/return/balance helpers),
    `domain/drawdown.ts` (`simulateDrawdown`), `domain/timeline.ts`
    (`buildRetirementTimeline`).
  - `estimateRetirementIncomeAtAge` is a closed form with checkpoints at
    each unlock/annuity start, so income never exceeds what is accessible by
    then; its result has an `access` summary. `projectNetWorth` and
    `estimateIncomeBreakdown` both run on `simulateDrawdown`.
  - Access: pension, managers insurance, provident (kitzba) and IRA
    provident from age 60; investment provident any time; study fund 6
    years after the first deposit (`liquidityDate`, else join date). No
    product type = pension fund, fully accessible (back-compat; flagged on
    the Dashboard).
  - Annuities (pension/managers insurance only): `estimatedMonthlyAnnuity`,
    else balance ÷ `conversionFactor` when `hasGuaranteedFactor`.
  - UI: Dashboard `SourceAccessCard`, six-band `IncomeBreakdownChart`,
    Projections `RetirementTimeline`, helper text on the annuity section;
    i18n en/ru/he.
  - Behavior change: income can no longer borrow against a future BL
    pension/annuity (no savings → 0 before it starts).
  - Not modeled: early-withdrawal penalty, withdrawal ordering,
    study-fund 3-year exception, severance split, minimum-pension rule,
    official conversion-factor tables.
- **Phase F (Phase 2 — Bituach Leumi): ALL DONE** (pre-phase validation of
  the plan's open items is in `docs/plan.md` → "Open Items").
  - `domain/bituachLeumiRates.ts` (sourced constants + effective date +
    `womenRetirementAge`) and `domain/bituachLeumi.ts`
    (`statutoryRetirementAge`, `estimateBituachLeumiPension`,
    `mayQualifyForIncomeSupplement`).
  - Flows into `estimateRetirementIncomeAtAge`, `projectNetWorth`,
    `estimateIncomeBreakdown`, funding gap and the feasibility solver
    (since Phase G through the per-source engine).
  - `profile.bituachLeumi` (`includeInProjection` default **true**,
    `insuredYearsToDate`, `monthlyPensionOverride`), backfilled in
    `normalizeProfile()`.
  - UI: Personal step section, Dashboard `BituachLeumiCard`, third chart
    band on Projections; i18n en/ru/he.
  - Not modeled: child supplement, earning test, means-tested
    income supplement (hint only). Tax constants were cross-checked later,
    in Phase I.
- **Phase E (close Phase 1 gaps): ALL DONE.**
  - E1: `domain/feasibility.ts` → `findEarliestFeasibleRetirementAge()`
    (linear scan to age 80) + Dashboard `FeasibilityCard`.
  - E2: `personal.monthlyGrossSalary` + per-account contribution
    percentages; `domain/contributions.ts`; contributions flow into
    projections, income, funding gap, feasibility, and income breakdown.
    Salary is constant in real terms; only `activeContributing` accounts
    deposit; deposits stop at retirement age.
  - E3: i18n en/ru/he + tests.
  - `ProfileContext` now calls `normalizeProfile()` on load; no Dexie
    version bump was needed (profile is one opaque blob).

- **Phase A (project setup & infra): ALL DONE.**
  - A1 `prototype/` → `app/` rename.
  - A2 Vitest + RTL + jsdom test infra.
  - A3 Dexie (IndexedDB) storage schema/repository.
  - A4 `ProfileContext` persists via Dexie (async load, `isReady` gate).
  - A5 Real Export/Import JSON wired on Settings + Welcome pages.
  - A6 CI workflow (`.github/workflows/ci.yml`): lint, typecheck, test,
    build on push/PR to `main`.
  - A7 Deploy workflow (`.github/workflows/deploy.yml`): builds, copies
    `index.html` → `404.html` (SPA deep-link fallback for GH Pages), deploys
    via `actions/deploy-pages`. **Verified green end-to-end**: both
    workflows succeeded on the latest push, and the live URL returns
    HTTP 200.
- **Phase B (domain calculation engine): ALL DONE.** Pure-TS, unit-tested
  net worth projection / retirement income / funding gap / income-breakdown
  functions in `app/src/domain/`.
- **Phase C (wire calculations into UI): ALL DONE.** Dashboard and
  Projections pages use the domain engine instead of mock data; Personal
  step has required-field + retirement-age validation. Verified end-to-end
  in-browser with a real profile.
- **Phase D (testing/docs/deploy verification): ALL DONE.**
  - D1: component tests for key flows (`Dashboard.test.tsx`,
    `MyData/PensionSavingsStep.test.tsx` — add/edit/remove repeater flow),
    using `fake-indexeddb` so `ProfileProvider`'s real persistence path
    runs unmodified in tests.
  - D2: `docs/architecture.md` / `docs/plan.md` / `README.md` updated to
    reflect implemented status (the two gaps it logged were closed in
    Phase E).
  - D3: live deploy verified (done as a side effect of A7).
- 396 tests total, all green; lint/typecheck/build all green.

(Counts moved on later: 645 passed and 1 skipped after Phase Q; 664 passed and 1 skipped after Phase S; 712 passed and 1 skipped after Phase T; 720 passed and 1 skipped after the returning-visitor change; 723 passed and 1 skipped after the logo and colour change.)

## Where to go next

Phase 1, the Phase 2 modules (Bituach Leumi, per-source model,
couples/household), the Phase 3 tax module and scenario comparison, the
Phase K input guidance, the Phase L tax refinements, the Phase M
Section 102 employer stock tax and its Phase N follow-ups, the Phase O
clearing-house import, the Phase P calculation trace and the Phase Q summary
tables are complete.
Remaining, not yet started:

- **Use the verification pack.** Export one from Settings, give it to an
  independent AI session with the prompt inside the pack, and fix whatever it
  finds. The pack proves the arithmetic and where each number came from; the
  reviewer's Part B checks that each formula is the right rule. Possible
  follow-ups: a self-check flag for `fromLatestStep` fallbacks, and an app
  version in the pack (there is no runtime version today). The timeline
  (`timeline.ts`) only groups income points the trace already covers into
  segments, so it is not traced itself.

- **Survivor analysis** (simulate the death of either spouse), Phase 3. The
  user said not now.
- **Real estate module** (equity, rental income, appreciation), Phase 3.
  The user said not now.
- Further tax work: Bituach Leumi contributions on income other than
  Section 102 shares (for example early retirees' non-pension income), health tax
  exceptions and non-pension income, a credit-points breakdown helper,
  tax-aware withdrawal splitting between spouses (needs a drawdown rework),
  the investment-gemel annuity exemption from 60 (rule U), the 30% rate for a 10%+ holder, ESPP and
  option strike prices (the user kept both out of scope). Also finish the
  constants check: read the Tax Authority's own tables for rows 1-9 and
  check row 17 (`docs/constants-to-verify.md`).
- **Foreign-stock capital gains in a personal brokerage account: researched,
  not built** (2026-10-30; the user chose to record the rules only). Rules R-T
  in `docs/constants-to-verify.md`: the taxable gain is the lower of the
  nominal shekel gain and the USD gain × the sale-date rate, which equals
  value − USD cost × max(purchase rate, sale rate); FIFO order for lots; old
  purchases (before 2012) may have transitional rates (unresolved). The model
  uses only the USD gain × 3.7, so it overstates tax when the dollar was higher
  at purchase. If the user asks to build it: per-holding purchase lots (date,
  shares, USD price, rate at purchase), an effective cost basis in
  `otherInvestmentsTaxProfile` and its trace, tests from the vectors in rule R;
  FIFO inside the drawdown is optional and changes timing only.
- **Investment gemel: researched, not built** (2026-10-30). Rule U in
  `docs/constants-to-verify.md`. Lump sum: 25% of the real gain at any age, no
  exemption at 60. A life annuity from 60 through a paying fund is tax-free.
  No 0% route before 60 was found, and nothing varies by fund or program. The
  2026 deposit ceiling is ₪83,641. The app keeps 25% at any age.
- **Bridge Planner: design written, waiting for the user's review**
  (2026-10-30; Phase R in `docs/implementation-progress.md`, full design in
  `docs/bridge-planner-design.md`). It covers the liquidity ladder, named
  withdrawal strategies, purchase lots for private and ESPP stock, an RSU
  schedule generator with vest-aware "cost of leaving early", per-source cost
  and stress tests, in six to seven independent steps. Nothing is built. Start
  with the open questions in section 7 of the design.
- Possible refinements to the contribution model (they change numbers, so
  they were deliberately left out of Phase K): real wage growth, a
  per-account salary override, and the study-fund **annual deposit** ceiling
  (₪15,712/month salary).
- Using the reference-only fields (policy number, fund ID, fees, annuity tax
  type, ...) in calculations, or matching `fundId` to published fund data
  (Phase 4, external data).
- **Statement import.** The **Pension Clearing House route is built** (Phase O):
  the user picks the consolidated report's zip (or its XML files), types the
  password from the email when asked, reviews what was found and ticks what to
  import. Code in `app/src/domain/clearingHouseImport/` and
  `app/src/pages/ClearingHouseImport/`; the spec and the list of deviations are
  in `docs/clearing-house-import-analysis.md`. Not imported on purpose: the
  pre/post-2008 split. The annuity is imported from the report's projections
  (O7; real versus nominal terms is open). No other import route is planned.
  Real files are never committed; tests use synthetic fixtures. Possible
  follow-ups: the report's Excel file (deposit history), a sample of a paying
  pension, the v009 XSD.

## Key technical decisions to know before continuing

- **Local-first, no backend.** All data lives in IndexedDB via Dexie
  (`app/src/storage/db.ts`). Export/Import is the only way data leaves the
  device (`app/src/storage/profileIO.ts`).
- **`normalizeProfile()`** (`app/src/types/index.ts`) is the single
  defensive-merge used for legacy localStorage migration, JSON import, and
  (since Phase E) every load from Dexie — don't duplicate this logic
  elsewhere. Any new profile field must be backfilled there.
- **Vite `base` differs by command**: `/` in dev, `/israeli-retirement-planning/`
  in build (`app/vite.config.ts`), and `main.tsx`'s `BrowserRouter` reads
  `import.meta.env.BASE_URL` for its `basename` — this is required for the
  GitHub Pages project-site subpath to resolve assets/routes correctly.
  Don't hardcode a different base path without updating both.
- **GH Pages SPA fallback**: GitHub Pages has no server-side rewrites, so
  deep-linked routes 404 unless `404.html` exists. The deploy workflow
  copies the built `index.html` to `404.html` after build — keep this step
  if the deploy workflow is ever rewritten.
- **i18n locale files** (`app/src/i18n/locales/{en,ru,he}.json`): `he.json`
  mixes `\uXXXX` escapes (older sections) and raw Hebrew (newer sections);
  `en.json`/`ru.json` use raw UTF-8. Keep this in mind when grepping/editing
  — a raw-Cyrillic search won't match Hebrew's escaped form and vice versa.
- **Installing deps behind a lagging npm proxy:** if `npm ci` 404s on
  recently released versions, `npm install --no-package-lock` from `app/`
  works for local verification — don't commit the resulting lockfile
  changes.
- **Linting is `oxlint`**, not ESLint — a deliberate deviation from the
  original `docs/architecture.md`, already logged there.
- **The calculation trace is a module-level context** (`app/src/domain/trace.ts`).
  The engine stays plain synchronous functions with no extra arguments; steps
  are recorded only inside `runTraced` and cost nothing otherwise. "Now" comes
  only from `engineNowMs()` / `engineCurrentYear()` so the traced run and the
  displayed figures use the same date. The verification pack redacts with an
  allow-list (unknown text becomes `[redacted]`) and refuses to export if a leak
  check fails. Details: `docs/calculation-trace.md`.

## Session-tracking mechanics (for the agent resuming this)

- `docs/constants-to-verify.md` lists every hard-coded tax, Bituach Leumi
  and access-rule figure with its confidence and what to look up
  officially; use its log table when you confirm one.
  truth** — always trust it over any local session/SQL state, since SQL
  todos don't transfer across machines/accounts.
- Each phase/task is committed+pushed in a fully working state (build +
  lint + typecheck + test green) before being checked off — so `git log`
  on `main` is a reliable trail of exactly what's been verified.
- Recommended resume procedure: read `docs/implementation-progress.md` top
  to bottom, find the first unchecked `[ ]` item, `git log --oneline` to
  confirm no partial work already exists for it, then continue from there.
