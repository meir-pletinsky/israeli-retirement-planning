# Architecture & Development Plan

## Status

Replaces the corrupted/truncated draft previously at
`initial-docs/Retirement Planning App - Architecture & Development Plan.md`
(that file ended mid-chat-export and is kept only for historical reference).

## Vision

A privacy-first Israeli retirement planning application. All user financial
data stays on the user's device by default.

Core principles:

- Privacy-first, local-first
- No required account creation
- No server-side storage of user financial data
- No user tracking / analytics on personal data
- Easy backup/restore and data portability
- Free or near-free hosting
- Usable on desktop and mobile
- Fully localized (English default, Russian, Hebrew incl. RTL)

## High-Level Architecture

```text
Browser (React / TypeScript SPA)
  ├─ UI layer (components, pages, charts)
  ├─ i18n layer (en / ru / he, RTL-aware)
  ├─ Domain/calculation engine (pure TS, framework-agnostic)
  ├─ Persistence: IndexedDB (via Dexie.js) — profile, scenarios, assumptions
  └─ Optional external data clients (CPI, FX, fund/market data)
        ├─ direct client-side fetch when the source allows CORS
        └─ bundled static fallback dataset when it doesn't / fetch fails

Hosting: GitHub Pages (static build, no backend)
```

There is no application server and no database beyond the user's browser
storage. The app is a static bundle; all computation happens client-side.

## Technology Stack

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict mode) | across app and calculation engine |
| UI framework | React | function components + hooks |
| Build tool | Vite | fast dev server, static build for Pages |
| Styling | Tailwind CSS | utility-first, built-in responsive + RTL (logical properties) |
| Routing | React Router | client-side routing for GitHub Pages (hash or basename-aware) |
| State | React context + local component state; Zustand if/when cross-page state grows | keep it simple until needed |
| i18n | i18next + react-i18next | language detector, RTL handled via `dir` attribute per language |
| Local storage | Dexie.js (IndexedDB wrapper) | structured, versioned schema, supports export/import |
| Charts | Recharts | net worth / income projection visualizations |
| Testing | Vitest + React Testing Library | unit tests for calculation engine are priority #1 |
| Lint/format | ESLint + Prettier | enforced in CI |
| CI/CD | GitHub Actions | lint + test + build + deploy to GitHub Pages |
| Hosting | GitHub Pages | free static hosting |

## Project Structure (proposed)

```text
src/
  app/              # app shell, routing, providers
  pages/            # one folder per route/screen
  components/       # shared/reusable UI components
  domain/           # pure calculation engine (no React/DOM deps)
    bituach-leumi/
    pension-fund/
    provident-fund/
    ...
  data/             # static fallback datasets (rates, tables), external data clients
  storage/          # Dexie schema, repositories, export/import
  i18n/             # translation resources (en, ru, he) + setup
  styles/           # Tailwind config, global styles
  types/            # shared TypeScript types
docs/               # project documentation (this folder)
initial-docs/       # original source material (kept for reference)
```

The **domain layer is framework-agnostic and has no UI dependencies**, so it
can be unit tested in isolation and reused if a different UI shell is ever
needed.

## Data & Persistence

- All user-entered data (personal profile, account balances, assumptions,
  scenarios) is stored in IndexedDB via Dexie.
- A versioned schema + migration strategy is required from day one (Dexie
  supports this natively) since the data model will grow across phases.
- **Export/Import**: users can export all data as a JSON file and re-import
  it (backup, device transfer, sharing with an advisor). This is a first-class
  feature, not an afterthought, since there is no server-side backup.
- No analytics or telemetry is sent off-device for user financial inputs.

## External Data Sources

Functional spec Section 11 lists many potential external feeds (CPI,
inflation history, FX rates, capital market returns, risk-free rate, pension
fund performance, mortality tables, housing data, government benefit data,
tax rates). Decision for this app, since it is a static, backend-less site:

1. **Try direct client-side fetch first**, for sources whose APIs support
   CORS and don't require a secret key (e.g., some Bank of Israel / CBS
   public endpoints).
2. **Fall back to a bundled static dataset** (checked into `src/data/`) when
   a direct fetch fails, is blocked by CORS, or the source has no public API.
3. Static fallback datasets are refreshed periodically via a scheduled
   GitHub Action that regenerates the JSON files and opens a PR — not at
   request time, and never via a custom backend.
4. Every projection screen must show the data's source and as-of date so
   the user knows whether a figure is live, cached, or a manual default.

This keeps the "no backend" principle while giving best-effort freshness
where the source cooperates, and a safe, deterministic fallback everywhere
else (important for Monte Carlo/default assumptions reproducibility).

## Localization & RTL

- Languages at launch: English (default), Russian, Hebrew.
- `i18next` namespaces per feature area to keep translation files manageable.
- Hebrew requires RTL: `<html dir="rtl">` toggled based on active language;
  Tailwind layout uses logical properties (`ms-*`/`me-*`, `ps-*`/`pe-*`)
  rather than hard-coded `ml-*`/`mr-*` so mirroring is automatic.
- Numbers, currency (₪ primary; optional display in foreign currency for
  foreign assets), and dates are formatted via `Intl` APIs per active locale.
- Font stack includes Hebrew- and Cyrillic-capable fallbacks.

## Responsiveness

- Mobile-first Tailwind breakpoints; layouts verified at common mobile,
  tablet, and desktop widths.
- Navigation pattern: sidebar on desktop/tablet, bottom tab bar (or
  hamburger) on mobile — see `docs/ui-concept.md`.

## Testing & Quality

- Calculation engine: high unit-test coverage, since correctness of
  retirement math is the core value of the product.
- Component tests for key interactive flows (data entry wizard, results
  dashboard).
- CI runs lint, type-check, unit tests, and build on every PR.

## Deployment

- GitHub Actions workflow builds the Vite app and deploys `dist/` to GitHub
  Pages on merge to `main`.
- No environment secrets are required for the MVP (no backend, no private
  API keys committed).

## Phasing

See `docs/plan.md` for the phased roadmap (MVP first, then progressively
richer functional-spec coverage).
