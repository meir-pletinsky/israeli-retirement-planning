# UI Concept Prototype

Click-through prototype for the Israeli Retirement Planning app's Phase 1
(MVP) UI. See `../docs/ui-concept.md` for the design spec this implements
and `../docs/plan.md` for the overall roadmap.

**This is UI-only**: navigation, layout, localization (English/Russian/
Hebrew incl. RTL), and responsive behavior are real; all numbers on the
Dashboard/Projections screens are static mock data (`src/data/mockData.ts`).
Profile form values are kept in React state + `localStorage` just so the
wizard feels real — there is no calculation engine yet.

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
  i18n/       # en/ru/he translation resources + i18next setup
  data/       # Mock projection data
  types/      # Shared TypeScript types
```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — type-check and produce a production build
- `npm run lint` — run oxlint
