/**
 * 八字規則（V1-10）：每條規則 = catalog.json 的資料 + 小型純函式 matcher（ARCHITECTURE-V2 §5）。
 *
 * 一個 catalog 規則 id 會依其 `scopes` 展開成多個 `Rule` 物件（`Rule.scope` 為單一 grain）。
 * 規則的 domain／trait／強度／valence 全部來自 catalog.json（D-028）；程式碼只判定
 * 「哪些干支構成哪種關係」與「命中了哪些位置」。
 */
import {
  DOMAINS,
  TRAITS,
  type Domain,
  type Grain,
  type Rule,
  type RuleHit,
  type SignalTemplate,
  type SignalWindow,
  type Trait,
} from '../../signals/types';
import catalogJson from './catalog.json';
import { NATAL_PILLARS, normalizeChart, type BaziRuleChart, type NatalPillar } from './chart';
import {
  branchesClash,
  findBranchBreaks,
  findBranchClashes,
  findBranchDirectionals,
  findBranchHarmonies,
  findBranchHarms,
  findBranchPunishments,
  findBranchTrines,
  findStemCombines,
  findStemControls,
  findStemProductions,
  parseGanZhi,
  stemsClash,
  type Branch,
  type Placed,
  type RelationHit,
  type Stem,
} from './relations';

// ─── catalog typing ───────────────────────────────────────────────────────────

export type RuleLevel = 'stem' | 'branch' | 'pillar';
export type PillarRelation = 'pillarFuyin' | 'pillarFanyin' | 'suiyunBinglin';

export interface CatalogEmit extends SignalTemplate {
  /** Chart position this template applies to (e.g. 'natal.day.branch', 'decade'). */
  position: string;
}

export interface CatalogRule {
  id: string;
  version: number;
  name: string;
  label: string;
  relation: string;
  level: RuleLevel;
  description: string;
  source: string;
  scopes: Grain[];
  modifiers?: { partial?: { factor: number; reason: string } };
  emits: CatalogEmit[];
}

export interface BaziCatalog {
  schemaVersion: number;
  system: 'bazi';
  conventions: Record<string, string>;
  positionDomains: Record<string, { domain: Domain; weight: number }[]>;
  rules: CatalogRule[];
}

export const BAZI_CATALOG = catalogJson as unknown as BaziCatalog;

// ─── chart positions ──────────────────────────────────────────────────────────

const NATAL_LABEL: Record<NatalPillar, string> = { year: '年', month: '月', day: '日', hour: '時' };
type ExternalKind = 'year' | 'decade' | 'month';
const EXTERNAL_LABEL: Record<ExternalKind, string> = { year: '流年', decade: '大運', month: '流月' };
const EXTERNAL_ORDER: readonly ExternalKind[] = ['year', 'decade', 'month'];

interface Member {
  /** Target key, e.g. 'natal.day', 'year', 'decade', 'decade@2022-01-01'. */
  key: string;
  natal: NatalPillar | null;
  external: ExternalKind | null;
  stem: Stem;
  branch: Branch;
  componentId: string | null;
}

interface Context {
  natal: Member[];
  externals: Member[];
  /** Key a hit must contain to belong to this scope (null for natal scope). */
  required: string | null;
}

function overlaps(start: string, end: string, w: SignalWindow): boolean {
  return start <= w.end && end >= w.start;
}

function natalMembers(chart: BaziRuleChart): Member[] {
  const out: Member[] = [];
  for (const p of NATAL_PILLARS) {
    const gz = chart.pillars[p];
    if (gz == null) continue;
    const { stem, branch } = parseGanZhi(gz);
    out.push({ key: `natal.${p}`, natal: p, external: null, stem, branch, componentId: chart.natalComponentId ?? 'natal' });
  }
  return out;
}

function external(kind: ExternalKind, key: string, ganZhi: string, componentId: string | null): Member {
  const { stem, branch } = parseGanZhi(ganZhi);
  return { key, natal: null, external: kind, stem, branch, componentId };
}

/** Build the evaluation contexts of one scope for a (normalized) chart and window. */
function contextsFor(chart: BaziRuleChart, scope: Grain, window: SignalWindow): Context[] {
  const natal = natalMembers(chart);
  if (scope === 'natal') return [{ natal, externals: [], required: null }];

  if (scope === 'decade') {
    const cycles = chart.luckCycles.filter((c) => overlaps(c.start, c.end, window));
    return cycles.map((c) => {
      const key = cycles.length > 1 ? `decade@${c.start}` : 'decade';
      return { natal, externals: [external('decade', key, c.ganZhi, c.componentId ?? `daYun_${c.index}`)], required: key };
    });
  }

  if (scope === 'year') {
    const a = chart.annual;
    if (!a) return [];
    const start = a.start ?? `${String(a.year).padStart(4, '0')}-01-01`;
    const end = a.end ?? `${String(a.year).padStart(4, '0')}-12-31`;
    if (!overlaps(start, end, window)) return [];
    const externals = [external('year', 'year', a.ganZhi, a.componentId ?? 'liuNian')];
    const cycles = chart.luckCycles.filter((c) => overlaps(c.start, c.end, window));
    const cycle = cycles.find((c) => c.start <= window.start && c.end >= window.start) ?? cycles[0];
    if (cycle) externals.push(external('decade', 'decade', cycle.ganZhi, cycle.componentId ?? `daYun_${cycle.index}`));
    return [{ natal, externals, required: 'year' }];
  }

  // month
  const months = (chart.monthly ?? []).filter((m) => overlaps(m.start, m.end, window));
  return months.map((m) => {
    const key = months.length > 1 ? `month@${m.start}` : 'month';
    return { natal, externals: [external('month', key, m.ganZhi, m.componentId ?? null)], required: key };
  });
}

