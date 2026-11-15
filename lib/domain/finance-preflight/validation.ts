import { posix } from 'node:path'
import type { FinancePreflightInput } from './types'

export const stages = ['document_writer', 'benchmarks', 'archive_commit', 'renderer'] as const
export const resources = ['rate_observations', 'screenshot_annotations', 'transfer_overrides'] as const
const roles = ['finance_curator', 'application_operator', 'source_custodian', 'briefing_producer']
const contracts = ['archive_path', 'curated_fx_authority']
const member = (v: unknown, values: readonly string[]) => typeof v === 'string' && values.includes(v)
const invalid = (): never => { throw new Error('Invalid finance preflight input') }
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) return invalid()
  if (Object.getOwnPropertySymbols(v).length || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => !Object.hasOwn(d, 'value') || !d.enumerable)) return invalid()
  return v as Record<string, unknown>
}
function keys(v: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (required.some(k => !Object.hasOwn(v, k)) || Object.keys(v).some(k => ![...required, ...optional].includes(k))) invalid()
}
function text(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 1024 && v.trim() === v && !/[\u0000-\u001f\u007f]/.test(v)
}
function id(v: unknown): boolean { return text(v) && /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(v) }
function path(v: unknown, absolute = true): boolean {
  return text(v) && !v.includes('\\') && (absolute ? posix.isAbsolute(v) && posix.normalize(v) === v : !/^[A-Za-z]:/.test(v))
}
function list(v: unknown, max = 32): unknown[] {
  if (!Array.isArray(v) || v.length > max || Object.getPrototypeOf(v) !== Array.prototype || Object.getOwnPropertyNames(v).length !== v.length + 1 || Object.getOwnPropertySymbols(v).length) return invalid()
  for (let i = 0; i < v.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(v, String(i))
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return invalid()
  }
  return v
}
function endpoint(value: unknown) {
  const e = record(value); keys(e, ['hostId', 'cwd', 'configuredPath', 'configurationSha256', 'observation'])
  if (!id(e.hostId) || !path(e.cwd) || !path(e.configuredPath, false) || typeof e.configurationSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(e.configurationSha256)) invalid()
  const o = record(e.observation)
  if (o.state === 'available') {
    keys(o, ['state', 'resolvedPath', 'canonicalPath', 'allowedRootCanonicalPath', 'kind', 'readAccess'])
    if (!path(o.resolvedPath) || !path(o.canonicalPath) || !path(o.allowedRootCanonicalPath) || o.allowedRootCanonicalPath === '/' || !member(o.kind, ['file', 'directory']) || !member(o.readAccess, ['readable', 'unreadable', 'unconfirmed'])) invalid()
  } else {
    keys(o, ['state']); if (!member(o.state, ['missing', 'unavailable', 'conflict'])) invalid()
  }
}
function assignment(value: unknown) {
  const a = record(value); keys(a, ['state', 'role'], ['actorId'])
  if (!member(a.state, ['unconfirmed', 'proposed', 'accepted']) || !member(a.role, roles) || (Object.hasOwn(a, 'actorId') && !id(a.actorId)) || (a.state === 'accepted' && !id(a.actorId))) invalid()
}
export function validateFinancePreflightInput(value: unknown): FinancePreflightInput {
  const v = record(value); keys(v, ['schemaVersion', 'observedAt', 'requestedContracts'], ['archive', 'curatedFx'])
  if (v.schemaVersion !== 1 || typeof v.observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v.observedAt)) invalid()
  const date = new Date(v.observedAt as string)
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== (v.observedAt as string).replace(/Z$/, (v.observedAt as string).includes('.') ? 'Z' : '.000Z')) invalid()
  const requested = list(v.requestedContracts, 2)
  if (!requested.length || new Set(requested).size !== requested.length || requested.some(c => !member(c, contracts))) invalid()
  if (Object.hasOwn(v, 'archive')) {
    const a = record(v.archive); keys(a, ['producer', 'consumer', 'stages']); endpoint(a.producer); endpoint(a.consumer)
    for (const raw of list(a.stages, 16)) {
      const s = record(raw); keys(s, ['stage', 'endpoint']); if (!(stages as readonly unknown[]).includes(s.stage)) invalid(); endpoint(s.endpoint)
    }
  }
  if (Object.hasOwn(v, 'curatedFx')) {
    const f = record(v.curatedFx); keys(f, ['curator', 'committer', 'inputs', 'outputs']); assignment(f.curator); assignment(f.committer)
    for (const raw of list(f.inputs, 16)) {
      const i = record(raw); keys(i, ['resource', 'endpoint', 'authority']); if (!(resources as readonly unknown[]).includes(i.resource)) invalid(); endpoint(i.endpoint); endpoint(i.authority)
    }
    for (const e of list(f.outputs)) endpoint(e)
  }
  return value as FinancePreflightInput
}
