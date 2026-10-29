# Calculation trace and verification pack

The app computes every figure on the user's device from the saved inputs. To let
someone else (a person, or an independent AI session) re-check those figures
offline, the engine can record **every calculation step** and export it as a
**verification pack**: one JSON file with the inputs, the constants, the steps,
the tables and a mechanical self-check, plus instructions for the reviewer.

No real data belongs in this document, the repo or the tests. All fixtures
hold invented values.

## For the user

Settings, section **Calculation verification**:

1. Choose what to trace: the early, standard or delayed scenario, or a specific
   retirement age (the primary user retires at that age; a spouse in the plan
   retires the same number of years earlier or later than in the standard
   scenario).
2. **Export verification pack**. The file is
   `israeli-retirement-planning-verification-pack-<date>.json` (about 200 KB for
   a typical household).
3. Optional: **Export redaction key** (offered after the pack). It maps the
   aliases in the pack (`acct1`, `holding1`, ...) back to the real accounts, so
   the owner can follow a finding to a policy. **Keep it on the device; never
   share it.**
4. Give the pack to a reviewer. `audit.prompt` in the file is a ready prompt, and
   `audit.guide` explains the format.

**Redacted is not anonymous.** The pack still holds balances, salary, deposit
rates, ages and dates. Share it only with someone trusted with that.

## What the pack contains

| Field | Content |
|---|---|
| `format`, `formatVersion` | `retirement-planning-verification-pack`, 1 |
| `evaluatedAt` | The moment the engine treated as "now" (all age and year maths use it) |
| `target`, `timing` | What was traced and the resulting retirement ages |
| `privacy` | What was redacted, and the warning |
| `audit` | `guide` (prose) and `prompt` for the reviewer |
| `inputs` | The saved profile, redacted |
| `constants` | Every tax, National Insurance and access-rule constant the engine reads, with as-of dates |
| `trace.steps` | The calculation in execution order |
| `trace.tables` | Year-by-year and per-account data that steps refer to |
| `displayed` | `fundingGap` (what the Dashboard shows), `feasibility`, `ageComparison` and `gapByAge` (one row per retirement age, no steps) |
| `roundingSteps` | Steps that round, floor or ceil: where a whole-shekel or whole-year cut happens |
| `selfCheck` | The result of `checkTrace` on the redacted pack |

There is no app version in the pack: the app has no runtime version. The
constants carry their own as-of dates.

### A step

```
id        scope path, e.g. net/binding/self/tax/incomeTax; a repeat gets "#2"
title     short name
formula   the rule in words
expr      optional formula over the input names
inputs    { name: { value, from } }
output    the value
note      optional
```

`from` says where an input came from:

| Kind | Meaning |
|---|---|
| `profile:<path>` | A field of `inputs`; list items are picked as `[id=acct1]`. For the spouse's view, `personal.*` and `bituachLeumi.*` paths are rewritten to `spouse.*`. |
| `step:<id>` | The output of an earlier step |
| `const:<NAME>` | A constant in `constants` |
| `derived:<text>` | Computed on the spot, usually a table lookup or sum; the text says how |

`expr` grammar: numbers, input names, `+ - * / ^`, parentheses, unary minus and
`min max abs floor ceil round sqrt pow` (`round` is JavaScript `Math.round`).
A null input counts as 0, a boolean as 1 or 0, and two numbers agree within a
relative 1e-9. A step without `expr` is a decision, lookup or table-driven
figure.

## Self-check (`traceCheck.ts`)

`checkTrace(log, { profile, constants })` re-does the mechanical part of the
audit: it evaluates every `expr`, follows every `step:`, `profile:` and `const:`
link (the referenced step must exist, come earlier and have the same value) and
reports issues of these kinds: `expr-mismatch`, `expr-error`, `step-missing`,
`step-order`, `step-mismatch`, `profile-missing`, `profile-mismatch`,
`const-missing`, `const-mismatch`.

The builder runs it on the **redacted** log against the **redacted** inputs, so
the file checks out exactly as the reviewer will see it. The reviewer is told
not to trust `selfCheck` and to repeat the work.

What it does not prove: that a formula is the right rule (Part B of the audit),
that a `derived:` note is true, or that the table behind a derived input is
right. `fromLatestStep` falls back to a `derived:` note when the step it wants
is missing or its value differs, and `checkTrace` does not flag that fallback.

## Design

