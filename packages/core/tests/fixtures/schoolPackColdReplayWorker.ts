import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
/** Test-only cold-process probe. Not an archive format or production replay API. */
import assert from 'node:assert/strict';
import { createCalculationSpec, type CalculationSpec } from '../../src/core/calculationSpec';
import { createChartSnapshotSession } from '../../src/core/chartSnapshotSession';
import type { ChartSnapshot } from '../../src/core/chartSnapshot';
import { interpretationBytes, type InterpretationSpec } from '../../src/core/interpretationSpec';
import { createNatalFactStore } from '../../src/facts/natalFactStore';
import type { NatalFactStore } from '../../src/facts/types';
import { createBoundSchoolRegistry, createSyntheticBoundSchoolRegistry, type FactBoundAnalysis } from '../../src/schools/boundAnalysis';
import type { SchoolContext, SchoolPackRef } from '../../src/schools/types';
import type { AnalyzeInput } from '../../src/core/analyze';

const input: AnalyzeInput = { year: 1990, month: 5, day: 17, hour: 23, minute: 10,
  name: 'SYNTHETIC REPLAY FIXTURE', gender: 'female',
  birthplace: { label: 'Synthetic fixture', lat: 23, lng: 120, timezone: 'Asia/Taipei' },
  useTrueSolarTime: true, ziHourConvention: 'early' };
const definitions = [
  { id: 'known-synthetic-v1', synthetic: true, timeKnown: true, version: '1' },
  { id: 'known-synthetic-v2', synthetic: true, timeKnown: true, version: '2' },
  { id: 'unknown-synthetic-v1', synthetic: true, timeKnown: false, version: '1' },
  { id: 'known-production-defaults', synthetic: false, timeKnown: true, version: '1' },
  { id: 'unknown-production-defaults', synthetic: false, timeKnown: false, version: '1' },
] as const;
const registryFor = (synthetic: boolean) => synthetic ? createSyntheticBoundSchoolRegistry() : createBoundSchoolRegistry();
const selectionFor = (synthetic: boolean, version: string): SchoolPackRef[] => synthetic
  ? [{ system: 'bazi', packId: 'a', packVersion: version }]
  : (['bazi', 'ziwei', 'numerology', 'tzolkin', 'mingGua'] as const)
    .map(system => ({ system, packId: 'default', packVersion: '1' }));

export type ColdReplayCase = {
  id: string;
  input: AnalyzeInput;
  calculationSpec: CalculationSpec;
  snapshot: ChartSnapshot;
  factStore: NatalFactStore;
  interpretation: InterpretationSpec;
  context: SchoolContext;
  result: FactBoundAnalysis;
};
export type ColdReplayArchive = {
  format: 'test-only-current-build-cold-reconstruction';
  producerPid: number;
  runtime: { version: string; revision: string };
  cases: ColdReplayCase[];
};

export function capture(): ColdReplayArchive {
  return {
    format: 'test-only-current-build-cold-reconstruction', producerPid: process.pid,
    runtime: { version: process.versions.node, revision: process.versions.v8 },
    cases: definitions.map(definition => {
      const birth = { ...input, timeKnown: definition.timeKnown };
      const calculationSpec = createCalculationSpec(birth);
      const { snapshot } = createChartSnapshotSession(calculationSpec);
      const factStore = createNatalFactStore(snapshot);
      const context = { factIds: factStore.facts.map(fact => fact.factId), availableConditions: ['ready'] };
      const registry = registryFor(definition.synthetic);
      const interpretation = registry.createSpec(selectionFor(definition.synthetic, definition.version));
      const result = registry.bindFacts(snapshot, interpretation, factStore, context).run();
      return { id: definition.id, input: birth, calculationSpec, snapshot, factStore, interpretation, context, result };
    }),
  };
}

export function reconstruct(archive: ColdReplayArchive) {
  assert.equal(archive.format, 'test-only-current-build-cold-reconstruction');
  assert.notEqual(process.pid, archive.producerPid, 'Producer must have exited before the verifier starts');
  assert.deepEqual(archive.runtime, { version: process.versions.node, revision: process.versions.v8 }, 'This probe does not support historical runtimes');
  assert.deepEqual(archive.cases.map(item => item.id), definitions.map(item => item.id));
  const results = archive.cases.map((saved, index) => {
    const definition = definitions[index]!;
    const registry = registryFor(definition.synthetic);

    // Recreate exact owned objects; deserialized values never become capabilities.
    const calculationSpec = createCalculationSpec(saved.input);
    assert.equal(interpretationBytes(saved.calculationSpec), interpretationBytes(calculationSpec));
    const { snapshot } = createChartSnapshotSession(calculationSpec, saved.snapshot);
    const factStore = createNatalFactStore(snapshot);
    assert.equal(interpretationBytes(saved.factStore), interpretationBytes(factStore));
    const interpretation = registry.createSpec(saved.interpretation.packs);
    registry.validateSpec(saved.interpretation, interpretation);
    const result = registry.bindFacts(snapshot, interpretation, factStore, saved.context).run();
    assert.equal(registry.validateFacts(saved.result, result), result);

    // Intentional safety boundaries: identical serialized bytes are not owned.
    assert.throws(() => registry.bindFacts(saved.snapshot, interpretation, factStore, saved.context));
    assert.throws(() => registry.bindFacts(snapshot, saved.interpretation, factStore, saved.context), /owned InterpretationSpec/);
    assert.throws(() => registry.bindFacts(snapshot, interpretation, saved.factStore, saved.context), /owned/);
    assert.throws(() => registry.validateFacts(saved.result, saved.result), /owned/);
    if (definition.synthetic) {
      const production = createBoundSchoolRegistry();
      assert.throws(() => production.bindFacts(snapshot, interpretation, factStore, saved.context), /owned InterpretationSpec/);
    }
    return { id: saved.id, analysisId: result.analysisId, specHash: snapshot.specHash, snapshotId: snapshot.snapshotId,
      resultSHA256: createHash('sha256').update(interpretationBytes(result)).digest('hex'),
      scope: result.identity.scope, stances: result.assessments.flatMap(item => item.conclusions.map(conclusion => conclusion.stance)),
      unavailable: result.unavailable.map(item => item.ref.system),
      abstained: result.assessments.filter(item => item.status === 'abstain').map(item => item.ref.system) };
  });
  return { verifierPid: process.pid, producerPid: archive.producerPid,
    status: 'PASS_CURRENT_BUILD_RECONSTRUCTION_ONLY', results };
}

if (import.meta.main) {
  try {
    const [mode, path] = process.argv.slice(2);
    if (mode === 'capture' && path) {
      const archive = capture();
      writeFileSync(path, JSON.stringify(archive));
      console.log(JSON.stringify({ producerPid: process.pid, cases: archive.cases.length }));
    } else if (mode === 'reconstruct' && path) {
      console.log(JSON.stringify(reconstruct(JSON.parse(readFileSync(path, 'utf8')) as ColdReplayArchive)));
    } else throw new Error('Expected capture|reconstruct and an archive path');
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}
