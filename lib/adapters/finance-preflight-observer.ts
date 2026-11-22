/** Metadata only. No dotenv, endpoint content reads, process execution or writes. */
import { constants, accessSync, realpathSync, statSync } from 'node:fs'
import { posix } from 'node:path'
import { createHash } from 'node:crypto'
import { FINANCE_FILES, financeFile } from '../../scripts/finance-paths.mjs'
import type { EndpointObservation } from '../domain/finance-preflight/types'
import type { EndpointRequest } from '../domain/finance-preflight/observation-request'

export interface MetadataFacts { kind: 'file' | 'directory' | 'other'; identity: string; size: number; modified: number; mode: number; uid: number; gid: number }
export interface ReadOnlyMetadata {
  realpath(path: string): string; stat(path: string): MetadataFacts; readable(path: string, kind: 'file' | 'directory'): void
}
export const localMetadata: ReadOnlyMetadata = {
  realpath: name => realpathSync(name),
  stat: name => { const s = statSync(name); return { kind: s.isFile() ? 'file' : s.isDirectory() ? 'directory' : 'other', identity: `${s.dev}:${s.ino}`, size: s.size, modified: s.mtimeMs, mode: s.mode & 0o777, uid: s.uid, gid: s.gid } },
  readable: (name, kind) => accessSync(name, constants.R_OK | (kind === 'directory' ? constants.X_OK : 0)),
}
const rootKeys = ['FINANCE_MODE', 'FINANCE_STATE_WRITABLE', 'FINANCE_RECORDS_DIR', 'FINANCE_TAX_DIR', 'FINANCE_STATE_DIR', 'FINANCE_RUNTIME_DIR', 'STOCK_DATA_DIR', 'FINANCE_CONNECTOR_RECORDS_DIR', 'STOCK_CONNECTOR_RECORDS_DIR', 'FINANCE_CONNECTOR_EXPORT_DIR', 'STOCK_CONNECTOR_EXPORT_DIR']
const settingKeys = [...rootKeys, ...Object.keys(FINANCE_FILES).flatMap(key => [key, key.replace(/^STOCK_/, 'FINANCE_')]), 'BRIEFING_ARCHIVE_DIR']
export const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function selectedSettings(env: Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries([...new Set(settingKeys)].sort().filter(k => env[k] !== undefined).map(k => [k, env[k]]))
}
export type CollectionCode = 'foreign_host' | 'setting_missing' | 'configuration_unavailable' | 'root_unavailable' | 'cwd_unavailable' | 'root_escape' | 'path_loop' | 'endpoint_missing' | 'metadata_unavailable' | 'read_access_denied' | 'unsupported_kind' | 'path_changed' | 'physical_input_alias' | 'physical_input_output_collision' | 'configuration_changed'
export interface CollectedEndpoint {
  endpoint: EndpointObservation; source: EndpointRequest['source']; requestedRoot: string; expectedHostname?: string
  facts?: MetadataFacts; issue?: CollectionCode
}
const codeOf = (error: unknown) => error && typeof error === 'object' && 'code' in error ? error.code : undefined
const inside = (root: string, name: string) => { const r = posix.relative(root, name); return r !== '..' && !r.startsWith('../') && !posix.isAbsolute(r) }
const sameFacts = (a: MetadataFacts, b: MetadataFacts) => fingerprint(a) === fingerprint(b)
function configuredPath(request: EndpointRequest, env: Record<string, string | undefined>): string | undefined {
  const s = request.source
  if (s.kind === 'explicit_path') return s.path
  if (s.kind === 'environment') return env[s.key]
  if (s.kind === 'finance_file') return financeFile(s.key, env as NodeJS.ProcessEnv, request.cwd)
  // Keep old observation requests compatible with the extractor's shared resolver.
  return financeFile('STOCK_FX_TRANSFER_OVERRIDES_PATH', env as NodeJS.ProcessEnv, request.cwd)
}
export function collectEndpoint(request: EndpointRequest, context: { env: Record<string, string | undefined>; hostname: string; hostId: string; metadata: ReadOnlyMetadata }): CollectedEndpoint {
  const result: CollectedEndpoint = {
    endpoint: { hostId: context.hostId, cwd: request.cwd, configuredPath: 'unavailable', configurationSha256: fingerprint({ source: request.source, cwd: request.cwd, settings: context.env }), observation: { state: 'unavailable' } },
    source: structuredClone(request.source), requestedRoot: request.allowedRoot, ...(request.expectedHostname ? { expectedHostname: request.expectedHostname } : {}),
  }
  const fail = (issue: CollectionCode, state: 'missing' | 'unavailable' | 'conflict' = 'unavailable') => { result.issue = issue; result.endpoint.observation = { state }; return result }
  if (request.expectedHostname && request.expectedHostname !== context.hostname) return fail('foreign_host')
  let configured: string | undefined
  try { configured = configuredPath(request, context.env) } catch { return fail('configuration_unavailable', 'conflict') }
  if (configured === undefined || !configured.trim()) return fail('setting_missing')
  if (configured.length > 1024 || configured.trim() !== configured || /[\u0000-\u001f\u007f\\]/.test(configured) || /^[A-Za-z]:/.test(configured) || /(?:^|\/)[A-Za-z][A-Za-z0-9+.-]*:\//.test(configured)) return fail('configuration_unavailable', 'conflict')
  result.endpoint.configuredPath = configured
  const resolved = posix.resolve(request.cwd, configured), fs = context.metadata
  let root: string, rootFacts: MetadataFacts, cwd: string
  try { root = fs.realpath(request.allowedRoot); rootFacts = fs.stat(root); if (rootFacts.kind !== 'directory' || root === '/') return fail('root_unavailable', 'conflict') } catch { return fail('root_unavailable') }
  try { cwd = fs.realpath(request.cwd); if (fs.stat(cwd).kind !== 'directory') return fail('cwd_unavailable') } catch { return fail('cwd_unavailable') }
  let canonical: string, facts: MetadataFacts
  try {
    canonical = fs.realpath(resolved)
    if (!inside(root, canonical)) return fail('root_escape', 'conflict')
    facts = fs.stat(canonical)
  } catch (error) {
    if (codeOf(error) === 'ELOOP') return fail('path_loop', 'conflict')
    return fail(codeOf(error) === 'ENOENT' ? 'endpoint_missing' : 'metadata_unavailable', codeOf(error) === 'ENOENT' ? 'missing' : 'unavailable')
  }
  if (facts.kind === 'other') return fail('unsupported_kind', 'conflict')
  let access: 'readable' | 'unreadable' = 'readable'
  try { fs.readable(canonical, facts.kind) } catch { access = 'unreadable'; result.issue = 'read_access_denied' }
  try {
    if (fs.realpath(request.allowedRoot) !== root || fs.realpath(request.cwd) !== cwd || fs.realpath(resolved) !== canonical || !sameFacts(rootFacts, fs.stat(root)) || !sameFacts(facts, fs.stat(canonical))) return fail('path_changed', 'conflict')
  } catch { return fail('path_changed', 'conflict') }
  result.facts = facts
  result.endpoint.observation = { state: 'available', resolvedPath: resolved, canonicalPath: canonical, allowedRootCanonicalPath: root, kind: facts.kind, readAccess: access }
  return result
}
