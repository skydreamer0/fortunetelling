import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SOURCE_REPOSITORY = 'skydreamer0/fortunetelling';
const REPOSITORY_URL = `https://github.com/${SOURCE_REPOSITORY}`;

/** A development/fork build has no authoritative upstream source claim. */
export function sourceOffer(env: NodeJS.ProcessEnv, head: () => string): string | undefined {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== SOURCE_REPOSITORY) return undefined;
  const sha = env.GITHUB_SHA;
  if (sha === undefined || !/^[a-f0-9]{40}$/.test(sha) || head() !== sha) {
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
