# Project Plan & Roadmap

Consolidates `initial-docs/Israeli Retirement Planning & Income Projection
Application.md` (functional spec) and `docs/architecture.md` into a phased,
buildable roadmap. Confirmed with the project owner:

- Phase 1 targets the functional spec's Section 14 "Recommended MVP" scope.
- External data sources: attempt direct client-side fetch where CORS
  permits, fall back to bundled static defaults otherwise (see
  `docs/architecture.md` → External Data Sources).
- Deliverables before implementation: this plan, `docs/ui-concept.md`, and
  an interactive click-through prototype (no calculation logic yet).

## Status

Phase 1 (MVP) is implemented — app shell, i18n/RTL, Dexie persistence +
export/import, domain calculation engine, dashboard/projections wiring,
wizard validation, CI + GitHub Pages deploy, and initial component tests
are all done. The first Phase 2 module, **Bituach Leumi**, is also done
(Phase F), followed by the **per-source model** (Phase G): per-product
access/liquidity rules, account annuitization and a per-source retirement
timeline, and **couples/household** (Phase H): a spouse, per-account owners,
staggered retirement and the Bituach Leumi spouse supplement. See [`docs/implementation-progress.md`](implementation-progress.md)
for the authoritative, task-by-task checklist and logged deviations.

Known gaps vs. this document's original Phase 1 output list: **both are now
closed** (see Phase E in
[`docs/implementation-progress.md`](implementation-progress.md)).

- **Salary / ongoing-contribution modeling — done.** `personal.monthlyGrossSalary`
  plus per-account employee/employer/severance contribution percentages
  feed monthly deposits (active accounts only, until retirement) into the
  projections. Salary is held constant in real terms (no real wage growth).
- **Earliest feasible retirement age — done.**
  `findEarliestFeasibleRetirementAge()` scans upward from the user's
  current age and returns the first age whose funding gap is non-negative;
  the Dashboard shows it, and Projections offers a free 3-age comparison
  (see the retirement scenario comparison item below).

## Open Items to Validate (flagged from initial docs)

Pre-Phase-2 check, **2026-10-26**. Items 1–2 were validated against
authoritative sources and drove the implementation; items 3–4 are
partially resolved and flagged for manual verification before their
modules ship; item 5 (per-product access rules) was checked against
secondary sources before Phase G; item 6 (couples) was validated against
btl.gov.il before Phase H.

1. **Bituach Leumi old-age pension — validated** (btl.gov.il; implemented
   in `domain/bituachLeumi*.ts`, every amount tied to an effective date and
   shown with a source link in the UI).
   - Retirement age: men 67; women 62 up to 65 by birth year (1960 → 62y4m,
     1962 → 63, 1966 → 64, 1970+ → 65). From age 70 the pension is paid
     regardless of work income.
   - **No early-claim option.** Between the retirement age and 70 an
     earnings test applies; the pension can only be deferred, with a
     **5% supplement per deferred year** of the full pension.
   - Basic pension from 01.01.2026: ₪1,838 single / ₪2,762 couple; spouse
     supplement ₪924; child supplement ₪581 (max 2). **Seniority
     supplement: 2% per full insured year, capped at 50%** (BTL's page
     states "per full year"; there is no 10-year threshold).
   - Qualifying period: 144 insured months, or 60 within the last 10 years.
   - Income-supplement guarantee (means-tested) from 01.01.2026: ₪4,375
     single under 70, ₪6,912 couple. Used only as a hint, not modeled.
   - Amounts are updated every 1 January (mostly by the average wage).
2. **Keren Hishtalmut — validated.** Liquidity is 6 years, or 3 years when
   used for study or retirement. The limit that exists is on **annual
   deposits**: ₪15,712/month salary (≈ ₪18,852/year combined 10%), frozen
   through 2027; self-employed ₪13,203 deductible and ₪20,566
   capital-gains-exempt. The "₪4.3M tax-free withdrawal cap" and the
   "15-year self-employed track" mentioned earlier could **not** be
   confirmed and are not planned. Modeling the deposit ceiling is an
   optional refinement.
