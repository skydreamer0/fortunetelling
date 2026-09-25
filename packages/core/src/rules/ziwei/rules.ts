/**
 * Ziwei rule set (ARCHITECTURE-V2 §5, V1-11). Each rule is catalog data
 * (`catalog.json`: id / version / params / source) plus a small pure matcher.
 * Matchers return `ZiweiHit`s that carry domain × trait × base weights and the
 * modifier chain; `evaluate.ts` turns them into Signals.
 *
 * Interpretive weights live only in data files (D-028): traits/ziwei.json,
 * traits/ziweiModifiers.json and catalog.json params.
 */

import type { Domain, Grain, Modifier, Rule, SignalTemplate, SignalWindow, Trait } from '../../signals/types';
import catalogData from './catalog.json';
import {
  MUTAGEN_ORDER,
  oppositeOf,
  trinesOf,
  type MutagenKind,
  type ZiweiPalace,
  type ZiweiPeriod,
  type ZiweiRuleChart,
} from './chart';
import {
  ZIWEI_MODIFIERS,
  canonicalPalaceName,
  domainLabel,
  natalStarTraitHits,
  palaceDomains,
  palaceModifier,
  shaInPalace,
  shaSamePalacePart,
  starTraitHits,
  traitLabel,
  type ZiweiHit,
} from './traitSignals';

// ─── Catalog ──────────────────────────────────────────────────────────────

export type RuleStatus = 'active' | 'pending_v1_05';

export interface CatalogEntry {
  id: string;
  version: number;
  scope: Grain;
  status: RuleStatus;
  description: string;
  source: string;
  params: Record<string, any>;
}

export interface ZiweiCatalog {
  version: number;
  system: 'ziwei';
  rules: CatalogEntry[];
}

export const ZIWEI_CATALOG = catalogData as unknown as ZiweiCatalog;

function catalogEntry(id: string): CatalogEntry {
  const e = ZIWEI_CATALOG.rules.find((r) => r.id === id);
  if (!e) throw new Error(`ziwei catalog: missing rule ${id}`);
  if (e.status !== 'active') throw new Error(`ziwei catalog: rule ${id} is ${e.status}`);
  return e;
}

