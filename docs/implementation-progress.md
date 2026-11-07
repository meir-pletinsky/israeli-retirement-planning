# Implementation Progress

Tracks the real-app implementation (post-prototype), so work can be resumed
in a new session/month if it pauses mid-stream (e.g. AI credit limits).

**How to resume:** read this file top to bottom. Anything not checked off is
not done. Check `git log` on the current task's area for partial work before
redoing it. Each task should be committed in a working state (build + tests
+ lint green) before being checked off here.

Scope note: Phase 1 here targets `docs/plan.md`'s "Phase 1 — MVP", but with
the richer pension-account / equity-holding input model already built in the
prototype (see `docs/ui-concept.md` + the schema-driven data model). The
calculation engine starts simple (aggregate balances, deterministic growth)
and originally did not model tax. Bituach Leumi was added as the first
Phase 2 module (Phase F below), the per-source access/annuity model as the
second (Phase G), couples/household planning as the third (Phase H), and the
Phase 3 tax module (gross → net income) as Phase I, the retirement-age
scenario comparison as Phase J, input guidance, single-person checks and
UI polish as Phase K, tax refinements (exemption schedule by year,
early-retirement health tax) as Phase L, Section 102 employer stock tax
as Phase M, and its follow-ups (contributions on the ordinary part, vesting
batches, a constants check) as Phase N, the Pension Clearing House import
(read a zip or XML files, review, apply) as Phase O, the calculation trace
with its offline verification pack as Phase P, the read-only summary tables
on the My Data steps as Phase Q, and the simple purchase / grant entry with
per-category equity tables as Phase S (Phase R is the Bridge Planner: R1 liquidity ladder
and R2 withdrawal order are built), and
the daily stock price files with ticker suggestions and price autofill as Phase T, and the
Monte Carlo risk analysis (the first Phase 4 piece) as Phase V, and the household dashboard
KPIs (retirement snapshot and the retire-at checks) as Phase W, and live Israeli inflation
from the Central Bureau of Statistics as Phase X, and the historical backtest (US market
history replayed on the plan) as Phase Y.

## Phase A — Project setup & infra

- [x] A1. Rename `prototype/` → `app/` (git mv, preserve history); update
      README/docs references.
- [x] A2. Add Vitest + React Testing Library + jsdom; `npm test` script;
      one smoke test passing.
- [x] A3. Add Dexie; versioned IndexedDB schema + repository module for the
      profile (per `docs/architecture.md` → Data & Persistence).
- [x] A4. Replace `ProfileContext`'s localStorage persistence with the Dexie
      repository (keep the context's public API stable for pages).
- [x] A5. Wire Settings page Export/Import buttons to real JSON
      export/download and import/upload (with shape validation), Reset
      stays working.
- [x] A6. GitHub Actions CI workflow: lint, typecheck, test, build on push/PR.
- [x] A7. GitHub Actions deploy workflow: build + publish `app/dist` to
      GitHub Pages on merge to `main`. Live at https://gimlai.app/ (custom domain,
      Vite `base` is `/`; originally
      https://meir-pletinsky.github.io/israeli-retirement-planning/)
      (verified: both workflows green, site returns HTTP 200 after push).

## Phase B — Domain calculation engine (pure TS, unit-tested)

- [x] B1. Formalize domain calculation input/output types in
      `app/src/domain/` (reuse `app/src/types`). See `domain/types.ts` +
      `domain/constants.ts`.
- [x] B2. Net worth projection function: given accounts/holdings/other
      assets + assumptions, project balances forward to the planning
      horizon. `domain/netWorth.ts` → `projectNetWorth()`. Projects in real
      (inflation-adjusted) terms so output is already "in today's money";
      originally balances-only — ongoing contributions were added later in
      Phase E (E2).
- [x] B3. Retirement income estimate function (deterministic, MVP-level).
      `domain/retirementIncome.ts` → `estimateRetirementIncome()`: amortizes
      the projected balance at retirement over the remaining planning
      horizon (annuity/loan-payment formula) for a sustainable monthly
      figure, independent of desired expenses.
- [x] B4. Funding gap + retirement-readiness indicator function.
      `domain/fundingGap.ts` → `calculateFundingGap()`: estimated
      sustainable income minus desired `expenses.retirementMonthly`;
      `status: "onTrack" | "shortfall"` matches the existing
      `StatusBanner` component's prop type.
- [x] B5. Vitest unit tests for B2–B4 (the highest-priority tests in the
      whole project per `docs/architecture.md`). 25 new tests across
      `netWorth.test.ts` / `retirementIncome.test.ts` / `fundingGap.test.ts`
      (32 total project-wide, all green).

## Phase C — Wire calculations into UI

- [x] C1. Dashboard: replace mock KPIs/chart with real calculated values
      from the domain engine + stored profile. `Dashboard.tsx` now calls
      `aggregateCurrentNetWorth`, `projectNetWorth`, `estimateRetirementIncome`,
      `calculateFundingGap`, `resolveRetirementAge`, `yearsToRetirement`.
      Verified in-browser with a real profile (age 45, retirement 67, other
      assets ₪200,000, desired expenses ₪6,000/mo): KPIs showed
      ₪2,180 projected income, ₪200,000 net worth today, -₪3,820 funding
      gap, 22 years to retirement — all consistent with the inputs.
- [x] C2. Projections page: replace mock data with real domain-engine
      output; scenario controls (retirement age) recalculate live.
      `Projections.tsx` now uses `projectNetWorth` per scenario (early/
      standard/delayed) and the new `estimateIncomeBreakdown()` (added to
      the domain engine as C2-supporting work, with its own
      `incomeBreakdown.test.ts` — 34 tests total project-wide, all green)
      for the income-by-source chart. Verified in-browser: net worth chart
      shows realistic growth-then-drawdown curve, income breakdown chart
      renders with real pension/investment split.
- [x] C3. My Data wizard: add validation for fields the calc engine
      requires. Scope: Personal step only — `age` and `retirementAge` are
      required and `retirementAge` must exceed `age`, since every domain
      calculation depends on both. Implemented via `NumberField`'s new
      `error` prop, `StepFooter`'s new `isValid`/`onInvalidAttempt` gating,
      and `PersonalStep`'s `showErrors` state (errors only shown after a
      blocked "Next" attempt, not on initial load). Other steps/fields are
      intentionally left unvalidated: the domain engine already defaults
      missing balances/expenses to 0 and degrades gracefully (e.g. a
      ₪0 funding gap baseline), so stricter validation elsewhere is
      deferred unless it proves necessary. Verified in-browser: blank
      Personal step blocks "Next" with inline errors; valid input proceeds.

## Phase D — Testing, docs, deploy verification

- [x] D1. Component tests for key flows (account/holding repeater add-edit-
      remove, dashboard rendering with calculated values). Added
      `fake-indexeddb` as a dev dependency so `ProfileProvider`'s real
      Dexie-backed load/save path runs unmodified in tests (via a new
      `src/test/renderWithProviders.tsx` helper). `Dashboard.test.tsx`
      covers the pre-onboarding empty state and KPI rendering against a
      seeded profile, computing expectations via the same domain-engine
      calls the component uses (rather than hardcoded snapshot numbers) so
      the test tracks real behavior. `MyData/PensionSavingsStep.test.tsx`
      exercises the full account repeater: add → edit → remove, including
      the confirm-removal modal. 3 new tests (37 total project-wide, all
      green).
- [x] D2. Update `docs/architecture.md` / `docs/plan.md` / `README.md` to
      reflect implemented status and any deviations from the original plan.
      Added a Status section to each of `architecture.md` and `plan.md`
      (linking to this file), corrected the stale ESLint+Prettier lint
      table row to `oxlint`, updated the `domain/` structure diagram to
      match the actual flat layout, noted the External Data Sources
      section is unimplemented Phase-4 scope, logged the repo-visibility
      deviation under Deployment, and flagged two real gaps vs. the
      original Phase 1 output list: no salary/contribution modeling, and
      no true "early retirement feasibility date" solver (only a 3-way
      scenario comparison). Added a Getting Started section to `README.md`.
- [x] D3. Verify the live GitHub Pages deployment; add the live link to
      `README.md`. (Done as part of A7; re-verify after future deploys that
      change routing/assets.)

## Phase E — Close Phase 1 gaps (post-MVP)

- [x] E1. Earliest-feasible-retirement-age solver.
      `domain/feasibility.ts` → `findEarliestFeasibleRetirementAge()` scans
      whole ages from `ceil(currentAge)` to `max(MAX_RETIREMENT_SEARCH_AGE
      (80), currentAge)` and returns the first age whose funding gap is
      non-negative (`calculateFundingGapAtAge`). Linear scan, not
      bisection: the gap isn't guaranteed monotonic in retirement age (e.g.
      a negative real return). Result is `feasible` / `notFeasible` /
      `noTarget` (no positive `expenses.retirementMonthly`). To support it,
      `netWorth` / `retirementIncome` / `fundingGap` gained `*AtAge`
      variants (`projectBalanceAtAge`, `estimateRetirementIncomeAtAge`,
      `calculateFundingGapAtAge`); the scenario-based functions delegate to
      them, so existing behavior is unchanged. Dashboard shows a new
      `FeasibilityCard` (earliest age, years from today, and
      feasible-now / not-reachable / add-expenses messages).
- [x] E2. Salary / ongoing-contribution modeling.
      New `personal.monthlyGrossSalary` (Personal step) and per-account
      `contributions` (`employeeRatePercent` / `employerRatePercent` /
      `severanceRatePercent`, "Ongoing contributions" section of the
      account form). `domain/contributions.ts` computes monthly deposits
      (salary × summed rates, **only for `activeContributing` accounts**)
      and their closed-form future value. Contributions flow into
      `projectNetWorth` (until retirement age), retirement income, funding
      gap, the feasibility solver, and the pension share of the income
      breakdown. `ProfileContext` now runs `normalizeProfile()` on load, and
      `normalizeProfile()` backfills `contributions`, so stored/imported
      profiles from before this change keep working. **No Dexie version
      bump needed** — the profile is stored as a single opaque blob.
- [x] E3. i18n (en/ru/he) for the salary field, contribution fields, and
      feasibility card; tests for contributions math, the solver (incl.
      boundary property: feasible at the result, shortfall one year
      earlier), `normalizeProfile` back-compat, the feasibility card, and
      the new form fields (74 tests total, all green).

## Phase F — Phase 2: Bituach Leumi (state old-age pension)

Pre-phase validation of the four `docs/plan.md` open items was done first
(2026-10-26); results are recorded in `docs/plan.md` → "Open Items".

- [x] F1. Sourced constants and benefit engine.
      `domain/bituachLeumiRates.ts` holds the BTL amounts/ages with an
      effective date (`2026-01-01`) and source URL, plus
      `womenRetirementAge(birthYear)`. `domain/bituachLeumi.ts`:
      `statutoryRetirementAge()`, `estimateBituachLeumiPension()` and
      `mayQualifyForIncomeSupplement()`.
      Pension = `1838 × (1 + seniority) × (1 + deferral)`; seniority =
      2%/full insured year capped at 50%; deferral = 5%/full year between
      the statutory age and 70 (claim age = `min(max(statutory,
      retirementAge), 70)`); eligibility = 144 insured months, or 60 within
      the last 10 years. A `monthlyPensionOverride` replaces the calculated
      amount and forces eligibility.
- [x] F2. Integration into the engine. `estimateRetirementIncomeAtAge` uses
      a "bridge" formula so savings carry the gap before the pension starts
      and spending stays level (`S = (V + B·(A(N) − A(monthsUntilClaim)))
      / A(N)`; identical to the old formula when `B = 0`). `projectNetWorth`
      offsets withdrawals by the pension from the claim age;
      `estimateIncomeBreakdown` gained a `bituachLeumi` band. Funding gap
      and the feasibility solver pick it up unchanged (e.g. 3M assets, age
      40, ₪6,000/month: earliest age 49 without the pension, 41 with a
      ₪2,000 pension).
- [x] F3. Data model. `profile.bituachLeumi` (`includeInProjection`,
      `insuredYearsToDate`, `monthlyPensionOverride`), backfilled by
      `normalizeProfile()` — no Dexie bump.
- [x] F4. UI + i18n (en/ru/he). Personal step "Bituach Leumi old-age
      pension" section; Dashboard `BituachLeumiCard` (pension, claim age,
      seniority/deferral notes, not-eligible/excluded states, income
      supplement hint, rates "as of" date and source link); a third bar in
      the Projections income chart.
- [x] F5. Tests: 108 total, all green (new `bituachLeumi.test.ts`, BL cases
      in the income / net-worth / breakdown / feasibility tests, profile
      backfill, Dashboard card states, Personal step form).
- [x] F6. Remaining Phase 2 items were split: Provident Fund / Managers
      Insurance nuance and the per-source timeline are done in Phase G;
      couples/household (spouse supplement ₪924) is done in Phase H.

## Phase G — Phase 2: per-source access rules, annuities and timeline

Pre-phase rule validation was done first (2026-10-26; secondary sources
only, see `docs/plan.md` → "Open Items" item 5).

- [x] G1. Sourced rules. `domain/accessRules.ts` (`ACCESS_RULES`: as-of
      date, earliest annuity age 60, study-fund liquidity 6 years) with the
      list of what is deliberately not modeled.
- [x] G2. Sources. `domain/sources.ts` turns each account into a
      `RetirementSource` (kind, balance, contribution, unlock age, value at
      retirement, optional annuity); `otherAssets` and equity form one
      always-accessible `otherInvestments` source. Category → kind and
      unlock age: pension/managers insurance/provident/IRA provident → 60,
      investment provident → 0, study fund → `liquidityDate`, else join date
      + 6 years. `domain/profileBasics.ts` holds the age/return/balance
      helpers extracted from `netWorth.ts`.
- [x] G3. Income engine. `estimateRetirementIncomeAtAge` is now a
      closed form with checkpoints at each unlock and annuity start:
      `S = min over t of (Σ unlocked value + Σ stream payments so far) /
      A(t)`, so spending can never exceed what is accessible by then. It
      reduces to the old formula when nothing is locked. The result carries
      a `RetirementAccessSummary` (accessible vs. locked at retirement,
      next unlock age, `bridgeLimited`, income if everything were
      accessible, the limiting age, annuity total, uncategorized accounts).
- [x] G4. Year-by-year simulation. `domain/drawdown.ts`
      (`simulateDrawdown`) withdraws pro rata from unlocked, non-annuitized
      sources and tracks each source's payment stream and share of capital;
      `projectNetWorth` and `estimateIncomeBreakdown` both use it, so the
      chart, the table and the timeline agree. The breakdown now has six
      bands (pension fund, provident fund, managers insurance, study fund,
      other investments, Bituach Leumi).
- [x] G5. Timeline. `domain/timeline.ts` (`buildRetirementTimeline`) groups
      consecutive ages with the same paying sources into segments.
- [x] G6. UI + i18n (en/ru/he). Dashboard `SourceAccessCard` (accessible vs.
      locked capital, account annuities, a bridge-limited warning, an
      uncategorized-accounts notice with a link to My Data — hidden when
      there is nothing to say); six-series `IncomeBreakdownChart`; Projections
      `RetirementTimeline` table; helper text on the account form's annuity
      section.
- [x] G7. Tests: 152 total, all green (new `sources.test.ts` and
      `sourceAccess.test.ts`; updated income/breakdown tests; Dashboard card
      states; Projections timeline). Checked in the browser in English and
      Hebrew (RTL).

## Phase H — Phase 2: couples / household

Pre-phase rule validation was done first (2026-10-26; btl.gov.il, see
`docs/plan.md` → "Open Items" item 6). Design decisions, agreed with the
user: spouse details live in the Personal step; each pension/savings
account has an owner (other assets and stocks stay household-level);
household spending starts when the later spouse retires, while each spouse
stops contributing and claims their own Bituach Leumi at their own ages;
"earliest feasible" means the earliest year both can retire together.

- [x] H1. Data model. `profile.spouse` (`age`, `gender`, `retirementAge`,
      `monthlyGrossSalary`, `bituachLeumi`) and `PensionAccount.owner`
      (`self` | `spouse`), both backfilled by `normalizeProfile()` — no
      Dexie bump. A spouse joins the plan only when `maritalStatus` is
      `married` **and** `spouse.age` is set (`isHouseholdActive`); otherwise
      spouse-owned accounts are ignored, so single-person results are
      unchanged. Common-law partners are treated as married.
- [x] H2. Household model. `domain/household.ts` builds a view per member
      (own accounts and sources, own contributions, own Bituach Leumi) and
      the retirement timing (`resolveRetirementTiming` for the early /
      standard / delayed scenarios, `retirementTimingAtAge` and
      `spouseAgeAt` for the feasibility scan, which keep the spouse's age
      linked to yours through the age gap). A single person is a household
      of one.
- [x] H3. Engine. The household clock counts years from today; the
      displayed age is the primary user's. The plan runs until the youngest
      member is 90, so rows can pass your age 90 when the spouse is younger.
      Withdrawals start when the later spouse retires; each member
      contributes until their own retirement age. `contributions.ts`,
      `retirementIncome.ts`, `drawdown.ts`, `incomeBreakdown.ts`,
      `netWorth.ts`, `fundingGap.ts` and `feasibility.ts` all go through
      this model; `RetirementIncomeEstimate` gained `members` and
      `householdRetirementAge`, and the feasibility result a `spouseAge`.
- [x] H4. Spouse supplement. The ₪924/month supplement goes to a member
      whose own pension is included, eligible and above 0, when the other
      spouse has no pension of their own. It starts at the later of the
      recipient's claim age and the date the spouse stops working or
      reaches the exempt age (woman 67, man 70), and ends when the spouse's
      own pension starts. Income-supplement hint uses the ₪6,912 couple
      guarantee.
