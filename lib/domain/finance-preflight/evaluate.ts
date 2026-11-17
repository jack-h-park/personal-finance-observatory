import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import type { ContractId, ContractResult, EndpointObservation, FinancePreflightReceipt, PreflightStatus, ReasonCode } from './types'
import { resources, stages, validateFinancePreflightInput } from './validation'

const aggregate = (values: PreflightStatus[]): PreflightStatus => ['conflict', 'mismatch', 'unavailable', 'matched'].find(s => values.includes(s as PreflightStatus)) as PreflightStatus
function assess(contract: ContractId): ContractResult & { flag: (code: ReasonCode, endpoint: string, status?: PreflightStatus) => void; check: (e: EndpointObservation, id: string, kind: 'file' | 'directory') => boolean; compare: (a: EndpointObservation, b: EndpointObservation, id: string) => void } {
  const result: ContractResult = { contract, status: 'matched', reasons: [], endpoints: [] }
  const flag = (code: ReasonCode, endpoint: string, status: PreflightStatus = 'conflict') => {
    result.reasons.push({ code, endpoint }); result.status = aggregate([result.status, status])
  }
  const check = (e: EndpointObservation, id: string, kind: 'file' | 'directory') => {
    result.endpoints.push({ id, value: structuredClone(e) })
    const o = e.observation
    if (o.state !== 'available') { flag(`endpoint_${o.state}`, id, o.state === 'conflict' ? 'conflict' : 'unavailable'); return false }
    let valid = true
    if (o.kind !== kind) { flag('endpoint_kind_mismatch', id); valid = false }
    if (posix.resolve(e.cwd, e.configuredPath) !== o.resolvedPath) { flag('observation_path_mismatch', id); valid = false }
    const rel = posix.relative(o.allowedRootCanonicalPath, o.canonicalPath)
    if (rel === '..' || rel.startsWith('../') || posix.isAbsolute(rel)) { flag('root_escape', id); valid = false }
    if (o.readAccess !== 'readable') { flag(`read_access_${o.readAccess}`, id, 'unavailable'); valid = false }
    return valid
  }
  const compare = (a: EndpointObservation, b: EndpointObservation, id: string) => {
    if (a.hostId !== b.hostId) flag('host_mismatch', id, 'mismatch')
    else if (a.observation.state === 'available' && b.observation.state === 'available' && a.observation.canonicalPath !== b.observation.canonicalPath) flag('canonical_path_mismatch', id, 'mismatch')
  }
  return Object.assign(result, { flag, check, compare })
}
const same = (a: EndpointObservation, b: EndpointObservation) => a.hostId === b.hostId && a.observation.state === 'available' && b.observation.state === 'available' && a.observation.canonicalPath === b.observation.canonicalPath
export function evaluateFinancePreflight(value: unknown): FinancePreflightReceipt {
  const input = validateFinancePreflightInput(value)
  const results = input.requestedContracts.map(contract => {
    const r = assess(contract)
    if (contract === 'archive_path') {
      const a = input.archive
      if (!a) r.flag('contract_missing', contract, 'unavailable')
      else {
        const producerValid = r.check(a.producer, 'producer', 'directory')
        if (r.check(a.consumer, 'consumer', 'directory') && producerValid) r.compare(a.producer, a.consumer, 'consumer')
        for (const stage of stages) {
          const group = a.stages.filter(s => s.stage === stage)
          if (!group.length) r.flag('stage_missing', stage, 'unavailable')
          if (group.length > 1) r.flag('stage_duplicate', stage)
          for (const s of group) if (r.check(s.endpoint, stage, 'directory') && producerValid) r.compare(a.producer, s.endpoint, stage)
        }
      }
    } else {
      const f = input.curatedFx
      if (!f) r.flag('contract_missing', contract, 'unavailable')
      else {
        r.assignments = structuredClone({ curator: f.curator, committer: f.committer })
        for (const [name, role] of [['curator', 'finance_curator'], ['committer', 'application_operator']] as const) {
          if (f[name].role !== role) r.flag(`${name}_role_mismatch`, name)
          if (f[name].state !== 'accepted') r.flag(`${name}_unconfirmed`, name, 'unavailable')
        }
        const inputs: EndpointObservation[] = []
        for (const resource of resources) {
          const group = f.inputs.filter(i => i.resource === resource)
          if (!group.length) r.flag('input_missing', resource, 'unavailable')
          if (group.length > 1) r.flag('input_duplicate', resource)
          for (const i of group) {
            const valid = r.check(i.endpoint, resource, 'file'), authorityValid = r.check(i.authority, `${resource}:authority`, 'file')
            if (valid && authorityValid) r.compare(i.endpoint, i.authority, resource)
            if (valid) {
              if (inputs.some(e => same(e, i.endpoint))) r.flag('input_alias', resource)
              inputs.push(i.endpoint)
            }
          }
        }
        if (!f.outputs.length) r.flag('output_missing', 'outputs', 'unavailable')
        f.outputs.forEach((e, i) => { if (r.check(e, `output:${i}`, 'file') && inputs.some(a => same(a, e))) r.flag('input_output_collision', `output:${i}`) })
      }
    }
    // Return data only: no closures or accidental executable capabilities in receipts.
    return { contract: r.contract, status: r.status, reasons: r.reasons, endpoints: r.endpoints, ...(r.assignments ? { assignments: r.assignments } : {}) }
  })
  return {
    schemaVersion: 1, observedAt: input.observedAt, inputSha256: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
    requestedContracts: [...input.requestedContracts], evidenceBasis: 'provided_observations', liveVerified: false,
    operationAuthorized: false, backupStatus: 'not_checked', status: aggregate(results.map(r => r.status)), results,
  }
}
