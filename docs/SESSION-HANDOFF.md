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
Snapshot as of this handoff:

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
- **Phase B (domain calculation engine): NOT STARTED.** Next up — pure-TS,
  unit-tested net worth projection / retirement income / funding gap
  functions in `app/src/domain/`.
- **Phase C (wire calculations into UI): NOT STARTED.** Dashboard and
  Projections pages still show mock data; depends on Phase B.
- **Phase D (testing/docs/deploy verification):** D3 (verify live deploy +
  README link) is done as a side effect of A7. D1 (component tests) and D2
  (docs updates reflecting final implementation) remain.

## Key technical decisions to know before continuing

- **Local-first, no backend.** All data lives in IndexedDB via Dexie
  (`app/src/storage/db.ts`). Export/Import is the only way data leaves the
  device (`app/src/storage/profileIO.ts`).
- **`normalizeProfile()`** (`app/src/types/index.ts`) is the single
  defensive-merge used both for legacy localStorage migration and JSON
  import — don't duplicate this logic elsewhere.
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
  uses `\uXXXX` escapes throughout; `en.json`/`ru.json` use raw UTF-8. Keep
  this in mind when grepping/editing — a raw-Cyrillic search won't match
  Hebrew's escaped form and vice versa.
- **Linting is `oxlint`**, not ESLint — a deliberate deviation from the
  original `docs/architecture.md`, already logged there.

## Session-tracking mechanics (for the agent resuming this)

- `docs/implementation-progress.md` is the **git-committed source of
  truth** — always trust it over any local session/SQL state, since SQL
  todos don't transfer across machines/accounts.
- Each phase/task is committed+pushed in a fully working state (build +
  lint + typecheck + test green) before being checked off — so `git log`
  on `main` is a reliable trail of exactly what's been verified.
- Recommended resume procedure: read `docs/implementation-progress.md` top
  to bottom, find the first unchecked `[ ]` item, `git log --oneline` to
  confirm no partial work already exists for it, then continue from there.
