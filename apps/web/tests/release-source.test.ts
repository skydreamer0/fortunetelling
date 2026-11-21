import assert from 'node:assert/strict';
import { test } from 'vitest';
import { SOURCE_REPOSITORY, sourceOffer } from '../release-source';

const sha = 'a'.repeat(40);
const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: SOURCE_REPOSITORY, GITHUB_SHA: sha };

test('the official build advertises the full commit actually checked out', () => {
  assert.equal(sourceOffer(env, () => sha), `https://github.com/${SOURCE_REPOSITORY}/tree/${sha}`);
  for (const candidate of [undefined, 'master', sha.slice(0, 7), 'b'.repeat(40)]) {
    assert.throws(() => sourceOffer({ ...env, GITHUB_SHA: candidate }, () => sha), /exact GitHub source commit/);
  }
});
test('local and fork builds do not claim to be an upstream release', () => {
  const notCalled = () => { throw new Error('should not probe git'); };
  assert.equal(sourceOffer({}, notCalled), undefined);
  assert.equal(sourceOffer({ ...env, GITHUB_REPOSITORY: 'someone/else' }, notCalled), undefined);
});
