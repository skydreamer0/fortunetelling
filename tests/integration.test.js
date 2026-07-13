import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTEGRATION_CASES } from './fixtures/integrationCases.js';

const REQUIRED_INPUT_KEYS = [
  'year', 'month', 'day', 'hour', 'minute',
  'gender', 'name', 'longitude', 'latitude',
];

test('integration fixtures have safe, reproducible provenance metadata', () => {
  assert.ok(INTEGRATION_CASES.length >= 4);

  const ids = new Set();
  for (const fixture of INTEGRATION_CASES) {
    assert.match(fixture.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(fixture.id), `duplicate fixture id: ${fixture.id}`);
    ids.add(fixture.id);

    assert.ok(['golden', 'public-reference'].includes(fixture.kind));
    assert.deepEqual(Object.keys(fixture.input).sort(), [...REQUIRED_INPUT_KEYS].sort());
    assert.match(fixture.asOf, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(fixture.expected && typeof fixture.expected === 'object');

    const { provenance } = fixture;
    assert.ok(provenance && typeof provenance === 'object');
    assert.match(provenance.accessedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(['exact', 'approximate', 'unknown'].includes(provenance.birthTimeConfidence));
    assert.ok(typeof provenance.notes === 'string' && provenance.notes.length > 0);

    if (fixture.kind === 'public-reference') {
      assert.match(provenance.sourceUrl, /^https:\/\//);
    }

    const serialized = JSON.stringify(fixture).toLowerCase();
    for (const privateField of ['email', 'address', 'password', 'token']) {
      assert.equal(serialized.includes(`"${privateField}"`), false);
    }
  }
});
