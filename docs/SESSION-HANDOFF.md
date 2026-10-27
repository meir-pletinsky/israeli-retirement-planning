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
done**, **Phase J (retirement scenario comparison) is done**, and **Phase K
(input guidance, single-person checks, UI polish) is done**. Phases A–J are
committed and pushed to `main`; Phase K is committed and pushed only if
`git log` shows it.

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
  - Limitations: 2026 rates used for all years (the 2027-28 exemption steps
    are not modeled); pro rata draws taxed per owner with no spouse tax
    coordination; investment basis = today's balance + deposits (existing
    gains are understated); the severance basket applies to the primary
    only; no health tax or Bituach Leumi contributions, other credit points
    (children), gemel-to-annuity exemption or old gemel lump-sum rules;
    `annuityTaxType` is unused. Medium confidence on the severance offset
    (1.35/180) and the conditional-exemption treatment.
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
- 336 tests total, all green; lint/typecheck/build all green.

## Where to go next

Phase 1, the Phase 2 modules (Bituach Leumi, per-source model,
couples/household), the Phase 3 tax module and scenario comparison, and the
Phase K input guidance are complete. Remaining, not yet started:

- **Survivor analysis** (simulate the death of either spouse), Phase 3.
- **Real estate module** (equity, rental income, appreciation), Phase 3.
- Tax refinements: the 2027-28 exemption steps, health tax and Bituach
  Leumi contributions, other credit points, spouse tax coordination, and
  re-checking the constants against the Tax Authority's circulars.
- Possible refinements to the contribution model (they change numbers, so
  they were deliberately left out of Phase K): real wage growth, a
  per-account salary override, and the study-fund **annual deposit** ceiling
  (₪15,712/month salary).
- Using the reference-only fields (policy number, fund ID, fees, annuity tax
  type, ...) in calculations, or matching `fundId` to published fund data
  (Phase 4, external data).

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
