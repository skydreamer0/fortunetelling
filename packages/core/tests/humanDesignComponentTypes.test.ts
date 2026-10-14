import { expect, test } from 'bun:test';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { humanDesignCalculator, humanDesignComponents, type HumanDesignChart } from '../src/calculators/humanDesign/calculator';
import { CENTERS, CENTER_NAMES, CHANNELS, type Center } from '../src/calculators/humanDesign/bodygraph';
import { HD_PLANETS, type HdChannel, type PlanetActivation } from '../src/calculators/humanDesign/humanDesign';
import type { HumanDesignComponent } from '../src/calculators/humanDesign/componentTypes';
import type { Component } from '../src/calculators/types';
import { createTimeContext } from '../src/time/index';

// Compiled by the workspace typecheck, including any/unknown widening probes.
type Assert<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Category = HumanDesignComponent['category'];
type Part<C extends Category> = Extract<HumanDesignComponent, { category: C }>;
type MissingFieldAccepted<T> = { [K in keyof T]-?: Omit<T, K> extends T ? K : never }[keyof T];
export type ExactCategories = Assert<Equal<Category,
  'type' | 'authority' | 'profile' | 'definition' | 'incarnationCross' | 'centers' | 'channels' | 'personality' | 'design'>>;
export type ExactIds = Assert<Equal<{ [C in Category]: Part<C>['id'] }, {
  type: 'hd_type'; authority: 'hd_authority'; profile: 'hd_profile'; definition: 'hd_definition';
  incarnationCross: 'hd_incarnation_cross'; centers: `hd_center_${Center}`; channels: `hd_channel_${string}`;
  personality: `hd_personality_${PlanetActivation['planet']}`; design: `hd_design_${PlanetActivation['planet']}`;
}>>;
export type ExactPayloads = Assert<Equal<{ [C in Category]: Part<C>['value'] }, {
  type: { type: NonNullable<HumanDesignChart['type']>; name: string };
  authority: { authority: HumanDesignChart['authority'] };
  profile: HumanDesignChart['profile'];
  definition: { definition: HumanDesignChart['definition'] };
  incarnationCross: HumanDesignChart['incarnationCross'];
  centers: { center: Center; defined: boolean };
  channels: HdChannel; personality: PlanetActivation; design: PlanetActivation;
}>>;
export type RequiredPayloadFields = Assert<Equal<{
  [C in Category]: MissingFieldAccepted<NonNullable<Part<C>['value']>>
}[Category], never>>;
export type NoMetadata = Assert<Equal<keyof HumanDesignComponent, 'id' | 'name' | 'category' | 'value'>>;
export type GenericCompatibility = Assert<Equal<HumanDesignComponent extends Component ? true : false, true>>;
export type PreservePublicReturn = Assert<Equal<ReturnType<typeof humanDesignComponents>, Component[]>>;
export type RejectCrossSideId = Assert<Equal<{
  id: 'hd_design_sun'; name: string; category: 'personality'; value: PlanetActivation;
} extends HumanDesignComponent ? true : false, false>>;
export type RejectCrossCategoryPayload = Assert<Equal<{
  id: 'hd_authority'; name: string; category: 'authority'; value: { definition: HumanDesignChart['definition'] };
} extends HumanDesignComponent ? true : false, false>>;
export type RejectUndefinedPayload = Assert<Equal<{
  [C in Category]: undefined extends Part<C>['value'] ? C : never
}[Category], never>>;
export type NullablePayloads = Assert<Equal<{
  [C in Category]: null extends Part<C>['value'] ? C : never
}[Category], 'profile' | 'incarnationCross'>>;

export function payloadIdentity(component: HumanDesignComponent): string | number | boolean | null {
  switch (component.category) {
    case 'type': return component.value.type;
    case 'authority': return component.value.authority;
    case 'profile': return component.value?.label ?? null;
    case 'definition': return component.value.definition;
    case 'incarnationCross': return component.value?.label ?? null;
    case 'centers': return component.value.defined;
    case 'channels': return component.value.id;
    case 'personality': return component.value.gate;
    case 'design': return component.value.gate;
    default: { const exhaustive: never = component; return exhaustive; }
  }
}

