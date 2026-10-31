# Bridge Planner — design (for review, nothing built yet)

Status: **proposal, 2026-10-30; R1 (liquidity ladder), R2 (withdrawal order), R3 (RSU
vesting), R4 (purchase lots), R5 (per-source cost table) and R6 (stress tests) built since.** Written for the
user to review before any code. Every number in this file is an invented example.

## 1. The problem

A person who retires before the age at which their pension and kupat gemel
open (60) must live on *something else* until then, and again until the
Bituach Leumi pension starts (67 for men, 62-65 for women). That "something
else" is a mix of bank cash, the study fund (קרן השתלמות, liquid after 6
years), an investment gemel (liquid any time), personal stock (including ESPP
purchases) and employer RSUs.

Each of these costs a different amount to use: a different tax, a different
loss of future growth, and for RSUs a different risk of being lost on leaving.
The app today answers "is there a bridge gap?" (`RetirementAccessSummary`
flags `bridgeLimited`; the Dashboard shows a warning) but not "which source
should I use first, and what does each choice cost?"

The user's own words, shortened: ESPP and private purchases are both just
lots (shares, price, date, rate); RSUs vest 5% a quarter over 5 years and the
unvested part is lost on leaving; the bridge options each have a different
cost in lost return and in tax; the app should show those options.

## 2. What the app does today (so we know what to change)

- `sources.ts` builds one pooled, always-accessible `otherInvestments` source
  from the equity holdings and `otherAssets`. Gains are taxed pro rata.
- `drawdown.ts` withdraws **pro rata** from all unlocked, non-annuitised
  sources. There is no withdrawal order.
- Unlock ages (`accessRules.ts`): pension, managers insurance, provident and
  IRA provident 60; investment gemel 0; study fund = `liquidityDate` or join
  date + 6 years.
- Employer stock is split by tax route into lots (`employerLots`); a batch
  vesting after retirement is routed as ordinary income, and the user is told
  to leave out shares that would be forfeited. Batches are typed by hand.
  Net worth and the drawdown use the holding's full quantity. *(Before R3.
  Since R3 the engine is vest-aware: a late batch is forfeited unless the
  grant keeps vesting, and batches can be generated.)*
- Scenario comparison (Phase J) varies only the retirement age and is not
  vest-aware.

## 3. Findings that shape the design

- **Investment gemel (rule U in `constants-to-verify.md`).** Lump sum: 25% of
  the real gain at any age, no exemption at 60. Annuity from age 60 through a
  paying fund: gains and annuity are tax-free. Nothing in the sources gives a
  0% route before 60. So for a bridge **before 60** the gemel costs 25% of the
  real gain; **from 60** the annuity route is a real alternative, but it locks
  the money into a life annuity (R7 models it as an opt-in per account).
- **Foreign stock (rules R-T).** The taxable gain is the lower of the nominal
  shekel gain and the USD gain × the sale-date rate; FIFO applies across lots.
  The app's single `unrealizedCapitalGainUSD` × 3.7 overstates tax when the
  dollar was higher at purchase.
- **ESPP.** If the discount was taxed on the payslip at purchase, the sale
  basis is the full market price on the purchase day, so ESPP lots behave like
  private purchases. The user must confirm this on a payslip or broker
  statement (open question 2).

## 4. Concepts

