import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SOURCE_REPOSITORY = 'skydreamer0/fortunetelling';
const REPOSITORY_URL = `https://github.com/${SOURCE_REPOSITORY}`;

/** A development/fork build has no authoritative upstream source claim. */
export function sourceOffer(env: NodeJS.ProcessEnv, head: () => string): string | undefined {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== SOURCE_REPOSITORY) return undefined;
  const sha = head();
  // PR browser jobs may checkout the exact head rather than GitHub's synthetic merge commit.
  // Only a trusted master push can publish, so that build must match the event SHA.
  const publishing = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/master';
  if (!/^[a-f0-9]{40}$/.test(sha) || (publishing && sha !== env.GITHUB_SHA)) {
    throw new Error('The exact GitHub source commit must match this checkout.');
  }
  return `${REPOSITORY_URL}/tree/${sha}`;
}

export function officialBuildSource(env = process.env): string | undefined {
  return sourceOffer(env, () => execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    encoding: 'utf8',
  }).trim());
}