const chart: HumanDesignChart = {
  birthJdUt: 2451545, designJdUt: 2451455, node: 'true',
  personality: HD_PLANETS.map((planet, i) => ({ planet, gate: i + 1, line: 1, color: 2, tone: 3, base: 4, longitude: i * 10 })),
  design: HD_PLANETS.map((planet, i) => ({ planet, gate: i + 14, line: 3, color: 4, tone: 5, base: 1, longitude: i * 10 + 1 })),
  gates: [],
  channels: CHANNELS.map((channel, i) => ({ ...channel, activation: (['personality', 'design', 'both', 'mixed'] as const)[i % 4]! })),
  definedCenters: ['sacral', 'throat'], undefinedCenters: CENTERS.filter(c => c !== 'sacral' && c !== 'throat'),
  type: 'manifestingGenerator', authority: 'sacral', definition: 'single',
  profile: { personalityLine: 1, designLine: 3, label: '1/3' },
  incarnationCross: { angle: 'rightAngle', personalitySun: 1, personalityEarth: 2, designSun: 14, designEarth: 15, label: '1/2 | 14/15' },
};

test('all nine Human Design categories retain legacy values, order, IDs, references and metadata omission', () => {
  const result = humanDesignComponents(chart);
  const expected = [
    { id: 'hd_type', name: 'Type', category: 'type', value: { type: 'manifestingGenerator', name: 'Manifesting Generator' } },
    { id: 'hd_authority', name: 'Authority', category: 'authority', value: { authority: 'sacral' } },
    { id: 'hd_profile', name: 'Profile', category: 'profile', value: chart.profile },
    { id: 'hd_definition', name: 'Definition', category: 'definition', value: { definition: 'single' } },
    { id: 'hd_incarnation_cross', name: 'Incarnation Cross', category: 'incarnationCross', value: chart.incarnationCross },
    ...CENTERS.map(center => ({
      id: `hd_center_${center}`, name: CENTER_NAMES[center], category: 'centers',
      value: { center, defined: center === 'sacral' || center === 'throat' },
    })),
    ...chart.channels.map(channel => ({ id: `hd_channel_${channel.id}`, name: `Channel ${channel.id}`, category: 'channels', value: channel })),
    ...chart.personality.map(activation => ({ id: `hd_personality_${activation.planet}`, name: `personality ${activation.planet}`, category: 'personality', value: activation })),
    ...chart.design.map(activation => ({ id: `hd_design_${activation.planet}`, name: `design ${activation.planet}`, category: 'design', value: activation })),
  ];
  expect(JSON.stringify(result)).toBe(JSON.stringify(expected));
  expect(new Set(result.map(part => part.category)).size).toBe(9);
  expect(result.every(part => Object.keys(part).join(',') === 'id,name,category,value')).toBe(true);
  expect(result[2]!.value).toBe(chart.profile);
  expect(result[4]!.value).toBe(chart.incarnationCross);
  for (const value of [...chart.channels, ...chart.personality, ...chart.design]) {
    expect(result.some(part => part.value === value)).toBe(true);
  }
});

test('all five existing type names remain unchanged', () => {
  const names = {
    manifestor: 'Manifestor', generator: 'Generator', manifestingGenerator: 'Manifesting Generator',
    projector: 'Projector', reflector: 'Reflector',
  } as const;
  for (const type of Object.keys(names) as Array<keyof typeof names>) {
    expect(humanDesignComponents({ ...chart, type })[0]!.value).toEqual({ type, name: names[type] });
  }
});

test('nullable authority, profile, definition and cross still emit their original null shapes', () => {
  const result = humanDesignComponents({ ...chart, authority: null, profile: null, definition: null, incarnationCross: null });
  expect(result.slice(1, 5).map(part => part.value)).toEqual([{ authority: null }, null, { definition: null }, null]);
  expect(result.length).toBe(humanDesignComponents(chart).length);
});

test('a null type emits no components, including with otherwise populated chart fields', () => {
  expect(humanDesignComponents({ ...chart, type: null })).toEqual([]);
});

test('unknown birth time preserves empty charts, true-node default and mean-node option', () => {
  const ctx = createTimeContext({
    date: '1995-07-16', time: null, timeAccuracy: 'unknown', gender: 'male',
    birthplace: { label: 'Tainan', lat: 22.9922, lng: 120.1848, timezone: 'Asia/Taipei' },
  });
  for (const config of [{}, { node: 'true' as const }, { node: 'mean' as const }]) {
    const result = humanDesignCalculator.calculate(ctx, config);
    expect(result.chart).toEqual({
      birthJdUt: null, designJdUt: null, node: config.node ?? 'true',
      personality: [], design: [], gates: [], channels: [], definedCenters: [], undefinedCenters: [],
      type: null, authority: null, profile: null, definition: null, incarnationCross: null,
    });
    expect(result.components).toEqual([]);
    expect(result.warnings).toEqual(['time_unknown']);
    expect(humanDesignComponents(result.chart)).toEqual([]);
  }
});