- [x] H5. UI + i18n (en/ru/he). Spouse section in the Personal step (shown
      when married; the rest waits for the spouse's age), an owner select on
      the account form and an owner / "not counted" badge on account cards,
      one Bituach Leumi block per spouse (with the supplement note), a
      "both of you retire together" line on the feasibility card, the
      spouse's age beside each timeline segment, and household notes under
      the Dashboard chart and on Projections.
- [x] H6. Tests: 192 total, all green (new `household.test.ts`,
      `normalizeProfile.test.ts`; spouse cases in the Personal step,
      Pension & savings step, Dashboard and Projections tests). Checked in
      the browser in English and Hebrew (RTL).

## Phase I — Phase 3: tax module (gross → net retirement income)

Tax constants were cross-checked first against secondary sources (gov.il
returned 403; see `docs/plan.md` → "Open Items" item 3). Design decision:
tax is applied **after** the level-gross plan is solved, per person per
year; net income = gross − tax, and the net figure drives the funding gap
and feasibility.

- [x] I1. Rates. `domain/taxRates.ts` holds the 2026 `TAX_RATES` (monthly
      brackets, credit point ₪242, default 2.25 / 2.75 credit points,
      surtax, 25% capital-gains rate, Section 9A exemption and severance
      offset) with an `ratesAsOf` date and source link for the UI.
- [x] I2. Tax engine. `domain/tax.ts` computes a person's annual tax from
      pension income, capital gains and credit points: progressive
      brackets, credit points, the Section 9A exemption from the statutory
      age, the 3% surtax (plus 2% on capital income) and the 25% real-gain
      rate. All amounts are in today's money.
- [x] I3. Net income. `domain/netIncome.ts` (`estimateNetIncome`) runs the
      drawdown simulation with per-account holdings and cost basis, taxes
      each household member separately per year, and returns the yearly
      gross / tax / net plus the headline (the lowest after-tax year).
      `sources.ts` tags each source with its tax treatment; `drawdown.ts`
      tracks holdings and basis; `household.ts` supplies each member's
      credit points; `fundingGap.ts` compares net income with expenses.
- [x] I4. Profile. `SpouseData.creditPoints` (backfilled to `null` by
      `normalizeProfile()` — no Dexie bump). `null` means the default for
      the person's gender.
- [x] I5. UI + i18n (en/ru/he). Dashboard income KPI is now after tax and a
      new tax card shows gross, tax, net, the effective rate, what is and
      is not included, and the rates' date and source link. Projections has
      an after-tax income chart (net plus tax, stacked). Credit-point fields
      for you and your spouse (step 0.25) with helper text.
- [x] I6. Tests: 251 total, all green (new `tax.test.ts`,
      `netIncome.test.ts`, `drawdown.test.ts`; updated `sources`,
      `fundingGap`, Dashboard, Projections, Personal step and
      `normalizeProfile` tests). Checked in the browser in English and
      Hebrew (RTL).

## Phase J — Phase 3: retirement scenario comparison

Design decisions: the user picks any three retirement ages freely (not fixed
or editable offsets); the comparison is independent of the Early / Standard /
Delayed toggle, which keeps driving the charts. A spouse's retirement moves by
the same number of years from the age they entered (`resolveRetirementTiming`
semantics), not to the same moment (`retirementTimingAtAge`, used by the
feasibility solver), so the user's own entered age equals the Dashboard.

- [x] J1. `retirementTimingShiftedTo(profile, selfAge)` in
      `domain/household.ts`: the spouse's retirement age is their entered age
      (default 67) plus `selfAge` minus the user's entered age, never before
      their current age; no spouse for a single person.
- [x] J2. `domain/scenarioComparison.ts`: `compareRetirementAge(s)` returns
      per age the years from now, savings when the household starts drawing,
      gross / tax / net income (the lowest after-tax year, as on the
      Dashboard), the gap to desired spending and a status (`onTrack`,
      `shortfall`, `noTarget`); `defaultComparisonAges` (an early age up to
      five years before the standard one, the standard age and the Delayed
      age; always three different ages where the bounds allow) and
      `isValidComparisonAge` (from today, 50–80).
- [x] J3. UI + i18n (en/ru/he). `components/ScenarioComparison.tsx` on the
      Projections page: three `NumberField`s and a table (scrolls
      horizontally on mobile) with the user's entered age marked "Your
      plan", the spouse's age for a couple and an inline error and empty
      column for an invalid age. State is local, not persisted. Without
      desired expenses the gap rows are replaced by a prompt to enter them.
- [x] J4. Tests: 275 total, all green (new `scenarioComparison.test.ts`;
      `household.test.ts` timing cases; five comparison cases in
      `Projections.test.tsx`). Checked in the browser in English and Hebrew
      (RTL), single and couple; the "Your plan" column equals the
      Dashboard's net income and gap.

Not done in Phase J: a chart of the comparison, and saving the chosen ages in
the profile. Both were added in Phase K (K6).

## Phase K — Input guidance, single-person support and UI polish

Scope decisions (agreed with the user): the polish is **UI only**, so
number-changing modelling (real wage growth, a per-account salary override,
the study-fund deposit ceiling) stays out. "Mandatory" stays strict: only the
age and the desired retirement age block the user; every other field is
tagged "Recommended" or "Reference only", and untagged fields are optional
refinements with a default.

Field tiers (what the badge on each label means):

- **Required**: age, desired retirement age, and the spouse's retirement age
  once a spouse age is entered.
- **Recommended** (not blocking, but the result changes): gender, marital
  status, gross salary, the spouse's age / gender / salary, account product
  category / status / balance / contribution rates, expected retirement
  spending, equity quantity and price, and the study-fund dates (only for
  the study-fund category).
- **Reference only** (saved and exported, not used in any calculation yet):
  provider name, policy number, fund ID, legacy policy model, balance
  breakdown, insurance coverages, investment track and fees, annuity tax
  type, guaranteed payment months, Form 161D, current monthly expenses,
  equity category / ticker / company / custodian, the employer grant and
  ESPP sections, purchase date and cost basis, and the dates of non-study
  funds.
- **Untagged**: credit points, Bituach Leumi fields, other assets, the
  annuity override and factor, tax-exemption numbers, and the equity
  unrealized gain and tax rate.

- [x] K1. Audit of every input against the engine: what blocks, what has a
      default, what is only stored. Findings: nothing but the two ages was
      ever blocking; a missing gender silently applies the male defaults
      (state pension age 67, 2.25 credit points); a null account status
      gives no deposits; a married user without a spouse age silently gets a
      single-person plan; no desired spending gives no funding gap.
- [x] K2. `domain/inputGuidance.ts`: `findDataGaps(profile)` lists the
      optional details that would change the result (`retirementSpending`,
      `noSavings`, `spouseMissing`, `accountType`, `accountStatus`, `salary`,
      `spouseSalary`, `contributionRates`, `gender`, `spouseGender`), each
      with the My Data step that fixes it.
- [x] K3. Importance badges: `components/fields/FieldLabel.tsx`
      (`importance` prop on every field component and on `CollapsibleSection`)
      and `pages/MyData/FieldLegend.tsx` (a "Which fields matter?" legend on
      each step). Required fields also carry `aria-required`.
- [x] K4. Cross-reference IDs: `PensionAccount.policyNumber` (as printed on
      the annual statement) and `PensionAccount.fundId` (the fund / program
      ID, "mispar kupa"), both reference only, backfilled `""` in
      `normalizeProfile()`. The account card shows "Policy … · Fund …".
      The in-app help makes no claims about any government system.
- [x] K5. Dashboard: a "Improve your estimate" card
      (`components/DataGapsCard.tsx`) links each gap to its My Data step. With
      no desired spending the surplus/shortfall KPI (formerly "Funding Gap") shows "—" and the status
      banner is hidden instead of a misleading gap. The "accounts with no
      product type" note moved from the Access card into the gaps card.
- [x] K6. Charts and Projections: `charts/formatAxisMoney.ts` gives compact
      axis labels (₪950, ₪2.5k, ₪1.5M) on all charts; the chart SVG is
      forced left-to-right in `index.css` so Hebrew y-axis labels no longer
      overlap the axis; `charts/ComparisonChart.tsx` plots the compared ages
      against the desired spending; `FeasibilityCard` now also shows on
      Projections; the three compared ages are saved in
      `ProfileData.comparisonAges` (only once all three are valid, dropped
      by `normalizeProfile()` when malformed; `initialComparisonAges`).
- [x] K7. Single person: tests that a person with no partner (no marital
      status, single, divorced, widowed, or married without a spouse age)
      can finish with only the two ages and sees no spouse content on the
      Personal step, Dashboard or Projections, and that a leftover
      spouse-owned account is not counted.
- [x] K8. Tests: 336 total, all green (new `inputGuidance.test.ts`,
      `formatAxisMoney.test.ts`; additions to `scenarioComparison`,
      `normalizeProfile`, Dashboard, Projections, Personal and Pension step
      tests). Checked in the browser in English and Hebrew (RTL): badges,
      legend, ID fields, gaps card, all four charts, and a minimal
      ages-only profile.

Not done: an empty-plan net-worth chart still shows a 0–4 axis (Recharts'
default for all-zero data); harmless, left as is.

## Phase L — Tax refinements: exemption schedule and early-retirement health tax

Scope chosen with the user: only the two refinements whose numbers could be
confirmed. Left out on purpose: a credit-points breakdown helper (the total
is already editable), tax-aware withdrawal splitting between spouses (needs a
drawdown-engine rework), the gemel-to-annuity exemption, and Bituach Leumi
contributions.

- [x] L1. **Exemption by calendar year.** `taxRates.ts` replaces the single
      fixed share with `qualifyingAnnuityFixedExemptionSchedule`: 22% (2025),
      22.5% (2026), 27.5% (2027), 32% (2028 onward), plus the 35%
      conditional share, so the total is 57% / 57.5% / 62.5% / 67%.
      `tax.ts` gains `fixedExemptionRate(year)`, `totalExemptionRate(year)`
      and a `taxYear` input; `qualifyingAnnuityExemption` takes the year.
      A year after the schedule keeps the last rate. The ceiling (₪9,430) and
      a user-entered exemption allowance stay flat in every year.
- [x] L2. **One clock source.** `Household.baseYear` (and
      `NetIncomeEstimate.baseYear`) is the calendar year the plan counts
      from. `buildHousehold(profile, timing, baseYear = new Date().getFullYear())`
      is the only place the clock is read for the plan, and it also feeds
      `estimateBituachLeumiPension`. `netIncome.ts` taxes each row in
      `baseYear + yearsFromNow`. `src/test/setup.ts` pins `Date` to
      2026-06-15 (only `Date` is faked, so timers and `waitFor` still run),
      so tests do not change when the year does.
- [x] L3. **Health tax on an early pension.** Before the statutory retirement
      age, pension-taxed income bears health tax: 3.23% up to ₪7,703 a month
      and 5.17% above (verified on btl.gov.il, 2026-10-27). New
      `PersonTaxInput.beforeStatutoryAge` (named `healthTaxApplies` in this
      phase), `PersonTax.healthTaxMonthly`
      (included in `totalMonthly`, not in the surtax base) and
      `earlyPensionHealthTax()`. From the statutory age no health tax is
      charged (secondary source). A man retiring at 62 with a ₪17,857
      pension now pays ₪2,917 a month instead of ₪2,143 until 67.
- [x] L4. **UI.** `TaxCard` shows the exemption of the plan's base year and
      the rise to 67% from 2028 (from 2028 on it shows the plain text), a
      health-tax line, and a shorter "not included" list. Strings in
      English, Hebrew and Russian (`includedExemptionRising`,
      `includedHealthTax`, `notIncluded`).
- [x] L5. **Tests:** 351 total, all green (new schedule, health-tax and
      calendar-year tests in `tax.test.ts` and `netIncome.test.ts`; figures
      moved in `fundingGap`, `sourceAccess` and Dashboard tests because early
      retirees now pay health tax).
- [x] L6. **Docs:** `docs/constants-to-verify.md` has rows 15-16 (schedule)
      and 18-20 (health tax), rules I-M, and two log lines. The 2026 step of
      only +0.5 points (22% to 22.5%) looks odd and is the first thing to
      check.

Not modeled (documented as conservative): the health-tax exceptions
(survivors' allowance, disability of 75% or more, a non-working married
woman with an insured husband), the health-tax income cap, health tax on
non-pension income before the statutory age, and Bituach Leumi contributions
of early retirees. Behavior change: profiles that retire before the
statutory age now show lower after-tax income.

## Phase M — Section 102 employer stock tax

Triggered by the user's employer plan supplement (Israeli equity awards under
the Section 102 capital-gains route). Before this phase the engine ignored
`employerGrantDetails`: every holding sat in one `other-investments` source
taxed at a flat 25% on the declared gain, so employer shares defaulted to no
tax at all.

- [x] M1. **Routing (`sources.ts`).** Holdings with
      `investmentCategory === "employerGrantedStock"` leave the
      `other-investments` bucket by tax route (`employerStockRoute`):
      `section102Capital` (a missing track counts as this), `ordinaryIncome`
      (the ordinary-income track, or a capital-route grant that is too
      recent: a disqualifying disposal), or `nonTrustee` (Section 3(i)).
      The 24 months are met when the user ticks the trustee box, the grant
      date is missing, or retirement is at least 24 months after it
      (`taxRates.ts`: `section102HoldingPeriodYears`).
- [x] M2. **Sources.** New `employer-stock-section-102` source
      (`capitalGains`, cost basis 0, new `ordinaryLayer` = Σ min(grant-date
      value, current value)) and `employer-stock-ordinary-income` source
      (new `ordinaryIncome` tax treatment). Both are emitted only when their
      value is above zero and keep `kind: "otherInvestments"`, so the income
      breakdown, timeline and access card are unchanged. Section 3(i) shares
      stay in `other-investments` with the grant value as cost basis.
      `profileBasics.ts` gains `holdingValueIls`.
- [x] M3. **Drawdown.** `DrawdownHolding.ordinaryFraction`: 1 for ordinary
      income, `layer / balance` for a Section 102 source, else 0. The layer
      stays fixed while the balance grows (growth above it is a capital gain),
      shrinks pro rata with withdrawals, and is zeroed if an annuity starts.
      `gainFraction = 1 - basis / balance - ordinaryFraction`.
- [x] M4. **Tax.** `PersonTaxInput.ordinaryInvestmentMonthly`. It is stacked
      on the taxable pension for the brackets (credit points applied once),
      with no pension exemption and no health tax. It counts toward the 3%
      surtax; the extra 2% stays on the capital-gain part.
      `netIncome.ts` sums it per member and passes it in.
- [x] M5. **UI.** The grant section of the equity form explains how the data
      is used, marks the grant date, tax track and share price as
      "recommended", and relabels `costBasisAtGrantUSD` to "Share price at
      grant" (per share, with a helper text). `TaxCard` takes
      `hasEmployerStock` and then adds a Section 102 line and a "not
      included" line. Strings in English, Hebrew and Russian.
- [x] M6. **Tests:** 377 total, all green (12 in `sources.test.ts` for routing
      and the holding period, 5 in `drawdown.test.ts`, 4 in
      `netIncome.test.ts` with hand-computed figures, 5 in `tax.test.ts`).
      `buildTestProfile`'s `equity` entries take an `employerGrant` option.
- [x] M7. **Docs:** `docs/constants-to-verify.md` rows 21-25, rules N-Q and a
      "not modeled" paragraph. The rules come from the employer's supplement,
      not the Tax Authority, so they are marked Medium.

Not modeled (conservative or by design): the 30% rate for a holder of
10% or more, unvested shares, options with a strike
price (acquisition cost is taken as 0), ESPP (still taxed as any other
investment), and inflation or currency adjustment of the grant value.
Bituach Leumi and health contributions on the ordinary part and separate
vesting dates were added in Phase N below.
Behavior change: profiles with employer shares now show tax on them, so
their after-tax income is lower than before.

## Phase N — Section 102 follow-ups: contributions, vesting batches, constants check

The user asked to continue with Bituach Leumi on the Section 102 ordinary
part, ESPP and strike-price options, vesting tranches and a check of the
constants, then narrowed the scope to **only what applies to RSUs**. ESPP and
strike-price options stay out of scope.

- [x] N1. **Contributions on the ordinary part.** `taxRates.ts` gains
      `nationalInsuranceReducedRate` (1.04%), `nationalInsuranceFullRate`
      (7%) and `contributionCeilingMonthly` (₪51,910), read on btl.gov.il on
      2026-10-27. `tax.ts` gains `employerShareContributions`: the ordinary
      slice is stacked on the early pension, only the part below the ceiling
      pays, and the reduced rates apply up to ₪7,703. Health tax is due at
      any age, Bituach Leumi before the statutory retirement age (the label of
      the retirement-age row was lost in extraction, so this is interpreted).
      `PersonTax.nationalInsuranceMonthly` is new, `healthTaxApplies` became
      `beforeStatutoryAge`, and the TaxCard lists the new line (en/he/ru).
- [x] N2. **Vesting batches.** `VestingTranche` (`vestDate`, `quantity`,
      `grantPriceUSD`) and `EmployerGrantDetails.vestingTranches`;
      `normalizeProfile` fills the list. `sources.ts` routes by lot:
      `stockRoute` (shared by `employerStockRoute`) and `employerLots` give
      each batch its own acquisition date, 24-month test and price at grant,
      and the shares not covered by a batch follow the holding's own grant
      date. Batches only split the tax route, so net worth and the drawdown
      are unchanged. A batch total above the holding's quantity is scaled
      down; an undated batch counts as met; a batch vesting after retirement
      is ordinary income. `EquitySplit.nonTrustee` carries Section 3(i) value
      and grant value, and `grantValueIls` was removed. The vest date as the
      start of the 24 months is **interpreted** from the supplement.
      **Superseded in R3:** the 24 months now count from the grant date for
      every lot (reported by the user), batches also drive net worth and the
      drawdown, and a batch vesting after retirement is forfeited unless the
      grant keeps vesting. See "R3 notes".
- [x] N3. **UI.** `pages/MyData/VestingTranchesEditor.tsx` (add/remove rows,
      date, quantity, optional price, a warning when the batches exceed the
      quantity) replaces the unused vested/unvested quantity fields in
      `EquityHoldingForm.tsx`. Strings in en/he/ru under
      `myData.steps.equity.tranches`.
- [x] N4. **Tests:** 396 total, all green (9 batch tests in
      `sources.test.ts`, 1 in `normalizeProfile.test.ts`, 2 in the new
      `EquityStep.test.tsx`, contribution tests in `tax.test.ts` and
      `netIncome.test.ts`).
- [x] N5. **Constants check.** Rows 14-16 (9A exemption) confirmed from the
      Tax Authority's guideline letter of 2 Feb 2026 (read at a payroll
      company's mirror). Rows 1-6, 10-13 match PwC's Israel tax summary (last
      reviewed 29 Jun 2026); rows 7-9 agree across secondary sources; rows
      26-28 (contributions) are new and verified on btl.gov.il. Gov.il,
      taxes.gov.il and kolzchut still refuse automated requests, so the Tax
      Authority's own tables were not read, and row 17 (severance offset) is
      still unchecked. No code value changed.
- [x] N6. **Docs:** `docs/constants-to-verify.md` (rows, rules I, J, N-Q, the
      "not modeled" lists and the log), `docs/SESSION-HANDOFF.md`, `docs/plan.md`.

Still not modeled: the 30% rate for a holder of 10% or more, options with a
strike price, ESPP, unvested shares, deducting employee contributions from
taxable income, and inflation or currency adjustment of the grant value.
Behavior change: profiles with Section 102 shares now show health tax (and
Bituach Leumi before the statutory age) on the ordinary part, so their
after-tax income is a little lower.

## Phase O — Pension Clearing House import

The user ordered a consolidated report from the Pension Clearing House
(swiftness.co.il), analysed its files (`docs/clearing-house-import-analysis.md`,
which holds the schema, code tables, mapping and the deviations of the built
importer) and asked for an importer: instructions on how to get the report, a
zip upload, and a password prompt.

- [x] O1. **Domain** (`domain/clearingHouseImport/`, pure TypeScript):
      `readFiles.ts` (a zip with a password, or plain XML; limits of 50 files,
      25 MB per entry and 100 MB in total; non-XML entries ignored),
      `xmlTree.ts` (DOM-free tree; nil, empty and absent leaves alike),
      `codes.ts` (the official code tables), `mapReport.ts` (report to
      `ImportedAccountCandidate[]` with a confidence per value, skipped records,
      personal suggestions and localized warning codes), `matchAndApply.ts`
      (matching to existing accounts, diffs, default selection, `applyImport`),
      `errors.ts` (`ClearingHouseImportError` with a code per failure).