// ─── hit construction ─────────────────────────────────────────────────────────

export interface BaziRuleHit extends RuleHit {
  /** Catalog positions the hit touches that carry domains (natal side, else 大運). */
  positions: string[];
}

interface RawHit {
  members: Member[];
  /** Display order for directed relations; otherwise members are re-ordered externals-first. */
  directed: boolean;
  label: string;
  complete: boolean;
}

function memberRank(m: Member): number {
  if (m.external) return EXTERNAL_ORDER.indexOf(m.external);
  return 10 + NATAL_PILLARS.indexOf(m.natal as NatalPillar);
}

function sortMembers(ms: Member[]): Member[] {
  return [...ms].sort((a, b) => memberRank(a) - memberRank(b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

function targetOf(ms: Member[]): string {
  const sorted = sortMembers(ms);
  const ext = sorted.filter((m) => m.external).map((m) => m.key);
  const nat = sorted.filter((m) => m.natal).map((m) => m.key);
  if (ext.length && nat.length) return `${ext.join('+')}×${nat.join('+')}`;
  return (ext.length ? ext : nat).join('×');
}

function positionOf(m: Member, level: RuleLevel): string {
  const base = m.natal ? `natal.${m.natal}` : (m.external as string);
  return level === 'pillar' ? base : `${base}.${level}`;
}

function describe(m: Member, level: RuleLevel): string {
  if (m.external) {
    const name = EXTERNAL_LABEL[m.external];
    return level === 'stem' ? `${name}${m.stem}` : level === 'branch' ? `${name}${m.branch}` : `${name}${m.stem}${m.branch}`;
  }
  const p = NATAL_LABEL[m.natal as NatalPillar];
  if (level === 'stem') return `${p}干${m.stem}`;
  if (level === 'branch') return `${p}支${m.branch}`;
  return `${p}柱${m.stem}${m.branch}`;
}

function textOf(raw: RawHit, level: RuleLevel): string {
  const ordered = raw.directed ? raw.members : sortMembers(raw.members);
  const parts = ordered.map((m) => describe(m, level));
  if (raw.directed) return `${parts[0]} ${raw.label} ${parts[1]}`;
  if (parts.length === 2) return `${parts[0]} 與 ${parts[1]} ${raw.label}`;
  return `${parts.join('、')} ${raw.label}`;
}

function uniq(xs: (string | null)[]): string[] {
  const out: string[] = [];
  for (const x of xs) if (x != null && !out.includes(x)) out.push(x);
  return out;
}

function toRuleHit(raw: RawHit, rule: CatalogRule): BaziRuleHit {
  const sorted = sortMembers(raw.members);
  const natalSide = sorted.filter((m) => m.natal);
  const domainSide = natalSide.length ? natalSide : sorted.filter((m) => m.external === 'decade');
  const hit: BaziRuleHit = {
    target: targetOf(raw.members),
    componentIds: uniq(sorted.map((m) => m.componentId)),
    text: textOf(raw, rule.level),
    positions: uniq(domainSide.map((m) => positionOf(m, rule.level))),
  };
  const partial = rule.modifiers?.partial;
  if (!raw.complete && partial) {
    hit.modifiers = [{ id: `${rule.id}.partial`, factor: partial.factor, reason: partial.reason }];
  }
  return hit;
}

// ─── relation matchers ────────────────────────────────────────────────────────

type StemFinder = (items: readonly Placed<Stem>[]) => RelationHit<Stem>[];
type BranchFinder = (items: readonly Placed<Branch>[]) => RelationHit<Branch>[];

const STEM_FINDERS: Record<string, StemFinder> = {
  stemCombine: findStemCombines,
  stemControl: findStemControls,
  stemProduce: findStemProductions,
};

const BRANCH_FINDERS: Record<string, BranchFinder> = {
  branchHarmony: findBranchHarmonies,
  branchClash: findBranchClashes,
  branchTrine: findBranchTrines,
  branchDirectional: findBranchDirectionals,
  branchPunishment: findBranchPunishments,
  branchHarm: findBranchHarms,
  branchBreak: findBranchBreaks,
};

function charHits(ctx: Context, rule: CatalogRule): RawHit[] {
  const all = [...ctx.externals, ...ctx.natal];
  const byKey = new Map(all.map((m) => [m.key, m]));
  let rel: RelationHit[];
  if (rule.level === 'stem') {
    const f = STEM_FINDERS[rule.relation];
    if (!f) throw new Error(`bazi rules: no stem matcher for ${rule.relation}`);
    rel = f(all.map((m) => ({ key: m.key, char: m.stem })));
  } else {
    const f = BRANCH_FINDERS[rule.relation];
    if (!f) throw new Error(`bazi rules: no branch matcher for ${rule.relation}`);
    rel = f(all.map((m) => ({ key: m.key, char: m.branch })));
  }
  return rel
    .filter((h) => (ctx.required ? h.members.some((m) => m.key === ctx.required) : h.members.every((m) => byKey.get(m.key)?.natal)))
    .map((h) => ({
      members: h.members.map((m) => byKey.get(m.key) as Member),
      directed: h.variant === 'directed',
      label: h.label,
      complete: h.complete,
    }));
}

function pillarPairs(ctx: Context): [Member, Member][] {
  if (!ctx.required) {
    const out: [Member, Member][] = [];
    for (let i = 0; i < ctx.natal.length; i++) {
      for (let j = i + 1; j < ctx.natal.length; j++) out.push([ctx.natal[i], ctx.natal[j]]);
    }
    return out;
  }
  const primary = ctx.externals.find((m) => m.key === ctx.required) as Member;
  return ctx.natal.map((n) => [primary, n] as [Member, Member]);
}

function pillarHits(ctx: Context, rule: CatalogRule): RawHit[] {
  const label = rule.label;
  if (rule.relation === 'suiyunBinglin') {
    const annual = ctx.externals.find((m) => m.external === 'year');
    const luck = ctx.externals.find((m) => m.external === 'decade');
    if (!annual || !luck) return [];
    return annual.stem === luck.stem && annual.branch === luck.branch
      ? [{ members: [annual, luck], directed: false, label, complete: true }]
      : [];
  }
  const test =
    rule.relation === 'pillarFuyin'
      ? (a: Member, b: Member) => a.stem === b.stem && a.branch === b.branch
      : rule.relation === 'pillarFanyin'
        ? (a: Member, b: Member) => stemsClash(a.stem, b.stem) && branchesClash(a.branch, b.branch)
        : null;
  if (!test) throw new Error(`bazi rules: no pillar matcher for ${rule.relation}`);
  return pillarPairs(ctx)
    .filter(([a, b]) => test(a, b))
    .map(([a, b]) => ({ members: [a, b], directed: false, label, complete: true }));
}

// ─── Rule objects ─────────────────────────────────────────────────────────────

export interface BaziRule extends Rule<BaziRuleChart> {
  match(chart: BaziRuleChart, window: SignalWindow): BaziRuleHit[];
  /** Templates that apply to one hit (selected by the hit's positions, deduped by domain×trait). */
  templatesFor(hit: BaziRuleHit): SignalTemplate[];
}

function templateOrder(a: SignalTemplate, b: SignalTemplate): number {
  return DOMAINS.indexOf(a.domain) - DOMAINS.indexOf(b.domain) || TRAITS.indexOf(a.trait) - TRAITS.indexOf(b.trait);
}

/** Dedupe templates by domain×trait keeping the strongest, in canonical DOMAINS×TRAITS order. */
function mergeTemplates(emits: readonly SignalTemplate[]): SignalTemplate[] {
  const best = new Map<string, SignalTemplate>();
  for (const e of emits) {
    const k = `${e.domain}|${e.trait}`;
    const cur = best.get(k);
    if (!cur || e.intensity > cur.intensity) {
      best.set(k, { domain: e.domain as Domain, trait: e.trait as Trait, intensity: e.intensity, valence: e.valence });
    }
  }
  return [...best.values()].sort(templateOrder);
}

function buildRule(entry: CatalogRule, scope: Grain): BaziRule {
  return {
    id: entry.id,
    version: entry.version,
    system: 'bazi',
    scope,
    emits: mergeTemplates(entry.emits),
    match(chart, window) {
      if (window.grain !== scope) return [];
      const normalized = normalizeChart(chart);
      const hits: BaziRuleHit[] = [];
      for (const ctx of contextsFor(normalized, scope, window)) {
        const raws = entry.level === 'pillar' ? pillarHits(ctx, entry) : charHits(ctx, entry);
        for (const raw of raws) hits.push(toRuleHit(raw, entry));
      }
      return hits.sort((a, b) => (a.target < b.target ? -1 : a.target > b.target ? 1 : 0));
    },
    templatesFor(hit) {
      return mergeTemplates(entry.emits.filter((e) => hit.positions.includes(e.position)));
    },
  };
}

/** Every 八字 rule, one `Rule` per (catalog id × scope), in catalog order. */
export const BAZI_RULES: readonly BaziRule[] = Object.freeze(
  BAZI_CATALOG.rules.flatMap((entry) => entry.scopes.map((scope) => buildRule(entry, scope))),
);

