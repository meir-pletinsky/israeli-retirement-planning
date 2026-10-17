# Israeli Retirement Planning & Income Projection Application
## Functional Specification (Version 1.0)

---

# 1. Overview

The application will help Israeli residents estimate:

- Eligibility for government retirement benefits.
- Income from private pension products.
- Early retirement feasibility.
- Future retirement income under multiple scenarios.
- Retirement readiness for individuals and couples.
- Impact of inflation, investment returns, taxation, and longevity.

The system should support both:

- Standard retirement
- Early retirement (FIRE-style planning)

---

# 2. Supported Retirement Income Sources

## 2.1 Bituach Leumi (Old-Age Pension)

Government-provided old-age pension.

### Objectives

Determine:

- Eligibility
- Earliest claim age
- Estimated monthly payment
- Couple benefits
- Future projected value

### Required User Inputs

```yaml
DateOfBirth
Gender
AliyahDate
IsraeliResident
YearsInIsrael
ContributionStartDate
ContributionEndDate
MaritalStatus
SpouseData
CurrentWorkIncome
PostRetirementWorkIncome
```

### Eligibility Factors

```yaml
Age
Residency
InsuranceContributionHistory
EmploymentIncome
```

### Outputs

```yaml
Eligible
ExpectedEligibilityDate
EstimatedMonthlyBenefit
EstimatedCoupleBenefit
IncomeSupplementEligibility
```

---

## 2.2 Pension Fund (Keren Pensia)

Mandatory retirement savings vehicle.

### Inputs

```yaml
FundName
CurrentBalance
CurrentMonthlyContribution
EmployeeContributionRate
EmployerContributionRate
SeveranceContributionRate
ExpectedAnnualReturn
ManagementFee
InvestmentTrack
```

### Outputs

```yaml
ProjectedBalance
ProjectedMonthlyPension
EarlyRetirementBalance
NormalRetirementBalance
```

---

## 2.3 Provident Fund (Kupat Gemel)

### Inputs

```yaml
CurrentBalance
ContributionHistory
InvestmentTrack
ManagementFee
ExpectedReturn
```

### Outputs

```yaml
ProjectedFutureBalance
PotentialAnnuityIncome
PotentialLumpSum
```

---

## 2.4 Managers Insurance

### Inputs

```yaml
CurrentBalance
ContributionRates
GuaranteedAnnuityFactor
InsuranceCoverage
ExpectedReturn
```

### Outputs

```yaml
ProjectedMonthlyIncome
DeathBenefitEstimate
DisabilityBenefitEstimate
```

---

## 2.5 Keren Hishtalmut

### Inputs

```yaml
CurrentBalance
FundOpeningDate
MonthlyContribution
ExpectedReturn
```

### Outputs

```yaml
CurrentWithdrawableAmount
LiquidityDate
ProjectedFutureValue
BridgeIncomePotential
```

---

## 2.6 Other Investments

### Inputs

```yaml
BrokerageAccounts
BankSavings
ForeignInvestments
CryptoAssets
CashHoldings
```

### Outputs

```yaml
ProjectedValue
SafeWithdrawalIncome
BridgeFundingAvailability
```

---

## 2.7 Real Estate

### Inputs

```yaml
PropertyValue
MortgageBalance
RentalIncome
ExpectedAppreciation
```

### Outputs

```yaml
NetEquity
RetirementRentalIncome
ProjectedFutureValue
```

---

# 3. User Types

## Individual

Single person retirement planning.

## Couple

Each spouse maintains separate retirement assets and eligibility.

Household analysis combines both profiles.

---

# 4. Couple Modeling

## Separate Calculations

For each spouse:

```yaml
PensionFundIncome
KupatGemelIncome
ManagersInsuranceIncome
BituachLeumiIncome
HishtalmutIncome
OtherInvestmentIncome
```

## Combined Household View

```yaml
TotalMonthlyRetirementIncome
CombinedNetWorth
CombinedExpenses
IncomeGap
```

---

# 5. Retirement Timeline Model

The system should calculate retirement income year-by-year.

Example:

```text
Age 55-60
Age 61-67
Age 67-70
Age 70+
```

Each source becomes available according to its rules.

---

# 6. Early Retirement Analysis

## Retirement Scenario Inputs

```yaml
DesiredRetirementAge
DesiredMonthlyExpense
ExpectedInflation
ExpectedHealthcareExpense
LifeExpectancy
```

## Outputs

```yaml
CanRetire
ProbabilityOfSuccess
YearsUntilFundDepletion
RequiredAdditionalSavings
FundingGap
```

---

# 7. Core Projection Engine

All calculations should use configurable assumptions.

### Investment Return

