import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

export const nativeRunners = ['ubuntu-24.04', 'windows-2022', 'macos-15-intel'] as const;
export interface SourceIdentity { repository: string; workflow: string; headSha: string; baseSha: string }
export interface SelectionContext extends SourceIdentity { runId: string; attempt: string }
export interface NativeJob { id: number; name: string; run_id: number; head_sha: string; status: string; conclusion: string | null; started_at: string; completed_at: string }
export interface NativeArtifact { id: number; name: string; expired: boolean; created_at: string; expires_at: string; workflow_run: { id: number; repository_id: number; head_repository_id: number; head_sha: string } }
export interface NativeRun { id: number; workflow_id: number; path: string; head_sha: string; run_attempt: number; repository: { id: number; full_name: string }; pull_requests: { head: { sha: string; repo: { id: number } }; base: { sha: string; repo: { id: number } } }[] }
export interface SelectedArtifact { runner: string; id: number; name: string; attempt: string; jobId: number }
const fail = (message: string): never => { throw new Error(message); };
const positive = (value: number) => Number.isSafeInteger(value) && value > 0;
const time = (value: string) => { const result = Date.parse(value); if (!Number.isFinite(result)) fail('Invalid artifact/job timestamp'); return result; };
export function sourceIdentity(env: NodeJS.ProcessEnv, event: any): SourceIdentity {
  const repository = env.GITHUB_REPOSITORY ?? '';
  const workflow = (env.GITHUB_WORKFLOW_REF ?? '').slice(repository.length + 1).split('@')[0] ?? '';
  const headSha = event.pull_request?.head?.sha ?? env.GITHUB_SHA ?? '';
  const baseSha = event.pull_request?.base?.sha ?? env.GITHUB_SHA ?? '';
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || workflow !== '.github/workflows/ci.yml' ||
      !/^[a-f0-9]{40}$/.test(headSha) || !/^[a-f0-9]{40}$/.test(baseSha) ||
      !(env.GITHUB_WORKFLOW_REF ?? '').startsWith(`${repository}/`)) fail('Invalid workflow source identity');
  return { repository, workflow, headSha, baseSha };
}
/** Current-attempt jobs include GitHub's carried-forward successes. Their actual
 * execution timestamps identify the producing artifact's original attempt. */