const coreRoot = resolve(import.meta.dir, '..');
const calculatorPath = join(coreRoot, 'src/calculators/humanDesign/calculator.ts');
const source = readFileSync(calculatorPath, 'utf8');
const contractImport = "import type { HumanDesignActivationComponent, HumanDesignComponent } from './componentTypes';";
const guards = / satisfies HumanDesign(?:ActivationComponent<typeof side>|Component)/g;

test('the complete calculator emits byte-identical JavaScript with and without its new type-only contracts', () => {
  const transpiler = new Bun.Transpiler({ loader: 'ts' });
  expect(source.includes(contractImport)).toBe(true);
  expect([...source.matchAll(guards)]).toHaveLength(8);
  const beforeContracts = source.replace(contractImport, '').replace(guards, '');
  expect(transpiler.transformSync(source)).toBe(transpiler.transformSync(beforeContracts));
  const typeModule = readFileSync(join(coreRoot, 'src/calculators/humanDesign/componentTypes.ts'), 'utf8');
  expect(transpiler.transformSync(typeModule).replace(/export\s*\{\s*\};?/g, '').trim()).toBe('');
});

test('real producer payload/category/ID mutations fail typecheck only while their contract guards are attached', () => {
  // Compile an isolated copy, never mutate the checkout used by other tests.
  const temp = mkdtempSync(join(tmpdir(), 'human-design-contract-'));
  try {
    cpSync(join(coreRoot, 'src'), join(temp, 'src'), { recursive: true });
    cpSync(join(coreRoot, 'package.json'), join(temp, 'package.json'));
    cpSync(join(coreRoot, 'tsconfig.json'), join(temp, 'tsconfig.json'));
    const dependencies = [join(coreRoot, 'node_modules'), resolve(coreRoot, '../../node_modules')].find(existsSync);
    expect(dependencies).toBeDefined();
    symlinkSync(dependencies!, join(temp, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const target = join(temp, 'src/calculators/humanDesign/calculator.ts');
    const check = (candidate: string) => {
      writeFileSync(target, candidate);
      const run = Bun.spawnSync([process.execPath, 'run', 'typecheck'], { cwd: temp, stdout: 'pipe', stderr: 'pipe' });
      return { exitCode: run.exitCode, output: new TextDecoder().decode(run.stdout) + new TextDecoder().decode(run.stderr) };
    };
    const baseline = check(source);
    expect(baseline.output).not.toContain('error TS');
    expect(baseline.exitCode).toBe(0);
    const mutations = [
      ["id: 'hd_type'", "id: 'hd_authority'"],
      ['type: chart.type, name: TYPE_NAMES[chart.type]', 'type: chart.type, name: TYPE_NAMES[chart.type].length'],
      ['authority: chart.authority', "authority: 'invalid-authority'"],
      ["category: 'profile', value: chart.profile", "category: 'profile', value: { label: '1/3' }"],
      ['definition: chart.definition', 'definition: 123'],
      ["category: 'incarnationCross', value: chart.incarnationCross", "category: 'incarnationCross', value: chart.profile"],
      ['defined: defined.has(c)', 'defined: Number(defined.has(c))'],
      ["category: 'channels', value: ch", "category: 'channels', value: chart.profile"],
      ['category: side, value: a', "category: 'channels', value: a"],
      ['category: side, value: a', 'category: side, value: { ...a, line: 7 }'],
    ] as const;
    for (const [from, to] of mutations) {
      expect(source.split(from)).toHaveLength(2);
      const mutant = source.replace(from, to);
      const rejected = check(mutant);
      expect(rejected.exitCode).not.toBe(0);
      expect(rejected.output).toContain('src/calculators/humanDesign/calculator.ts');
      expect(rejected.output).toContain('error TS');
      const unguarded = check(mutant.replace(contractImport, '').replace(guards, ''));
      expect(unguarded.output).not.toContain('error TS');
      expect(unguarded.exitCode).toBe(0);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}, 120_000);
