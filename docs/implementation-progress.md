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
- [ ] A2. Add Vitest + React Testing Library + jsdom; `npm test` script;
      one smoke test passing.
- [ ] A3. Add Dexie; versioned IndexedDB schema + repository module for the
      profile (per `docs/architecture.md` → Data & Persistence).
- [ ] A4. Replace `ProfileContext`'s localStorage persistence with the Dexie
      repository (keep the context's public API stable for pages).
- [ ] A5. Wire Settings page Export/Import buttons to real JSON
      export/download and import/upload (with shape validation), Reset
      stays working.
- [ ] A6. GitHub Actions CI workflow: lint, typecheck, test, build on push/PR.
- [ ] A7. GitHub Actions deploy workflow: build + publish `app/dist` to
      GitHub Pages on merge to `main`.

## Phase B — Domain calculation engine (pure TS, unit-tested)

- [ ] B1. Formalize domain calculation input/output types in
      `app/src/domain/` (reuse `app/src/types`).
- [ ] B2. Net worth projection function: given accounts/holdings/other
      assets + assumptions, project balances forward to life expectancy.
- [ ] B3. Retirement income estimate function (deterministic, MVP-level).
- [ ] B4. Funding gap + retirement-readiness indicator function.
- [ ] B5. Vitest unit tests for B2–B4 (the highest-priority tests in the
      whole project per `docs/architecture.md`).

## Phase C — Wire calculations into UI

- [ ] C1. Dashboard: replace mock KPIs/chart with real calculated values
      from the domain engine + stored profile.
- [ ] C2. Projections page: replace mock data with real domain-engine
      output; scenario controls (retirement age) recalculate live.
- [ ] C3. My Data wizard: confirm/add validation for fields the calc engine
      requires; graceful handling of incomplete profiles.

## Phase D — Testing, docs, deploy verification

- [ ] D1. Component tests for key flows (account/holding repeater add-edit-
      remove, dashboard rendering with calculated values).
- [ ] D2. Update `docs/architecture.md` / `docs/plan.md` / `README.md` to
      reflect implemented status and any deviations from the original plan.
- [ ] D3. Verify the live GitHub Pages deployment; add the live link to
      `README.md`.

## Deviations from original docs (log as they happen)

- Linting uses `oxlint` (already chosen during prototype phase) rather than
  ESLint+Prettier as `docs/architecture.md` originally proposed.
