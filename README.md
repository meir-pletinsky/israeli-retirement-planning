# Israeli Retirement Planning

A privacy-first, local-first web app to help Israeli residents estimate
retirement income, eligibility, and readiness across pensions, provident
funds, Bituach Leumi, investments, and more.

**Live app:** https://meir-pletinsky.github.io/israeli-retirement-planning/
(auto-deployed from `main` via GitHub Actions; see
[`docs/implementation-progress.md`](docs/implementation-progress.md) for
current build status).

**Status:** Phase 1 (MVP) implemented, including salary/contribution
modeling and an earliest-feasible-retirement-age solver, plus three Phase 2
modules: the Bituach Leumi state pension, a per-source model (access
ages, annuity conversion, per-source retirement timeline) and
couples/household planning (a spouse, per-account owners, staggered
retirement, the Bituach Leumi spouse supplement) — see
[`docs/implementation-progress.md`](docs/implementation-progress.md) for
the detailed checklist and [`docs/plan.md`](docs/plan.md)'s Status section
for how it compares to the original spec.

## Getting started

```powershell
git clone https://github.com/meir-pletinsky/israeli-retirement-planning.git
cd israeli-retirement-planning/app
npm ci
npm run dev        # http://localhost:5173/
```

Requires Node 22 (matches the CI workflow). Other useful commands (run
from `app/`): `npm run build`, `npm run lint`, `npm run typecheck`,
`npm test`. See [`docs/SESSION-HANDOFF.md`](docs/SESSION-HANDOFF.md) for a
fuller cross-machine setup/resume guide.

## Project documents

- [`initial-docs/`](initial-docs) — original source material (functional
  spec + an early, partially corrupted architecture draft), kept for
  reference/history.
- [`docs/architecture.md`](docs/architecture.md) — current architecture &
  technology decisions (React/TypeScript/Vite/Tailwind, local-first with
  IndexedDB, GitHub Pages hosting, no backend).
- [`docs/plan.md`](docs/plan.md) — phased project plan/roadmap, starting
  with an MVP scope.
- [`docs/ui-concept.md`](docs/ui-concept.md) — UI/UX concept: information
  architecture, screens, components, visual direction, localization & RTL.
- [`docs/implementation-progress.md`](docs/implementation-progress.md) —
  live implementation checklist; read this to see what's built and resume
  work across sessions.
- [`app/`](app) — the application (evolved from the original click-through
  prototype; same stack, now with real persistence and calculations).

## Requirements

- Responsive for desktop and mobile.
- Localized: English (default), Russian, Hebrew (incl. RTL).
- Professional, clean UI.
- TypeScript, maintainable codebase.