3. **Tax brackets/credits — cross-checked against secondary sources
   (medium confidence; implemented in `domain/tax.ts` and
   `domain/taxRates.ts`).** gov.il / taxes.gov.il blocked automated access,
   so the figures come from MSL, Ovdimly, ig-tax, israeltax.org and Efraty.
   The Dashboard shows the rates' effective date and a link to the Tax
   Authority.
   - 2026 monthly brackets (widened by legislation published in March 2026,
     retroactive to 1 January): 10% to 7,010; 14% to 10,060; 20% to 19,000;
     31% to 25,100; 35% to **46,690**; 47% above. The 53,970 limit seen in
     older material is the 2022-23 value and was dropped.
   - Credit point ₪242/month; a resident man gets 2.25 points, a woman 2.75.
   - Qualifying annuity (kitzva mezuka, Section 9A): from the statutory
     retirement age, a share of a pension up to ₪9,430/month is exempt: 35%
     conditional plus a fixed share that rises by calendar year (22% in 2025,
     22.5% in 2026, 27.5% in 2027, 32% from 2028), so 57.5% in 2026, 62.5%
     in 2027 and 67% from 2028. The engine uses each year's share. Each
     tax-free severance shekel already withdrawn cuts the conditional part
     by 1.35/180 a month (medium confidence).
   - Health tax on an early pension (before the statutory retirement age):
     3.23% up to ₪7,703/month and 5.17% above (verified on btl.gov.il).
   - Surtax 3% above ₪721,560/year, plus 2% on the part of capital income
     above it; capital gains 25% on the real gain.
   - **Re-check against the Tax Authority's published circulars in a browser
     before relying on the edge cases.** Every figure, its confidence and
     what to search for is listed in
     [`docs/constants-to-verify.md`](constants-to-verify.md).
4. **Managers Insurance — resolved (medium confidence).** Policies with a
   guaranteed annuity factor have not been sold since 1 Jan 2013
   (Circular 2012-1-5), so it is a legacy-policy input, which matches the
   existing `LegacyPolicyModel` field.
5. **Access / liquidity rules per product — validated against secondary
   sources only (2026-10-26; medium-to-high confidence).** Bizportal,
   btl.gov.il and nevo.co.il were readable; gov.il and Kol-Zchut were
   blocked, so re-check against the Capital Market Authority before
   relying on the edge cases. Implemented in `domain/accessRules.ts` and
   `domain/sources.ts`.
   - Pension funds, managers insurance and provident funds (kupat gemel):
     money can be taken from **age 60**, men and women alike (high
     confidence for pension and gemel; medium for managers insurance).
   - Investment provident fund (*gemel le-hashkaa*): accessible at any
     time (high confidence).
   - Study fund: liquid **6 years after the first deposit** (high
     confidence).
   - Managers insurance: monthly annuity = balance ÷ conversion factor
     (*mekadem*). Guaranteed factors by cohort are about 144, 167 and 200;
     policies since 2013 use a market factor of about 214. Only a
     user-entered factor or annuity is used — no official factor table.
   - Provident fund deposits from 2008 onward must be taken as an annuity;
     earlier deposits can be taken as a lump sum. The model simplifies this
     to capital drawn down from 60.
   - **Not modeled** (unverified or out of scope): the minimum-pension rule
     (32.5% of the average wage) that restricts early lump sums; the
     study-fund "3 years" exception for retirement; official conversion
     factor tables; the early-withdrawal penalty; the
     severance (*pitzuim*) split.
6. **Couples — validated against btl.gov.il (2026-10-26; implemented in
   `domain/household.ts`).**
   - The **spouse supplement (₪924/month)** is paid to the pensioner only
     for a spouse who lives in Israel and receives no Bituach Leumi pension
     of their own. If both spouses qualify, each receives a single-rate
     pension. Common-law partners count as married.
   - The supplement is **income-tested** unless the spouse is a woman aged
     67+ or a man aged 70+. The income threshold itself could **not** be
     confirmed, so it is not hard-coded: the model starts the supplement
     only once the spouse has stopped working (or is past that age) and
     assumes it is then paid in full.
   - The couple income-supplement guarantee (₪6,912) is used for the hint
     when the household is a couple. The child supplement is out of scope.
   - Each spouse is taxed separately, with their own credit points (see
     Open Item 3 and Phase 3).