**Bridge gap.** For each year from retirement to the first unlock (and again to
the statutory age): desired net spending minus the net income that is already
available (unlocked annuities, rental, the spouse's income). Computed by the
existing income engine; the planner only reads it.

**Source cost, two parts, shown side by side, never merged into one "score":**

1. *Tax to raise ₪100 net*: ₪100 ÷ (1 − effective tax rate on that source).
   Cash 0%; study fund 0% (if liquid and within its rules); investment gemel
   25% × the real-gain share; a stock lot 25% × the gain share of the lot
   (rule R); a Section 102 ordinary layer at the marginal rate plus Bituach
   Leumi and health tax (rule Q); pension before the statutory age pays tax
   and health tax (rule I).
   Example: a lot worth ₪100k with ₪70k basis pays 25% × ₪30k = ₪7.5k, so
   raising ₪100 net needs about ₪108 of shares.
2. *What you give up*: the growth the money would have earned (the source's
   own assumed return, less its fee) and any tax shelter it loses (study fund
   growth is tax-free for good; gemel growth is tax-deferred; RSUs may be
   forfeited). Shown as plain facts, for example "keeps growing tax-free",
   "fee 0.9% a year", "unvested units are lost on leaving".

**Strategies, as named scenarios, not an optimiser.** Each is a fixed
withdrawal order; the app runs the full plan once per strategy and compares:

| Strategy | Order |
|---|---|
| Pro rata (today) | All unlocked sources at the same share |
| Taxable first | Cash, then stock lots, then investment gemel, then study fund last (keep the tax-free growth longest) |
| Lowest tax first | Cash, study fund, then the source with the smallest tax per ₪100 net |
| Bridge-only | Use only the sources that are unlocked, and leave pension sources untouched until 60 |

Compared on: total tax paid, net worth at the plan horizon (real terms), the
first year with a shortfall, and the highest taxable income in one year (so the
surtax threshold of ₪721,560 is visible). The app never calls one "optimal"; it
shows the differences and the assumptions behind them.

**Liquidity ladder.** A staircase of the money that can be used by date or age:
cash and investment gemel now, stock lots now, RSU batches on their vest dates
(Section 102 capital route after 24 months from the grant date, rule P), study fund at its
liquidity date, pension and gemel at 60, Bituach Leumi at the statutory age.
Read-only; it needs no new inputs.

**Cost of leaving early.** For a candidate retirement date, the RSU shares that
would still be unvested are forfeited. The card says "staying N more months
keeps X more shares, about ₪Y after tax", and it recomputes the portfolio with
only the shares vested by that date. A per-grant flag "keeps vesting after
leaving?" (default: no) covers plans with retirement vesting.

## 5. Data model additions

- **Purchase lot** on a stock holding (*built in R4, with two changes: there is no `kind`
  field because the holding's category already says ESPP or private, and the rate field is
  `usdToIlsRate`; see "R4 notes" in `implementation-progress.md`*): `date`, `quantity`,
  `priceUSD`, `usdToIlsRate` (optional, defaults to the sale rate). With lots, the effective
  cost basis is
  Σ quantity × priceUSD × max(fxAtPurchase, sale rate) (rule R), and it
  replaces `unrealizedCapitalGainUSD`. Without lots the current field is used,
  so existing data keeps working. `averageCostBasisUSD` and `purchaseDate`
  stay reference-only until lots exist.
- **RSU grant schedule generator**: from a grant date, total units and a
  template ("5% a quarter for 20 quarters", editable), produce the vesting
  batches that `employerLots` already understands. Hand-typed batches stay
  valid. The holding keeps today's vested quantity; later vests are added by
  retirement date.
- **Per-grant flag** "keeps vesting after leaving" (default no).
- **Split of the pooled investments source** into cash, taxable securities
  and employer lots, so a withdrawal order is possible. Prerequisite for the
  strategies.
- **Withdrawal order option** in `drawdown.ts`: an ordered list of source
  groups; pro rata inside a group. Default stays pro rata so no existing
  result changes.

All new calculations must be written to the calculation trace (Phase P) and
checked by the verification pack's self-check, with test vectors from rules R
and S and invented data only.

## 6. Suggested build order (each step ships on its own)

| Step | What | Changes numbers? |
|---|---|---|
| R1 | Liquidity ladder (read-only, from existing sources) | No |
| R2 | Split the pooled source; withdrawal order in `drawdown.ts`; strategy comparison card (**built, with two changes: "Bridge-only" dropped because it equals pro rata, and the pooled source is not split; see "R2 notes" in `implementation-progress.md`**) | Only when a non-default strategy is chosen |
| R3 | RSU schedule generator, "keeps vesting" flag, vest-aware retirement date and the "cost of leaving early" line (**built; the leaving-early line shows a monthly after-tax gain, and `quantity` is the whole award; see "R3 notes" in `implementation-progress.md`**) | Yes: unvested shares no longer count at retirement |
| R4 | Purchase lots and effective cost basis (rule R); ESPP kind (**built; there is no `kind` field, the category says ESPP or private; see "R4 notes" in `implementation-progress.md`**) | Yes, for holdings with lots (lower tax when the dollar was higher at purchase) |
| R5 | Per-source cost table ("tax to raise ₪100 net" and "what you give up") (**built with two columns only, as the user chose; "what you give up" is words, not numbers; see "R5 notes" in `implementation-progress.md`**) | No |
| R6 | Stress tests: employer-stock haircut and USD/ILS move (**built as fixed rows: employer shares −30% and −50%, the dollar −10% and −20%, and both together; see "R6 notes" in `implementation-progress.md`**) | No |
| R7 | Investment-gemel annuity route from 60 (rule U) (**built as an opt-in tick box per investment-provident-fund account; no default conversion factor; see "R7 notes" in `implementation-progress.md`**) | Only for accounts the user ticks and gives a factor or estimate |

R1 can come first because it needs nothing new. R2 is the biggest engine
change. R3 fixes a real overstatement: today unvested shares count in full.

## 7. Open questions for the user

1. **Cost definition.** *Answered (R5):* "two columns only" (tax per ₪100 net,
   and what you give up), with no single "net worth at 90" number per source. That
   number would need a full plan run per source and an assumed return per source.
2. **ESPP basis.** *Answered (R4):* the ESPP discount is taxed as salary at
   purchase, so the cost basis is the full market price that day; ESPP shares
   sit in a normal brokerage account (no trustee, no 24-month lock). User-reported,
   not checked against the Ordinance.
3. **RSU forfeiture.** *Answered (R3):* every unvested unit is lost when the
   owner leaves; there is no retirement clause. The per-grant flag exists and
   defaults to off.
4. **24 months.** *Answered (R3):* for RSUs held by an ESOP in Israel the 24
   months count from the original grant date of the award, not from each vest
   date. User-reported, not checked against the Ordinance.
5. **Investment gemel annuity (R7).** *Answered (R7):* yes, model it, as a
   per-account opt-in in My Data shown only for investment provident funds. The
   user supplies the conversion factor or a monthly estimate; nothing is
   assumed. The exemption rule is from advisory sites and the legal section is
   unconfirmed.
6. **Exchange rate.** The model uses a fixed 3.7. A live Bank of Israel rate is
   deferred to Phase 4; the effective cost basis in R4 uses the user's
   purchase-date rate and the fixed sale rate.

## 8. Directions not worth building

- Price prediction or live tickers: the plan already works in today's money.
- A full FIFO simulator with historical exchange rates for every trade: lots
  with one rate each are enough, and the total tax over a full liquidation is
  the same.
- Option strike prices and special ESPP rules: out of scope.
- Loss harvesting and loss carry-forwards.
- A black-box "optimal withdrawal" optimiser: its answer cannot be checked
  line by line, which the verification pack requires.
