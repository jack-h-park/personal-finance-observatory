/** Recorded observations only: this contract grants no operational authority. */
export type ContractId = 'archive_path' | 'curated_fx_authority'
export type PreflightStatus = 'matched' | 'mismatch' | 'unavailable' | 'conflict'
export type StageId = 'document_writer' | 'benchmarks' | 'archive_commit' | 'renderer'
export type ResourceId = 'rate_observations' | 'screenshot_annotations' | 'transfer_overrides'
export type LogicalRole = 'finance_curator' | 'application_operator' | 'source_custodian' | 'briefing_producer'
export type PathObservation = {
  state: 'available'; resolvedPath: string; canonicalPath: string; allowedRootCanonicalPath: string
  kind: 'file' | 'directory'; readAccess: 'readable' | 'unreadable' | 'unconfirmed'
} | { state: 'missing' | 'unavailable' | 'conflict' }
export interface EndpointObservation {
  hostId: string; cwd: string; configuredPath: string; configurationSha256: string; observation: PathObservation
}
export interface RoleAssignment { state: 'unconfirmed' | 'proposed' | 'accepted'; role: LogicalRole; actorId?: string }
export interface ArchiveContract {
  producer: EndpointObservation; consumer: EndpointObservation
  stages: { stage: StageId; endpoint: EndpointObservation }[]
}
export interface CuratedFxContract {
  curator: RoleAssignment; committer: RoleAssignment
  inputs: { resource: ResourceId; endpoint: EndpointObservation; authority: EndpointObservation }[]
  outputs: EndpointObservation[]
}
export interface FinancePreflightInput {
  schemaVersion: 1; observedAt: string; requestedContracts: ContractId[]
  archive?: ArchiveContract; curatedFx?: CuratedFxContract
}
export type ReasonCode = 'contract_missing' | 'stage_missing' | 'stage_duplicate' | 'input_missing' | 'input_duplicate'
  | 'output_missing' | 'curator_unconfirmed' | 'committer_unconfirmed' | 'curator_role_mismatch' | 'committer_role_mismatch'
  | 'endpoint_missing' | 'endpoint_unavailable' | 'endpoint_conflict' | 'read_access_unconfirmed' | 'read_access_unreadable'
  | 'endpoint_kind_mismatch' | 'observation_path_mismatch' | 'root_escape' | 'host_mismatch' | 'canonical_path_mismatch'
  | 'input_output_collision' | 'input_alias'
export interface PreflightReason { code: ReasonCode; endpoint: string }
export interface ContractResult {
  contract: ContractId; status: PreflightStatus; reasons: PreflightReason[]
  endpoints: { id: string; value: EndpointObservation }[]
  assignments?: { curator: RoleAssignment; committer: RoleAssignment }
}
export interface FinancePreflightReceipt {
  schemaVersion: 1; observedAt: string; inputSha256: string; requestedContracts: ContractId[]
  evidenceBasis: 'provided_observations'; liveVerified: false; operationAuthorized: false; backupStatus: 'not_checked'
  status: PreflightStatus; results: ContractResult[]
}
