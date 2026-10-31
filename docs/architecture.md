# Architecture & Development Plan

## Status

Replaces the corrupted/truncated draft previously at
`initial-docs/Retirement Planning App - Architecture & Development Plan.md`
(that file ended mid-chat-export and is kept only for historical reference).

**Implementation status:** this document describes the architecture as
*designed*. Phase 1 (MVP) now *implements* most of it — see
[`docs/implementation-progress.md`](implementation-progress.md) for the
task-by-task build log and a few deviations from the plan below (repo
visibility, linter choice, FX placeholder rate). The sections below are
kept largely as originally written; where the real implementation diverges
materially, a note is added inline.

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
| Lint/format | `oxlint` | **Deviation:** chosen over ESLint+Prettier during the prototype phase for speed/simplicity; enforced in CI. See `docs/implementation-progress.md` deviations log. |
| CI/CD | GitHub Actions | lint + test + build + deploy to GitHub Pages |
| Hosting | GitHub Pages | free static hosting |

## Project Structure (proposed)

```text
src/
  app/              # app shell, routing, providers
  pages/            # one folder per route/screen
  components/       # shared/reusable UI components
  domain/           # pure calculation engine (no React/DOM deps); kept flat
                    # (one file per concern, e.g. constants.ts, types.ts,
                    # profileBasics.ts, sources.ts, accessRules.ts,
                    # retirementIncome.ts, drawdown.ts, netWorth.ts,
                    # incomeBreakdown.ts, timeline.ts, fundingGap.ts,
                    # contributions.ts, feasibility.ts, bituachLeumi.ts,
                    # bituachLeumiRates.ts, household.ts, taxRates.ts,
                    # tax.ts, netIncome.ts, scenarioComparison.ts,
                    # inputGuidance.ts,
                    # index.ts) rather
                    # than split into
                    # per-product folders — products differ by rule data
                    # (accessRules.ts, sources.ts), not by calculation.
                    # household.ts builds a per-spouse view (retirement
                    # timing, own sources and Bituach Leumi, the spouse
                    # supplement) that the engine uses for couples; a
                    # single person is a household of one.
                    # netIncome.ts is a post-hoc tax layer: it takes the
                    # level-gross plan, simulates the drawdown with
                    # per-account holdings and cost basis, and taxes each
                    # member per year with tax.ts (rates in taxRates.ts;
                    # the pension exemption follows a calendar-year
                    # schedule, and a pension taken before the statutory
                    # age bears health tax; employer shares under Section
                    # 102 are routed in sources.ts, one lot per vesting
                    # batch (vesting.ts decides which batches count:
                    # unvested batches are forfeited at retirement unless
                    # the grant keeps vesting), into an ordinary-income layer (which also pays
                    # health tax and, before the statutory age, Bituach
                    # Leumi, see employerShareContributions in tax.ts) and
                    # a capital-gains remainder). The clock is read only in
                    # buildHousehold (Household.baseYear), so tests can pin
                    # the year;
                    # the Dashboard headline, funding gap and feasibility
                    # use the resulting after-tax income.
                    # scenarioComparison.ts evaluates the household at any
                    # retirement age (a spouse's retirement moves by the
                    # same number of years, via retirementTimingShiftedTo
                    # in household.ts) for the Projections comparison card;
                    # the three compared ages are saved in the profile
                    # (comparisonAges).
                    # inputGuidance.ts (findDataGaps) lists the optional
                    # details that would change the result, for the
                    # Dashboard's "Improve your estimate" card. Policy
                    # number, fund ID and the other reference-only fields
                    # are saved and exported but no domain code reads them.
                    # monteCarlo.ts replays the household's drawdown
                    # (simulateHouseholdDrawdown with yearlyRates) on
                    # seeded random real returns for the Projections risk
                    # card and the Dashboard KPI. It is outside the
                    # calculation trace and the verification pack.
                    # spendingTest.ts is the pass/fail test shared by
                    # monteCarlo.ts and historicalBacktest.ts (a path
                    # passes when no year's unmet spending exceeds ₪1; the
                    # largest passing gross spending is found by search).
                    # historicalBacktest.ts replays the same drawdown on
                    # each start year of the bundled US history.
                    # liquidityLadder.ts groups the household's sources
                    # into "when does this open" rows for the Projections
                    # ladder card. It reads the same sources and unlock
                    # ages as retirementIncome.ts, so it changes no
                    # numbers; it is outside the calculation trace.
                    # drawdown.ts draws pro rata by default; the saved
                    # Assumptions.withdrawalStrategy (Household
                    # .withdrawalStrategy) can instead draw sources in an
                    # order (taxable money first, or lowest tax first).
                    # The order moves tax, not the gross amount drawn, and
                    # lean runs (Monte Carlo, backtest) stay pro rata.
                    # withdrawalStrategies.ts runs netIncome.ts once per
                    # order for the Projections comparison card; it is
                    # outside the calculation trace (the drawdown itself
                    # traces a non-default order).
                    # leavingEarly.ts (the "Leaving before your shares
                    # vest" card) finds the unvested company shares lost at
                    # the retirement date, what one more month would keep
                    # and the monthly after-tax gain. It is outside the
                    # trace; the vest-aware engine itself is traced through
                    # the employerVesting and employerLots tables.
                    # purchaseLots.ts applies the foreign-currency rule
                    # (rule R) to the purchase lots of an ESPP or private
                    # holding. sources.ts (otherInvestmentsTaxProfile) uses
                    # it as the holding's taxable gain and cost basis in
                    # place of the unrealized-gain field, and the trace
                    # gets a purchaseLots table only when lots exist.
                    # sourceCosts.ts (the "What each source costs to draw
                    # on" card) finds, per kind of money of each person, the
                    # extra monthly tax to raise net spending by 100 in
                    # the first year that money can be drawn, on top of the
                    # plan's own draws (through memberTax). It reuses
                    # netIncome.ts retirementPlanYears, is read-only and is
                    # outside the trace.
  history/          # bundled US stock/bond/inflation history, 1928 onward
                    # (usMarketHistory.ts) and the real-return maths
                    # (returns.ts). Extended by hand once a year.
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

**Implemented so far:** exchange rates (live), stock prices (published with the
app) and Israeli inflation (live, with a bundled table). The rest of the feeds
below are still open (Phase 4 scope). `FALLBACK_USD_TO_ILS_RATE` in
`app/src/domain/constants.ts` is the last-resort dollar rate when a profile holds none.

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

**First implemented feed: stock prices (Phase T).** A scheduled GitHub Action
(`deploy.yml`) builds one JSON file per S&P 500 stock into `public/stock-data/`
and publishes it with the app, rather than opening a PR with checked-in data (58 MB
is too large to commit daily). The app reads those files from its own site only
when the ticker typed in the stock dialog is in the list, so no third-party host
is contacted, but the ticker is visible to the Pages host. Nothing else about the
profile leaves the device. See [`docs/stock-price-data-design.md`](stock-price-data-design.md).

**Exchange rates (live).** `app/src/fx/` asks Frankfurter (which republishes the Bank
of Israel's rates) for the dollar rate: today's, and the rate on each grant or purchase
date. Opt-out in Settings; on failure the user types the rate.

**Israeli inflation (Phase X).** `app/src/cpi/` asks the Central Bureau of Statistics
(`api.cbs.gov.il/index/data/price?id=120010`, the general consumer price index; no key,
CORS open) for the monthly 12-month change, and shows the latest figure and the 10, 20 and
30 year averages under the inflation field in Assumptions → Advanced, for reference. The
request carries only the series number and a start year (no cookies, no referrer), and
the answer is kept for six hours. When the request fails or the lookup is switched off in
Settings (a separate switch from the exchange rates), the app shows a bundled
December-to-December table for 1952 to 2025 (`src/cpi/snapshot.ts`, generated by
`npm run cpi-data`), and says so. The plan's own inflation stays the user's number.

**US market history (Phase Y).** `app/src/history/usMarketHistory.ts` is a static table
of yearly US stock returns (S&P 500 with dividends), 10-year Treasury returns and US
inflation, 1928 to 2025, from Aswath Damodaran (NYU Stern) and FRED. It is bundled with the
app, so the historical backtest makes no request and works offline and the same every
time. There is no refresh script: one row is appended by hand each January. Because it is US
data it is in US purchasing power; the shekel is not modelled.

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
- **Deviation:** the repo is **public**, not private as originally intended.
  GitHub Pages publishing from a private repo requires a paid GitHub plan;
  this account is on the Free plan. User approved making the repo public
  rather than switching to a different free host. See
  `docs/implementation-progress.md` for the full note.

## Phasing

See `docs/plan.md` for the phased roadmap (MVP first, then progressively
richer functional-spec coverage).