- [x] O2. **UI** (`pages/ClearingHouseImport/`, route `/import/clearing-house`,
      "Import report" button on the Pension & savings step): instructions and a
      link to the site, file picker with drag and drop, password prompt (wrong
      password reported separately, field cleared after each attempt), a review
      screen (whose report is it, personal details, one card per account with a
      per-field tick, a confidence and a diff badge, warnings, skipped
      records, the provider's own projection shown for comparison) and a
      done screen.
- [x] O3. **i18n:** `clearingHouse` section in en, he and ru (104 keys, same
      keys and placeholders in all three).
- [x] O4. **Tests:** `mapReport.test.ts` (79), `matchAndApply.test.ts`,
      `importFlow.test.ts`, `readFiles.test.ts` (ZipCrypto and AES),
      `reviewState.test.ts`, `ClearingHouseImportPage.test.tsx` (end to end with
      an invented zip: password, wrong password, partner, update-vs-new,
      skipped records, no ID on screen) and the entry link. All fixtures hold
      invented values; a gitignored `*.local.test.ts` runs the real files from
      `CH_REAL_DIR` and writes only counts to `CH_OUT`.
- [x] O5. **Dependency:** `@zip.js/zip.js` 2.24.0, lazy-loaded (its own 217 kB
      chunk, workers off). **`package.json` and `package-lock.json` were edited
      by hand** because the sandbox's npm proxy returned 404 for the tarball;
      re-run `npm install` where the registry is reachable to confirm the
      lockfile.

Not imported on purpose: the pre/post-2008 and section-190 balance split.
Uncertain values and values that would overwrite the user's own start
unticked. (The annuity was first left out too; O7 adds it.)
Behavior change: none for existing data; the import only writes what the user
ticks.

- [x] O6. **Per-account salary base (audit of a real import).** Auditing the
      first real import showed the engine applied one personal salary to every
      active account, although each policy has its own salary (two employment
      lines, and a study fund covering both), overstating deposits by about two
      thirds.
      Added `AccountContributions.monthlySalaryBase` (empty = personal salary;
      old data is filled by the existing merge defaults, no migration).
      `monthlyContributionForAccount` and `contributionSalaryBase` use it; the
      importer reads `SACHAR-POLISA` into it (new review field); the account
      form has a field for it (en, he, ru); `findDataGaps` no longer asks for
      the personal salary when every contributing account has a base. Tests:
      engine (own base, fallback, zero, frozen, mixed salaries), importer
      (imported, per account, not for frozen / no salary / zero rates),
      `applyImport`, data gaps, profile import and the form. Details in
      `clearing-house-import-analysis.md` section 6.2.1.

- [x] O7. **Annuity import (second finding of the same audit).** Without an
      annuity the engine treated every pension fund and managers insurance as
      capital. The report states the projections the provider itself makes, so
      the importer now turns the one nearest the user's retirement age into
      annuity fields (`clearingHouseImport/annuity.ts`, applied in the review
      stage because the mapper does not know the retirement age):
      old pension funds get `estimatedMonthlyAnnuity` (the projected pension);
      policies with `MEKADEM-MOVTACH-LEPRISHA` get that factor and
      `hasGuaranteedFactor`; new pension funds and newer managers insurance get
      the implied factor (accumulation ÷ monthly pension), derived. A figure
      from another age, or a factor outside 100 to 300, starts unticked.
      **Engine:** a pension fund now uses its conversion factor even when it
      is not marked guaranteed; managers insurance still needs the flag, and
      the review card says so. Shared `CONVERSION_FACTOR_MIN/MAX` replace the
      form's literals. Texts updated in en, he and ru (helper, projection
      note, done reminder, yes/no, the not-guaranteed note). Tests: mapper
      (projection shape, implied and guaranteed factors, basis per product),
      `annuity.test.ts`, `applyImport`, diff rules, the engine rule and an end
      to end page test. Existing users re-import the zip to get the new fields;
      matched accounts show them as "fills an empty field".
      Open: whether the report's projections are real or nominal. They are read
      as today's money, like the rest of the engine.

- [x] O8. **Policy number kept even when it equals the holder's ID** (the user
      wants to compare the app with the offline PDF statements; for a new pension
      fund the report's "policy number" is the holder's ID). It is stored on this
      device only, flagged in review (`policyNumberIsHolderId`), never a
      distinctive matching key, and redacted from the verification pack
      (Phase P) behind an alias; the redaction key file maps it back. The
      separate `fundId` and the plan name are still not imported. Tests in
      `mapReport.test.ts` and `matchAndApply.test.ts`; texts in en, he and ru.

- [x] O9. **Sample report and "whose report is it" check.**
      *Sample:* `public/sample/sample-clearing-house-report.zip` (six invented
      XML files for one made-up person, no password) ships with the app. A
      "Try the sample report" button on the first screen loads it; the review
      and done screens carry an amber **SAMPLE** banner. It is parsed as of a
      fixed date so the age does not drift, never matches or updates the
      user's own accounts, and when the plan already has data it is added only
      after a confirmation tick, with no personal field pre-ticked.
      *Different person:* `ownerCheck.ts` compares the report's gender and age
      (tolerance 2 years) with the chosen owner's details, and checks whether
      the report's policies are already saved under the other person. Any
      mismatch shows an amber panel and keeps Apply disabled until the user
      ticks "I confirm this is my report" (or "my partner's"). When the report
      fits the partner better than the user, the owner starts as the partner.
      Several holder IDs in one report give a soft `multipleHolders` warning.
      Holder IDs are compared in memory only and are never shown, stored or
      exported. A partner's accounts imported while the user is not married
      show a note that they are saved but not counted. Tests:
      `ownerCheck.test.ts` (12) and `ClearingHouseImportPage.test.tsx`
      (owner check, partner suggestion, sample, a parse of the shipped zip).
      *(The `multipleHolders` warning and the "IDs never stored" rule were
      replaced in O11.)*

