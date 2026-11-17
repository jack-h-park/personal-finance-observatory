import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { TextDecoder } from 'node:util'
import { resolveTaxEvidence, type EvidenceRoots } from '@/lib/application/evidence-index'
import { selectAnnualFederalHistory } from '@/lib/application/annual-tax-history-selection'
import { annualJsonDigest } from '@/lib/domain/taxes/annual/rules'
import { compareUsFederalAnnualEstimate, type FederalAnnualComparison } from '@/lib/domain/taxes/annual/us-composition'
import type { Evidence } from '@/lib/domain/taxes/history'

type ReviewPin = { id: string; revision: number; sha256: string }
export type ReadOnlyAnnualComparisonRequest = {
  inputFile: string; historyFile: string; reviewFile: string; evidenceRoots: EvidenceRoots; expectedReview: ReviewPin
}
export type ReadOnlyAnnualComparisonResult = {
  schemaVersion: 1; status: 'compared' | 'blocked'; comparisonEligible: boolean; differenceMinor: string | null
  verification: 'selected-history-evidence-and-review-pins-checked' | 'incomplete'
  review: ReviewPin | null; history: { revision: number; sha256: string } | null
  evidence: { id: string; recordRevision: number; sha256: string; status: 'verified' | 'blocked' }[]
  comparison: FederalAnnualComparison | null; blockers: string[]
}
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k))
}
function absolute(value: unknown): value is string {
  return typeof value === 'string' && path.isAbsolute(value) && path.normalize(value) === value && !value.includes('\0')
}
function validPin(value: unknown): value is ReviewPin {
  return exact(value, ['id', 'revision', 'sha256']) && typeof value.id === 'string' && !!value.id.trim() && Number.isSafeInteger(value.revision) && Number(value.revision) >= 1 && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256)
}
function fileStamp(s: fs.BigIntStats) { return [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].map(String).join(':') }
function checkedPath(file: string) {
  if (!absolute(file)) throw new Error('Explicit canonical absolute file path required')
  let parent = path.parse(file).root
  for (const part of path.relative(parent, path.dirname(file)).split(path.sep).filter(Boolean)) {
    parent = path.join(parent, part)
    const s = fs.lstatSync(parent)
    if (s.isSymbolicLink() || !s.isDirectory()) throw new Error('Non-directory or linked JSON parent')
  }
}
/** Bounded descriptor read; missing state is never manufactured as an empty history. */
function readJson(file: string, limit: number) {
  checkedPath(file)
  const before = fs.lstatSync(file, { bigint: true })
  if (!before.isFile() || before.isSymbolicLink() || before.size > BigInt(limit)) throw new Error('JSON source unavailable or oversized')
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
  try {
    const opened = fs.fstatSync(fd, { bigint: true })
    if (!opened.isFile() || fileStamp(before) !== fileStamp(opened)) throw new Error('JSON source changed')
    const chunks: Buffer[] = []; let size = 0
    while (size <= limit) {
      const chunk = Buffer.alloc(Math.min(65536, limit + 1 - size))
      const n = fs.readSync(fd, chunk, 0, chunk.length, null)
      if (!n) break
      chunks.push(chunk.subarray(0, n)); size += n
    }
    if (size > limit || fileStamp(fs.fstatSync(fd, { bigint: true })) !== fileStamp(opened)) throw new Error('JSON source changed or oversized')
    checkedPath(file)
    if (fileStamp(fs.lstatSync(file, { bigint: true })) !== fileStamp(opened)) throw new Error('JSON source replaced')
    const bytes = Buffer.concat(chunks)
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown, stamp: fileStamp(opened), rawSha256: digest(bytes) }
  } finally { fs.closeSync(fd) }
}
function rootStamp(root: string) {
  if (!absolute(root)) throw new Error('Explicit evidence root required')
  const real = fs.realpathSync(root), stat = fs.statSync(real, { bigint: true })
  if (!stat.isDirectory()) throw new Error('Evidence root unavailable')
  return [real, String(stat.dev), String(stat.ino)].join(':')
}

