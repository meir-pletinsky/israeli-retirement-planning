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
and does **not** yet model annuity conversion nuance, Bituach Leumi, or tax —
those remain Phase 2/3 per `docs/plan.md`.

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
      no ongoing-contribution modeling yet (no salary/contribution field in
      the data model — balances only).
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

- [ ] D1. Component tests for key flows (account/holding repeater add-edit-
      remove, dashboard rendering with calculated values).
- [ ] D2. Update `docs/architecture.md` / `docs/plan.md` / `README.md` to
      reflect implemented status and any deviations from the original plan.
- [x] D3. Verify the live GitHub Pages deployment; add the live link to
      `README.md`. (Done as part of A7; re-verify after future deploys that
      change routing/assets.)

## Deviations from original docs (log as they happen)

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
