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
are all done. See [`docs/implementation-progress.md`](implementation-progress.md)
for the authoritative, task-by-task checklist and logged deviations.

Known gaps vs. this document's original Phase 1 output list (not blockers,
but should be addressed before calling Phase 1 fully spec-complete):

- **No "current salary" input or ongoing-contribution modeling.** The data
  model (richer than this plan originally assumed — see
  `person-programs-and-investments.json` and `docs/ui-concept.md`) only
  captures point-in-time account balances, so projections grow existing
  balances but don't model future contributions from salary. Revisit if/when
  a salary field is added.
- **"Early retirement feasibility date" isn't solved for.** What's
  implemented instead is a 3-way scenario *comparison* (early/standard/
  delayed, at fixed age offsets — see `domain/constants.ts`), not a
  calculation of the earliest age at which the funding gap turns
  non-negative. A true feasibility solver is a reasonable Phase 2 addition.

## Open Items to Validate (flagged from initial docs)

These aren't blockers for planning/UI concept, but should be confirmed with
authoritative sources (Bituach Leumi, Ministry of Finance, Tax Authority)
before the real calculation engine ships in Phase 2+:

- Exact current Bituach Leumi old-age pension eligibility ages, amounts, and
  income-supplement thresholds (change periodically; must not be hardcoded
  without a source/date shown to the user).
- Keren Hishtalmut liquidity rule (6-year holding period) and any
  profession-specific exceptions.
- Current tax brackets/credits applicable to retirement withdrawals vs.
  earned income.
- Whether "Managers Insurance" guaranteed annuity factors are still sold
  (legacy-only product) — affects whether this is a "current product" input
  or a "legacy policy" input in the UI.

These will be tracked as implementation tasks in their respective phases,
not resolved here.

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
couples/household modeling, survivor analysis, tax module, external live
data feeds, Monte Carlo, real estate, Keren Hishtalmut/Provident
Fund/Managers Insurance nuance beyond basic balance+growth.

## Phase 2 — Core Retirement Sources & Couples

- Bituach Leumi module: eligibility, earliest claim age, estimated monthly
  benefit, income-supplement eligibility (with source/date shown)
- Provident Fund (Kupat Gemel) and Managers Insurance modules
- Couple user type: per-spouse data + combined household view
- Retirement timeline model (income by source, age-banded)

## Phase 3 — Risk, Tax & Life Events

- Tax module (gross → net retirement income, tax credits/residency)
- Survivor analysis (simulate death of either spouse)
- Real estate module (equity, rental income, appreciation)
- Early/standard/delayed retirement scenario comparison

## Phase 4 — Advanced Projection & External Data

- Monte Carlo simulation (10th/50th/90th percentile, success probability)
- Historical projection mode using real CPI/market-return history
- Live external data integrations per the fetch-then-fallback strategy
  (CPI, FX, fund performance, mortality tables, risk-free rate)
- Household dashboard KPIs from functional spec Section 13 in full

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
