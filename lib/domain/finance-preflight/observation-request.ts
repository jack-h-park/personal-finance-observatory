import { posix } from 'node:path'
import type { ContractId, EndpointObservation, ResourceId, RoleAssignment, StageId } from './types'
import { validateFinancePreflightInput } from './validation'

export const observedFinanceKeys = ['STOCK_BRIEFING_ARCHIVE_DIR', 'STOCK_FX_RATE_OBSERVATIONS_PATH', 'STOCK_HANA_FX_SCREENSHOT_EVIDENCE_PATH', 'STOCK_FX_LEDGER_PATH'] as const
export type PathSource = { kind: 'environment'; key: 'BRIEFING_ARCHIVE_DIR' }
  | { kind: 'finance_file'; key: typeof observedFinanceKeys[number] }
  | { kind: 'explicit_path'; path: string }
  | { kind: 'legacy_transfer_override' }
export interface EndpointRequest { cwd: string; allowedRoot: string; expectedHostname?: string; source: PathSource }
export interface ObservationRequest {
  schemaVersion: 1; requestedContracts: ContractId[]
  archive?: { producer: EndpointRequest; consumer: EndpointRequest; stages: { stage: StageId; endpoint: EndpointRequest }[] }
  curatedFx?: { curator: RoleAssignment; committer: RoleAssignment; inputs: { resource: ResourceId; endpoint: EndpointRequest; authority: EndpointRequest }[]; outputs: EndpointRequest[] }
}
const invalid = (): never => { throw new Error('Invalid finance observation request') }
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Object.getOwnPropertySymbols(v).length) return invalid()
  if (Object.values(Object.getOwnPropertyDescriptors(v)).some(d => !Object.hasOwn(d, 'value') || !d.enumerable)) return invalid()
  return v as Record<string, unknown>
}
function keys(v: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (required.some(k => !Object.hasOwn(v, k)) || Object.keys(v).some(k => ![...required, ...optional].includes(k))) invalid()
}
function list(v: unknown): unknown[] {
  if (!Array.isArray(v) || v.length > 32 || Object.getPrototypeOf(v) !== Array.prototype || Object.getOwnPropertyNames(v).length !== v.length + 1 || Object.getOwnPropertySymbols(v).length) return invalid()
  for (let i = 0; i < v.length; i++) if (!Object.hasOwn(Object.getOwnPropertyDescriptor(v, String(i)) ?? {}, 'value')) invalid()
  return v
}
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 1024 && v.trim() === v && !/[\u0000-\u001f\u007f\\]/.test(v)
const absolute = (v: unknown) => text(v) && posix.isAbsolute(v) && posix.normalize(v) === v
function endpoint(raw: unknown): EndpointObservation {
  const e = object(raw); keys(e, ['cwd', 'allowedRoot', 'source'], ['expectedHostname'])
  if (!absolute(e.cwd) || !absolute(e.allowedRoot) || e.allowedRoot === '/' || (Object.hasOwn(e, 'expectedHostname') && !text(e.expectedHostname))) invalid()
  const s = object(e.source)
  if (s.kind === 'environment') { keys(s, ['kind', 'key']); if (s.key !== 'BRIEFING_ARCHIVE_DIR') invalid() }
  else if (s.kind === 'finance_file') { keys(s, ['kind', 'key']); if (!(observedFinanceKeys as readonly unknown[]).includes(s.key)) invalid() }
  else if (s.kind === 'explicit_path') { keys(s, ['kind', 'path']); if (!text(s.path) || /^[A-Za-z]:/.test(s.path) || /(?:^|\/)[A-Za-z][A-Za-z0-9+.-]*:\//.test(s.path)) invalid() }
  else if (s.kind === 'legacy_transfer_override') keys(s, ['kind'])
  else invalid()
  return { hostId: 'validation-host', cwd: e.cwd as string, configuredPath: 'not-observed', configurationSha256: '0'.repeat(64), observation: { state: 'unavailable' } }
}
export function validateObservationRequest(value: unknown): ObservationRequest {
  try {
    const v = object(value); keys(v, ['schemaVersion', 'requestedContracts'], ['archive', 'curatedFx'])
    const requestedContracts = list(v.requestedContracts)
    const skeleton: Record<string, unknown> = { schemaVersion: v.schemaVersion, observedAt: '2025-01-01T00:00:00Z', requestedContracts }
    if (Object.hasOwn(v, 'archive')) {
      const a = object(v.archive); keys(a, ['producer', 'consumer', 'stages'])
      skeleton.archive = { producer: endpoint(a.producer), consumer: endpoint(a.consumer), stages: list(a.stages).map(raw => { const s = object(raw); keys(s, ['stage', 'endpoint']); return { stage: s.stage, endpoint: endpoint(s.endpoint) } }) }
    }
    if (Object.hasOwn(v, 'curatedFx')) {
      const f = object(v.curatedFx); keys(f, ['curator', 'committer', 'inputs', 'outputs'])
      skeleton.curatedFx = { curator: f.curator, committer: f.committer, inputs: list(f.inputs).map(raw => { const i = object(raw); keys(i, ['resource', 'endpoint', 'authority']); return { resource: i.resource, endpoint: endpoint(i.endpoint), authority: endpoint(i.authority) } }), outputs: list(f.outputs).map(endpoint) }
    }
    validateFinancePreflightInput(skeleton)
    return value as ObservationRequest
  } catch { return invalid() }
}
