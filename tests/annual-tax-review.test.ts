import Ajv2020 from 'ajv/dist/2020'
import schema from '../schemas/tax-history.v1.schema.json'
import assert from 'node:assert/strict'
import test from 'node:test'
import example from '../examples/tax-history.synthetic.json'
import { validateTaxHistory } from '../lib/domain/taxes/history'
import { reconcileTaxHistory } from '../lib/domain/taxes/reconcile'

const candidate = () => {
  const s = structuredClone(example)
  Object.assign(s.returns[0], { reportedAmounts: { prepayments: { currency: 'USD', minor: '11000' }, refundRequested: { currency: 'USD', minor: '0' }, evidenceIds: ['doc-1'] } })
  return s
}

test('return-reported money is additive and never changes settlement or outstanding arithmetic', () => {
  const before = reconcileTaxHistory(validateTaxHistory(example))
  const input = candidate(), serialized = JSON.stringify(input)
  const store = validateTaxHistory(input)
  assert.deepEqual(reconcileTaxHistory(store), before)
  assert.equal(JSON.stringify(input), serialized)
})

test('reported values require exact currency, unsigned minor units, explicit values and evidence references', () => {
  for (const facts of [
    { prepayments: { currency: 'KRW', minor: '1' }, evidenceIds: ['doc-1'] },
    { prepayments: { currency: 'USD', minor: '-0' }, evidenceIds: ['doc-1'] },
    { prepayments: { currency: 'USD', minor: '-1' }, evidenceIds: ['doc-1'] },
    { prepayments: { currency: 'USD', minor: '1.25' }, evidenceIds: ['doc-1'] },
    { prepayments: { currency: 'USD', minor: '01' }, evidenceIds: ['doc-1'] },
    { prepayments: { currency: 'USD', minor: '0' }, evidenceIds: [] },
    { prepayments: { currency: 'USD', minor: '1' }, evidenceIds: ['unknown-doc'] },
    { evidenceIds: ['doc-1'] },
    { refundRequested: null, evidenceIds: ['doc-1'] },
    { refundRequested: { currency: 'USD', minor: '1' }, evidenceIds: ['doc-1'], received: true },
  ]) {
    const s = structuredClone(example); Object.assign(s.returns[0], { reportedAmounts: facts })
    assert.throws(() => validateTaxHistory(s))
  }
})


test('published JSON schema also rejects a reported-facts shell with no money value', () => {
  const validate=new Ajv2020({strict:false,validateFormats:false}).compile(schema)
  assert.equal(validate(candidate()),true)
  const s=candidate();Object.assign(s.returns[0],{reportedAmounts:{evidenceIds:['doc-1']}})
  assert.equal(validate(s),false)
})
