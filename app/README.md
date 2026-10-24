# Israeli Retirement Planning — App

The application (evolved from an earlier click-through prototype). See
`../docs/ui-concept.md` for the design spec, `../docs/plan.md` for the
roadmap, and `../docs/implementation-progress.md` for current build status.

## Stack

React 19 + TypeScript + Vite + Tailwind CSS v4 + React Router + i18next +
Recharts — matches the stack chosen in `../docs/architecture.md`.

## Run locally

```bash
npm install
npm run dev
```

Then open the printed local URL. Use the language selector (top-right / in
Settings) to preview English, Russian, and Hebrew (RTL).

## Structure

```text
src/
  app/        # App root, routing, AppShell (nav), profile state
  pages/      # Welcome, Dashboard, My Data (wizard), Projections, Settings
  components/ # Shared UI (KpiCard, charts, form fields, modal, etc.)
  domain/     # Pure calculation engine (no UI deps), unit-tested
  storage/    # Persistence (Dexie-backed profile repository, export/import)
  i18n/       # en/ru/he translation resources + i18next setup
  data/       # Static fallback datasets (see docs/architecture.md)
  types/      # Shared TypeScript types
```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — type-check and produce a production build
- `npm run lint` — run oxlint
- `npm test` — run the Vitest test suite
