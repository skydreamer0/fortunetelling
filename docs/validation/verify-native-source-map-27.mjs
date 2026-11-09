/** Offline source-inventory audit only. Does not import or execute product code. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'ff745920264faa01aafd149407ce4a145fa84dc8';
const file = 'docs/contracts/native-source-map-candidate-27.json';
const paths = [
  'packages/core/src/facts/natalRuleMetadata.ts',
  'packages/core/src/rules/natalHitMetadata.ts',
  'packages/core/src/rules/bazi/catalog.json',
  'packages/core/src/rules/bazi/rules.ts',
  'packages/core/src/rules/ziwei/catalog.json',
  'packages/core/src/rules/ziwei/rules.ts',
  'packages/core/src/rules/ziwei/traitSignals.ts',
  'packages/core/src/traits/ziwei.json',
  'packages/core/src/traits/ziweiModifiers.json',
  'packages/core/src/facts/natalValidationLinks.ts',
];
const sha256 = b => createHash('sha256').update(b).digest('hex');
const git = (...args) => execFileSync('git', ['-C', root, ...args]);
const key = r => `${r.system}|${r.ruleId}|${r.ruleVersion}`;
const candidate = JSON.parse(readFileSync(resolve(root, file), 'utf8'));
const exactKeys = (object, expected) => assert.deepEqual(Object.keys(object).sort(), [...expected].sort());

const attribution = {
  'bazi.stem.control': {
    triggerKind: 'bazi.stemControl', sourceStatus: 'resolved',
    sourceRoles: ['controller', 'controlled'],
    factKinds: ['bazi.pillar'], gaps: [],
    boundaries: ['primary-natal-only', 'ordered-controller-controlled', 'claim-unresolved'],
  },
  'ziwei.star.tianma': {
    triggerKind: 'ziwei.star-placement', sourceStatus: 'partial',
    sourceRoles: ['primary-placement', 'lucun-本宮', 'lucun-對宮', 'lucun-三合', 'same-palace-sha'],
    factKinds: ['ziwei.star-placement'],
    gaps: ['absence-conditions-not-facts', 'palace-relations-not-facts'],
    boundaries: ['primary-natal-only', 'host-source-palace-retained', 'claim-unresolved'],
  },
  'ziwei.natal.star_traits': {
    triggerKind: 'ziwei.star-placement', sourceStatus: 'partial',
    sourceRoles: ['primary-placement', 'natal-transformation', 'same-palace-sha'],
    factKinds: ['ziwei.star-placement', 'ziwei.natal-transformation'],
    gaps: ['absence-conditions-not-facts', 'brightness-not-fact', 'palace-relations-not-facts'],
    boundaries: ['primary-natal-only', 'host-source-palace-retained', 'borrowed-not-independent-star', 'claim-unresolved'],
  },
};

function validate(d, getSource = path => readFileSync(resolve(root, path))) {
  exactKeys(d, ['schemaVersion','status','scope','baseline','authority','sourcePins','coverage','rules','adoptionRequirements']);
  assert.equal(d.schemaVersion, 1);
  assert.equal(d.status, 'candidate-not-adopted');
  assert.equal(d.scope, 'two-catalog-native-metadata-inventory-only');
  assert.equal(d.baseline, BASE);
  assert.deepEqual(d.authority, { scientificValidation: 'not-assessed', independence: 'not-established', productionGrouping: false, productionConsumer: false, g1Approved: false });
  assert.deepEqual(d.sourcePins.map(p => p.path), paths);
  const sources = new Map();
  for (const pin of d.sourcePins) {
    exactKeys(pin, ['path','blobSha','sha256']);
    const original = git('show', `${BASE}:${pin.path}`);
    const actual = getSource(pin.path);
    assert.equal(pin.blobSha, git('rev-parse', `${BASE}:${pin.path}`).toString().trim());
    assert.equal(pin.sha256, sha256(original));
    assert.equal(sha256(actual), pin.sha256, `source drift: ${pin.path}`);
    sources.set(pin.path, actual.toString('utf8'));
  }
  const metadata = sources.get(paths[0]);
  const match = metadata.match(/const mapped = new Set\(\[([^\]]+)\]\)/);
  assert.ok(match, 'Pinned metadata allowlist must remain mechanically readable');
  const mapped = new Set([...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
  assert.deepEqual([...mapped].sort(), Object.keys(attribution).map(id => `${id.split('.')[0]}|${id}|1`).sort());
  const expected = [];
  for (const system of ['bazi', 'ziwei']) {
    const path = `packages/core/src/rules/${system}/catalog.json`;
    const catalog = JSON.parse(sources.get(path));
    catalog.rules.forEach((rule, index) => {
      const scopes = system === 'bazi' ? rule.scopes : [rule.scope];
      const native = scopes.includes('natal');
      const included = native && mapped.has(`${system}|${rule.id}|${rule.version}`);
      expected.push({
        system, ruleId: rule.id, ruleVersion: rule.version, scopes,
        catalogRef: { path, pointer: `/rules/${index}`, declaredSource: rule.source },
        nativeMetadataCoverage: included ? 'mapped-limited' : native ? 'unmapped' : 'outside-natal-scope',
        nativeAttribution: included ? attribution[rule.id] : null,
        schoolMapping: null, questionMapping: null, sourceFamilyMapping: null, scoringGroupKey: null, eligibilityPolicy: null,
      });
    });
  }
  // Code-unit order is explicit, not host-locale collation.
  expected.sort((a,b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  assert.deepEqual(d.rules, expected, 'Exact catalog rows/versions/projections/gaps and null policy fields required');
  assert.equal(new Set(d.rules.map(key)).size, d.rules.length);
  const natal = expected.filter(r => r.scopes.includes('natal')).length;
  assert.deepEqual(d.coverage, {
    catalogs: { bazi: 13, ziwei: 11 }, totalCatalogRules: expected.length,
    natalCatalogRules: natal, mappedLimitedNatalRules: mapped.size,
    unmappedNatalRules: natal - mapped.size, outsideNatalRules: expected.length - natal,
    excludes: ['bazi-ten-god-catalog', 'other-systems', 'alternative-charts', 'flow-period-metadata', 'all-school-question-mappings', 'general-source-family-equivalence'],
  });
  assert.deepEqual(d.adoptionRequirements, ['exact-rule-and-catalog-versions', 'reviewed-school-and-question-scope', 'reviewed-source-family-domain-native-trigger-definition', 'independent-source-fixtures-and-counterexamples', 'explicit-unresolved-coverage', 'separate-eligibility-policy', 'named-owner-adoption-receipt', 'new-version-not-in-place-promotion']);
}

test('fixed-source inventory and no-authority boundary', () => validate(candidate));
const mutations = [
  ['forged adoption', d => { d.status = 'adopted'; }],
  ['forged G1', d => { d.authority.g1Approved = true; }],
  ['forged production grouping', d => { d.authority.productionGrouping = true; }],
  ['missing rule', d => { d.rules.pop(); }],
  ['duplicate rule', d => { d.rules.push(structuredClone(d.rules[0])); }],
  ['unrecognized rule', d => { d.rules[0].ruleId = 'bazi.unknown'; }],
  ['wrong source hash', d => { d.sourcePins[0].sha256 = '0'.repeat(64); }],
  ['missing source pin', d => { d.sourcePins.pop(); }],
  ['wrong catalog source attribution', d => { d.rules[0].catalogRef.declaredSource = 'independently validated'; }],
  ['invented school', d => { d.rules[0].schoolMapping = 'default'; }],
  ['invented question', d => { d.rules[0].questionMapping = 'promotion'; }],
  ['invented group', d => { d.rules[0].scoringGroupKey = 'natal'; }],
  ['invented eligibility', d => { d.rules[0].eligibilityPolicy = 'allow'; }],
  ['erase partial gap', d => { d.rules.find(r => r.ruleId === 'ziwei.star.tianma').nativeAttribution.gaps = []; }],
  ['coverage inflation', d => { d.coverage.mappedLimitedNatalRules = 16; }],
  ['extra unrecognized field', d => { d.approved = true; }],
  ['wrong baseline', d => { d.baseline = '0'.repeat(40); }],
];
for (const [name, change] of mutations) test(`reject ${name}`, () => {
  const altered = structuredClone(candidate); change(altered); assert.throws(() => validate(altered));
});
test('reject source bytes changed despite unchanged ledger', () => {
  assert.throws(() => validate(candidate, p => p === paths[0] ? Buffer.from('changed') : readFileSync(resolve(root,p))));
});