- **Tracing is a module-level context** (`trace.ts`). `runTraced(fn, {evaluatedAt})`
  activates it for the synchronous call. When it is off, every call is a no-op;
  step bodies are built lazily (`recordStep(id, () => body)`) and trace-only
  collections are guarded by `isTracing()`, so results and speed are unchanged.
  A test asserts the traced result equals the untraced one.
- **One traced run covers the whole chain:** `calculateFundingGapForTiming`
  calls household, income, drawdown, net income and the funding gap, with
  scopes `self/`, `spouse/`, `income/`, `drawdown/`, `net/`, `fundingGap/`. Ids
  are scope paths with no duplicates.
- **One clock.** The engine reads "now" only through `engineNowMs` and
  `engineCurrentYear`. A trace fixes it to `evaluatedAt`;
  `withEngineClock(at, fn)` fixes it without tracing, which keeps the untraced
  parts of the pack (`displayed`) on the same "now" as the traced run.
- **Instrumented modules:** `sources`, `bituachLeumi`, `household`,
  `retirementIncome`, `drawdown`, `tax` (`recordPersonTaxSteps`), `memberTax`,
  `netIncome` and `netIncomeTrace`, `fundingGap`. `traceConstants.ts` builds the
  constants snapshot.
- **The target decides the timing:** a scenario uses `resolveRetirementTiming`,
  an age uses `retirementTimingShiftedTo` (the same as the age comparison), so
  the traced result equals what the app shows for that scenario or age.

## Redaction (`verificationRedaction.ts`)

- **Allow-list, not block-list.** Numbers, booleans and null are kept. A string
  is kept only when its key is a known enum (`owner`, `productCategory`,
  `legacyPolicyModel`, `accountStatus`, `annuityTaxType`, `investmentCategory`,
  `taxTrack`, `gender`, `maritalStatus`, `preset`) with a plain-token value, or a
  known date key (`joinDate`, `liquidityDate`, `grantDate`, `purchaseDate`,
  `vestDate`) with a date value. An `id` is aliased; every other string becomes
  `[redacted]`. A field added to the profile later is therefore redacted until
  someone allows it.
- **Aliases** (`acctN`, `holdingN`, `trancheN`) replace real ids everywhere in
  the log in one pass, longest id first (so `x-1` never eats part of `x-10`),
  in strings and in object keys.
- **The key** (`RedactionKey`) lists alias, kind, real id and details (provider,
  policy number, fund id, category, track, owner, ticker, company, custodian) and
  the pack's `evaluatedAt`.
- **Leak check.** After building, `findLeaks` scans the inputs, step ids, `from`
  values, input values, outputs and table ids, columns and cells for any real id
  (4+ characters) or non-kept text (6+ characters) from the profile. A hit throws
  `VerificationPackLeakError`, which carries locations only, never the text, and
  nothing is exported. Titles, formulas and notes are not scanned, to avoid
  false positives; the engine never writes provider, policy, ticker or company
  names (a test guards this with distinctive invented values).

## Instrumenting a new calculation

1. Wrap the logic in `withScope("name", ...)` (or `withMember` for per-person
   work).
2. `recordStep("local/id", () => ({ title, formula, expr, inputs: { a: input(v,
   fromProfile("path")), b: input(w, fromStep("other/id")) }, output }))`. Give
   `expr` whenever the output is arithmetic over the inputs: it is what the
   reviewer re-evaluates.
3. Link every input to its true origin; use `derived:` only when nothing else
   fits. Tables go in `recordTable`.
4. Add the expectation to `tracePipeline.test.ts` (steps present, `checkTrace`
   clean, traced result equals untraced) and run `npx vitest run src/domain`.
5. Never write a name, policy number, ticker or company into a step.

## Tests

`trace.test.ts`, `traceCheck.test.ts`, `tracePipeline.test.ts` (the invented
couple from `src/test/traceFixtures.ts`, including a tamper test),
`verificationPack.test.ts` (both target kinds, redaction, key, leak check,
serialization, a tampered pack, ages and the clock) and
`components/VerificationExport.test.tsx`.

## Findings and open items

- The pack explains the engine's arithmetic and its sources. It cannot say
  whether the engine's *rules* are right; that is Part B of the audit and relies
  on `docs/constants-to-verify.md`.
- The engine is deterministic: no volatility, no probability of success.
- A future pack version could add the withdrawal-order and spouse-tax-split
  decisions once the drawdown rework exists.