- [x] O10. **Me | Partner tabs on Personal and Pension & savings.** The two people's
      data used to share one list (with an owner chip per row) and one form. Now:
      *Pension & savings* has a tab per person (`PersonTabs.tsx`, ARIA tablist, arrow
      keys, RTL-aware, brand colour for the user and indigo for the partner). Each tab
      shows that person's summary table, accounts, Add button (owner preset to the active
      tab) and Clearing House import link (`/import/clearing-house?owner=spouse`).
      Tabs appear when the user is married or any account is owned by the partner. A
      partner tab of a not-married user shows one amber "saved but not counted" note
      instead of a chip per row. The household total sits above the tabs; other assets,
      equity, expenses and assumptions stay household-level (no tabs).
      *Personal* shows a Me | Partner switch when married: own fields on Me, the spouse
      section on Partner (age, gender, retirement age and so on). A single user sees a
      note that only married couples share calculations; a married user sees what the
      household total includes. On an invalid Next the tab with the error gets a "!"
      badge and the view jumps to it (own details first).
      *State:* the selected person lives in `ActivePersonProvider` (in `MyDataLayout`),
      with a local-state fallback so a step also works standalone. `?person=self|spouse`
      opens a step on a tab; `?owner=` presets the import owner and the done button
      returns to the matching tab. The owner dropdown now says "Partner" (was "My
      spouse") to match the tabs. Removed texts: `ownerNotCounted`,
      `summary.pensionNotCountedNote`. Tests: `PersonTabs.test.tsx` and tab-aware
      cases in `PensionSavingsStep`, `PersonalStep`, `SummaryTables` and
      `ClearingHouseImportPage` tests.

- [x] O11. **Who the report is about: first name, age and a person fingerprint.**
      The importer used to ignore the customer block (`YeshutLakoach`) entirely.
      Now it reads the first name, family name, birth date and ID number from it,
      in memory, for three things (analysis doc, section 6.7):
      *One person per zip:* products whose blocks describe different people are
      detected (`reportPeople.ts` `samePerson`: the ID decides when both have one,
      ignoring leading zeros; otherwise name and birth date decide). The review
      screen then asks for an explicit tick. This replaces the soft
      `multipleHolders` warning.
      *Recognising the person:* each person gets up to two one-way fingerprints
      (PBKDF2-SHA-256, 100k iterations, fixed salt) of the ID and of
      first name + family name + birth date. A later report that shares one is the
      same person: the owner is suggested and the age, gender and "looks like the
      other person" concerns are dropped. Reports saved under the other owner, and
      reports of someone else, raise the existing different-person confirmation.
      *Showing where data came from:* `pensionSavings.reports` keeps one record per
      import (owner, fingerprints, **first name**, **age at import**, report date,
      import date); each account has a `reportId` (`null` = added manually). My
      Data shows it in a Source column of the accounts table (shown on each card
      until O12). The record goes when its
      last account does, and a re-import that replaces an earlier report's accounts
      replaces its record.
      *Not stored:* the ID, family name and birth date. *Caveat, stated in the
      docs:* a fingerprint of a 9-digit ID is a pseudonym, not anonymisation (about
      10^8 values), and the first name is clear text in the profile export. The
      verification pack redacts all of it. Profiles saved before this change load
      with no report records and no account linked to one, so their accounts read
      "Added manually" even if they came from an import.
      *Sample:* its record is marked `sample` with no fingerprints, so it is never
      recognised and never counts as another person; the sample zip now carries a
      first name and family name (דנה לדוגמה). The privacy text (en, he, ru) says
      what is kept. Tests: `reportPeople.test.ts`, `reportSource.test.ts`,
      `ownerCheck.test.ts` (recognition), `matchAndApply.test.ts` (record,
      pruning), `normalizeProfile.test.ts`, `PensionSavingsStep.test.tsx` (source
      labels) and the page tests (person line, stored record, recognition,
      different person); verification pack privacy test covers the new fields.
      Suite: 899 passed, 1 skipped.

- [x] O12. **One table per list: edit, remove, add and import on the table.** My
      Data used to show every account or holding twice: in a read-only summary
      table and again as a card with Edit and Remove. The cards are gone
      (`PensionAccountCard.tsx`, `EquityHoldingCard.tsx` deleted).
      *Row actions:* `SummaryTable` takes `rowActions`, which adds a last column
      with Edit and Remove (`RowActions.tsx`). The column stays in view when the
      table scrolls sideways (`sticky end-0`, so it is on the left in Hebrew) and
      has a screen-reader-only header ("Actions"). Each button names its row for
      screen readers (`aria-describedby` points at the row's first cell), so a
      reader hears "Edit, Menora Pension · Policy 123". `SummaryTable` also takes
      `toolbar` (heading row) and `emptyMessage`, and the "Summary only … use the
      cards below" hint is removed.
      *Pension & savings:* one heading ("My accounts", "Partner's accounts" or
      "Pension & savings accounts") with the Import link and the Add account button
      on its right, then the table. Both buttons follow the open Me | Partner tab.
      With no accounts the table is replaced by the Clearing House explanation and
      the "no accounts yet" text; with accounts, one hint line under the table
      (`clearingHouse.entryHint`) says what Import does.
      *Equity:* the step renders its own heading and Add holding button, then the
      per-category tables (with the actions column), the total across categories
      and the exchange-rate control, then the Back / Next footer (O13 moved the
      legend into the forms).
      `MyDataLayout` no longer renders the equity table or the legend for this
      step. The category tables keep their "at a glance" titles.
      Removed texts: `myData.summary.pensionTitle` and `readOnlyHint` (en, he,
      ru); new: `myData.summary.actions` and `clearingHouse.entryHint`.
      Tests: `SummaryTables.test.tsx` (actions per row, which row an action acts
      on, toolbar above the table, empty states),
      `PensionSavingsStep.test.tsx` (source labels now once, in the table).
      Suite: 901 passed, 1 skipped. Behavior change: none to any calculation or
      stored data.

- [x] O13. **The field legend moves into the account and holding forms.** The
      "Which fields matter?" card no longer sits under the Pension & savings and
      Equity tables. Each form (`PensionAccountForm`, `EquityHoldingForm`) shows
      it instead, as one folded line pinned under the form title and outside the
      scrolling part, so it stays in view while the user scrolls the fields. The
      line reads "Which fields matter?" with the three badges and a chevron (the
      badges are hidden on a narrow screen); a click opens the full explanation
      and it is closed again each time a form opens. It is drawn as a tinted
      callout (light-blue fill and border, an "i" icon, white badge pills,
      `ImportanceBadge onTint`) so it stands apart from the white fields below.
      `FormModal` takes an optional
      `note` for such a pinned line; `FieldLegend.tsx` gains
      `CollapsibleFieldLegend` and shares the list with the card. The other My
      Data steps (Personal, Expenses, Assumptions) keep the card under the
      stepper. No new texts. Tests: `SummaryTables.test.tsx` (no legend on the
      step page, folded by default, opens and closes, outside the scrolling part,
      calculation or stored data.

- [x] O14. **Expenses tab: retirement spending, as one total or an itemised
      list.** The user decided that today's spending is not needed, only what
      they expect to spend in retirement ("I don't think we need today expenses
      for calculations"). Research input: `israel_retirement_household_expenses.md`.
      *Model:* `ExpensesData = { mode: "totals" | "detailed", retirementMonthly,
      items }`. The old `currentMonthly` field is gone from the type and the
      screen; `normalizeExpenses` drops it from old saved profiles and repairs
      bad items. An `ExpenseItem` has id, optional `catalogKey`, name, category
      (10), one amount (expected cost in retirement, today's money), frequency
      (monthly, bimonthly, quarterly, yearly, every N years), `everyYears`,
      necessity (essential or discretionary) and notes.
      *Domain:* `domain/expenses.ts` (`monthsBetweenPayments`,
      `monthlyEquivalent`, `expenseTotals` = essential + discretionary + total,
      `desiredRetirementMonthly`). Totals mode uses `retirementMonthly`; detailed
      mode uses the full itemised total (essential + discretionary), rounded; an
      empty list gives null and does NOT fall back to the typed figure. The
      essential-only total is shown as the "minimum budget" for information
      only. All consumers (`feasibility`, `fundingGap`, `scenarioComparison`,
      `netWorth`, `inputGuidance`, `ScenarioComparison`) now call
      `desiredRetirementMonthly`. `domain/expenseCatalog.ts` holds 63
      suggestions with no amounts (typical frequency and necessity) and
      `itemFromSuggestion`; a suggested item keeps an empty name, so the screen
      shows the catalog name in the active language (typing a name overrides it).
      *UI:* `ExpensesStep` (mode switch; totals field, or the planned-spending
      box, toolbar and per-category `ExpenseItemsTable`s), `ExpenseItemForm`,
      `ExpenseSuggestionsModal` (tick rows, optional amount, items already in
      the list are disabled), `expenseLabels.ts`. The typed total is kept when
      switching modes and ignored in itemised mode. The step shows no "Which fields
      matter?" card (it has at most one tagged field, explained by its helper text),
      and the mode question is a block label above the switch. Not done (deferred): items
      that only apply in an age range.
      *Verification pack:* item names and notes are redacted (aliases
      `expense1…`); `catalogKey` is redacted too; the funding-gap trace input
      comes from `fromDerived` in itemised mode.
      Texts: `myData.steps.expenses.*` in en, he and ru (plural forms for
      "every N years"); `currentMonthly` removed.
      Tests: `expenses.test.ts`, `expenseLocales.test.ts` (catalog and enum keys
      exist in all three languages), `normalizeProfile.test.ts`,
      `verificationPack.test.ts`, `ExpensesStep.test.tsx`. Suite: 955 passed, 1
      skipped. Behavior change: the plan no longer reads the old current-expenses
      figure (it was only used as a fallback before).

## Phase P — Calculation trace and verification pack
The user asked for a way to validate the app's calculations: "traces of all
calculation steps to be exportable for debugging and may be used validation by
independent AI sessions offline". Design and usage: `docs/calculation-trace.md`.

- [x] P1. **Trace core** (`domain/trace.ts`): a module-level, synchronous
      context (`runTraced`), a no-op when off, lazy step builders, scope-path ids
      (`#n` for a repeat), provenance (`profile:`, `step:`, `const:`,
      `derived:`), tables, and one engine clock (`engineNowMs`,
      `engineCurrentYear`, `withEngineClock`) so that "now" is the same for the
      traced run and the untraced figures beside it.
- [x] P2. **Instrumentation of the whole chain**: `sources`, `bituachLeumi`,
      `household`, `retirementIncome`, `drawdown`, `tax` (`recordPersonTaxSteps`),
      `memberTax`, `netIncome` / `netIncomeTrace`, `fundingGap`. One traced
      `calculateFundingGapForTiming` covers everything (about 215 to 255 steps).
      Results are unchanged with tracing off (a test compares both).
- [x] P3. **Self-check** (`traceCheck.ts`): evaluates every `expr`, follows every
      `step:`, `profile:` and `const:` link, nine issue kinds, with a tamper test.
      `traceConstants.ts` snapshots every tax, National Insurance and access-rule
      constant.
- [x] P4. **Verification pack** (`verificationPack.ts`, `verificationGuide.ts`,
      `verificationRedaction.ts`): a target (scenario or age), the traced run, the
      displayed figures (funding gap, earliest feasible age, age comparison, gap
      for every retirement age), `roundingSteps`, the auditor guide and prompt.
      **Privacy:** an allow-list redaction (numbers, enums and dates are kept, other
      text becomes `[redacted]`), ids aliased to `acctN` / `holdingN` /
      `trancheN`, a separate local-only redaction key, and a leak check that
      throws `VerificationPackLeakError` (locations only) before anything is
      exported.
- [x] P5. **UI:** Settings, "Calculation verification" (`components/VerificationExport.tsx`):
      scenario or age picker, export of the pack, then the key; privacy
      warning ("redacted is not anonymous"); en, he and ru.
- [x] P6. **Tests:** `trace.test.ts`, `traceCheck.test.ts`, `tracePipeline.test.ts`,
      `verificationPack.test.ts`, `VerificationExport.test.tsx`; invented data only.
      Run on a real exported profile (locally, counts only): all four targets
      build, no leak, no self-check issue.

Behavior change: none. Tracing is off during normal use.
Open: the pack proves the arithmetic and the sources, not that a formula is the
right rule (the reviewer's Part B); a `fromLatestStep` fallback to `derived:` is
not flagged by the self-check.

## Phase Q — Read-only summary tables on My Data

The user asked for "readonly summary tables for sections like 'Pension & Saving'
and 'Equity & Investments'", in addition to the ways of adding items and
importing the clearing-house report, and above the "Which fields matter?" card.

- [x] Q1. **Placement:** `MyDataLayout` renders the table for the current step
      between the stepper and `FieldLegend`; the step components, cards, Add,
      Import, Edit and Remove are unchanged. No table appears on the other steps,
      or while a step has no items.
- [x] Q2. **Pension & Savings** (`PensionSummaryTable.tsx`): one row per account
      with provider (and policy / fund reference), product category, owner (only
      when the owner is shown on the cards), status, balance, employee, employer
      and severance rates, fee from accumulation and estimated monthly annuity;
      a balance total from `aggregatePensionBalance`, so it matches the plan. A
      spouse's account that is not yet counted is flagged and left out of the
      total, with a note.
- [x] Q3. **Equity & Investments** (`EquitySummaryTable.tsx`): ticker and company,
      category, custodian, quantity, price, value in USD and in ILS, with totals
      and a note on the fixed exchange rate (`holdingValueIls`, now exported from
      `domain`). Phase S replaced the single table with one table per category.
- [x] Q4. **Shared pieces:** `SummaryTable.tsx` (read-only table with a totals row,
      scrolls sideways on a narrow screen, figures in `dir="ltr"` so they read the
      same in Hebrew) and `summaryFormat.ts`. Texts under `myData.summary` in en,
      he and ru; the column headers reuse the existing field labels.
- [x] Q5. **Tests:** `SummaryTables.test.tsx` (invented data only): rows and
      totals, order above the legend, read-only, spouse counted / not counted, owner
      column hidden for a single person, no table when empty or on another step.

Behavior change: none to any calculation.

### Research note: foreign-stock capital gains (no code)

The user shared a research document on Israeli capital gains tax for foreign
stocks (FIFO lots and USD/ILS rates). Checked on 2026-10-30 against accountant
write-ups and the 2002 Income Tax Regulations; recorded as rules R-T and log
rows in `docs/constants-to-verify.md`. The "lower of nominal shekel gain and
dollar gain at the sale-date rate" rule and FIFO are confirmed; the transitional
rates for purchases before 2012 are not. The app uses only the user-entered USD
gain × 3.7, keeps no purchase lots and does not use `averageCostBasisUSD` or
`purchaseDate`. The user chose to record the rules only, so nothing was built.

### Research note: investment gemel (no code)

Checked on 2026-10-30 against three advisory sites (Kol Zchut and gov.il returned
403); recorded as rule U and a log row in `docs/constants-to-verify.md`. A lump
sum pays 25% of the real gain at any age, with no exemption at 60. Only a
monthly life annuity taken from 60 through a paying fund is tax-free. No source
describes a 0% route before 60, and the rule does not vary by fund or program.
The 2026 deposit ceiling is ₪83,641. The app keeps treating the fund as 25% of
the real gain at any age; the annuity route was not modeled then. Bridge Planner R7 now models
it as an opt-in per account (see "R7 notes").

## Phase R — Bridge Planner (R1–R7 built; R2b deferred)

Proposal for the early-retirement bridge: which source to use first, what each
costs and what leaving early does to unvested RSUs. Full design, build order
and open questions: [`docs/bridge-planner-design.md`](bridge-planner-design.md).
The user reviewed the design and asked to start; its open questions in section 7 are asked
one at a time, before the step that needs each (1 for R5, 2 for R4, 3 and 4 for R3, 5 for R7).
All of them are answered.

- [x] R1. Liquidity ladder (read-only, no new inputs). See "R1 notes" below.
- [x] R2. Withdrawal order in `drawdown.ts`, strategy comparison card and a saved choice.
      See "R2 notes" below. The pooled investments source is **not** split (see the notes).
- [x] R3. RSU schedule generator, "keeps vesting after leaving" flag, vest-aware
      retirement date and "cost of leaving early". See "R3 notes" below. Questions
      3 (forfeiture) and 4 (24 months) of the design doc are answered.
- [x] R4. Purchase lots (private and ESPP) with an effective cost basis (rule R). See
      "R4 notes" below. Question 2 (ESPP basis) of the design doc is answered.
- [x] R5. Per-source cost table (tax per ₪100 net, what you give up). See "R5 notes" below.
      Question 1 (cost definition) of the design doc is answered: two columns only.
- [x] R6. Stress tests (employer-stock haircut, USD/ILS move). See "R6 notes" below. The sizes
      are fixed rows, as the user chose; there is no open question in the design doc for it.
- [x] R7. Investment-gemel annuity route from 60 (rule U), as an opt-in tick box per
      investment-provident-fund account. See "R7 notes" below. Question 5 of the design doc is
      answered.

## Phase S — Simple purchase / grant entry and per-category summary tables

The user asked to help enter stock (ESOP, ESPP, private investment) in the "Stock /
equity holding" dialog: first just category, stock symbol, quantity, purchase or
grant date and share price; second, a separate summary table per category on
Equity & Investments. "Share price" is the price on the purchase or grant date;
the current price stays a separate field because it gives the holding its value.

- [x] S1. **Entry form** (`EquityHoldingForm.tsx`): category, ticker, quantity, the
      date and the price on that date, current price, total value; company and
      custodian below. The date and price are always shown. Before a category is
      chosen they have generic labels ("Purchase / grant date", "Share price on
      that date"); the entry is kept in all three categories' fields, and choosing a
      category (`categoryChangePatch`) moves it into that category's fields and
      clears the others, so changing the category later carries it over. Everything
      else (tax track, vesting batches, 24-month
      flag, ESPP discount and price paid, unrealized gain, tax rate) sits in one
      "More details" section per category, collapsed unless the holding already
      has a value there, so editing an existing holding still shows its settings.
- [x] S2. **No new fields, no calculation change.** `holdingEntry.ts` maps the
      date and price onto the existing fields, so the Section 102 and tax logic
      reads the same values as before:

      | Category | Date | Price on that date |
      |---|---|---|
      | ESOP / RSU | `employerGrantDetails.grantDate` | `costBasisAtGrantUSD` |
      | ESPP | `esppDetails.purchaseDate` | `fairMarketValueAtPurchaseUSD` (market price that day, before the discount; the price paid stays under "More details") |
      | Private | `personalPurchaseDetails.purchaseDate` | `averageCostBasisUSD` |

- [x] S3. **Per-category tables** (`EquitySummaryTable.tsx`): one read-only table each
      for ESOP / RSU, ESPP, private investments and holdings with no category;
      empty ones are hidden. Columns: ticker and company, custodian, quantity, date
      and price on that date (generic headers for uncategorised), current price,
      value in USD and ILS, with totals. When more than one table shows, a line gives the total
      across categories; the exchange-rate note appears once.
- [x] S4. **Tests** (invented data only): `holdingEntry.test.ts` (mapping, the
      no-category entry, `categoryChangePatch`, "has advanced details"),
      `EquityStep.test.tsx` (saving each category's date and price, entering them
      before a category and carrying them over, collapsed and auto-opened details),
      `SummaryTables.test.tsx` (per-category tables, totals, hidden empty ones,
      missing cells). The test fixture `buildTestProfile` gained `category`,
      `ticker` and `entry`.

Behavior change: none to any calculation. The entry is a single purchase or grant
(no lots): a second purchase is a second holding with its own current price.

Caveat: today only the ESOP / RSU price and date feed the tax result (grant price
in `employerLots`). For ESPP and private holdings the tax uses the hand-entered
unrealized gain and rate under "More details"; the entered purchase price and date
are reference only.

Open: derive a private holding's unrealized gain from (current − purchase price) ×
quantity instead of asking for it (would change the tax result); a field for sale
transaction expenses (Section 102 deducts them); one current price per ticker
instead of per entry; purchase lots (Bridge Planner R4).

## Phase T — Stock price data, ticker suggestions and price autofill

A daily job caches the S&P 500 price history as one JSON file per stock and publishes it
with the app. In the "Stock / equity holding" dialog the ticker suggests those stocks and,
once it is one of them, the app fills the price on the purchase or grant date, today's
price and the company name. Typed values always win. Design, the dividend-adjusted
finding and open items: [`docs/stock-price-data-design.md`](stock-price-data-design.md).

- [x] T1. **Data job** (`app/scripts/stock-data/`, run with `npm run stock-data`):
      downloads the Kaggle dataset zip, streams the CSV (RFC 4180 parser), writes
      `public/stock-data/_index.json` and `<TICKER>.json` (dates and closes as parallel
      lists). Checks the set (at least 400 symbols, newest price at most 7 days old)
      before swapping it in, so a bad run never replaces good files. Real run: 503
      stocks, 2.95M rows, about 18 s, 58 MB.
- [x] T2. **Workflow** (`.github/workflows/deploy.yml`): daily schedule next to push and
      manual runs; the last good files are kept in the Actions cache; a failed refresh
      deploys with the cached files and shows a warning. Not testable locally: run it
      once from the Actions tab after the first push.
- [x] T3. **App side** (`app/src/stockPrices/`): `format.ts` (file shape, shared with
      the job), `lookup.ts` (last trading day on or before a date, up to 10 days back),
      `client.ts` (fetch, validate the JSON because Pages answers a missing file with an
      HTML page, cache; null on any failure).
- [x] T4. **Form** (`MyData/useStockPriceAutofill.ts`, `EquityHoldingForm.tsx`,
      `TextField.tsx`): ticker suggestions with company names (other tickers still
      allowed), the fill rules (an empty field is filled once, a filled value follows
      the date, a typed or deleted value is left alone, a ticker change clears what was
      filled) and a note under the price saying which trading day it is from. Texts in
      en, he and ru.
- [x] T5. **Tests** (invented symbols only): `csv`, `build` and `dataset` tests for the
      job (the dataset test builds a small zip), `lookup` and `client` tests, and
      `StockPriceAutofill.test.tsx` (suggestions, fill, weekend fallback, no overwrite,
      ticker change, unlisted ticker, editing an existing holding, offline).

Behavior change: none to any calculation. The prices only fill form fields.

Known limitation: the dataset's close is the dividend- and split-adjusted close, so an
older price for a dividend payer is lower than the price quoted that day (KO: about −30%
for 2015). The user accepted this for now; the dialog says so. The source can be swapped
later without touching the app.

Open: the dataset's license for republishing, a source with real closes, coverage beyond
the S&P 500 (Israeli-employer stocks such as CHKP and WIX), ticker spelling for share
classes, an opt-out for lookups in Settings. All in `docs/stock-price-data-design.md`.

## Phase V — Monte Carlo risk analysis (Phase 4, part 1)

The plan assumes the same real return every year, so it can say "you are on track" while a
bad run of markets would break it. The Monte Carlo replays the plan on 2,000 random return
sequences and reports how often the desired retirement spending lasts to the planning
horizon. Phase 4 has more pieces: a historical projection mode (done as Phase Y) and live
external data (exchange rates and, as Phase X, Israeli inflation are done). (The full
dashboard KPIs were built next, as Phase W.)

Decisions (the user chose the first two):
- **One volatility input.** "Market volatility" in Assumptions → Advanced, default 12%,
  0 to 50. It is saved in `assumptions.volatilityPct`; older saved profiles and imports
  fall back to 12 (`normalizeAssumptions`).
- **Placement.** A "Risk analysis" card on Projections (success chance, the spending that
  holds up in 90% of histories, a p10/p50/p90 net-worth fan chart, a collapsed "How this
  works") and one Dashboard KPI, "Simulated spending coverage to age 90" (formerly
  "Probability of Success").
- **Only the return is random.** `ln(1 + r_t) = ln(1 + r) + σ·z`, so the median path stays on
  the deterministic projection and success at the deterministic sustainable level is about
  50%. The same return applies to every source (cautious). Bituach Leumi, annuities and
  other fixed streams do not vary.
- **Success** means that in every drawing year the streams and unlocked capital cover the
  spending (`DrawdownYear.unmet` ≤ ₪1). The median first-shortfall age of the failing
  paths is reported.
- **Tax.** The desired spending is after tax, so it is grossed up with the plan's effective
  tax rate (its lowest net-income year, clamped to 0–90%). Tax is not recomputed on each
  path.
- **Reproducible.** A fixed seed, with the random shocks generated once and reused for every
  spending level, so the same inputs always give the same answer and the success rate only
  falls as spending rises (which is what makes the search below work).
- **Not in the verification pack.** Monte Carlo never runs under a trace and has no trace
  steps; the pack covers the deterministic plan only.

- [x] V1. **Engine hooks** (`domain/drawdown.ts`): `DrawdownYear.unmet`, `DrawdownOptions`
      (`yearlyRates` overrides the constant rate, `lean` skips holdings and capital share),
      and the trace start call guarded by `isTracing()`. A constant `yearlyRates` run equals
      the normal simulation (tested).
- [x] V2. **Assumption** (`types/index.ts`, `AssumptionsStep`): `volatilityPct`,
      `DEFAULT_VOLATILITY_PCT`, `MAX_VOLATILITY_PCT`, `normalizeAssumptions`; a volatility
      field with help text. Fixed on the way: choosing a preset in `AssumptionsStep` now
      keeps the volatility.
- [x] V3. **Domain** (`domain/monteCarlo.ts`): seeded generator (mulberry32), Box-Muller
      shocks, `quantile`, `runMonteCarlo(profile, scenario, options)`, `successBand`
      (strong at 90% and above, fair at 70% and above, otherwise weak) and `successPercent`
      (rounded down, so 99.9% never shows as 100%). `confidentNetMonthly` is the largest
      spending that succeeds on at least 90% of paths, found by doubling then halving a
      bracket until it is within 0.5% (or ₪10); a probe stops as soon as more paths than
      the limit have failed. Returns null with no desired spending or no drawing years.
- [x] V4. **UI** (`RiskAnalysisCard`, `charts/MonteCarloFanChart`, `riskFormat.ts`,
      `Projections`, `Dashboard`): the card (with a "no expenses yet" state that links to
      the Expenses tab), the fan chart with a marker at the first drawing year, the KPI
      (a dash without a result; green, neutral or red by band). On Projections the result
      is computed from a deferred scenario, so the scenario buttons answer first and the
      card fades while it updates. The Dashboard KPI skips the confident-spending search.
      The Dashboard KPI row is three columns from `lg` and five from `xl`.
- [x] V5. **Texts** in en, he and ru; `i18n/riskLocales.test.ts` checks that every risk
      key exists in all three and that the `{{placeholders}}` match.
- [x] V6. **Tests**: `monteCarlo.test.ts` (generator, shocks, quantiles, reproducibility,
      fan invariants, median against the deterministic projection, zero volatility,
      monotonicity in spending and volatility, the 90% property of the confident spending,
      scenarios, legacy profiles), `unmet` tests in `drawdown.test.ts`, `volatilityPct`
      tests in `normalizeProfile.test.ts`, and Projections and Dashboard component tests.

Measured (browser, a real saved profile with 36 drawing years): the success run alone
takes about 90 ms, the run with the confident-spending search about 430 ms (it was
760 ms before the early exit and the 0.5% stop; the figure moved by ₪10). The fixed test
plan (age 40, retiring at 67, ₪1.2M saved, ₪9,000 a month wanted) gives 65% success, a
confident spending of ₪4,750 and a median shortfall at 82.

Known limits: one volatility for every source (no equity/bond split, no correlation); no
sequence-of-inflation risk; no tax per path; the market model is lognormal, so it has no
crashes beyond what the volatility implies; the historical mode (real return history) is
the separate Phase Y card.

## Phase W — Dashboard retirement KPIs (Phase 4, part 2)

The Dashboard's top row had five KPIs. Functional spec Section 13 also lists planned
spending, the safe withdrawal rate, projected pension income, state benefits, the funds
available at retirement, and "can I retire now / at 55 / 60 / 65". This phase adds them in
two places, with no new inputs and no external data.

Decisions (my judgement calls; the user has not yet reviewed them):
- **Same engines as the charts.** `calculateRetirementKpis` reads the household income
  estimate, the drawdown and the income breakdown, so the numbers agree with Projections.
- **Withdrawal rate** (reworked by UXB-16; first built as the "safe withdrawal rate") = the
  planned spending's first-year draw, plus any part the savings cannot pay, ÷ the spendable
  (unlocked, not annuitised) capital in that year. The first version used the sustainable
  income, so it ignored the planned spending and "safe" was misleading. It is not a share of
  total net worth: capital that already pays an annuity is outside the pool, and the note says
  "available funds" to match the neighbouring "Funds available at retirement" card. A state
  pension that starts at retirement lowers it; one that starts later does not touch the first
  year.
- **Pension income** = pension fund + provident fund + managers insurance bands at the
  first age they are above 0, with that age. Study fund and other investments are left out.
- **State benefits** = the largest Bituach Leumi band over retirement and the age it first
  appears; a dash with "Not in your projection" when it is excluded.
- **Funds available** = `access.accessibleAtRetirement`, with the locked amount and the
  unlock age in a note.
- **Retire-at checks** use `calculateFundingGapAtAge` for "now" (the soonest whole age, as
  in the earliest-feasible-age search) and for each of 55, 60 and 65 the user has not
  reached. A couple retires together and the spouse's age is shown. The card appears only
  when planned retirement spending is entered; the Feasibility card already carries the
  "add expenses" prompt.

- [x] W1. **Engine** (`domain/drawdown.ts`): `DrawdownYear.spendable` (unlocked, not
      annuitised capital before the draw) and `drawn` (the year's draw), filled in lean
      mode too. Tests in `drawdown.test.ts`.
- [x] W2. **Domain** (`domain/dashboardKpis.ts`): `calculateRetirementKpis`,
      `checkRetirementAges`, `EARLY_RETIREMENT_CHECK_AGES`. Tests in `dashboardKpis.test.ts`
      (withdrawal rate against income ÷ net worth, state pension timing, locked accounts,
      ages for 40/55/58/66/70, couples, agreement with the funding gap).
- [x] W3. **UI**: `RetirementSnapshot` (five `KpiCard`s, which gained an optional `note`),
      `RetireAgeChecksCard`, `useFormatAge` (shared with `SourceAccessCard`), wired into
      `Dashboard` after the status banner and after the Feasibility card. The checks are
      memoised with the snapshot because they run the funding-gap model several times.
- [x] W4. **Texts** in en, he and ru (`dashboard.snapshot.*`, `dashboard.retireChecks.*`);
      `i18n/dashboardLocales.test.ts` checks keys and `{{placeholders}}`.
- [x] W5. **Component tests** in `Dashboard.test.tsx`. Two older tests looked up a net-worth
      amount across the whole page; with 0% real return the new "Funds available" card shows
      the same amount, so they now look inside the "Net Worth Today" card.

Checked in the browser on a real saved profile (narrow viewport, English and Hebrew RTL).
The wide `xl` five-column layout was not viewed; it reuses the top row's grid classes.

Known limits: the withdrawal rate is a gross first-year figure, not a stress test; the
retire-at ages 55, 60 and 65 are fixed, not editable.

## Phase X — Live Israeli inflation (Phase 4, part 3)

The inflation assumption was a typed number with three presets. The Central Bureau of
Statistics (CBS) publishes the consumer price index for free with open CORS, so Assumptions →
Advanced now shows what inflation actually was, next to the field, and lets the user copy a
figure into it. The plan's own inflation is still the user's number; nothing is applied
automatically.

Decisions (my judgement calls; the user has not yet confirmed the placement or the switch):
- **Placement.** A reference block under the Inflation field in the Advanced panel, so the
  request is made only when that panel is open.
- **Four rows.** The latest 12-month change, and the 10, 20 and 30 year averages. An average
  is the compound yearly rate over exactly N years (the geometric mean of the 12-month
  changes at 12-month steps back from the latest month). A window is left out if any step
  is missing. Windows over 30 years are not offered, because the 1980s dominate them.
- **"Use" button.** Sets `inflationPct` to the figure rounded to one decimal and leaves the
  preset as it is. A row whose figure equals the field shows "In use".
- **Own switch.** Settings → Inflation data (stored under the meta key `cpiLookupOff`),
  separate from the exchange-rate switch, so each host can be refused on its own. Settings
  makes no request. The privacy list names the CBS.
- **Request.** `https://api.cbs.gov.il/index/data/price?id=120010&format=json&download=false&lang=en&startPeriod=01-{year}&PageSize=1000`
  (the API pages at 100 points unless `PageSize` is set). No cookies, no referrer, 10 s
  timeout. A success is kept for 6 hours, a failure is retried, and concurrent callers share
  one request. The start year is the current year minus 31.
- **Fallback.** `src/cpi/snapshot.ts` holds the December-over-December change for 1952 to
  2025 (generated, not edited by hand; a test compares it with the generator's output). When
  the request fails or the switch is off, the block shows the table's averages, says "built-in
  table" and gives its retrieval date. `useIsraelCpi(enabled)` returns `{summary, status}` with
  status `live`, `loading`, `unavailable` or `off`, and always starts from the built-in
  summary, so the block never flashes empty.

- [x] X1. **Pure maths** (`cpi/format.ts`, `cpi/stats.ts`): month labels, 12-month change,
      N-year averages, with the "any missing step omits the window" rule.
- [x] X2. **Refresh script** (`scripts/cpi-data/`, `npm run cpi-data`): fetches the series,
      checks it (`findProblem`) and writes `src/cpi/snapshot.ts`. Run it about once a year,
      after the December figure is out in mid-January. First run: 74 years, 1952 to 2025.
- [x] X3. **Data layer** (`cpi/builtIn.ts`, `cpi/client.ts`, `cpi/useIsraelCpi.ts`).
- [x] X4. **Switch** (`storage/db.ts`, `ProfileContext.tsx`, `Settings.tsx`): `cpiLookupEnabled`
      with the same plumbing as the exchange-rate switch; cleared data turns it back on.
- [x] X5. **UI** (`pages/MyData/InflationReference.tsx`, wired into `AssumptionsStep`).
- [x] X6. **Texts** in en, he and ru; `i18n/cpiLocales.test.ts` checks keys and
      `{{placeholders}}`. Checked in the browser in all three languages (live data loaded:
      12-month 1.6%, 10 years 1.9%, 20 years 1.8%, 30 years 2.2%); this showed a cramped Hebrew
      button and a double full stop in the Russian status line, both fixed.
- [x] X7. **Tests**: format, stats, built-in table, client (success, failure, timeout, cache,
      shared request), hook, snapshot script, the component and the Settings switch.
      1099 passed and 1 skipped in all.

Known limits: the figures are reference only (the projection does not use the history);
the table must be refreshed by hand once a year; one series (the general index, id 120010),
so no housing or food sub-indices.

The historical projection mode was the next Phase 4 piece; it is now Phase Y, below. It used
the US market history instead of this feed, so the CBS index is still reference only.

## Phase Y — Historical backtest (Phase 4, part 4)

The Monte Carlo draws random returns. This card instead replays the plan on what US stocks and
bonds actually returned, starting in every year from 1928, so the user sees real histories such
as the 1929 crash, the 1966–1981 stagnation and 2008. It sits on Projections right after the
risk analysis.

The user chose the data: **US stocks and bonds, 1928–2025, in real terms** (over a
shekel-converted history from 1961). Everything else below is my judgement call and the user
has not yet confirmed it.

Decisions:
- **Source.** Aswath Damodaran's `histretSP` table (S&P 500 with dividends, 10-year US
  Treasury, yearly, with the US CPI inflation). Bundled as 98 rows in
  `src/history/usMarketHistory.ts`: `[year, stocks %, bonds %, inflation %]`. No request is
  made. There is no refresh script (that would need a spreadsheet reader as a dependency),
  so the file is extended by hand once a year, in January: append one row.
- **Real return** = `(1 + nominal) / (1 + inflation) − 1`, per year, for the chosen mix.
- **Mix.** Stocks in 10% steps from 0 to 100, default 60%, rebalanced every year. It is card
  state, not saved in the profile.
- **Windows.** A window starts in each year that has a full run of history. For a plan that
  draws to 90 from age 40 (50 years) there are 98 − 50 + 1 = 49 windows (1928–1976 starts).
  Year 1 of the plan gets the start year's return, year 2 the next, and so on, to the same
  planning horizon as everywhere else (age 90, at most 72 years, so at least 27 windows; the
  code still refuses fewer than 10).
- **Two bases.** "As they happened" uses the history as it was. "Matched to my plan" shifts
  every year by one constant so the history's average equals the plan's own real return; it
  keeps the ups and downs and isolates the order of returns (sequence risk) from the level.
- **Success** is the Monte Carlo's test: every drawing year's unmet spending is at most ₪1.
  The shared code moved to `domain/spendingTest.ts` (`prepareSpendingTest`, `evaluatePaths`,
  `findLargestGrossSpending`); `monteCarlo.ts` now imports it and its tests are unchanged.
- **Survivable spending** = the largest monthly spending that every window funds, found
  with the Monte Carlo's search at confidence 100%, converted to after tax and floored to
  ₪10. It can differ by about ₪30 between target levels because the search bracket depends on
  the starting ceiling.
- **Result is "what happened", not a probability.** Neighbouring windows share most of their
  years, so the card shows "X of N starting years" and lists the failed ranges ("1929–1937,
  1965–1969"), the hardest start, and the plan's return against the history's average.
- **Chart.** One thin line per start year (blue when funded, red when short), the hardest
  start thick and dark red, and a dashed line at the retirement age. No tooltip.
- **RTL.** Year ranges inserted into sentences are wrapped in left-to-right isolates
  (U+2066 … U+2069) so Hebrew shows 1946–1981, not 1981–1946. The "X of N" figure is left to
  flow naturally, because a left-to-right wrapper around a Hebrew word moves the word to the
  end.

- [x] Y1. **Shared test** (`domain/spendingTest.ts`), extracted from `monteCarlo.ts` with no
      behaviour change (`monteCarlo.test.ts` and `dashboardKpis.test.ts` still pass).
- [x] Y2. **Data and maths** (`history/usMarketHistory.ts`, `history/returns.ts`): the
      bundled table, `realReturn`, `realReturnsForMix`, `geometricMean`, `rebaseReturns`.
      14 tests (no gaps from 1928, plausible percentages, the 1931, 1974 and 2022 bad years,
      the real-return formula, the mix, the geometric mean and the rebasing).
- [x] Y3. **Domain** (`domain/historicalBacktest.ts`): `runHistoricalBacktest`,
      `groupConsecutiveYears`. 19 tests (window count, a window against a direct
      simulation, success counts as spending rises, both bases, the worst window, the
      survivable spending, no target and no drawing years). Couples are not tested here; the
      engines underneath are covered by the household and Monte Carlo tests.
- [x] Y4. **UI** (`HistoricalBacktestCard`, `charts/BacktestChart`, `charts/backtestColours`),
      wired into `Projections` after `RiskAnalysisCard`. The three inputs (scenario, mix,
      basis) are deferred separately, like the risk card.
- [x] Y5. **Texts** in en, he and ru (`projections.history.*`);
      `i18n/historyLocales.test.ts` checks keys and `{{placeholders}}`.
- [x] Y6. **Component tests** in `Projections.test.tsx` (funded count, survivable spending,
      failed years, the mix and basis controls, closed explanation, isolated ranges, the
      no-target prompt).
- [x] Y7. **Browser check** on a real saved profile in English, Hebrew (RTL) and Russian.
      It found two Hebrew problems, both fixed: "63 מתוך 63" had its word pushed to the end,
      and the year ranges read backwards. An "100% Your spending held up…" line was also
      dropped as redundant. The wide two-column layout was not viewed; it reuses the risk
      card's grid classes. 1149 passed and 1 skipped in all.

Known limits: US history in US purchasing power (the shekel, Israeli inflation and Israeli
markets are not modelled); two asset classes only; before fees and tax; overlapping windows;
the table needs a new row each January.

## Phase Z — Cover plan for early retirement (insurance continuity)

Survivors' and death cover in a pension fund lapses some months after the last deposit. An early
retiree therefore has a gap between the end of that cover and the age the pension opens. This
phase lets each person choose how to handle it and shows the cost. The full design, the owner's
answers to the six open questions (2026-11-06) and the status table are in
`docs/insurance-cover-design.md`; the legal rules are rule V in `docs/constants-to-verify.md`.

Decisions (the owner's answers, Q1–Q6): the size of the gap in money comes from the imported
spouse survivors' pension; a non-earner is assumed able to keep paying (a toggle switches that
off); the cost is paid out of pocket and shown read-only in the expenses report; the need-until
age defaults to the pension start (60) and is editable; disability is left out; both partners
have their own plan. The app never recommends an option.

- [x] C2. **Types and My Data input** (`CoverPlan`, `createCoverPlan`, normalisation,
      `pages/MyData/CoverPlanSection`): one optional plan per person (none / keep pension
      insurance / independent term life, need-until age, monthly cost, term end age, "keep
      paying after the arrangement"). A null plan changes no number.
- [x] C2b. **Survivors' pension fields** on the pension account (`monthlySurvivorsSpousePension`,
      `survivorSpousePercent`): typed in the account form and imported from the Clearing House
      report, mapped by element name because the parent node is not verified.
- [x] C3. **Pure logic** (`domain/coverPlan.ts`, `coverAnalysis.ts`): the free extension (5
      months) and arrangement (24 months) windows, the protection gap in years and in money,
      the cover on file, a result block in the My Data section and the Dashboard
      `CoverNoticeCard`.
- [x] C4. **Projections card** (`CoverOptionsCard`, `planForOption`, `compareCoverOptions`):
      the three options side by side with gap, monthly cost, total cost and the effect on the
      plan, each option run through the normal engine.
- [x] C5. **Cover cost as an outflow** (`domain/coverCost.ts`): a negative stream in
      `retirementIncome.ts`, added to the needed draw in `drawdown.ts`, taxed with the draw and
      subtracted again in `netIncome.ts` (so gross − tax = net still holds). Traced
      (`<role>/cover/*`, `net/binding/coverCostMonthly`, table `drawdown/coverCost`), kept in the
      verification pack, and shown read-only in `CoverCostsSummary` on the Expenses step.
      `monthlyIncomeTodayMoney` is clamped at 0.
- [x] C6. **Risk premium out of the deposit** (`contributions.ts`,
      `monthlyRiskDeductionForAccount`): while working, `monthlyRiskDeduction` buys cover, not
      savings, so it is subtracted from what is added to the balance (floored at 0), with the
      `monthlyDeposit` trace step and a helper text under the field. **This changes numbers for
      every profile with a stored deduction**, lowering the balance at retirement by the
      premium's future value.
- [x] Tests: `coverPlan.test.ts`, `coverAnalysis.test.ts`, `coverCost.test.ts` (engine, trace,
      spouse), `contributions.test.ts` (risk premium, trace), `verificationPack.test.ts`, the
      My Data, Dashboard and Projections page tests. 1553 passed and 1 skipped in all.

Known limits and unverified assumptions: whether a person with no earned income may keep
depositing, and at what cost (rule V); the Clearing House parent node of the survivors'
elements; the balance-only part of the gap in money is a Low-confidence estimate; orphans'
and parents' pensions and lump sums are not netted; the cost is a flat figure the user enters
(no premium table, no rise with age); "same accounts" in Q2 is read as accounts with a
survivors' pension above 0; the "keep paying" toggle defaults to on (the owner did not say);
the displayed gross income is net of the cover cost while tax is computed on the full draw.

### R1 notes — liquidity ladder (Phase R)

A "When your money becomes usable" card on Projections, just above the retirement
timeline. It is a staircase: one row per moment something opens up, showing what opens and
a running "usable so far" total. It complements the timeline (income by source and age) and
the Dashboard's source-access card (one accessible/locked pair); it does not replace either.

Decisions (mine, not yet confirmed by the user):
- **It changes no numbers.** `domain/liquidityLadder.ts` (`buildLiquidityLadder`) reads the
  same household sources and unlock ages as `estimateHouseholdRetirementIncome`. The capital
  total matches `access.accessibleAtRetirement` to the shekel (a test checks it with
  non-zero growth).
- **Rows.** Month 0 is "When you retire". A pot that opens later is a row at its unlock age
  (pension, managers insurance and provident fund at 60; a study fund at its liquidity date;
  investment gemel and other savings at 0). Same month rule as the income estimator:
  `max(round((years until the unlock age − years until retirement) × 12), 0)`. Pots still
  locked at retirement are shown at their grown value (`valueAtRetirement` × catch-up
  growth), as the engine does. Anything opening at or after age 90 is left out.
- **Income items** (annuity, Bituach Leumi pension, the spouse supplement) are rows too, but
  shown as "₪X a month" and **not** added to "usable so far".
- **Couples.** Each line says "(yours)" or "(your spouse's)"; a spouse's pot is placed at the
  primary user's age at that moment.
- **Employer RSU batches are not rungs.** The engine counts every granted share as usable at
  retirement, so a rung would contradict the numbers elsewhere. Instead an amber note says
  how much company stock vests after retirement and the first vest date (at today's price).
  R3 made the engine vest-aware: the note now covers only grants that keep vesting after the
  owner leaves (the others lose those shares, which the "Leaving before your shares vest"
  card shows).
- **Not traced.** Every figure comes from values the trace already records
  (`valueAtRetirement`, the unlock ages), and the ladder only groups them, like the
  timeline. It is outside the verification pack on purpose; say so if you want it added.
- **RTL.** The year and the date inside sentences are wrapped in left-to-right isolates
  (U+2066 … U+2069) and passed as interpolation values; the sentence itself is not wrapped.

- [x] R1a. Domain (`domain/liquidityLadder.ts`), 8 tests (staircase, agreement with the
      engine under growth, income items, a spouse's pot, the horizon, an empty plan, late
      vesting flagged and not flagged).
- [x] R1b. Card (`components/LiquidityLadderCard.tsx`), wired into `Projections`.
- [x] R1c. Texts in en, he and ru (`projections.ladder.*`); `i18n/ladderLocales.test.ts`
      checks keys and `{{placeholders}}`.
- [x] R1d. Component tests in `Projections.test.tsx` ("liquidity ladder": the staircase and
      running total, couple labels, the late-vesting note, closed explanation, hidden
      without savings).
- [x] R1e. Browser check in English, Hebrew (RTL) and Russian on a saved profile, once with
      a single "when you retire" row and once with a 55 → 60 → 65 staircase. No bidi
      problems. 1171 passed and 1 skipped in all.

### R2 notes — withdrawal order (Phase R)

A "Which savings to draw on first" card on Projections, after the income charts and before
the liquidity ladder. It compares three orders and the user can **save one**; the saved order
then drives the whole plan (Dashboard, income chart, timeline, funding gap).

Decisions (mine, not yet confirmed by the user):
- **Three orders, not four.** `proRata` (default, today's behaviour), `taxableFirst` and
  `lowestTaxFirst`, in `Assumptions.withdrawalStrategy` (`WITHDRAWAL_STRATEGIES` in
  `types/index.ts`; an unknown or missing value normalises to pro rata). The design doc's
  "Bridge-only" order is **dropped**: the engine never draws locked capital, so it would
  equal pro rata.
- **Cash is not split from securities.** The pooled `other-investments` source is unchanged.
  Splitting it would change trace steps, tests and the results for holdings with their own tax
  rates. It can come later as an optional "R2b".
- **The order changes only who is drawn on, never how much.** All sources earn the same real
  rate, so the gross draw, the solver, `unmet`, `spendable` and net worth are identical in
  every order. Only the tax, and so the net income, changes. Net worth is therefore not a
  comparison line.
- **Where it lives.** `Household.withdrawalStrategy` (set in `buildHousehold`);
  `drawdown.ts` (`withdrawalRank`, `withdrawalTiers`, `allocateDraw`; `simulate()` computes the
  allocation first, then updates balances). Ranks: taxable first = other investments, then the
  investment gemel, then pension, exempt (study fund) last; lowest tax first = exempt, then
  money taxed only on its gain (by `gainFraction × capital-gains rate`), then pension, then
  money taxed as ordinary income. Sources whose ranks are within 1e-9 share a tier and are drawn
  pro rata inside it.
- **Lean runs stay pro rata.** Monte Carlo, the backtest and `spendingTest` use `lean: true`;
  they only depend on how much is drawn, not on which source. The card says so.
- **Comparison** (`domain/withdrawalStrategies.ts`, `compareWithdrawalStrategies`): builds the
  household once, runs the net-income estimate per order (about 9 ms for all three). Lines: total
  tax, average and lowest income you keep, first year below the desired spending, highest taxable
  income in a year (`NetIncomeYear.taxableMonthly`, from `memberTaxDetail`), and years above the
  surtax threshold. When every order gives the same tax each year the card shows only a message.
- **A lower total tax can lower the headline "lowest year" income.** In a trial plan the order
  with the least tax left a lower income in the leanest year than pro rata. The card shows all
  lines and a trade-off note, and never calls an order "optimal".
- **Trace.** A `withdrawalStrategy` step and a `withdrawalOrder` table appear **only** for a
  non-default order, so the existing traces and verification pack are unchanged.
- **Layout.** The three order descriptions are a short list above the table (not in the
  column headers), so the table fits a 400 px phone without scrolling in English and Russian.
- **RTL.** Amounts and ages are wrapped in `\u2066…\u2069` and passed as interpolation values.

- [x] R2a. Types and normalisation (`withdrawalStrategy`), fixture override, household wiring.
- [x] R2b. Engine (`drawdown.ts`), `memberTaxDetail`, `NetIncomeYear.taxableMonthly`.
- [x] R2c. `domain/withdrawalStrategies.ts` with 13 tests (ordering, shares sum to one, same
      gross, a source never overdrawn, agreement with `estimateNetIncome`, `identical`,
      shortfall age, empty income).
- [x] R2d. Card (`components/WithdrawalStrategyCard.tsx`), wired into `Projections`; a click
      saves the order with `updateProfile`.
- [x] R2e. Texts in en, he and ru (`projections.withdrawal.*`);
      `i18n/withdrawalLocales.test.ts`.
- [x] R2f. Component tests ("withdrawal order": compare and mark, save, deltas, identical
      message, no shortfall row, closed details, hidden without savings) and a
      `normalizeProfile` test.
- [x] R2g. Browser check in English, Hebrew (RTL) and Russian at 485 px. Saving
      "Taxable money first" changed the Dashboard income after tax and the timeline (the
      other-investments pot is drawn first); pro rata left them as before. 1201 passed and 1
      skipped.

### R3 notes — RSU vesting schedule (Phase R)

What changed: the engine now knows which shares have vested. Before R3 every granted share
counted in full at retirement, which overstated the plan for anyone retiring before the last
batch vests.

Answers from the user (design questions 3 and 4):
- **24 months.** For RSUs held by an ESOP in Israel the 24 months count from the **original
  grant date of the award**, not from each quarterly vest date. This is **user-reported and not
  checked against the Ordinance** (rows 21, 23 and rule P in `constants-to-verify.md`). It
  replaces the Phase N reading.
- **Forfeiture.** Every unvested unit is lost when the owner leaves (no retirement clause).
  The per-grant flag `EmployerGrantDetails.keepsVestingAfterLeaving` exists and defaults to off.

Judgement calls (mine, not yet confirmed by the user):
1. **`quantity` is the whole award** (vested plus unvested). The batches partition it and the
   remainder is already vested. The design doc said "the holding keeps today's vested quantity;
   later vests are added". Keeping the whole award means existing holdings and the Section 102
   summary tables stay as they were, and `vestedQuantityAt` does the split.
2. **Grant-date 24 months for all lots.** `trusteeHoldingPeriodMet` applies to every lot.
   A lot is sold at `max(retirement, vest date)`.
3. **Late batches.** A batch vesting after retirement is forfeited unless the flag is on. With
   the flag on it is counted from retirement and sold on its vest date; the ladder's amber
   note then shows its value.
4. **Net worth today leaves unvested shares out** (Dashboard, input guidance). The equity
   summary table and the `holdings` trace table keep the full quantity.
5. **Known simplification.** Shares that vest between today and retirement are valued at
   today's price and grown from today, which slightly overstates their growth.
6. **The "leaving early" line shows a monthly after-tax gain**, not a lump sum as the design
   doc suggested. It treats the next batch as already vested and takes the difference in
   `estimateNetIncomeForTiming(...).netMonthlyIncome`, floored at zero.
7. **Not traced.** The leaving-early card is outside the traces and the verification pack, like
   the ladder and the backtest. The engine changes are traced through the new `employerVesting`
   table and the `employerLots` table.
8. **The form shows what has vested** ("vested so far", "not yet vested"). The shares lost at
   retirement are shown on Projections, because the editor has no retirement date.
9. **The generator always replaces the whole batch list** and uses the holding's own grant date
   and quantity. Defaults: 20 batches, every 3 months, first batch 3 months after the grant
   (`DEFAULT_VESTING_TEMPLATE`).

Where it lives: `domain/vesting.ts` (`employerShareBatches`, `batchStatusAtRetirement`,
`vestedQuantityAt`, `quantityAtRetirement`, `forfeitedQuantityAt`, `generateVestingSchedule`,
`addMonthsToIsoDate`), `domain/leavingEarly.ts`
(`buildLeavingEarlyCost`), `sources.ts` (`stockRoute`, `employerLots`, `employerVesting`
trace), `profileBasics.ts`, `netWorth.ts`, `liquidityLadder.ts`. UI:
`components/UnvestedSharesCard.tsx`, `pages/MyData/VestingTranchesEditor.tsx`,
`EquityHoldingForm.tsx`, `holdingEntry.ts`.

- [x] R3a. Types, `normalizeProfile` (the flag defaults to false and keeps true), fixture
      option `employerGrant.keepsVestingAfterLeaving`.
- [x] R3b. `domain/vesting.ts` with tests (batches and scaling, status and forfeiture,
      quantities, month-end dates, the generator: whole units, the remainder, fewer units than
      batches, unusable input). `MAX_TEMPLATE_BATCHES` is 120.
- [x] R3c. Engine: `sources.ts`, `profileBasics.ts`, `netWorth.ts`, `liquidityLadder.ts`.
- [x] R3d. `domain/leavingEarly.ts` with 6 tests.
- [x] R3e. UI: the schedule generator, the vested summary, the "keeps vesting" checkbox
      (it opens "More details"), the "Leaving before your shares vest" card after the ladder.
- [x] R3f. Texts in en, he and ru (`projections.unvested.*`,
      `myData.steps.equity.tranches.generate*`, `fields.keepsVestingAfterLeaving*`) with
      plurals; the locale parity test passes.
- [x] R3g. Component tests (generator, disabled button, the flag, the card sentences, closed
      details, no card when the flag is on, no ladder note when the flag is off).
- [x] R3h. Browser check at 485 px in English and Hebrew with a 2,000-share grant (20
      quarterly batches). Retiring on 31.10.2027 loses 900 shares (about ₪280,620); one more
      month would keep 100 shares. With the flag on the card disappears and the ladder note
      shows the same value. No bidi problems. 1240 passed and 1 skipped in all.

### R4 notes — purchase lots and the effective cost basis (Phase R)

What changed: an ESPP or private holding can list its purchases (date, shares, market price
that day, dollar rate that day). Their cost replaces the single "unrealized capital gain"
number, and the tax is worked out per purchase by rule R. Holdings with no lot are exactly as
before.

Answers from the user (design question 2):
- **ESPP discount.** It is taxed as salary at purchase, so the cost basis is the **full market
  price that day**.
- **Where ESPP shares sit.** In a normal brokerage account: no trustee and no 24-month lock.
  They take the ordinary capital-gains route, the same as private shares. Both answers are the
  user's report, not checked against the Ordinance (see the log in `constants-to-verify.md`).

Rule R per lot (`saleRate` is the profile's fixed dollar rate, `purchaseRate` the lot's own):
- `value = quantity × current price × saleRate`.
- `nominal = value − quantity × price × purchaseRate`; `adjusted = value − quantity × price × saleRate`.
- The lot's recognised gain is the lower of the two when both are gains, the smaller loss when
  both are losses, and 0 when they disagree in sign. A holding's gain is the sum over its lots,
  never below zero. Test vectors: $100 bought at ₪5.00, now $200 at ₪3.00 gives a taxable ₪100;
  $150 bought at ₪4.00, now $100 at ₪3.50 gives a loss, so the engine gain is 0.

Judgement calls (mine, not yet confirmed by the user):
1. **No `kind` field on a lot.** The holding's category already says ESPP or private.
2. **Lots partition the quantity.** Shares in no lot have no gain (basis = value). Lots that add
   up to more than the quantity are scaled down to fit, and the form warns.
3. **A lot without a rate uses the sale rate**, so only its dollar gain counts. That is the
   old "dollar gain at the sale rate" behaviour.
4. **The sale rate is the profile's fixed rate** (fallback 3.7), not a forecast.
5. **Losses are netted inside a holding but never carried to another holding or year.**
6. **Lots replace the unrealized-gain field** while at least one lot has shares and a price
   (`isUsableLot`; a price of 0 is allowed). The form says so under that field. An incomplete lot
   is left out and the form says how many.
7. **ESPP without lots still has a zero gain** (as before R4): its old fields never fed the tax.
8. **Lots count only for the ESPP and private categories.** A grant, or no category, ignores
   them. Switching a holding to a grant keeps the lots in the data, unused.
9. **No price autofill for lots.** The bundled prices are adjusted for dividends and splits, so
   they are not the price paid. The dollar rate of each lot is filled in from the Bank of
   Israel (as for the main entry), and a typed value wins.
10. **The lot table is traced only when lots exist** (`purchaseLots`, plus a different
    `costBasis` note), so existing traces and the verification pack are unchanged for holdings
    without lots. In the pack, lot ids are aliased `lot1`, `lot2`, … and dates are kept.
11. **"Start from the purchase above"** (a button shown while there are no lots) copies the
    entry's date, price, rate and the holding's quantity into a first lot. It is a click, never
    automatic.
12. **The main entry's dollar rate is still not used by the tax.** Only the rate of each lot is.
    The hint under the form says so.

Where it lives: `domain/purchaseLots.ts` (`holdingLots`, `isUsableLot`, `holdingTakesLots`,
`incompleteLotCount`), `sources.ts` (`otherInvestmentsTaxProfile`, `recordOtherInvestmentsSteps`),
`types/index.ts` (`PurchaseLot`, `normalizeProfile`), `verificationRedaction.ts`. UI:
`pages/MyData/PurchaseLotsEditor.tsx`, `useDatedRateAutofill.ts` (shared with
`useEntryRateAutofill.ts`), `EquityHoldingForm.tsx`, `holdingEntry.ts` (`hasAdvancedDetails`).

- [x] R4a. Types, `normalizeProfile` (lots default to `[]`, the rate is validated), fixture
      option `purchaseLots`.
- [x] R4b. `domain/purchaseLots.ts` with tests (the two rule R vectors, netting, scaling, no
      rate, categories, unusable lots).
- [x] R4c. Engine: `otherInvestmentsTaxProfile`, the lot trace, the redaction aliases and the
      guide text; tests in `sources.test.ts`, `tracePipeline.test.ts`, `verificationPack.test.ts`.
- [x] R4d. UI: the purchases editor in both "More details" sections, the per-lot rate autofill,
      the summary line (cost basis and gain counted), the "exceeds" and "left out" notes, the
      unrealized-gain note, `hasAdvancedDetails`.
- [x] R4e. Texts in en, he and ru (`myData.steps.equity.lots.*`,
      `fields.unrealizedIgnoredWithLots`, a new `fields.rateHint`, the two section titles); the
      locale parity test passes. No plural keys.
- [x] R4f. Component tests in `PurchaseLotsEditor.test.tsx` (11 cases).
- [x] R4g. Browser check at about 485 px in English and Hebrew with an ESPP holding of 10
      shares at $200 and two lots (6 at $100 and ₪5.00; 4 at $150 and ₪4.00) and a sale rate of
      ₪3.118: cost basis ₪5,400 and a counted gain of ₪836, as worked by hand. No bidi
      problems. The test data was removed afterwards. 1271 passed and 1 skipped in all.

### R5 notes — per-source cost table (Phase R)

What changed: Projections has a "What each source costs to draw on" card after the liquidity
ladder. For each kind of money of each person it shows two columns: the **extra monthly tax to
raise your net spending by ₪100** (with "draw ₪X to keep ₪100" under it) and **what you give up**
(words only). Nothing else in the plan changes.

Answer from the user (design question 1): **two columns only.** No single "net worth at 90 per
source" number: it would need a plan run per source and an assumed return per source.

How the tax is found (`domain/sourceCosts.ts`, `buildSourceCostTable(profile, scenario)`):
- A group is one kind of money of one person. The groups, in table order: study fund, other
  investments, investment provident fund, Section 102 shares, ordinary-income shares, provident
  fund, managers insurance, pension fund.
- The reference year of a group is the first plan year in which some account of it is unlocked.
  The tax is worked out then, on top of the plan's own draws for that year, through the same
  `memberTax` the Dashboard uses. Only that person's tax changes.
- The gross draw `g` is found by bisection so that `g − (tax(g) − tax(0)) = 100`. The table shows
  `taxPerStep = g − 100` and `drawPerStep = g`. Example: a lot worth ₪100k with a ₪70k basis (30%
  of it gain) at a flat 25% needs about ₪108.11 drawn per ₪100 net, so the tax is ₪8.11.
- A group's tax profile (gain share, ordinary-income share, capital-gains rate) is the average
  over its unlocked accounts, weighted by their value at retirement.

Judgement calls (mine, not yet confirmed by the user):
1. **The tax is the marginal tax at the first year the money can be drawn**, on top of what the
   plan already draws that year, not a lifetime average. It can be higher than the average rate.
2. **Groups are per person and weighted by value at retirement.** A couple gets one row per
   spouse and group, self first. The age shown is that person's own age in the reference year.
3. **Annuity sources and sources worth less than ₪0.50 at retirement are left out**: a payment
   is not a pot to draw on.
4. **"What you give up" is words, not numbers.** Every source earns the same return in the
   model, so growth does not tell them apart. The wording avoids a hard-coded rate because the
   pooled investments use a blended rate.
5. **The card is not in the calculation trace or the verification pack** (like the ladder, the
   leaving-early card and the backtest). It is read-only.
6. **The management fee is shown only if entered**, as a value-weighted average over the
   accounts of the group that state one. It is not part of the tax.
7. **Whole shekels in the display.** A tax under ₪0.50 shows "No tax", and the "draw" line is
   hidden then.
8. **Refactor with no change in numbers:** `netIncome.ts` now exports `retirementPlanYears` (the
   plan's retirement years, the streams and the draw per holding) and `estimateNetIncomeForHousehold`
   uses it; `sources.ts` has constants for the three investment source ids.

Where it lives: `domain/sourceCosts.ts`, `domain/netIncome.ts` (`retirementPlanYears`,
`PlanYear`), `domain/sources.ts` (`OTHER_INVESTMENTS_SOURCE_ID`, `SECTION_102_SOURCE_ID`,
`ORDINARY_STOCK_SOURCE_ID`). UI: `components/SourceCostCard.tsx`, placed in `pages/Projections.tsx`.
Texts: `projections.sourceCost.*` in en, he and ru (no plural keys).

- [x] R5a. Domain: `retirementPlanYears` refactor, the source-id constants, `sourceCosts.ts`.
- [x] R5b. Domain tests in `sourceCosts.test.ts` (15 cases: empty profile, study fund, the 8.11
      investment example, no gain, investment provident fund, draw − tax = 100, pension before
      and after the statutory age, a locked pot, annuity excluded, Section 102 and
      ordinary-income shares, the fee, couples, the plan's net income unchanged).
- [x] R5c. UI card and texts in en, he and ru; the locale parity test passes.
- [x] R5d. Component tests in `Projections.test.tsx`, "source costs" (7 cases).
- [x] R5e. Browser check in English and Hebrew in the narrow panel with the real profile (study
      fund, other investments, provident fund and managers insurance rows, fees shown): no bidi
      problems, the table fits. No test data was needed, so nothing to restore. 1293 passed and
      1 skipped in all.

### R6 notes — stress tests (Phase R)

What changed: Projections has an "If things go wrong" card after "Leaving before your shares
vest". It runs the plan again with one thing going wrong and shows, for each, the **savings when
you start drawing** and the **monthly income after tax (lowest year)**, with the change from the
plan as it is and whether the income still covers the desired spending. Nothing else in the plan
changes.

Answer from the user: **fixed rows.** Employer shares fall 30% and 50%, the dollar falls 10% and
20%, plus one row with both. Order: the plan now, employer rows, dollar rows, the "both" row.

How it works (`domain/stressTests.ts`, `buildStressTest(profile, scenario)`):
- Each stress copies the profile with a change and runs the whole plan: `buildHousehold`, then
  `estimateHouseholdRetirementIncome` (savings at retirement) and `estimateNetIncomeForHousehold`
  (the lowest year's net income, the Dashboard figure). The gap is the net income minus the
  desired monthly spending, or null when none is entered.
- **Employer shares fall:** the price of company grants and ESPP shares is scaled down. A holding
  that states its gain in dollars (no purchase lots) has that gain reduced by the dollars lost per
  share, so the tax follows; lots and grants work the gain out from the price.
- **The dollar falls:** `equity.usdToIlsRate` is scaled down (built-in 3.7 when none is set). Values
  and the taxed gain follow through rule R; a lot with no stored rate follows the sale rate. Only
  equity is in dollars; pensions and other assets are in shekels.
- **Exposure:** the card says how much of the savings at retirement is in dollars and how much of
  that is employer shares, at today's price and rate. Shares that would be forfeited (unvested
  and not kept after leaving) are left out, as in the plan.
- The card is hidden with no dollar holdings. Without employer shares only the two dollar rows
  show. About 4 ms for all six runs (a couple with several pensions), memoised in the page.

Judgement calls (mine, not yet confirmed by the user):
1. **ESPP counts as employer stock.** Shares bought privately do not, even in the same company.
2. **The "both" row is employer −50% and dollar −20%**, the two harshest rows together.
3. **Only adverse moves are shown.** A stronger dollar is not a stress.
4. **Not in the calculation trace or the verification pack** (like R5 and the leaving-early card).
5. **The gain adjustment** for holdings without lots (above) so a price fall also lowers the tax.
6. **The two measures are savings at retirement and the lowest net monthly income.**
7. **Lots without a stored rate follow the sale rate** when the dollar falls.

Where it lives: `domain/stressTests.ts` (the constants, `StressTest`, `StressRow`,
`isEmployerStock`). UI: `components/StressTestCard.tsx`, placed in `pages/Projections.tsx` after
`UnvestedSharesCard`. Texts: `projections.stress.*` in en, he and ru (no plural keys).

- [x] R6a. Domain: `stressTests.ts`.
- [x] R6b. Domain tests in `stressTests.test.ts` (20 cases: empty, employer and dollar rows, the
      base equals the net income estimate, no gap without spending, shekel savings untouched,
      ESPP, own shares, the combined row, built-in rate, unvested shares lost or kept, the gain
      adjustment, scenarios, no change to the profile).
- [x] R6c. UI card and texts in en, he and ru; the locale parity test passes.
- [x] R6d. Component tests in `Projections.test.tsx`, "stress tests" (8 cases).
- [x] R6e. Browser check in English and Hebrew in the narrow panel with the real profile plus two
      temporary dollar holdings (an employer grant and a private holding): all rows, the covers
      line and the change lines read correctly, no bidi problems. The profile and the language
      were restored afterwards. 1321 passed and 1 skipped in all.

### R7 notes — investment provident fund as a life annuity (Phase R)

What changed: My Data > Pension & Savings, for an account whose product category is
**Investment provident fund** only, has a tick box "Take as a life annuity from age 60". Ticked,
the fund is no longer a lump sum taxed at 25% of its real gain: from 60 it pays a monthly annuity
that is tax-free (rule U). Everything else is as before; an account that is not ticked, and every
other category, is unchanged, and profiles saved earlier load with the box off.

Answer from the user: **yes, model it, and make it the user's choice in the UI, but only for the
relevant funds.** Rule U is the same for every fund and track, so "relevant" can only mean the
investment-provident-fund category.

How it works (`domain/sources.ts`, `takesGemelAnnuity`, `buildAnnuity`):
- The flag is `PensionAccount.lifeAnnuityFrom60` (default false; `normalizeProfile` turns anything
  but `true` into false). `takesGemelAnnuity(account)` is true for the category plus the flag.
- **The amount comes from the user.** There is no built-in conversion factor
  (`accessRules.ts` says defaults are never hard-coded). The annuity is the balance at the start
  age ÷ the conversion factor the user entered (the paying fund's own factor; the "guaranteed"
  tick is not needed), or the user's own monthly estimate, which wins. With neither, no annuity is
  modeled, the fund stays as a lump sum and the form shows an amber hint.
- **Start age** is `max(retirement age, 60)` (`ACCESS_RULES.investmentGemelAnnuityAge`). A
  "paying annuity" account status does not move it earlier. The balance grows at the real rate
  until then, then it becomes a fixed monthly stream for life, like the pension annuities.
- **Tax:** the source keeps its capital-gains treatment, so `memberIncome` (which counts only
  pension-type annuities) leaves the stream out of taxable income: it is tax-free by
  construction, and the notes in the trace say so. The Section 9A exemption is not used.
- **No drawing as capital** while the annuity is modeled, even before 60 (the engine treats any
  source with an annuity as locked). The unlock age stays 0, so without an annuity the fund is
  still capital as before.
- The stream is added to the provident-fund band of the income breakdown. The liquidity ladder,
  the source-cost table, the withdrawal strategies and the stress tests skip annuity sources
  already, so they needed no change.
- **In the trace and the verification pack** (unlike R5 and R6): R7 changes numbers. The start-age
  step shows `max(retirementAge, investmentGemelAnnuityAge)`, the constant is in the constants
  snapshot, and the monthly-annuity step carries the tax-free note. `checkTrace` finds no issues.

Judgement calls (mine, not yet confirmed by the user):
1. **Only the investment-provident-fund category** offers the choice (see above).
2. **No default conversion factor.** The user must enter a factor or an estimate.
3. **Locked from today once ticked,** even before 60, as pension funds are.
4. **Life-long, tax-free, no 9A exemption used.** Heirs, the loan against the balance and
   Amendment 190 are not modeled.
5. **The rule is unconfirmed:** secondary sources only; medium-high confidence for the 0% route,
   low for the legal basis. The form's helper text says so; see rule U in `constants-to-verify.md`.

Where it lives: `types/index.ts`, `domain/accessRules.ts`, `domain/sources.ts`,
`domain/memberTax.ts` and `domain/netIncomeTrace.ts` (notes), `pages/MyData/PensionAccountForm.tsx`.
Texts: `myData.steps.pensionSavings.fields.lifeAnnuityFrom60*` in en, he and ru.

- [x] R7a. Domain: the flag, `takesGemelAnnuity`, the annuity and the trace steps.
- [x] R7b. Tests: `sources.test.ts` (8 cases), `netIncome.test.ts` (3: tax-free, no tax on growth,
      unchanged when off), `normalizeProfile.test.ts` (1), `tracePipeline.test.ts` (1, with
      `checkTrace`), `PensionSavingsStep.test.tsx` (2: shown only for the category, hint and save).
- [x] R7c. Form tick box, helper and hint in en, he and ru; the locale parity test passes.
- [x] R7d. Browser check in English and Hebrew with the real profile (one provident fund switched
      to an investment provident fund, ticked, factor 200): the box shows only for that category,
      the hint goes away once a factor is entered, and the Dashboard moves the fund out of
      "locked until 60" and into the monthly pension income. Hebrew reads correctly right to
      left. The profile and the language were restored afterwards. 1336 passed and 1 skipped in
      all.

## Welcome page for returning visitors

The welcome page used to appear on every visit unless the user had pressed Save on the last
My Data step or imported a file (the saved `onboarded` flag). Someone who entered data
without finishing the steps, or who used the clearing-house import, saw it again with a
profile already saved on the device.

- [x] `ProfileContext` now exposes `onboarded` as the saved flag **or** "the profile holds
      data" (`hasProfileData` in `types/index.ts`: any difference from `EMPTY_PROFILE`).
      The start page then goes straight to the Dashboard, which lists what is still
      missing. A truly empty profile still gets the welcome page and the Dashboard's
      empty state. Nothing new is saved; it is derived on each load.
- [x] Tests: `types/hasProfileData.test.ts` and `app/App.test.tsx` (new visitor, saved data
      without the flag, finished profile, saved but empty profile).

Not handled: data saved under a different address (another browser, device, or
`localhost` versus the published site) is a different IndexedDB, so it cannot be detected.
Use Settings → Export and Import to move it.

## Welcome page redesign for new visitors

The start page was a title, two buttons and one privacy line. A new visitor could not tell
what the app does, what the privacy promise covers, which order to fill the steps in, or that
the Pension Clearing House import is the quickest way in. The "Import data" button also did not
say it loads a file from an earlier session.

- [x] `pages/Welcome/` (the page moved from `pages/Welcome.tsx`): `AboutBox` (what it does,
      plus a "save and come back later" note naming Export data and Import data),
      `PrivacyBox` (no account or server, nothing uploaded, the optional public lookups and what
      they send), `GetStartedFlow` (a numbered vertical diagram of the five My Data steps, each
      with Required, Recommended or Optional, ending at the results), `FastTrackCard` (the
      Clearing House import: what it fills for Personal and Pension and savings, what is still
      the user's, how to order the report, and a link to `/import/clearing-house`).
- [x] The old "Import data" button is now "Load my saved data file", with a hint line that names
      the Export data button in Settings. The Settings buttons are unchanged.
- [x] The "what it fills" lists come from `domain/clearingHouseImport/types.ts` and
      `mapReport.ts`: age, gender, salary and marital status (a suggestion) for Personal; the
      account details, deposit rates, fees and track, annuity estimate and cover for pension.
- [x] Copy under `welcome.*` in en, he and ru (RTL checked); `welcome.import` and
      `welcome.privacyNote` were removed. The Hebrew and Russian text is not native-reviewed.
- [x] Follow-up: the top primary button is "Get started" (smooth-scrolls to the Get started
      card and focuses its heading); "Start my plan" moved to the bottom of that card. Trade-off:
      it now comes before the Fast-track card.
- [x] Tests: `pages/Welcome/Welcome.test.tsx` (the boxes, the step order, the fast-track link,
      the Get started scroll, Start my plan inside the Get started card, the load button,
      loading a saved file, a bad file).

## App logo and Mediterranean colour scheme

The app had no logo (plain text in the header and the Vite purple bolt as the favicon) and
used Tailwind's teal. The user picked a pomegranate mark (Israeli touch, no Magen David) and
a Mediterranean palette (sea blue, warm Jerusalem-stone page background, sun gold accent).

- [x] **Logo.** New `components/LogoMark.tsx` (SVG, decorative, gradient ids made unique
      with `useId` so several marks can share a page). Used in the desktop sidebar, the
      mobile header and the Welcome page. `public/favicon.svg` replaced with the same mark.
      `index.html` gained a `theme-color` meta tag.
- [x] **Palette.** `index.css` defines `--color-brand-50…950` (600 is `#0b6e99`, 700 is
      `#075985`) and `--color-surface` (`#faf6ec`) in a Tailwind 4 `@theme` block. All
      `teal-*` classes became `brand-*` (35 files); the page background in `AppShell` and
      `Welcome` is `bg-surface`. Use `brand-*` for new work, not a raw colour name.
- [x] **Charts.** Net worth, net income and comparison charts use the brand blues. The
      provident-fund band moved from sky blue to turquoise `#2dd4bf` so it stays distinct
      from the (now blue) pension-fund band. Status colours (green, amber, rose) are unchanged.
- [x] Tests: `components/LogoMark.test.tsx`.

Not done: an `apple-touch-icon` and a web manifest (both need PNG files, and the project
has no image tooling). `public/icons.svg` is an unused Vite template leftover.

## UX review fixes (`[Review-UX-n]` commits)

Fixes for the findings in the UX/usability review, one commit per finding, in the order
the review recommended (data protection, accessibility, financial interpretation, then the
rest).

- [x] **UX-02 Accessible dialogs.** `components/ModalFrame.tsx` is the one dialog frame
      (`role="dialog"`, `aria-modal`, labelled by its title, focus moved in and restored,
      Tab trapped, Escape closes the topmost dialog, the page behind made `inert`).
      `FormModal` and `ConfirmModal` are thin wrappers over it; build new dialogs on it.
- [x] **UX-01 Import protects the current plan.** Importing over a plan that has data no
      longer replaces it silently. `ImportPreviewDialog` compares the current plan with
      the file (`domain/planSummary.ts`), warns about areas the file has nothing for
      (`readProfileFile` reports which sections the file carries), and only replaces on
      confirmation. The plan is first saved as a restore point (Dexie schema version 2,
      `restorePoints` table; only the latest is kept, and Reset all data deletes it) and
      Settings offers "Restore the plan from before the last import". Importing into an
      empty plan applies at once. `i18n/localeParity.test.ts` now checks that he and ru
      have every English key with the same placeholders. The Welcome page's "load my saved
      data file" is unchanged: there is nothing to lose before a plan exists.
- [x] **UX-15 Form errors reach the user.** After a blocked Next on the Personal step,
      focus moves to the first invalid field (opening the partner's tab when that is where
      it is), the field gets `aria-invalid` and `aria-describedby` pointing at its message
      (`NumberField` also links helper text), and a `role="alert"` summary tells screen
      readers why the step did not continue.
- [x] **UX-10 Stepper shows what is entered, not where the user is.** The check marks no
      longer mean "the user moved past this step". `pages/MyData/stepStatus.ts` derives each
      step's state from the saved data: Personal is "Required details complete" or
      "Required details missing" (amber "!"); Pension & Savings, Equity & Investments
      (which also holds bank deposits) and Expenses are "Details entered" (checked) or
      "Nothing entered yet"; Assumptions is "Customized" or "Using defaults". The state is
      printed under each step name and is part of the button's accessible name; the current
      step carries `aria-current="step"`. No review flag is stored, so an optional step the
      user looked at and left empty reads "Nothing entered yet" rather than "skipped".
- [x] **UX-06 The Dashboard gap KPI names its sign.** "Funding Gap" is now "Monthly
      surplus" or "Monthly shortfall" depending on the sign (the neutral "Monthly surplus
      or shortfall" while no spending is entered). The amount is shown as an absolute value
      under a one-line note ("to spare each month after your planned spending" / "short of
      your planned spending each month" / "Enter your planned spending to see this."), so a
      plain number is never read as a gap that is good or bad by itself.
- [x] **UX-04 The simulated success figure is not presented as a promise.** The Dashboard
      KPI "Probability of Success" is now "Simulated spending coverage to age 90". Under the
      figure it says what the number is (the share of the simulated market histories that
      fund the spending, and, at 100%, that all of them do and that this is not certainty),
      that it is not a guarantee, which return / inflation / volatility it assumes, and
      links to the Projections risk analysis. The risk-analysis card repeats the
      qualification and the assumptions outside its collapsed "How this works" section.
- [x] **UX-05 The Dashboard figures name their basis.** The income KPI says it is the
      lowest year of retirement (at the user's age in that year), after tax and in today's
      money, and reconciles it as "gross before tax, minus tax" (or "no tax expected"). The
      Snapshot labels pension income "Before tax, from age N" and state benefits "Tax-free,
      from age N". The years KPI shows each person's retirement age and years to go; for a
      couple it is titled "Years until your household retires" and notes that the later of
      the two is counted (`retirementWhen` in `domain/profileBasics.ts`, which
      `yearsToRetirement` now reads).
- [x] **UX-03 Sample accounts cannot be mistaken for the user's own.** While any account
      points at a sample report, every page shows a "Sample accounts are part of your
      results" notice (the number of made-up accounts, with the Sample badge) above the page
      content. Its "Remove sample accounts" action asks for confirmation and then removes
      only the accounts that came from the sample and the sample report records
      (`removeSampleImport`); accounts typed in or imported from a real report stay. Profile
      details the sample filled into an empty plan are ordinary values and stay; the
      confirmation says so. A separate disposable demo plan was not built; it would need a
      way to hold two plans and switch between them.
- [Review-UX-14] The preset row on the Assumptions step (`AssumptionsStep.tsx`) now wraps
  (`flex-wrap`, `max-w-full` buttons) instead of running past a 320 px screen in Russian, and
  each preset button reports `aria-pressed`. jsdom cannot measure layout, so the test asserts
  the wrapping classes and the pressed state.
- [Review-UX-7] The Assumptions presets are no longer opaque. Each preset is a card showing its
  yearly return, inflation and the real return they leave (Base: 6%, 2.5%, about 3.4%), the field
  labels say "per year" (and the return "before inflation"), and a note says the rates are
  nominal and that volatility is set separately. Which preset is marked is now derived from the
  values (`matchingPreset` in `domain/profileBasics.ts`), so changing the return or inflation by
  hand, or picking a Bureau of Statistics figure, switches the marking to a "Custom" card (which
  opens the fields); `assumptions.preset` is kept only as the last preset picked, so no
  migration was needed. Volatility is not part of any preset, so changing it keeps Base marked.
  A new `ActiveAssumptions` line ("Base - investment return 6% (before inflation), inflation
  2.5%, market volatility 12%. All per year." with a "Change assumptions" link) tops the
  Dashboard and Projections.
- [Review-UX-8] "Reference only" no longer sits on groups that contain calculation-relevant
  fields. The employer-grant group in `EquityHoldingForm.tsx` is now titled "Tax and vesting -
  affects your estimate" (tax track, vesting schedule, keeps-vesting and trustee-period
  checkboxes all feed the estimate) and only "Estimated tax on vesting/sale" is tagged. The
  same rule was applied to the pension account form: the Insurance coverages and Investment
  track & fees groups lost the group tag (death cover, risk premium, survivors' pension and the
  accumulation fee are used), while the disability amount, survivors' %, track name, deposit
  fee, profit-sharing fee and yield-guarantee flag carry the field tag. Groups where nothing is
  used (balance breakdown, ESPP details) stay tagged.
- [Review-UX-9] The scenario selector is now its own "Retirement scenario" section; each
  button reads "Early - age 60 / Standard - age 65 / Delayed - age 68" (`aria-pressed` marks
  the active one) and a note says it applies to the charts and cards below, not to the age
  comparison above. Every scenario-dependent title (net worth, income by source, income after
  tax, risk analysis, historical backtest, withdrawal order, liquidity ladder, source costs,
  unvested shares, stress tests, timeline) carries a small tag with the active scenario
  (`ScenarioTag` / `ScenarioTitle` in `components/ScenarioTag.tsx`, label helper in
  `useScenarioLabel.ts`); the heading's own accessible name is unchanged. The age comparison
  says it has its own ages. `defaultComparisonAges` now offers an early age up to 5 years
  before the standard one (not held at the 60 floor, but never before today or 50), so a plan
  for 60 starts at 55 / 60 / 63 rather than two identical columns; if no earlier age exists it
  offers the standard age and two later ones. `Early` is also never later than the entered age
  (a plan for 58 no longer gets "Early - age 60"), and when Early equals Standard because of
  the floor the selector says so.
- [Review-UX-11] My Data saves every change as it is made, and the footer now says so: a note
  "Changes save automatically on this device." with a small "Saving…" / "Saved" status
  (`SaveStatus` in `components/SaveStatus.tsx`, state from `ProfileContext` through the
  separate `SaveStatusContext` in `app/saveStatus.ts`, so a status flip re-renders only its
  readers). Only the newest write sets the status. If the browser refuses a write the footer
  shows an alert telling the user to check browser storage and use Export data in Settings,
  and it clears on the next successful write. The last step's button is "View my results"
  instead of "Save" (it still marks the plan as started and opens the Dashboard). Record
  dialogs keep their explicit Save / Cancel, since those really are a commit/discard choice.
- [Review-UX-12] The Clearing House import review no longer asks for a pass over every value
  of every account. It opens with a "Summary of this report" (accounts selected "x of y",
  total balance in the report, values selected, values to confirm, warnings) and, for more
  than one account, bulk controls: Select all / Clear all accounts, Show / Hide all details and
  "Show only the selected changes". Each account card shows its balance, how many values are
  selected and a "To check: n" badge, and lists only the values that need a look (a value that
  would replace one the plan holds, or an interpretation marked uncertain; highlighted with an
  amber edge) until "Show all details" is chosen, which also offers Select all values / Clear
  values for that account. Helpers in `reviewState.ts` (`accountValueRows`, `needsAttention`,
  `selectableKeys`, `candidateBalance`, `countWarnings`) hold the rules. The selection summary
  and the Import / Start over buttons sit in a `fixed` bar (`data-fixed-actions`) that
  stays in view while scrolling, above the mobile nav and beside the desktop sidebar
  (`index.css` adds scroll padding so a focused field is not hidden behind it). `Sticky` does
  not work there because `main` scrolls, so the bar's offsets are coupled to `AppShell`; the
  mobile nav now has a fixed `h-16` to keep them aligned. "Calculation-critical" is
  approximated as changed-versus-existing or uncertain values.
- [Review-UX-13] The My Data account tables no longer hide the balance on a phone or widen the
  page on a desktop. `SummaryTable` (used by the pension, bank-deposit, equity and expense
  tables) renders each row as a card below the `md` breakpoint (`useMediaQuery`, in
  `app/useMediaQuery.ts`; it reports "not narrow" where `matchMedia` is missing, as in jsdom).
  A card shows the first column as its title, the columns flagged `primary` as label / value pairs
  (pension: category and balance; bank deposits: amount and current value; equity: quantity and
  shekel value; expenses: amount and per month), every other column under a native
  `<details>` "More details", then Edit / Remove (still described by the card title) and, after
  the list, the totals. The card actions are visible buttons, not an overflow menu. The desktop
  table is unchanged, and the content column of `AppShell` now has `min-w-0`, so a wide table
  scrolls inside its own container instead of stretching the document past the viewport.
- [Review-UX-17] Bank deposits no longer vanish behind an unqualified "usable at any time"
  claim. The model still pools deposits into the non-pension investments bucket (usable at any
  age, growing at the plan return, whole balance treated as cost basis). Now the liquidity
  ladder and the source-cost card show a `BankDepositsNote` ("counted in Other Investments ...
  maturity date, early-withdrawal terms and renewal are not modeled individually") whenever a
  deposit with a balance exists, and the ladder / source-cost wording says "including bank
  deposits" / "treated as usable". The deposit form's Maturity date is no longer tagged
  "Reference only" (it does stop interest accruing in the current value) and carries a helper
  saying that it is not used to time withdrawals. Contract-aware deposits (early-withdrawal
  penalties, maturity and renewal, a bank rung in the ladder) are a modeling change left open.
- [Review-UX-20] The Projections charts say which spending case they describe. The net-worth
  curve follows the planned retirement spending; the income charts show the sustainable income
  (sized to last to age 90) and ignore the budget. `domain/netWorth.ts` gains
  `projectSpendingFunding` (a lean household drawdown that reports the age at which planned
  spending is first not fully funded). `SpendingBasisNotes` puts a one-line basis note under the
  net-worth title ("Your savings if you spend X a month ... covers it through 90 / runs out at
  age N") and under the income charts and timeline (sustainable income, not planned spending,
  with a shortfall warning). `NetWorthChart` marks the shortfall age with a dashed "Unfunded from
  here" line, and `NetIncomeChart` draws the planned after-tax spending as a dashed line. The
  income chart titles became "Sustainable income by source / after tax". The connected annual
  cash-flow view (income, withdrawals, essential and full expenses, unfunded spending) and a
  planned-spending line on the gross by-source chart are left open.
- [Review-UX-18] The income views separate recurring payments from withdrawals from savings.
  `estimateIncomeBreakdown` points gain `withdrawn` (the part of each band drawn from savings
  capital) and `recurringAmount(point, band)` (the rest: Bituach Leumi and started annuities);
  band totals are unchanged, so the Dashboard figures are unaffected. `IncomeBreakdownChart`
  stacks recurring payments (solid) under withdrawals (hatched, `BandSwatch` in the legend),
  groups the legend under those two headings, draws only the sources that have an amount, and
  its tooltip lists the non-zero sources with "(payment)" / "(withdrawal)". The retirement
  timeline lists each stage's payments and withdrawals separately, and a segment breaks when a
  source switches between the two. `IncomeSplitNote` explains that withdrawals can include the
  original capital and that the plan does not model interest or dividends as separate streams;
  it also says Other Investments is one pool (bank deposits, private and vested employer shares,
  cash, other assets). A bank / private-stock / employer-stock drill-down is not possible because
  the drawdown draws that pool as one bucket.
- [Review-UX-16] The Dashboard shows what Net Worth Today is made of. `breakdownPortfolio`
  (`domain/portfolioBreakdown.ts`) splits `aggregateCurrentNetWorth` into pension, provident,
  managers insurance, study fund, bank deposits, private shares (including ESPP and holdings with
  no category), vested employer shares and cash / other assets. Rows are rounded to whole shekels
  and the rounding difference goes to the largest row, so they add up exactly to the figure.
  `PortfolioSummaryCard` lists them (each row links to where it is entered), lists the unvested
  employer shares apart as not counted today (projections add what vests by retirement), states
  the USD/ILS rate behind the share values (Bank of Israel date, typed, or built-in) with a link
  to change it, and notes when a spouse's accounts are included. The Net Worth KPI links to it.
- [Review-UX-19] The decision screens show the essential/discretionary structure of the budget.
  `budgetBreakdown` (`domain/expenses.ts`) splits the itemised list into the essential and the
  full budget (the full figure is `desiredRetirementMonthly`, the number every projection is
  measured against) and by category, in whole shekels per month with largest-remainder rounding
  so the parts add up to the total. `BudgetCard` (Dashboard after the snapshot; Projections for
  the selected scenario) compares the same estimated net income with each budget ("to spare" /
  "short"), lists the categories and links to the expenses step. With one typed total it says
  essential and discretionary cannot be told apart and links to itemising. It states that the
  risk analysis tests the full budget only, so no "essentials covered" status is offered:
  that would need a probability computed for the essential budget (left for the owner).
- [Review-UX-22] Irregular costs hidden inside the monthly average are listed.
  `irregularCosts` (`domain/expenses.ts`) collects the itemised expenses paid once a year or
  less often (twelve or more months between payments; quarterly and bimonthly items are regular),
  with their per-payment amount, frequency and monthly equivalent (largest-remainder rounding so
  the rows add up to the total), their share of the planned monthly spending, and the largest
  single payment. `IrregularCostsCard` (Dashboard after the budget card; Projections after the
  budget card) shows the table and says plainly that this is an average, not a payment
  schedule: the inputs hold no due dates, so no dates are invented. The reserve line names the
  largest single payment as the amount that must be available when it falls due (it is not a
  modeled sinking-fund balance). The "Planned monthly spending" KPI links down to the card.
  The card appears only with itemised expenses.
- [Review-UX-21] The net-worth path explains its steps and splits by source. The simulation
  (`domain/drawdown.ts`) now records, per year, each kind's end-of-year balance and the
  sources whose capital became an annuity that year (the balance is zeroed because it is
  paid out as monthly income). `projectBalancePath` (`domain/balancePath.ts`) turns that into
  rounded per-kind points (largest-remainder rounding, `domain/rounding.ts`, so the parts add
  up to the net worth) and a list of events: drawing starts, and one annuity start per kind
  (same-kind sources combined). Both result screens number those events on the chart and list
  them under it ("What shapes this path"); the Projections table now has one column per kind
  with a balance plus a total, a note that balances are end-of-year in today's money and that
  annuitised capital is no longer a balance, and a note that bank deposits, shares and other
  holdings are one investments pool in the model, so no separate path is invented for them.
  Ages are the primary user's, as before. No stacked chart was built (a table was chosen).
- [Review-UX-23] Risk results say what they rest on. Projections gets a "What the risk tests rest on"
  card (`RiskBasisCard`, shown when a desired spending is entered) above the risk analysis. It
  states that the Monte Carlo risk analysis applies the plan's single return and volatility to all
  savings, that the historical backtest replays a hypothetical US stock/bond portfolio (the
  default 60/40, changeable in the card) rather than the user's own holdings, and, when there are
  dollar holdings, how much of the savings at retirement is in dollars and in employer shares
  (from `buildStressTest`), noting that neither test treats them differently from shekel savings
  and linking to the stress cases (`#stress-test`). The backtest's mix select now carries a
  "hypothetical model portfolio" hint. On the Dashboard the portfolio summary adds the share of
  the total that is employer shares (the concentration), with a link to Projections. The risk
  models themselves are unchanged: the backtest mix is still independent of the holdings.

## Second usability review fixes (`[Review-UXB-n]` commits)

Fixes for the findings in `review-b-ux-usability.md`, one commit per finding, in the order
of its section 10 (UXB-14 is skipped on request).

- [x] **UXB-01 Figures no longer change from one view to the next.** Two causes. (1) The
      real defect: when a draw empties the last capital, the year-end balances were left as
      floating-point residue (about 1e-13, sometimes negative), and the shares of the
      following year's draw (`balance / unlockedTotal`) turned into noise such as -2 or 4, so
      the last year's tax swung from ₪5,900 to ₪22,800 a month with the clock (a bank deposit's
      value changes with the date, which made the residue differ). `drawdown.ts` now counts a
      balance under `DRAWDOWN_DUST` (half an agora) that a draw leaves behind as empty, and
      the last year keeps the previous year's split as designed. (2) The engine read the
      system clock separately in every calculation. `ProfileProvider` now takes one moment
      (`evaluatedAt`) when the profile changes, or when the tab returns to the foreground after
      an hour, and pins the engine to it (`pinEngineClock` in `domain/trace.ts`; traces and
      `withEngineClock` still take precedence). The assumptions line on Dashboard and
      Projections shows "Calculated as of <date>". Tests: `domain/clockStability.test.ts`
      (a deposit plan swept across two weeks of system times) and `app/ProfileContext.test.tsx`.
- [x] **UXB-06 Every screen opens at its top.** `RouteScrollManager` (mounted in `App`) resets
      the scroll position and moves focus to the page `h1` on every forward navigation
      (links, the sidebar, "Next", the wizard stepper). A link to a section (`/path#id`)
      scrolls to and focuses that section instead, waiting up to about half a second for it
      to render. Browser back and forward, and plain in-page `#` links, keep the browser's
      own position. The Dashboard had no `h1`, so it now has one ("Dashboard") like the
      other screens; on small screens `scroll-padding-top` keeps a linked section below the
      sticky header, and the focused heading shows no ring. Tests:
      `app/RouteScrollManager.test.tsx`.
- [x] **UXB-23 "Bank deposits" opens the step where deposits are entered, at the deposits
      table.** Each row of "What Net Worth Today is made of" now links to its own section
      (`components/portfolioInputTargets.ts`): deposits to `/my-data/equity#bank-deposits-summary`,
      employer shares and private shares to their holdings tables, pension and savings accounts
      to the accounts table and "Cash and other assets" to the "Other assets" field. For this
      `SummaryTable` puts its `id` on its section and `NumberField` takes an `id`; the new
      scroll handling (UXB-06) does the rest. Tests: `components/portfolioInputTargets.test.tsx`
      checks that every target exists on the step it names; `Dashboard.test.tsx` checks the links.
- [x] **UXB-05 A retirement age the user never entered is no longer presented as theirs.**
      While `personal.retirementAge` is empty (or the spouse's, while the plan covers one) the
      plan still falls back to 67, but now says so: a banner above the Dashboard and Projections
      figures ("Using an assumed retirement age of 67", linking to the field), "67 (assumed)" in
      the "Years to Retirement" note, a first "Improve your estimate" item (`retirementAge` /
      `spouseRetirementAge` in `findDataGaps`) and a "67 if empty" placeholder on the field.
      `assumedRetirementAges` (`domain/profileBasics.ts`) decides who is assumed; the links go to
      the new field ids via `components/retirementAgeTargets.ts` (the spouse's opens the partner
      tab). `NumberField` gained a `placeholder`. Tests: `household.test.ts`,
      `inputGuidance.test.ts`, `AssumedRetirementAgeBanner.test.tsx`, `Dashboard.test.tsx`.
- [x] **UXB-16 The "Safe withdrawal rate" no longer calls a rate safe that the user's plan may not meet.**
      The old figure was the first-year draw of the *sustainable* income, so it did not move with
      the planned spending (5.6% at both ₪21,166 and ₪42,000 a month). The tile is now "Your
      withdrawal rate": the planned spending's first-year draw (plus any part the savings cannot
      pay) over the spendable savings, before tax, with a neutral note ("Rates above about 4%
      rely more on investment returns"). Pension and state income that have started reduce it;
      "—" with a reason when no spending is planned or no savings are spendable.
      `RetirementKpis.withdrawalRate` (`domain/dashboardKpis.ts`) changed meaning accordingly.
      Tests: `dashboardKpis.test.ts`, `Dashboard.test.tsx`.
- [x] **UXB-02 The Dashboard says which spending each figure follows.**
      The income KPI (now "Sustainable income after tax") says it is the most the savings can pay
      so they last to age 90, and adds the plan line "At your planned ₪X a month your usable
      savings last through age 90 / run out at age N" (`PlannedSpendingLine`,
      `components/SpendingBasisNotes.tsx`). The net-worth chart carries the same basis note as
      the Projections page (`NetWorthBasisNote`) and the red "Unfunded from here" marker. "What
      shapes this path" (`PathEventsList`, shared with Projections) gained an unnumbered
      "Age N: at your planned spending your usable savings run out" row, and with no spending
      entered says "No spending is entered, so nothing is drawn" instead of "start drawing".
      Tests: `Dashboard.test.tsx` ("which spending the figures follow"), plus the KPI rename in
      `App.test.tsx`, `Welcome.test.tsx`.
- [x] **UXB-29 Copy, translation and visual slips.**
      The Hebrew status banner was misspelled ("להשגאת") and addressed the user in the masculine
      singular; it now reads in the plural like the rest of the Dashboard (`dashboard.statusOnTrack`,
      `statusShortfall`; `localeParity.test.ts` guards it). The historical backtest says "held up in
      every starting year" (new `projections.history.band.all`) when all windows are funded, instead
      of "nearly all". `DateField` keeps its calendar button inside the input's own box — it was
      anchored to the whole cell, so beside a taller neighbour (the holding dialogs) it dropped
      below the input; its label is now tied to the input with `htmlFor`. On Projections, an Early
      scenario that equals Standard (the age-60 floor, or a plan to retire before 60) is disabled
      and a stored Early choice falls back to Standard. The broader mix of masculine-singular and
      plural address across the Hebrew UI is a copy decision left open. Tests:
      `DateField.test.tsx`, `Projections.test.tsx`, `PensionSavingsStep.test.tsx`,
      `localeParity.test.ts`.
- [x] **UXB-30 The coverage KPI says why it is empty.**
      Before spending is entered, "Simulated spending coverage to age 90" showed only "—". It now
      carries the same note as the surplus tile ("Enter your planned spending to see this.") and an
      "Add expenses" link to the expenses step; when spending is entered but no retirement years
      are left to test, it says so (`projections.risk.noYears`). Tests: `Dashboard.test.tsx`.
- [x] **UXB-31 Account amounts are shown in whole shekels.**
      Pension balances showed "₪221,010.2" or "₪63,458.15" next to whole-shekel figures elsewhere.
      `summaryFormat.ts` gains `formatWholeCurrency`; the pension and savings tables (balance,
      total, estimated annuity), the person cards, the bank-deposit amount, the expense-item amount,
      the typed-total note and the import preview use it. Dollar prices keep their cents, and the
      edit dialogs still hold the exact stored value. Tests: `SummaryTables.test.tsx`.
- [x] **UXB-12 The holding dialog previews the restated value.**
      With "Quantities and prices are as originally reported" ticked and a later split, the dialog's
      "Total value" used the typed share count while the saved row used the restated one (4× for a
      ×4 split). `EquityHoldingForm` now takes the restated quantity from `HoldingDialog`, shows the
      value on that quantity and keeps the typed figures in brackets ("as reported: 10 shares ·
      $150", `splits.totalAsReported`). Tests: `BulkHoldings.test.tsx`.
- [x] **UXB-36 Chart colours, names and tables are consistent.**
      `charts/chartPalette.ts` gives every colour one meaning: dark slate for totals (net worth, the
      median, income kept), grey for deducted or secondary amounts (tax, the other compared ages),
      one dashed magenta line for the planned spending in the Compare and Net-income charts, and
      red only for a shortfall; the income-band and backtest colours were darkened to 3:1 on white.
      Every chart's svg now has `role="img"`, an accessible name and a description (`chartA11y`).
      Each chart shows a one-sentence takeaway above it (`useChartTakeaways`), and the net-worth,
      income, net-income, risk and history charts gain a "Show as table" switch (`ChartFrame`,
      `ChartTables`; the table is the same numbers the chart draws). Strings are under `charts.*`.
      Tests: `chartConsistency.test.tsx`, `chartTakeaways.test.tsx`.
- [x] **UXB-03 "On track" is qualified by the risk result.**
      The Dashboard said "on track" and "monthly surplus" from the average-return projection, while
      the risk analysis showed a low chance of funding the same spending. When the plan is funded in
      average markets but the Monte Carlo band is not "strong", the status banner turns amber and
      reads "On track in average markets only", with the share of simulated histories that fund the
      plan, the spending that holds with 90% confidence (when below the goal) and a link to the risk
      analysis; the surplus KPI turns neutral and adds the same sentence. The surplus is also sized
      against the planned spending ("9% above your planned spending of ₪1,000 a month"). The
      feasibility card now says its age is for average markets and adds the earliest age that holds
      with 90% confidence (`findEarliestConfidentRetirementAge`, a linear scan with
      `meetsMonteCarloConfidence`, which stops each simulation once the failures exceed what 90%
      allows; `useRetirementFeasibility` shares the result between the Dashboard and Projections).
      The historical backtest card explains in one sentence why it can disagree with the
      simulation (the replayed return against the plan's return, and the simulation's volatility).
      `StatusBanner` gains a `caution` state, details and an action. Tests: `StatusBanner.test.tsx`,
      `FeasibilityCard.test.tsx`, `Dashboard.test.tsx`, `Projections.test.tsx`,
      `feasibility.test.ts`, `monteCarlo.test.ts`.

## Modeling assumptions (by phase)

- **Tax modeling assumptions (Phase I).**
  - Tax is a post-hoc layer on the level-gross plan, so the plan is
    conservative: it does not re-solve for a higher gross to reach a net
    target. The headline is the lowest after-tax year, which is why it can
    be lower than the later years (the 9A exemption starts at 67 and the
    Bituach Leumi pension at its own age).
  - Withdrawals are pro rata across unlocked sources and taxed per owner;
    there is no tax coordination between spouses and no withdrawal-order
    optimization.
  - The 2026 brackets and credit point are used for all years, fixed in
    today's money. The exemption share is the exception: since Phase L it
    follows the calendar-year schedule (57.5% in 2026, 62.5% in 2027, 67%
    from 2028).
  - Regular and IRA provident funds are treated as pension income.
    Investment provident funds and other investments pay 25% on the real
    gain only; the cost basis is today's balance plus future deposits, so
    gains already accrued today are understated. Declared equity gains
    reduce the other-investments basis.
  - Study-fund and Bituach Leumi pension income are tax-free.
    `annuityTaxType` is not used yet.
  - The severance basket (past tax-free severance, which cuts the
    conditional exemption) applies to the primary user only.
  - Not modeled: Bituach Leumi contributions, health tax on non-pension
    income, other credit points (children, olim, etc.), the
    gemel-to-annuity exemption, old gemel lump-sum rules. Health tax on an
    early pension was added in Phase L.
  - Medium confidence: the severance-offset formula (1.35/180) and the
    conditional-exemption treatment. Constants come from secondary sources.
  - **Behavior change:** the headline monthly income, the funding gap and
    the feasibility result are now after tax, so existing profiles show
    lower income than before. The gross figure is still used for the
    Bituach Leumi hint.
  - `docs/plan.md` listed the 35% bracket ceiling as 53,970; the correct
    2026 value is 46,690.

- **Household modeling assumptions (Phase H).**
  - Household spending starts when the later spouse retires. Until then
    each member keeps contributing to their own accounts until their own
    retirement age; the model assumes the working spouse's salary is not
    available to cover spending after the first spouse retires.
  - Payments that start before the household retires (a Bituach Leumi
    pension, an account annuity) are counted from the household's
    retirement and are not drawn in the simulation earlier — a
    conservative simplification.
  - The scenario functions (early / standard / delayed) shift both
    spouses by the same offsets from their entered ages (floor 60,
    default 67 when empty). The feasibility scan keeps the spouse's age
    linked to yours through the age gap.
  - A spouse's Bituach Leumi pension is calculated like yours. The
    ₪924 supplement waits until the spouse stops working because its
    income-test threshold could not be confirmed (it then assumes full
    payment). No child supplement, survivor analysis or tax effects
    (the spouse's credit points are Phase 3).
  - To plan a spouse with no pension, enter 0 insured years and a
    retirement age equal to their current age.
  - **Behavior change:** a retirement age already in the past now
    amortizes the funding over the remaining years from today instead of
    producing a negative period (a minor fix made while generalizing the
    timing; no earlier test depended on it).
  - A single person, or a married user who has not entered a spouse age,
    gets exactly the previous results.

- **Per-source modeling assumptions (Phase G).**
  - An account with no product type is treated as a pension fund that is
    fully accessible (unlock age 0), so old profiles keep their numbers; the
    Dashboard flags these accounts. `iraProvidentFund` is treated as locked
    until 60.
  - Provident funds are modeled as capital drawn down from 60 (the
    annuity-only rule for post-2008 deposits is not applied).
  - Annuities apply only to pension funds and managers insurance, are
    treated as inflation-linked real streams through age 90, and take the
    annuitized capital out of the simulation, which shows as a drop in net
    worth at the start age. `estimatedMonthlyAnnuity` wins over a guaranteed
    factor; with neither set the account is drawn down as capital.
  - No early-withdrawal penalty or tax, no withdrawal-order optimization
    (pro rata across unlocked sources), no study-fund "3 years" retirement
    exception, no severance split, no minimum-pension rule.
  - **Behavior change:** the income can no longer borrow against a future
    Bituach Leumi pension or annuity — a person with no savings now gets 0
    before the pension starts (previously a positive figure). Feasibility
    results with ordinary savings are unchanged.
  - The simulation draws in rows N..90 (91−N draws) while the closed form
    spends over 90−N years; this one-row quirk predates Phase G and is kept.
  - Access rules were validated against secondary sources only.

- **Bituach Leumi modeling assumptions (Phase F).** Single-person rate
  only (the spouse supplement was added in Phase H); the child
  supplement, the earnings test between the statutory age and 70, and the
  means-tested income supplement are not modeled. The
  current-year amounts are used as today's-money values for all future
  years. Retiring after the statutory age assumes the pension is deferred
  (5%/year) because of work income. New and legacy profiles **include the
  pension by default** (`includeInProjection: true`), so existing users'
  income estimates rise; the Dashboard card makes that visible and the
  Personal step can switch it off. `buildTestProfile` excludes it by
  default so older tests stay isolated. Women's retirement age uses birth
  year (derived from age and the current year), which is exact for
  1960–1969 cohorts; cohorts born before mid-1947 are not modeled.
- **Contribution modeling assumptions (Phase E).** Salary is held constant
  in real terms (no real wage growth); deposits are end-of-month, compounded
  monthly at the real return; all contributions are attributed to the
  "pension" bucket in the income breakdown; no tax/fee drag on deposits.
  Typical Israeli rates to enter: pension 6% employee + 6.5% employer + 6%
  severance; study fund 2.5% + 7.5%.
- Linting uses `oxlint` (already chosen during prototype phase) rather than
  ESLint+Prettier as `docs/architecture.md` originally proposed.
- **Repo visibility: private → public.** GitHub Pages publishing from a
  private repo requires GitHub Pro/Team/Enterprise; this account is on the
  Free plan. User approved making the repo public so Pages (Actions-based
  deploy) could be used as originally planned, instead of switching to a
  different free host.
- **Equity FX conversion placeholder.** The data model allows USD-
  denominated equity holdings but there's no live/bundled FX feed yet
  (that's Phase 4 "External Data" scope). `domain/constants.ts` defines a
  fixed `FALLBACK_USD_TO_ILS_RATE` placeholder so equity still counts
  toward net worth instead of being silently dropped; replace with real FX
  data in Phase 4.
- **Early/Delayed scenario offsets are Phase-1 assumptions**, not sourced
  from the functional spec (which only names the three scenarios, not their
  exact age deltas): early = standard retirement age − 5 years (floored at
  60), delayed = standard + 3 years. See `domain/constants.ts`.
