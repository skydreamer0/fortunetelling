import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/index.js';
import { INTEGRATION_CASES } from './fixtures/integrationCases.js';

const REQUIRED_INPUT_KEYS = [
  'year', 'month', 'day', 'hour', 'minute',
  'gender', 'name', 'longitude', 'latitude',
];

const REPORT_KEYS = [
  'asOf', 'engines', 'evolution', 'generatedAt', 'honesty', 'input',
  'layers', 'radars', 'schemaVersion', 'scoringRules', 'stateTable', 'version',
];

function rulesById(report) {
  return new Map(
    Object.values(report.scoringRules.byRadarType)
      .flat()
      .map(rule => [rule.id, rule]),
  );
}

function engineComponent(report, engineId, category) {
  return report.engines
    .find(engine => engine.engineId === engineId)
    ?.components.find(component => component.category === category);
}

function stableReport(report) {
  const { generatedAt: _generatedAt, ...stable } = report;
  return stable;
}

function reduceIndependent(number) {
  let reduced = number;
  while (reduced > 9 && ![11, 22, 33].includes(reduced)) {
    reduced = [...String(reduced)].reduce((sum, digit) => sum + Number(digit), 0);
  }
  return reduced;
}

function independentLifePath({ year, month, day }) {
  return reduceIndependent(
    reduceIndependent(year) + reduceIndependent(month) + reduceIndependent(day),
  );
}

function independentDigitFrequency({ year, month, day }) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
  for (const digit of `${year}${month}${day}`) {
    if (digit !== '0') counts[digit] += 1;
  }
  return counts;
}

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

test('public analyze contract holds for golden and sourced celebrity charts', () => {
  for (const fixture of INTEGRATION_CASES) {
    const report = analyze(fixture.input, { asOf: fixture.asOf });
    const expected = fixture.expected;

    assert.deepEqual(Object.keys(report).sort(), [...REPORT_KEYS].sort(), fixture.id);
    assert.equal(report.schemaVersion, 1, fixture.id);
    assert.equal(report.asOf, fixture.asOf, fixture.id);
    assert.deepEqual(report.input, fixture.input, fixture.id);
    assert.deepEqual(
      report.engines.map(engine => engine.engineId).sort(),
      ['bazi', 'dreamspell', 'minggua', 'numerology', 'ziwei'],
      fixture.id,
    );

    for (const engine of report.engines) {
      assert.deepEqual(engine.errors, [], `${fixture.id}/${engine.engineId}`);
    }

    if (fixture.provenance.birthTimeConfidence === 'exact') {
      assert.ok(report.radars.length >= 3, fixture.id);
    }

    const rules = rulesById(report);
    for (const radar of report.radars) {
      for (const axis of radar.axes) {
        assert.ok(rules.has(axis.ruleId), `${fixture.id}/${radar.id}/${axis.ruleId}`);
      }
    }

    assert.equal(report.stateTable.pending, false, fixture.id);
    assert.equal(report.evolution.pending, false, fixture.id);
    assert.equal(report.honesty.pending, false, fixture.id);
    assert.deepEqual(report.honesty.violations, [], fixture.id);

    assert.equal(expected.lifePath, independentLifePath(fixture.input), fixture.id);
    assert.equal(
      engineComponent(report, 'numerology', 'lifePath')?.value.number,
      expected.lifePath,
      fixture.id,
    );

    if (expected.digitFrequency) {
      assert.deepEqual(expected.digitFrequency, independentDigitFrequency(fixture.input), fixture.id);
      assert.deepEqual(
        engineComponent(report, 'numerology', 'digitFrequency')?.value,
        expected.digitFrequency,
        fixture.id,
      );
    }

    if (expected.baziNatal) {
      const { convention: _convention, ...natal } = engineComponent(report, 'bazi', 'natal').value;
      assert.deepEqual(natal, expected.baziNatal, fixture.id);
    }
  }
});

void stableReport;
