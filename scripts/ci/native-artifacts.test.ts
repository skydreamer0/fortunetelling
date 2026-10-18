import { expect, test } from 'vitest';
import { nativeRunners, selectNativeArtifacts, sourceIdentity, type SelectionContext, type NativeRun, type NativeJob, type NativeArtifact } from './native-artifacts';
const sha = 'a'.repeat(40), base = 'b'.repeat(40);
const context: SelectionContext = { repository: 'owner/repo', workflow: '.github/workflows/ci.yml', headSha: sha, baseSha: base, runId: '123', attempt: '2' };
const stamp = (minute: number) => `2026-10-18T11:${String(minute).padStart(2, '0')}:00Z`;
function fixture() {
  const run: NativeRun = { id: 123, workflow_id: 42, path: context.workflow, head_sha: sha, run_attempt: 2, repository: { id: 10, full_name: context.repository }, pull_requests: [{ head: { sha, repo: { id: 10 } }, base: { sha: base, repo: { id: 10 } } }] };
  const jobs: NativeJob[] = nativeRunners.map((runner, i) => ({ id: i + 1, name: `Native calendar (${runner})`, run_id: 123, head_sha: sha, status: 'completed', conclusion: 'success', started_at: stamp(i === 2 ? 20 : 0), completed_at: stamp(i === 2 ? 30 : 10) }));
  const artifact = (runner: string, attempt: number, created: number, id: number): NativeArtifact => ({ id, name: `native-calendar-${runner}-${attempt}`, expired: false, created_at: stamp(created), expires_at: '2026-10-19T00:00:00Z', workflow_run: { id: 123, repository_id: 10, head_repository_id: 10, head_sha: sha } });
  const artifacts = [artifact(nativeRunners[0], 1, 9, 100), artifact(nativeRunners[1], 1, 9, 101), artifact(nativeRunners[2], 1, 9, 102), artifact(nativeRunners[2], 2, 29, 103)];
  return { run, jobs, artifacts };
}
const select = (f: ReturnType<typeof fixture>, c = context) => selectNativeArtifacts(c, f.run, f.jobs, f.artifacts, Date.parse(stamp(40)));
test('mixed attempts select original Linux/Windows successes and new successful Mac, never old failed Mac', () => {
  expect(select(fixture()).map(row => [row.runner, row.id, row.attempt])).toEqual([[nativeRunners[0], 100, '1'], [nativeRunners[1], 101, '1'], [nativeRunners[2], 103, '2']]);
});
test('single-attempt complete successes retain exact inventory', () => {
  const f = fixture(); f.run.run_attempt = 1; f.jobs[2]!.started_at = stamp(0); f.jobs[2]!.completed_at = stamp(10); f.artifacts.pop();
  expect(select(f, { ...context, attempt: '1' }).map(row => row.attempt)).toEqual(['1', '1', '1']);
});
const mutations: [string, (f: ReturnType<typeof fixture>) => void][] = [
  ['missing expired flags', f => { for (const a of f.artifacts) delete (a as any).expired; }],
  ['missing all repository IDs', f => { delete (f.run.repository as any).id; delete (f.run.pull_requests[0]!.head.repo as any).id; delete (f.run.pull_requests[0]!.base.repo as any).id; for (const a of f.artifacts) { delete (a.workflow_run as any).repository_id; delete (a.workflow_run as any).head_repository_id; } }],
  ['duplicate native job IDs', f => f.jobs[1]!.id = f.jobs[0]!.id],
  ['string repository ID', f => (f.run.repository as any).id = '10'],
  ['missing artifact source repo ID', f => delete (f.artifacts[3]!.workflow_run as any).repository_id],
  ['missing PR head repo ID', f => delete (f.run.pull_requests[0]!.head.repo as any).id],
  ['nonboolean expired flag', f => (f.artifacts[3] as any).expired = 0],
  ['wrong repository', f => f.run.repository.full_name = 'other/repo'],
  ['wrong workflow', f => f.run.path = '.github/workflows/other.yml'],
  ['wrong run', f => f.run.id = 124],
  ['wrong attempt', f => f.run.run_attempt = 3],
  ['wrong run head', f => f.run.head_sha = base],
  ['wrong PR head', f => f.run.pull_requests[0]!.head.sha = base],
  ['wrong PR base', f => f.run.pull_requests[0]!.base.sha = sha],
  ['missing PR', f => f.run.pull_requests = []],
  ['wrong base repo', f => f.run.pull_requests[0]!.base.repo.id = 11],
  ['duplicate PR', f => f.run.pull_requests.push(f.run.pull_requests[0]!)],
  ['missing job', f => f.jobs.pop()],
  ['duplicate job', f => f.jobs[2] = f.jobs[0]!],
  ['unknown OS job', f => f.jobs[2]!.name = 'Native calendar (unknown)'],
  ['failed latest job cannot use older artifact', f => f.jobs[2]!.conclusion = 'failure'],
  ['unfinished job', f => f.jobs[2]!.status = 'in_progress'],
  ['wrong job head', f => f.jobs[2]!.head_sha = base],
  ['wrong job run', f => f.jobs[2]!.run_id = 124],
  ['missing fresh Mac artifact cannot fall back', f => f.artifacts.pop()],
  ['duplicate artifact name', f => f.artifacts.push({ ...f.artifacts[3]!, id: 999 })],
  ['duplicate artifact ID', f => f.artifacts[3]!.id = f.artifacts[0]!.id],
  ['unknown artifact OS', f => f.artifacts[3]!.name = 'native-calendar-unknown-2'],
  ['future attempt', f => f.artifacts[3]!.name = 'native-calendar-macos-15-intel-3'],
  ['wrong artifact SHA', f => f.artifacts[3]!.workflow_run.head_sha = base],
  ['wrong artifact run', f => f.artifacts[3]!.workflow_run.id = 124],
  ['wrong artifact repository', f => f.artifacts[3]!.workflow_run.repository_id = 11],
  ['wrong artifact head repository', f => f.artifacts[3]!.workflow_run.head_repository_id = 11],
  ['expired flag', f => f.artifacts[3]!.expired = true],
  ['expired timestamp', f => f.artifacts[3]!.expires_at = stamp(39)],
  ['stale artifact timestamp', f => f.artifacts[3]!.created_at = stamp(19)],
  ['post-job artifact timestamp', f => f.artifacts[3]!.created_at = stamp(31)],
  ['invalid timestamp', f => f.artifacts[3]!.created_at = 'invalid'],
];
for (const [name, mutate] of mutations) test(`reject ${name}`, () => { const f = fixture(); mutate(f); expect(() => select(f)).toThrow(); });
test('workflow source derives exact PR head/base and rejects foreign workflow ref', () => {
  const env = { GITHUB_REPOSITORY: context.repository, GITHUB_WORKFLOW_REF: `${context.repository}/${context.workflow}@refs/pull/1/merge` };
  expect(sourceIdentity(env, { pull_request: { head: { sha }, base: { sha: base } } })).toEqual({ repository: context.repository, workflow: context.workflow, headSha: sha, baseSha: base });
  expect(() => sourceIdentity({ ...env, GITHUB_WORKFLOW_REF: `other/repo/${context.workflow}@master` }, {})).toThrow();
});
