import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizePages, authorizePagesArtifact, type PagesContext } from './pages-gate';

const sha = 'a'.repeat(40);
const other = 'b'.repeat(40);
const accepted: PagesContext = {
  repository: 'skydreamer0/fortunetelling',
  eventName: 'push', ref: 'refs/heads/master', sha, acceptedSha: sha,
  acceptanceResult: 'success', checkoutSha: sha, currentMasterSha: sha,
  runId: '123', runAttempt: '1',
};

describe('Pages exact-source acceptance gate', () => {
  test('reusable deployment has no independent trigger and gates both build and publish', () => {
    const workflow = Bun.YAML.parse(readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8')) as any;
    expect(Object.keys(workflow.on)).toEqual(['workflow_call']);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs.deploy.permissions).toEqual({ contents: 'read', pages: 'write', 'id-token': 'write' });
    expect(workflow.jobs.deploy.needs).toBe('build');
    for (const job of [workflow.jobs.build, workflow.jobs.deploy]) {
      const steps = job.steps as any[];
      expect(steps.find(s => s.uses === 'actions/checkout@v4').with).toEqual({ ref: '${{ github.sha }}', 'persist-credentials': false });
      expect(steps.find(s => s.uses === 'oven-sh/setup-bun@v2').with['bun-version']).toBe('1.4.3');
      const gate = steps.findIndex(s => s.run?.includes('bun scripts/ci/pages-gate.ts'));
      expect(gate).toBeGreaterThan(0);
      expect(steps[gate].run).toContain('/git/ref/heads/master');
      expect(steps[gate].env.PAGES_ACCEPTED_SHA).toBe('${{ inputs.accepted_sha }}');
      expect(steps[gate].env.PAGES_ACCEPTANCE_RESULT).toBe('${{ inputs.acceptance_result }}');
      expect(gate).toBeLessThan(steps.findIndex(s => s.run === 'bun run build' || s.uses === 'actions/deploy-pages@v4'));
    }
    const deploy = workflow.jobs.deploy.steps.find((s: any) => s.uses === 'actions/deploy-pages@v4');
    expect(deploy.with.artifact_name).toBe('${{ needs.build.outputs.artifact_name }}');
    const artifactGate = workflow.jobs.deploy.steps.find((s: any) => s.run?.includes('bun scripts/ci/pages-gate.ts'));
    expect(artifactGate.env.PAGES_ARTIFACT_NAME).toBe('${{ needs.build.outputs.artifact_name }}');
    expect(artifactGate.env.PAGES_BUILD_ATTEMPT).toBe('${{ needs.build.outputs.build_attempt }}');
  });
  test('rejects a fork or missing repository identity', () => {
    for (const repository of ['fork/fortunetelling', '', undefined]) {
      expect(() => authorizePages({ ...accepted, repository })).toThrow('unexpected repository');
    }
  });
  test('allows a fully accepted direct master push', () => {
    expect(authorizePages(accepted)).toBe(`github-pages-${sha}-123-1`);
  });
  for (const acceptanceResult of ['failure', 'cancelled', 'skipped', 'timed_out', 'neutral', '', undefined]) {
    test(`rejects CI result ${String(acceptanceResult)}`, () => {
      expect(() => authorizePages({ ...accepted, acceptanceResult })).toThrow('acceptance must succeed');
    });
  }
  for (const eventName of ['pull_request', 'pull_request_target', 'workflow_dispatch', 'workflow_run', undefined]) {
    test(`rejects trigger ${String(eventName)}`, () => {
      expect(() => authorizePages({ ...accepted, eventName })).toThrow('trusted push');
    });
  }
  test('rejects feature branches and tags even with a successful result', () => {
    for (const ref of ['refs/heads/feature', 'refs/tags/master', '', undefined]) {
      expect(() => authorizePages({ ...accepted, ref })).toThrow('only master');
    }
  });
  for (const key of ['acceptedSha', 'checkoutSha', 'currentMasterSha'] as const) {
    test(`rejects a different or missing ${key}`, () => {
      for (const value of [other, '', undefined]) {
        expect(() => authorizePages({ ...accepted, [key]: value })).toThrow('Pages deployment blocked');
      }
    });
  }
  test('a current-master rerun uses a distinct immutable artifact name', () => {
    expect(authorizePages({ ...accepted, runAttempt: '2' })).toBe(`github-pages-${sha}-123-2`);
  });
  test('an old successful rerun cannot publish after master advances', () => {
    expect(() => authorizePages({ ...accepted, runAttempt: '2', currentMasterSha: other })).toThrow('current master');
  });
  test('deploy-only rerun may use the same-run successful build, never another run or SHA', () => {
    const rerun = { ...accepted, runAttempt: '2' };
    expect(() => authorizePagesArtifact(rerun, `github-pages-${sha}-123-1`, '1')).not.toThrow();
    for (const name of [`github-pages-${other}-123-1`, `github-pages-${sha}-456-1`, 'github-pages', '', undefined]) {
      expect(() => authorizePagesArtifact(rerun, name, '1')).toThrow('artifact provenance');
    }
    for (const attempt of ['3', '0', '', undefined]) {
      expect(() => authorizePagesArtifact(rerun, `github-pages-${sha}-123-${attempt}`, attempt)).toThrow('build attempt');
    }
  });
  test('invalid provenance cannot enter the artifact name or outputs', () => {
    for (const patch of [{ sha: '' }, { sha: `${sha}\n` }, { runId: '0' }, { runId: '123\n' }, { runAttempt: '0' }, { runAttempt: undefined }]) {
      expect(() => authorizePages({ ...accepted, ...patch })).toThrow('Pages deployment blocked');
    }
  });
  test('CLI emits an artifact output only after the complete gate passes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'fortune-pages-gate-'));
    try {
      for (const result of ['success', 'failure', 'cancelled', 'skipped']) {
        const output = join(directory, `${result}.out`);
        const child = Bun.spawnSync([process.execPath, fileURLToPath(new URL('./pages-gate.ts', import.meta.url))], {
          env: {
            ...process.env,
            GITHUB_REPOSITORY: accepted.repository!, GITHUB_EVENT_NAME: 'push', GITHUB_REF: accepted.ref!,
            GITHUB_SHA: sha, PAGES_ACCEPTED_SHA: sha, PAGES_ACCEPTANCE_RESULT: result,
            PAGES_CHECKOUT_SHA: sha, PAGES_CURRENT_MASTER_SHA: sha,
            GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_OUTPUT: output,
          },
        });
        if (result === 'success') {
          expect(child.exitCode).toBe(0);
          expect(readFileSync(output, 'utf8')).toBe(`artifact_name=github-pages-${sha}-123-1\n`);
        } else {
          expect(child.exitCode).not.toBe(0);
          expect(existsSync(output)).toBe(false);
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
