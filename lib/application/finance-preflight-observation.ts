import { hostname } from 'node:os'
import { evaluateFinancePreflight } from '../domain/finance-preflight'
import type { EndpointObservation, FinancePreflightInput } from '../domain/finance-preflight/types'
import { validateObservationRequest, type EndpointRequest } from '../domain/finance-preflight/observation-request'
import { collectEndpoint, fingerprint, localMetadata, selectedSettings, type CollectedEndpoint, type CollectionCode, type ReadOnlyMetadata } from '../adapters/finance-preflight-observer'

export interface LocalObservationContext {
  env?: Record<string, string | undefined>; now?: () => string; hostname?: () => string; metadata?: ReadOnlyMetadata
}
export function observeFinancePreflight(value: unknown, options: LocalObservationContext = {}) {
  const request = validateObservationRequest(value), envSource = options.env ?? process.env
  const env = selectedSettings(envSource), name = (options.hostname ?? hostname)(), hostId = `host-${fingerprint(name)}`
  const observedAt = (options.now ?? (() => new Date().toISOString()))()
  const context = { env, hostname: name, hostId, metadata: options.metadata ?? localMetadata }
  const input: FinancePreflightInput = { schemaVersion: 1, observedAt, requestedContracts: [...request.requestedContracts] }
  const endpoints: { id: string; collection: CollectedEndpoint }[] = []
  const collectionIssues: { endpoint: string; code: CollectionCode }[] = []
  const collect = (request: EndpointRequest, id: string): EndpointObservation => {
    const collection = collectEndpoint(request, context); endpoints.push({ id, collection })
    if (collection.issue) collectionIssues.push({ endpoint: id, code: collection.issue })
    return collection.endpoint
  }
  if (request.requestedContracts.includes('archive_path') && request.archive) {
    const a = request.archive
    input.archive = { producer: collect(a.producer, 'archive:producer'), consumer: collect(a.consumer, 'archive:consumer'), stages: a.stages.map((s, i) => ({ stage: s.stage, endpoint: collect(s.endpoint, `archive:${s.stage}:${i}`) })) }
  }
  if (request.requestedContracts.includes('curated_fx_authority') && request.curatedFx) {
    const f = request.curatedFx
    input.curatedFx = { curator: structuredClone(f.curator), committer: structuredClone(f.committer), inputs: f.inputs.map((i, n) => ({ resource: i.resource, endpoint: collect(i.endpoint, `fx:input:${i.resource}:${n}`), authority: collect(i.authority, `fx:authority:${i.resource}:${n}`) })), outputs: f.outputs.map((e, i) => collect(e, `fx:output:${i}`)) }
    const inputs = endpoints.filter(e => e.id.startsWith('fx:input:') && e.collection.facts?.kind === 'file')
    for (const e of endpoints.filter(e => e.id.startsWith('fx:output:') || e.id.startsWith('fx:input:'))) {
      if (!e.collection.facts || e.collection.facts.kind !== 'file') continue
      if (inputs.some(i => i !== e && i.collection.facts?.identity === e.collection.facts!.identity)) {
        const code = e.id.startsWith('fx:output:') ? 'physical_input_output_collision' : 'physical_input_alias'
        collectionIssues.push({ endpoint: e.id, code }); e.collection.endpoint.observation = { state: 'conflict' }
      }
    }
  }
  if (fingerprint(env) !== fingerprint(selectedSettings(envSource))) {
    for (const e of endpoints) e.collection.endpoint.observation = { state: 'conflict' }
    collectionIssues.push({ endpoint: 'configuration', code: 'configuration_changed' })
  }
  return {
    schemaVersion: 1 as const, collectionMode: 'local_read_only' as const, observedAt, requestSha256: fingerprint(request),
    processContext: { hostname: name, hostId, hostIdentityBasis: 'os_hostname' as const, cwd: process.cwd() },
    configurationKeys: Object.keys(env).sort(), jobContextVerified: false as const, liveVerified: false as const, operationAuthorized: false as const,
    collectionIssues, endpoints, input, assessment: evaluateFinancePreflight(input),
  }
}
