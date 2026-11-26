# 2027 US federal tax estimate for investment income

## Decision and inputs

Use the existing Tax Planning entry point to answer one question: how much could the supported US federal taxes change if a contemplated investment-income scenario occurs in 2027? Enter a baseline and a scenario with the planned income. Hold unrelated assumptions constant if the difference is meant to isolate the investment decision. The calculator does not infer an individual's filing status, residency, sourcing, or tax method.

Both scenarios require the same Single or Married Filing Jointly status and full-year US treatment supported by the general federal schedules. Each scenario takes a separately determined post-deduction taxable income and two Form 8960 bases in USD. Use Form 8960 modified adjusted gross income and net investment income after applicable deductions and adjustments, with net investment income floored at zero. None of these amounts is calculated from the other fields. Missing fields stay unknown.

Choose the preferential-income method independently for each scenario.

| Method | Input and result |
| --- | --- |
| Direct entry | Enter qualified dividends and already-netted gains eligible for the general rates, limited to the portion in taxable income. |
| Schedule D | Enter qualified dividends and both net Schedule D totals. Add the smaller of the long-term and combined net gains if both are positive. A loss or zero produces no preferential gain, and qualified dividends are still included. |
| Distributions only | When Schedule D is not required, enter qualified dividends and eligible capital gain distributions. |

Both worksheet methods limit the result to taxable income. The estimate shows the amount that entered the preferential brackets. The [IRS qualified dividends and capital gain worksheet](https://www.irs.gov/instructions/i1040gi) supplies the input structure; the rate schedule remains the published 2027 schedule. The Holdings prefills retain their established input method.

## Calculation and evidence

- The regular component applies the ordinary schedule to taxable income less the eligible preferential portion, then stacks the preferential portion above that base. It applies the general capital-gain ceilings and the ordinary-only cap. [IRS Revenue Procedure 2026-35, sections 3.01 and 3.03](https://www.irs.gov/irb/2026-48_irb) and [26 USC § 1(h)](https://uscode.house.gov/us/usc/t26/s1/) provide the published 2027 thresholds and statutory treatment.
- NIIT is 3.8% of the smaller of net investment income and the nonnegative excess of NIIT MAGI over the filing-status threshold. [IRS NIIT guidance](https://www.irs.gov/individuals/net-investment-income-tax).
- Arithmetic uses cents and basis points. Each component rounds to cents once per scenario, then the displayed difference subtracts the baseline. This is a statutory rate-schedule planning estimate. Filing Tax Table intervals, filing-specific rounding, AMT, withholding, estimated payments, state or Korean taxes, foreign tax credits and treaties are outside scope. Select unsupported or uncertain scope if either scenario requires a special method such as PFIC, special Schedule D rates, a Form 4952 election, Form 2555 stacking or dual-status treatment. No amount is returned for that scope. The displayed total is regular tax plus NIIT, before credits and payments. [IRS residency guidance](https://www.irs.gov/individuals/international-taxpayers/determining-an-individuals-tax-residency-status) explains why a move does not automatically establish full-year eligibility.
- Inputs are held in browser memory. They do not enter the URL, local storage, a server action, the financial database, or the tax-history store. No filed-return comparison, payment calculation or operating write is part of the workflow. The actual 2025 comparison remains blocked.

## Synthetic acceptance

| Scenario | Expected change |
| --- | --- |
| MFJ with ordinary, preferential and NIIT changes | USD 480 ordinary increase, USD 1,500 preferential increase and USD 418 NIIT increase, totaling USD 2,398 |
| Single across the 15% / 20% capital gain boundary | USD 1,840 regular increase and USD 380 NIIT increase, totaling USD 2,220 |
| Single with preferential income at the zero-rate ceiling | USD 0 regular and NIIT change |
| Compare the first scenario in reverse | Signed decrease of USD 2,398 |
| Schedule D long-term gain USD 12,000, total net gain USD 7,000, qualified dividends USD 3,000 | USD 10,000 of preferential income; in the first scenario this preserves the USD 2,398 increase |
| Schedule D net loss and USD 3,000 of qualified dividends | Only USD 3,000 of preferential income |
| USD 1,500 in eligible dividends and distributions with USD 600 taxable income | USD 600 of preferential income |
| Missing or inconsistent inputs, unknown applicability, or a selected special method | No estimate |

The 2027 scope is tied to published rules, with no future-year fallback. Recheck the rule reference before adding a subsequent year or expanding the contract. Operating deployment and personal applicability are separate from these synthetic checks.

## Cross-border coverage

The US estimate is a federal component comparison. PFIC applicability and elections,
special NIIT adjustments, and foreign tax credit eligibility or amounts are separate
determinations. A PFIC-specific amount is not used as a balancing input. The Korean
screen continues to use the same conditional domestic calculation on independently
prepared KRW gains; neither screen produces a combined after-credit obligation. See
the [Korean scope](kr-overseas-stock-tax-2027.md) and the [IRS Form 8621
instructions](https://www.irs.gov/instructions/i8621).
