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
Phase 3 tax module (gross → net income) as Phase I.

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
      GitHub Pages on merge to `main`. Live at
      https://meir-pletinsky.github.io/israeli-retirement-planning/
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

## Deviations from original docs (log as they happen)

- **Tax modeling assumptions (Phase I).**
  - Tax is a post-hoc layer on the level-gross plan, so the plan is
    conservative: it does not re-solve for a higher gross to reach a net
    target. The headline is the lowest after-tax year, which is why it can
    be lower than the later years (the 9A exemption starts at 67 and the
    Bituach Leumi pension at its own age).
  - Withdrawals are pro rata across unlocked sources and taxed per owner;
    there is no tax coordination between spouses and no withdrawal-order
    optimization.
  - The 2026 rates (57.5% exemption, brackets, credit point) are used for
    all years, fixed in today's money. The 2027 (62.5%) and 2028 (67%)
    exemption steps are not modeled.
  - Regular and IRA provident funds are treated as pension income.
    Investment provident funds and other investments pay 25% on the real
    gain only; the cost basis is today's balance plus future deposits, so
    gains already accrued today are understated. Declared equity gains
    reduce the other-investments basis.
  - Study-fund and Bituach Leumi pension income are tax-free.
    `annuityTaxType` is not used yet.
  - The severance basket (past tax-free severance, which cuts the
    conditional exemption) applies to the primary user only.
  - Not modeled: health tax and Bituach Leumi contributions, other credit
    points (children, olim, etc.), the gemel-to-annuity exemption, old
    gemel lump-sum rules.
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