export function selectNativeArtifacts(context: SelectionContext, run: NativeRun, jobs: NativeJob[], artifacts: NativeArtifact[], now: number): SelectedArtifact[] {
  if (!/^[\w.-]+\/[\w.-]+$/.test(context.repository) || context.workflow !== '.github/workflows/ci.yml' ||
      !/^[a-f0-9]{40}$/.test(context.headSha) || !/^[a-f0-9]{40}$/.test(context.baseSha) ||
      !positive(run.repository.id) || !positive(run.id) || !positive(run.run_attempt) ||
      !/^[1-9]\d*$/.test(context.runId) || !/^[1-9]\d*$/.test(context.attempt) || !Number.isFinite(now) ||
      run.id !== Number(context.runId) || run.run_attempt !== Number(context.attempt) || !positive(run.workflow_id) ||
      run.path !== context.workflow || run.repository.full_name !== context.repository || run.head_sha !== context.headSha) fail('Run/source identity mismatch');
  if (run.pull_requests.length) {
    if (run.pull_requests.length !== 1 || !positive(run.pull_requests[0]!.head.repo.id) || !positive(run.pull_requests[0]!.base.repo.id) || run.pull_requests[0]!.head.sha !== context.headSha || run.pull_requests[0]!.base.sha !== context.baseSha ||
        run.pull_requests[0]!.base.repo.id !== run.repository.id) fail('PR head/base identity mismatch');
  } else if (context.headSha !== context.baseSha) fail('Missing PR provenance');
  const nativeJobs = jobs.filter(job => job.name.startsWith('Native calendar ('));
  if (nativeJobs.length !== nativeRunners.length || nativeJobs.some(job => !nativeRunners.some(runner => job.name === `Native calendar (${runner})`))) fail('Native job inventory mismatch');
  if (new Set(nativeJobs.map(job => job.id)).size !== nativeRunners.length) fail('Duplicate native job IDs');
  const nativeArtifacts = artifacts.filter(artifact => artifact.name.startsWith('native-calendar-'));
  const seen = new Set<string>();
  const ids = new Set<number>();
  for (const artifact of nativeArtifacts) {
    const match = /^native-calendar-(ubuntu-24\.04|windows-2022|macos-15-intel)-([1-9]\d*)$/.exec(artifact.name);
    if (!match || Number(match[2]) > Number(context.attempt) || seen.has(artifact.name) || ids.has(artifact.id) || !positive(artifact.id)) fail('Unknown/duplicate artifact inventory');
    seen.add(artifact.name); ids.add(artifact.id);
    if (typeof artifact.expired !== 'boolean' || typeof artifact.created_at !== 'string' || typeof artifact.expires_at !== 'string' ||
        !positive(artifact.workflow_run.id) || !positive(artifact.workflow_run.repository_id) || !positive(artifact.workflow_run.head_repository_id)) fail('Incomplete artifact provenance');
    if (artifact.workflow_run.id !== run.id || artifact.workflow_run.repository_id !== run.repository.id ||
        artifact.workflow_run.head_repository_id !== (run.pull_requests[0]?.head.repo.id ?? run.repository.id) || artifact.workflow_run.head_sha !== context.headSha) fail('Artifact source identity mismatch');
  }
  return nativeRunners.map(runner => {
    const matchingJobs = nativeJobs.filter(job => job.name === `Native calendar (${runner})`);
    if (matchingJobs.length !== 1) fail('Duplicate/missing native job');
    const job = matchingJobs[0]!;
    if (!positive(job.id) || job.run_id !== run.id || job.head_sha !== context.headSha || job.status !== 'completed' || job.conclusion !== 'success') fail('Native producing job not successful');
    const start = time(job.started_at), end = time(job.completed_at);
    if (start > end || end > now) fail('Invalid native execution interval');
    const candidates = nativeArtifacts.filter(artifact => artifact.name.startsWith(`native-calendar-${runner}-`) && time(artifact.created_at) >= start && time(artifact.created_at) <= end);
    if (candidates.length !== 1) fail('Missing/ambiguous artifact for latest native job');
    const artifact = candidates[0]!;
    if (artifact.expired !== false || time(artifact.expires_at) <= now) fail('Expired selected native artifact');
    return { runner, id: artifact.id, name: artifact.name, attempt: artifact.name.slice(`native-calendar-${runner}-`.length), jobId: job.id };
  });
}
async function api(path: string): Promise<any> {
  const token = process.env.GH_TOKEN;
  if (!token) fail('Missing read-only workflow token');
  const response = await fetch(`https://api.github.com${path}`, { redirect: 'error', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) fail(`Metadata request failed: HTTP ${response.status}`);
  return response.json();
}
async function collection(path: string, key: string): Promise<any[]> {
  const result: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const value = await api(`${path}?per_page=100&page=${page}`);
    if (!Array.isArray(value[key]) || !Number.isSafeInteger(value.total_count)) fail('Invalid metadata page');
    result.push(...value[key]);
    if (result.length === value.total_count) return result;
    if (result.length > value.total_count || value[key].length === 0) fail('Incomplete metadata pagination');
  }
  return fail('Metadata pagination bound exceeded');
}
export async function selectFromGitHub(): Promise<void> {
  const identity = sourceIdentity(process.env, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8')));
  const context = { ...identity, runId: process.env.GITHUB_RUN_ID ?? '', attempt: process.env.GITHUB_RUN_ATTEMPT ?? '' };
  if (!/^[1-9]\d*$/.test(context.runId) || !/^[1-9]\d*$/.test(context.attempt)) fail('Invalid run identifiers');
  const path = `/repos/${identity.repository}/actions/runs/${context.runId}`;
  const run = await api(path);
  const jobs = await collection(`${path}/attempts/${context.attempt}/jobs`, 'jobs');
  const artifacts = await collection(`${path}/artifacts`, 'artifacts');
  const selected = selectNativeArtifacts(context, run, jobs, artifacts, Date.now());
  writeFileSync('native-artifact-selection.json', JSON.stringify({ context, selected }, null, 2));
  if (!process.env.GITHUB_OUTPUT) fail('Missing step output path');
  appendFileSync(process.env.GITHUB_OUTPUT!, `artifact_ids=${selected.map(row => row.id).join(',')}\n`);
}
if (import.meta.main) await selectFromGitHub();
