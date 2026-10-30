# Bridge Planner — design (for review, nothing built yet)

Status: **proposal, 2026-10-30.** Written for the user to review before any
code. Every number in this file is an invented example.

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
  Net worth and the drawdown use the holding's full quantity.
- Scenario comparison (Phase J) varies only the retirement age and is not
  vest-aware.

## 3. Findings that shape the design

- **Investment gemel (rule U in `constants-to-verify.md`).** Lump sum: 25% of
  the real gain at any age, no exemption at 60. Annuity from age 60 through a
  paying fund: gains and annuity are tax-free. Nothing in the sources gives a
  0% route before 60. So for a bridge **before 60** the gemel costs 25% of the
  real gain; **from 60** the annuity route is a real alternative, but it locks
  the money into a life annuity.
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
(Section 102 capital route after 24 months, rule P), study fund at its
liquidity date, pension and gemel at 60, Bituach Leumi at the statutory age.
Read-only; it needs no new inputs.

**Cost of leaving early.** For a candidate retirement date, the RSU shares that
would still be unvested are forfeited. The card says "staying N more months
keeps X more shares, about ₪Y after tax", and it recomputes the portfolio with
only the shares vested by that date. A per-grant flag "keeps vesting after
leaving?" (default: no) covers plans with retirement vesting.

## 5. Data model additions

- **Purchase lot** on a stock holding: `date`, `quantity`, `priceUSD`,
  `fxAtPurchase` (optional, defaults to the fallback rate), `kind`
  (`purchase` or `espp`). With lots, the effective cost basis is
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
| R2 | Split the pooled source; withdrawal order in `drawdown.ts`; strategy comparison card | Only when a non-default strategy is chosen |
| R3 | RSU schedule generator, "keeps vesting" flag, vest-aware retirement date and the "cost of leaving early" line | Yes: unvested shares no longer count at retirement |
| R4 | Purchase lots and effective cost basis (rule R); ESPP kind | Yes, for holdings with lots (lower tax when the dollar was higher at purchase) |
| R5 | Per-source cost table ("tax to raise ₪100 net" and "what you give up") | No |
| R6 | Stress tests: employer-stock haircut and USD/ILS move | No |
| R7 | Investment-gemel annuity route from 60 (rule U), if wanted | Yes, for investment gemel from 60 |

R1 can come first because it needs nothing new. R2 is the biggest engine
change. R3 fixes a real overstatement: today unvested shares count in full.

## 7. Open questions for the user

1. **Cost definition.** Is "two columns side by side" (tax per ₪100 net, and
   what you give up) enough, or do you also want one number per source, such as
   "net worth at 90 if you raise ₪100 here instead of there"? The single number
   needs a full plan run per source and an assumed return per source.
2. **ESPP basis.** Is the ESPP discount taxed on your payslip at purchase? Are
   ESPP shares held under a Section 102 trustee or in a normal brokerage
   account? (Rule P and the 24-month period depend on it.)
3. **RSU forfeiture.** Does your plan have any retirement-vesting clause, or is
   every unvested unit lost? The per-grant flag exists for this.
4. **24 months.** Counted from the grant date or from each vest date (rule P)?
5. **Investment gemel annuity (R7).** Worth modelling? It only matters from
   age 60 and locks the money into a life annuity; the exemption rule is from
   advisory sites and the legal section is unconfirmed.
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
