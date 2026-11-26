# 2027 Korea–US estimate for one stock sale

Open **Tax Planning → 2027 Korea–US tax estimate for one stock sale**. The
comparison shows how much the same contemplated sale changes the eligible US
federal and Korean tax components, both before and after a separately established
foreign tax credit.

## Enter both annual scenarios

Use the same owner, sale and other assumptions in both countries and the same
US filing status across both scenarios. Enter annual amounts without the sale
and with the sale. US inputs are post-deduction taxable income, its eligible
preferential portion, and the two NIIT bases in USD. Korean inputs are the
annual eligible net gains or losses in KRW before the basic deduction. The
same sale can have different gains under the two countries' basis, netting and
currency rules. The user supplies those annual totals and confirms the bounded
scope. See the [US estimate and worksheet](investment-tax-reserve-2027.md) and
the [Korean estimate](kr-overseas-stock-tax-2027.md) for the specific exclusions.

## Credit inputs and limits

Choose a single credit direction for both scenarios, confirmed zero credit in
both, or unknown/outside scope. For a direction, supply the independently
determined creditable tax and available current-year limit attributable to the
modeled tax for each scenario, after other uses of the limit. Supply both in the
receiving jurisdiction's currency. Enter an explicit zero when appropriate.
This comparison applies the smaller of the two amounts. It does not determine
ownership allocation, treaty residence, sourcing or resourcing, country or
category eligibility, payment versus accrual timing, the legal limitation,
refunds, carryovers, or tax-basis deductions. If a scenario needs a different
credit direction or an excluded calculation, leave the treatment unknown.

- A credit in the US reduces the regular federal tax component. NIIT stays as
  calculated by the domestic estimate. Relief that changes NIIT is outside
  scope. [IRS foreign tax credit limitation](https://www.irs.gov/taxtopics/tc856)
  and [IRS NIIT questions and answers](https://www.irs.gov/newsroom/questions-and-answers-on-the-net-investment-income-tax).
- A credit in Korea reduces only the national tax component in this model.
  The calculation assumes the credit method and unchanged local income tax.
  A necessary-expense election or a separate local adjustment is outside scope.
  [Korean Income Tax Act §§ 118 and 118-6](https://www.law.go.kr/LSW/lsInfoP.do?efYd=20270101&lsiSeq=280405).
- The tool withholds both after-credit columns if the credit is unknown,
  incomplete, or exceeds the receiving tax component in either scenario.
  It does not fall back to zero or apply a credit in both directions.
  [Korea–US tax treaty](https://www.irs.gov/businesses/international-businesses/korea-tax-treaty-documents).

One entered KRW-per-USD rate converts each US subtotal to whole won, rounded
half up at the subtotal. The signed change subtracts the converted baseline
total from the converted scenario total. This planning rate does not convert
the taxable gains or the legally creditable foreign tax. The result remains
a planning estimate of supported tax components. Inputs stay in browser
memory. There are no calls to financial records, filing history or write APIs.

## Synthetic acceptance

A scenario with USD 2,398 additional US federal tax, including USD 418 of NIIT,
and KRW 2,090,000 additional Korean tax at KRW 1,300.50 per USD adds KRW
5,208,599 before credit. With a separately established USD 1,500 of eligible
Korean tax and USD 1,200 of remaining US limit, the increase after credit is
KRW 3,647,999, with the same NIIT. Under the separate Korean-credit example a
KRW 700,000 allowable national credit reduces the increase to KRW 4,508,599.
Tests also cover a credit present in both annual scenarios, incomplete
eligibility, excess credit, explicit zero credit and a signed decrease.