## Phase 1 — MVP (functional spec Section 14)

**Goal:** a working single-user projection tool with the essential inputs
and outputs, fully localized and responsive, proving out the architecture.

Inputs:

- Age, gender, expected retirement age
- Current salary
- Current pension fund (Keren Pensia) balance
- Current Keren Hishtalmut balance
- Other investment assets (lump sum)
- Monthly living expenses (current/retirement)
- Assumption set: investment return & inflation (conservative/base/optimistic
  presets, user-editable)

Outputs:

- Retirement income estimate (monthly, in today's money)
- Net worth projection over time (chart)
- Early retirement feasibility date
- Funding gap (shortfall/surplus vs. desired expenses)
- Simple retirement-readiness indicator (deterministic, not probabilistic
  yet — Monte Carlo is Phase 4)

Technical scope:

- App shell, routing, i18n (en/ru/he + RTL), responsive layout
- Dexie-backed local storage of profile + assumptions, with export/import
- Deterministic projection engine (unit-tested) for the sources above
- Dashboard + data-entry wizard + settings screens (see `docs/ui-concept.md`)
- CI (lint/test/build) + GitHub Pages deploy

**Out of scope for Phase 1:** Bituach Leumi detailed eligibility rules,
couples/household modeling (added in Phase 2), survivor analysis, tax module, external live
data feeds, Monte Carlo, real estate, Keren Hishtalmut/Provident
Fund/Managers Insurance nuance beyond basic balance+growth.

## Phase 2 — Core Retirement Sources & Couples

- **Bituach Leumi module — done** (see Phase F in
  [`docs/implementation-progress.md`](implementation-progress.md)):
  statutory retirement age, seniority and deferral supplements, qualifying
  period, a manual override for BTL's own calculator figure, and an
  income-supplement hint, with the rates' effective date and source shown on
  the Dashboard. Single-rate only; the spouse supplement came with
  couples (below), while the child supplement, the earnings
  test and the means-tested income supplement itself are not modeled. The
  "earliest claim age" idea was dropped because BTL has no early claim.
- **Per-source model — done** (Phase G in
  [`docs/implementation-progress.md`](implementation-progress.md)):
  each account is a source with its own unlock age (pension, managers
  insurance, provident fund from 60; study fund 6 years after the first
  deposit; investment provident fund and other assets always accessible),
  and pension/managers-insurance accounts can be converted to a monthly
  annuity from a user-entered amount or guaranteed factor. Income is limited
  by when each pot opens, so retiring before 60 only spends accessible
  savings. The Dashboard explains locked capital, annuities and uncategorized
  accounts; Projections shows a six-band income chart and a retirement
  timeline by source and age. Early-withdrawal penalties and
  withdrawal-order optimization remain later work; tax came in Phase 3.
- **Couples / household — done** (Phase H in
  [`docs/implementation-progress.md`](implementation-progress.md);
  rules in Open Item 6). Marital status "married" reveals a spouse section
  in the Personal step (age, gender, retirement age, salary, Bituach Leumi
  inputs); each pension/savings account has an owner (you or your spouse).
  Other assets and stocks stay household-level. Household spending starts
  when the later spouse retires; each spouse keeps contributing until their
  own retirement age and claims their own Bituach Leumi pension at their own
  age, plus the ₪924 spouse supplement where it applies. "Earliest feasible"
  is the earliest year both can retire together. A spouse only joins the
  plan once their age is entered, and single-person results are unchanged.
  Not modeled: survivor analysis (Phase 3), the working spouse's salary
  after the first spouse retires, payments that start before the household
  retires (they count from retirement and are not drawn earlier), the child
  supplement.

## Phase 3 — Risk, Tax & Life Events

- **Tax module — done** (Phase I in
  [`docs/implementation-progress.md`](implementation-progress.md); rates in
  Open Item 3). Retirement income is now shown after tax: each spouse is
  taxed separately, year by year, on their own pension income (brackets,
  credit points and the Section 9A exemption from the statutory retirement
  age) and on the real gain of investment provident funds and other
  investments (25%); Bituach Leumi pensions and study-fund withdrawals are
  tax-free. The Dashboard headline, funding gap and feasibility use the
  lowest after-tax year; a tax card shows the split and what is and is not
  included, and Projections charts the after-tax income per year. Credit
  points are editable for both spouses. Phase L refined it: the exemption
  share follows the calendar-year schedule (57.5% in 2026, 62.5% in 2027,
  67% from 2028) and a pension taken before the statutory retirement age
  bears health tax (3.23% / 5.17%). Phase M added employer stock under
  Section 102: the grant-date value of shares sold in retirement is taxed as
  ordinary income at the marginal rate and the growth above it at 25% (a
  sale within 24 months of the grant, or the ordinary-income track, is taxed
  entirely as ordinary income). Phase N added health tax (and, before the
  statutory age, Bituach Leumi) on that ordinary part, and vesting batches
  with their own 24-month periods. Not modeled: Bituach Leumi
  contributions on other income, health tax on non-pension income, other credit
  points (children), tax planning between spouses (for example shifting
  withdrawals to the spouse with the lower rate), the investment-gemel annuity
  exemption from 60, the 30% rate for a 10% shareholder, options with a strike price
  and ESPP. A **Bridge Planner** (liquidity ladder, withdrawal strategies,
  purchase lots, vest-aware retirement date) is designed but not built: see
  [`docs/bridge-planner-design.md`](bridge-planner-design.md).
- **Stock price data and autofill — done** (Phase T in
  [`docs/implementation-progress.md`](implementation-progress.md); design in
  [`docs/stock-price-data-design.md`](stock-price-data-design.md)). A daily job
  publishes the S&P 500 price history with the app; the stock dialog suggests
  tickers and fills the price on the purchase or grant date, today's price and the
  company name. Prices are dividend-adjusted (older prices of dividend payers are
  too low). No calculation changed. (simulate death of either spouse)
- Real estate module (equity, rental income, appreciation)
- **Retirement scenario comparison — done** (Phase J in
  [`docs/implementation-progress.md`](implementation-progress.md)).
  Projections has a "Compare retirement ages" card: pick any three
  retirement ages for the primary user and see, side by side, the years
  from now, the savings when the household starts drawing, the income
  before and after tax, and the gap to the desired spending. A spouse's
  retirement moves by the same number of years from the age they entered, so
  the user's own entered age reproduces the Dashboard exactly. The three
  ages are saved in the profile (`comparisonAges`, once all three are valid)
  and start at the Early / Standard / Delayed ages; a chart plots them
  against the desired spending.
- **Input guidance and single-person support — done** (Phase K in
  [`docs/implementation-progress.md`](implementation-progress.md)). Only the
  current age and the desired retirement age block the plan; every other
  field is badged "Recommended" (changes the result) or "Reference only"
  (saved, not used in any calculation, e.g. policy number and fund ID), and
  the Dashboard's "Improve your estimate" card lists the optional details
  that would change the result. A person without a partner needs nothing
  more than the two ages; spouse fields and results appear only once a
  spouse age is entered.

## Phase 4 — Advanced Projection & External Data

- Monte Carlo simulation (10th/50th/90th percentile, success probability)
- Historical projection mode using real CPI/market-return history
- Live external data integrations per the fetch-then-fallback strategy
  (CPI, FX, fund performance, mortality tables, risk-free rate)
- Household dashboard KPIs from functional spec Section 13 in full
- Statement import: the **Pension Clearing House route is built** (zip or XML
  files, password prompt, review before apply; see
  `docs/clearing-house-import-analysis.md`). No other import route is planned.

## Non-Functional Requirements (all phases)

- TypeScript strict mode; maintainable, tested domain layer
- Desktop + mobile responsive UI
- English (default) / Russian / Hebrew localization, including RTL
- Professional, clean visual design (see `docs/ui-concept.md`)
- No server-side storage of user financial data; local-first with
  export/import for backup

## Milestone Definition of Done (per phase)

1. Domain logic unit-tested.
2. UI localized in all three languages (no hardcoded strings).
3. Responsive check at mobile/tablet/desktop breakpoints.
4. Data migration path verified if the Dexie schema changed.
5. CI green (lint, type-check, test, build) before merge.
