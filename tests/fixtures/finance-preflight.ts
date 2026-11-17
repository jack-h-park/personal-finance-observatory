import type { EndpointObservation, FinancePreflightInput } from '../../lib/domain/finance-preflight/types'

export const endpoint = (canonicalPath = '/synthetic/records/archive', kind: 'file' | 'directory' = 'directory'): EndpointObservation => ({
  hostId: 'synthetic-host', cwd: '/synthetic', configuredPath: canonicalPath,
  configurationSha256: 'a'.repeat(64),
  observation: { state: 'available', resolvedPath: canonicalPath, canonicalPath, allowedRootCanonicalPath: '/synthetic/records', kind, readAccess: 'readable' },
})
export function scenario(): FinancePreflightInput {
  return {
    schemaVersion: 1, observedAt: '2025-01-15T12:00:00Z', requestedContracts: ['archive_path'],
    archive: { producer: endpoint(), consumer: endpoint(), stages: ['document_writer', 'benchmarks', 'archive_commit', 'renderer'].map(stage => ({ stage: stage as 'document_writer' | 'benchmarks' | 'archive_commit' | 'renderer', endpoint: endpoint() })) },
    curatedFx: {
      curator: { state: 'unconfirmed', role: 'finance_curator' }, committer: { state: 'unconfirmed', role: 'application_operator' },
      inputs: ['rate_observations', 'screenshot_annotations', 'transfer_overrides'].map(resource => ({ resource: resource as 'rate_observations' | 'screenshot_annotations' | 'transfer_overrides', endpoint: endpoint(`/synthetic/records/${resource}.json`, 'file'), authority: endpoint(`/synthetic/records/${resource}.json`, 'file') })),
      outputs: [endpoint('/synthetic/records/generated/ledger.json', 'file')],
    },
  }
}