```yaml
Conservative: 4%
Base: 6%
Optimistic: 8%
```

### Inflation

```yaml
Conservative: 4%
Base: 2.5%
Optimistic: 1.5%
```

### Salary Growth

```yaml
AnnualSalaryGrowth
```

### Life Expectancy

```yaml
ExpectedAgeOfDeath
```

---

# 8. Retirement Scenarios

The app should generate:

### Standard Retirement

```yaml
RetireAtLegalAge
```

### Early Retirement

```yaml
RetireBeforeLegalAge
```

### Delayed Retirement

```yaml
RetireAfterLegalAge
```

---

# 9. Survivor Analysis

Simulate death of either spouse.

### Outputs

```yaml
RemainingHouseholdIncome
SurvivorPensionIncome
IncomeReduction
```

---

# 10. Tax Module

## Inputs

```yaml
TaxStatus
TaxCredits
ForeignIncome
ForeignPensions
TaxResidency
```

## Outputs

```yaml
GrossRetirementIncome
NetRetirementIncome
TaxLiability
```

---

# 11. External Data Sources

The application should supplement user inputs using external data feeds.

---

## 11.1 Consumer Price Index (CPI)

Source:

```yaml
Israel Central Bureau of Statistics (CBS)
```

Usage:

```yaml
Inflation adjustment
Real-value calculations
Pension purchasing power
Historical analysis
```

---

## 11.2 Inflation History

Source:

```yaml
CBS
Bank of Israel
```

Usage:

```yaml
Long-term inflation averages
Monte Carlo simulations
Stress testing
```

---

## 11.3 Currency Exchange Rates

Source:

```yaml
Bank of Israel
European Central Bank
Federal Reserve
```

Supported:

```yaml
ILS/USD
ILS/EUR
ILS/GBP
ILS/CAD
```

Usage:

```yaml
Foreign assets
Foreign pensions
International retirement planning
```

---

## 11.4 Capital Market Returns

Source:

```yaml
Tel Aviv Stock Exchange
S&P 500
MSCI World
NASDAQ
```

Usage:

```yaml
Expected portfolio returns
Backtesting
Historical modeling
```

---

## 11.5 Risk-Free Rate

Source:

```yaml
Bank of Israel
Government Bonds
```

Usage:

```yaml
Discount rates
Withdrawal models
Retirement projections
```

---

## 11.6 Pension Fund Performance

Source:

```yaml
Israeli Ministry of Finance
PensionNet
GemelNet
```

Usage:

```yaml
Historical returns
Fund comparisons
Future assumptions
```

---

## 11.7 Mortality Tables

Source:

```yaml
Israeli Central Bureau of Statistics
Insurance Industry Tables
```

Usage:

```yaml
Longevity projections
Annuity estimates
Survivor analysis
```

---

## 11.8 Housing Market Data

Source:

```yaml
CBS
Bank of Israel
Tax Authority
```

Usage:

```yaml
Property appreciation
Rental income assumptions
```

---

## 11.9 Government Benefit Data

Source:

```yaml
Bituach Leumi
Ministry of Finance
```

Usage:

```yaml
Current pension amounts
Eligibility rules
Retirement ages
Future policy changes
```

---

## 11.10 Tax Rates

Source:

```yaml
Israel Tax Authority
```

Usage:

```yaml
Net income calculations
Retirement withdrawal planning
```

---

# 12. Projection Models

The application should provide:

## Historical Projection

Based on historical averages.

---

## Deterministic Projection

Fixed assumptions.

Example:

```yaml
Return: 6%
Inflation: 2.5%
```

---

## Monte Carlo Simulation

Randomized future outcomes.

Outputs:

```yaml
10th Percentile Outcome
50th Percentile Outcome
90th Percentile Outcome
Success Probability
```

---

# 13. Dashboard KPIs

## Household

```yaml
NetWorth
RetirementIncome
RetirementExpenses
FundingGap
SafeWithdrawalRate
```

## Retirement

```yaml
YearsToRetirement
ProjectedPensionIncome
ProjectedGovernmentBenefits
AvailableBridgeFunds
```

## Early Retirement

```yaml
CanRetireNow
CanRetireAt55
CanRetireAt60
CanRetireAt65
```

---

# 14. Recommended MVP

## Essential Inputs

```yaml
Age
Gender
Salary
CurrentPensionBalance
CurrentKerenHishtalmutBalance
InvestmentAssets
ExpectedRetirementAge
MonthlyLivingExpenses
```

## Essential Outputs

```yaml
RetirementIncomeEstimate
NetWorthProjection
EarlyRetirementDate
FundingGap
RetirementProbability
```

This MVP can provide meaningful retirement projections while minimizing user onboarding complexity.