/** Explicit read-only library adapter; never consults config/env, writes, relinks or invokes workflows. */
export function readAnnualFederalComparison(requestValue: unknown): ReadOnlyAnnualComparisonResult {
  const result: ReadOnlyAnnualComparisonResult = {
    schemaVersion: 1, status: 'blocked', comparisonEligible: false, differenceMinor: null, verification: 'incomplete',
    review: null, history: null, evidence: [], comparison: null, blockers: [],
  }
  const block = (code: string) => {
    result.blockers = [code]; result.comparison = null; result.differenceMinor = null; result.comparisonEligible = false
    result.status = 'blocked'; result.verification = 'incomplete'
    result.evidence = result.evidence.map(e => ({ ...e, status: 'blocked' }))
    return result
  }
  let request: ReadOnlyAnnualComparisonRequest
  try {
    annualJsonDigest(requestValue)
    const copy = structuredClone(requestValue)
    if (!exact(copy, ['inputFile', 'historyFile', 'reviewFile', 'evidenceRoots', 'expectedReview']) || !absolute(copy.inputFile) || !absolute(copy.historyFile) || !absolute(copy.reviewFile) || !validPin(copy.expectedReview) || !exact(copy.evidenceRoots, ['records', 'tax']) || !absolute(copy.evidenceRoots.records) || !(copy.evidenceRoots.tax === null || absolute(copy.evidenceRoots.tax))) return block('invalid-request')
    request = copy as ReadOnlyAnnualComparisonRequest
  } catch { return block('invalid-request') }
  const specs = [[request.inputFile, 2 * 1024 * 1024], [request.historyFile, 20 * 1024 * 1024], [request.reviewFile, 2 * 1024 * 1024]] as const
  let input: ReturnType<typeof readJson>, history: ReturnType<typeof readJson>, review: ReturnType<typeof readJson>
  try { [input, history, review] = specs.map(([file, limit]) => readJson(file, limit)) as [typeof input, typeof history, typeof review] }
  catch { return block('json-source-unavailable') }
  let bundle: Record<string, unknown>
  try {
    annualJsonDigest(review.value)
    if (!exact(review.value, ['schemaVersion', 'id', 'revision', 'selectionReview', 'compositionReview', 'comparisonApproval']) || review.value.schemaVersion !== 1 || typeof review.value.id !== 'string' || !review.value.id.trim() || !Number.isSafeInteger(review.value.revision) || Number(review.value.revision) < 1) return block('review-invalid')
    bundle = review.value
    result.review = { id: bundle.id as string, revision: bundle.revision as number, sha256: annualJsonDigest(bundle) }
    if (result.review.id !== request.expectedReview.id || result.review.revision !== request.expectedReview.revision || result.review.sha256 !== request.expectedReview.sha256) return block('review-pin-mismatch')
  } catch { return block('review-invalid') }
  let selection: ReturnType<typeof selectAnnualFederalHistory>
  try { selection = selectAnnualFederalHistory(history.value, input.value, bundle.selectionReview) }
  catch { return block('history-selection-invalid') }
  result.history = { revision: selection.storeRevision, sha256: selection.storeSha256 }
  if (selection.status !== 'selected' || !selection.recorded) { result.blockers = selection.blockers; return result }
  const roots = new Map<string, string>()
  try {
    for (const e of selection.evidence) {
      const root = request.evidenceRoots[e.root]
      if (!root) return block('evidence-unavailable')
      if (!roots.has(root)) roots.set(root, rootStamp(root))
    }
  } catch { return block('evidence-unavailable') }
  if (selection.evidence.length > 32) return block('evidence-read-limit')
  const verify = (evidence: Evidence[]) => {
    let bytes = 0
    for (const e of evidence) {
      const resolved = resolveTaxEvidence(e, request.evidenceRoots, { maxBytes: 64 * 1024 * 1024 - bytes })
      bytes += resolved.bytes.length
      if (bytes > 64 * 1024 * 1024) throw new Error('Evidence budget exceeded')
    }
  }
  try { verify(selection.evidence); result.evidence = selection.evidence.map(e => ({ id: e.id, recordRevision: e.recordRevision, sha256: e.sha256, status: 'verified' })) }
  catch { return block('evidence-unavailable') }
  let comparison: FederalAnnualComparison
  try { comparison = compareUsFederalAnnualEstimate(input.value, bundle.compositionReview, selection.recorded, bundle.comparisonApproval) }
  catch { return block('comparison-invalid') }
  try {
    verify(selection.evidence)
    for (const [root, stamp] of roots) if (rootStamp(root) !== stamp) throw new Error('Evidence root changed')
    const current = specs.map(([file, limit]) => readJson(file, limit))
    if (current.some((v, i) => v.stamp !== [input, history, review][i].stamp || v.rawSha256 !== [input, history, review][i].rawSha256)) throw new Error('Source changed')
  } catch { return block('source-changed-during-read') }
  result.comparison = comparison; result.verification = 'selected-history-evidence-and-review-pins-checked'
  result.status = comparison.status; result.comparisonEligible = comparison.comparisonEligible; result.differenceMinor = comparison.differenceMinor; result.blockers = comparison.blockers
  return result
}
