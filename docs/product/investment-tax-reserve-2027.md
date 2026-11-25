# 2027 US federal investment tax estimate

## Decision and inputs

Use the existing Tax Planning entry point to answer one question: how much could the supported US federal taxes change if a contemplated investment-income scenario occurs in 2027? Enter a baseline and a scenario with the planned income. Hold unrelated assumptions constant if the difference is meant to isolate the investment decision. The calculator does not infer an individual's filing status, residency, sourcing, or tax method.

Both scenarios require an explicit supported full-year US tax treatment and the same Single or Married Filing Jointly status. Each takes four nonnegative USD inputs: total taxable income after deductions, the eligible preferential amount already included in that taxable income, NIIT-specific modified adjusted gross income, and net investment income for NIIT. Qualified dividends and already-netted gains belong in the preferential amount only when eligible for the general 0%, 15%, and 20% treatment. Missing fields are never zero. The preferential amount cannot exceed taxable income.

## Calculation and evidence

- The regular component applies the ordinary schedule to taxable income less the eligible preferential portion, then stacks the preferential portion above that base. It applies the general capital-gain ceilings and the ordinary-only cap. [IRS Revenue Procedure 2026-35, sections 3.01 and 3.03](https://www.irs.gov/irb/2026-48_irb) and [26 USC § 1(h)](https://uscode.house.gov/us/usc/t26/s1/) provide the published 2027 thresholds and statutory treatment.
- NIIT is 3.8% of the smaller of net investment income and the nonnegative excess of NIIT MAGI over the filing-status threshold. [IRS NIIT guidance](https://www.irs.gov/individuals/net-investment-income-tax).
- Arithmetic uses cents and basis points. Each component rounds to cents once per scenario, then the displayed difference subtracts the baseline. This is a statutory rate-schedule planning estimate. Filing Tax Table intervals, filing-specific rounding, credits, AMT, withholding, estimated payments, state or Korean taxes, foreign tax credits, treaties, dual-status treatment and special methods such as PFIC are outside scope. [IRS residency guidance](https://www.irs.gov/individuals/international-taxpayers/determining-an-individuals-tax-residency-status) explains why a move does not automatically establish full-year eligibility.
- Inputs are held in browser memory. They do not enter the URL, local storage, a server action, the financial database, or the tax-history store. No filed-return comparison, payment calculation or operating write is part of the workflow. The actual 2025 comparison remains blocked.

## Synthetic acceptance

| Scenario | Expected change |
| --- | --- |
| MFJ with ordinary, preferential and NIIT changes | USD 480 ordinary increase, USD 1,500 preferential increase and USD 418 NIIT increase, totaling USD 2,398 |
| Single across the 15% / 20% capital gain boundary | USD 1,840 regular increase and USD 380 NIIT increase, totaling USD 2,220 |
| Single with preferential income at the zero-rate ceiling | USD 0 regular and NIIT change |
| Compare the first scenario in reverse | Signed decrease of USD 2,398 |
| Missing or inconsistent inputs and unknown applicability | No estimate |

The 2027 scope is tied to published rules, with no future-year fallback. Recheck the rule reference before adding a subsequent year or expanding the contract. Operating deployment and personal applicability are separate from these synthetic checks.