/** A ziwei Rule: match() returns hits that already carry domain/trait/base weights. */
export interface ZiweiRule extends Rule<ZiweiRuleChart> {
  match(chart: ZiweiRuleChart, window: SignalWindow): ZiweiHit[];
  /** Where the emitted domain × trait comes from when `emits` is not static. */
  emitsFrom?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

interface MutagenTemplate {
  trait: Trait;
  intensity: number;
  valence: number;
}

const overlaps = (p: ZiweiPeriod, w: SignalWindow) =>
  p.start !== null && p.end !== null && p.start <= w.end && p.end >= w.start;

function findStarPalace(chart: ZiweiRuleChart, starName: string): ZiweiPalace | null {
  return chart.palaces.find((p) => p.stars.some((s) => s.name === starName)) ?? null;
}

function periodMutagenHits(
  chart: ZiweiRuleChart,
  period: ZiweiPeriod,
  templates: Record<MutagenKind, MutagenTemplate>,
  periodKind: string,
): ZiweiHit[] {
  if (!period.mutagen) return [];
  const hits: ZiweiHit[] = [];
  for (const kind of MUTAGEN_ORDER) {
    const starName = period.mutagen[kind];
    const palace = findStarPalace(chart, starName);
    if (!palace) continue;
    const t = templates[kind];
    const componentIds = [period.componentId, palace.componentId];
    const main = chart.mainStarComponentIds[starName];
    if (main) componentIds.push(main);
    for (const pd of palaceDomains(palace.name)) {
      hits.push({
        target: `${period.componentId}:${kind}:${starName}`,
        componentIds,
        text:
          `${period.label}${periodKind}${period.heavenlyStem}干化${kind}於${starName}，` +
          `${starName}在原局${palace.name}，對應${domainLabel(pd.domain)}領域的「${traitLabel(t.trait)}」特徵`,
        domain: pd.domain,
        trait: t.trait,
        baseIntensity: t.intensity,
        baseValence: t.valence,
        valenceShift: 0,
        modifiers: [palaceModifier(palace, pd)],
      });
    }
  }
  return hits;
}

const OVERLAY_KIND: Record<string, string> = { 大限: 'decade', 流年: 'year', 流月: 'month' };

interface OverlayParams {
  overlayFactor: number;
  overlayDomain: Domain;
  focus: MutagenTemplate;
}

function periodOverlayHits(chart: ZiweiRuleChart, period: ZiweiPeriod, p: OverlayParams, periodKind: string): ZiweiHit[] {
  const host = chart.palaces[period.palaceIndex];
  if (!host) return [];
  const hits: ZiweiHit[] = [];

  for (const pd of palaceDomains(host.name)) {
    hits.push({
      target: `${period.componentId}:focus:${host.componentId}`,
      componentIds: [period.componentId, host.componentId],
      text:
        `${period.label}${periodKind}命宮落在原局${host.name}，` +
        `本期${domainLabel(pd.domain)}領域的「${traitLabel(p.focus.trait)}」特徵受到聚焦`,
      domain: pd.domain,
      trait: p.focus.trait,
      baseIntensity: p.focus.intensity,
      baseValence: p.focus.valence,
      valenceShift: 0,
      modifiers: [palaceModifier(host, pd)],
    });
  }

  const overlay: Modifier = {
    id: `overlay.${OVERLAY_KIND[periodKind] ?? 'year'}`,
    factor: p.overlayFactor,
    reason: `${period.label}${periodKind}命宮疊在原局${host.name}，原局星曜特徵以因子 ${p.overlayFactor} 疊加到本期${domainLabel(p.overlayDomain)}領域`,
  };
  hits.push(
    ...starTraitHits(chart, host, {
      targetPrefix: `${period.componentId}:overlay`,
      extraModifiers: [overlay],
      extraComponentIds: [period.componentId],
      domainsOverride: [{ domain: p.overlayDomain, factor: 1 }],
      textPrefix: `${period.label}${periodKind}命宮疊原局${host.name}：`,
    }),
  );
  return hits;
}

/** 三方四正 palaces with their 會照 weights (本宮, 對宮, 三合×2). */
function sanfangOf(chart: ZiweiRuleChart, i: number): { palace: ZiweiPalace; role: string; weight: number }[] {
  const w = ZIWEI_MODIFIERS.sanfang;
  const [t1, t2] = trinesOf(i);
  return [
    { palace: chart.palaces[i], role: '本宮', weight: w.self },
    { palace: chart.palaces[oppositeOf(i)], role: '對宮', weight: w.opposite },
    { palace: chart.palaces[t1], role: '三合', weight: w.trine },
    { palace: chart.palaces[t2], role: '三合', weight: w.trine },
  ];
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

interface FixedStarParams {
  template: SignalTemplate;
  palaceFactors: Record<string, number>;
  withLucun?: { factor: number; valenceShift: number };
}

function fixedStarHits(chart: ZiweiRuleChart, starName: string, p: FixedStarParams, ruleTag: string): ZiweiHit[] {
  const hits: ZiweiHit[] = [];
  for (const palace of chart.palaces) {
    if (!palace.stars.some((s) => s.name === starName)) continue;
    const name = canonicalPalaceName(palace.name);
    const pf = p.palaceFactors[name] ?? p.palaceFactors.default ?? 1;
    const modifiers: Modifier[] = [
      { id: `${ruleTag}.palace.${name}`, factor: pf, reason: `${starName}坐${palace.name}（宮位因子 ${pf}）` },
    ];
    let valenceShift = 0;
    const componentIds = [palace.componentId];

    if (p.withLucun) {
      const meet = sanfangOf(chart, palace.index).filter((x) => x.palace.stars.some((s) => s.name === '祿存'));
      if (meet.length > 0) {
        modifiers.push({
          id: `${ruleTag}.with_lucun`,
          factor: p.withLucun.factor,
          reason: `三方四正會祿存（${meet.map((x) => `${x.palace.name}${x.role}`).join('、')}）：強度 ×${p.withLucun.factor}，傾向 +${p.withLucun.valenceShift}`,
        });
        valenceShift += p.withLucun.valenceShift;
        for (const x of meet) if (!componentIds.includes(x.palace.componentId)) componentIds.push(x.palace.componentId);
      }
    }

    const sha = shaSamePalacePart(palace, starName);
    modifiers.push(...sha.modifiers);
    valenceShift += sha.valenceShift;

    hits.push({
      target: `natal:${palace.componentId}:${starName}`,
      componentIds,
      text:
        `${starName}坐${palace.name}，對應${domainLabel(p.template.domain)}領域的` +
        `「${traitLabel(p.template.trait)}」特徵`,
      domain: p.template.domain,
      trait: p.template.trait,
      baseIntensity: p.template.intensity,
      baseValence: p.template.valence,
      valenceShift,
      modifiers,
    });
  }
  return hits;
}

// ─── Rules ────────────────────────────────────────────────────────────────

function defineRule(
  id: string,
  build: (entry: CatalogEntry) => Omit<ZiweiRule, 'id' | 'version' | 'system' | 'scope'>,
): ZiweiRule {
  const entry = catalogEntry(id);
  return { id, version: entry.version, system: 'ziwei', scope: entry.scope, ...build(entry) };
}

const natalStarTraits = defineRule('ziwei.natal.star_traits', () => ({
  emits: [],
  emitsFrom: 'traits/ziwei.json × traits/ziweiModifiers.json palaceDomains',
  match: (chart) => natalStarTraitHits(chart),
}));

const decadeMutagen = defineRule('ziwei.decade.mutagen', (e) => ({
  emits: [],
  emitsFrom: 'catalog params.templates; domain from the natal palace of the transformed star',
  match: (chart, window) =>
    chart.decades.filter((d) => overlaps(d, window)).flatMap((d) => periodMutagenHits(chart, d, e.params.templates, '')),
}));

const decadeOverlay = defineRule('ziwei.decade.palace_overlay', (e) => ({
  emits: [],
  emitsFrom: 'catalog params.focus + traits/ziwei.json of the overlaid palace',
  match: (chart, window) =>
    chart.decades
      .filter((d) => overlaps(d, window))
      .flatMap((d) => periodOverlayHits(chart, d, e.params as OverlayParams, '大限')),
}));

const sanfangSha = defineRule('ziwei.sanfang.sha', (e) => ({
  emits: [],
  emitsFrom: 'catalog params.templates; domain from palaceDomains of each anchor palace',
  match: (chart) => {
    const hits: ZiweiHit[] = [];
    const templates = e.params.templates as MutagenTemplate[];
    for (const host of chart.palaces) {
      const parts = sanfangOf(chart, host.index).flatMap((x) =>
        shaInPalace(x.palace).map((star) => ({ ...x, star })),
      );
      if (parts.length === 0) continue;
      const sum = round6(parts.reduce((a, x) => a + x.weight, 0));
      const componentIds = [host.componentId];
      for (const x of parts) if (!componentIds.includes(x.palace.componentId)) componentIds.push(x.palace.componentId);
      const detail = parts.map((x) => `${x.star}（${x.palace.name}${x.role}×${x.weight}）`).join('、');
      const sumMod: Modifier = {
        id: 'sanfang.sha_sum',
        factor: sum,
        reason: `三方四正會照煞曜：${detail}，加權合計 ${sum}`,
      };
      for (const pd of palaceDomains(host.name)) {
        for (const t of templates) {
          hits.push({
            target: `natal:${host.componentId}:sanfang_sha`,
            componentIds,
            text:
              `${host.name}三方四正會照煞曜 ${parts.map((x) => x.star).join('、')}，` +
              `對應${domainLabel(pd.domain)}領域的「${traitLabel(t.trait)}」特徵`,
            domain: pd.domain,
            trait: t.trait,
            baseIntensity: t.intensity,
            baseValence: t.valence,
            valenceShift: 0,
            modifiers: [palaceModifier(host, pd), sumMod],
          });
        }
      }
    }
    return hits;
  },
}));

const tianma = defineRule('ziwei.star.tianma', (e) => ({
  emits: [e.params.template as SignalTemplate],
  match: (chart) => fixedStarHits(chart, '天馬', e.params as FixedStarParams, 'tianma'),
}));

const lucun = defineRule('ziwei.star.lucun', (e) => ({
  emits: [e.params.template as SignalTemplate],
  match: (chart) => fixedStarHits(chart, '祿存', e.params as FixedStarParams, 'lucun'),
}));

const yearMutagen = defineRule('ziwei.year.mutagen', (e) => ({
  emits: [],
  emitsFrom: 'catalog params.templates; domain from the natal palace of the transformed star',
  match: (chart, window) =>
    chart.yearly && overlaps(chart.yearly, window) ? periodMutagenHits(chart, chart.yearly, e.params.templates, '') : [],
}));

const yearOverlay = defineRule('ziwei.year.palace_overlay', (e) => ({
  emits: [],
  emitsFrom: 'catalog params.focus + traits/ziwei.json of the overlaid palace',
  match: (chart, window) =>
    chart.yearly && overlaps(chart.yearly, window)
      ? periodOverlayHits(chart, chart.yearly, e.params as OverlayParams, '流年')
      : [],
}));

const yearSequence = defineRule('ziwei.year.sequence', (e) => ({
  emits: [],
  emitsFrom: 'catalog params.templates / params.overlay (same model as ziwei.year.mutagen / ziwei.year.palace_overlay)',
  match: (chart, window) =>
    chart.yearlySequence
      // The asOf year is already covered by ziwei.year.mutagen / ziwei.year.palace_overlay.
      .filter((y) => overlaps(y, window) && !(chart.yearly && chart.yearly.lunarYear != null && y.lunarYear === chart.yearly.lunarYear))
      .flatMap((y) => [
        ...periodMutagenHits(chart, y, e.params.templates, ''),
        ...periodOverlayHits(chart, y, e.params.overlay as OverlayParams, '流年'),
      ]),
}));

const monthMutagen = defineRule('ziwei.month.mutagen', (e) => ({
  emits: [],
  emitsFrom: 'catalog params.templates; domain from the natal palace of the transformed star',
  match: (chart, window) =>
    chart.monthlySequence.filter((m) => overlaps(m, window)).flatMap((m) => periodMutagenHits(chart, m, e.params.templates, '')),
}));

const monthOverlay = defineRule('ziwei.month.palace_overlay', (e) => ({
  emits: [],
  emitsFrom: 'catalog params.focus + traits/ziwei.json of the overlaid palace',
  match: (chart, window) =>
    chart.monthlySequence
      .filter((m) => overlaps(m, window))
      .flatMap((m) => periodOverlayHits(chart, m, e.params as OverlayParams, '流月')),
}));

/** All implemented (status: active) ziwei rules, in catalog order. */
export const ZIWEI_RULES: readonly ZiweiRule[] = [
  natalStarTraits,
  decadeMutagen,
  decadeOverlay,
  sanfangSha,
  tianma,
  lucun,
  yearMutagen,
  yearOverlay,
  yearSequence,
  monthMutagen,
  monthOverlay,
];
