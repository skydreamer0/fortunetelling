/**
 * 八字十神／神煞規則（V1-10b）：chart × 時間窗 → Signal[]（ARCHITECTURE-V2 §5、§5.1、§6）。
 *
 * 規則 = tenGodCatalog.json 的資料 + 小型純函式 matcher。domain／trait／強度／valence、
 * 藏干權重、各 grain 強度係數、神煞觸動係數全部是資料（D-028）；程式碼只判定
 * 「哪個十神／神煞被哪個外部干支觸動」。每個不為 1 的係數都記在 evidence.modifiers。
 *
 * - `bazi.tengod.annual|decade|monthly`：外部干支（天干＋藏干）相對日主的十神組別。
 * - `bazi.shensha.yima|taohua|caiku`：外部地支逢／沖（財庫另含刑、合）神煞支。
 * - `bazi.clash.movement`：流年／流月地支沖日支或月支 → movement（沖動）。
 *
 * 純函式、確定性（D-014）：輸出依 ruleId → target → DOMAINS → TRAITS 排序；
 * 同一命中內同 domain×trait 取最強者；跨命中重複 id 視為規則撰寫錯誤而丟出。
 */
import { createSignal } from '../../signals/createSignal';
import {
  DOMAINS,
  TRAITS,
  type Domain,
  type Grain,
  type Modifier,
  type Rule,
  type RuleHit,
  type Signal,
  type SignalTemplate,
  type SignalWindow,
  type Trait,
} from '../../signals/types';
import { normalizeChart, type BaziRuleChart, type NatalPillar } from './chart';
import { parseGanZhi, type Branch, type Stem } from './relations';
import { ACTIVATIONS, activationOf, branchesClashEachOther, caikuOf, taohuaOf, wealthElementOf, yimaOf, type Activation } from './shensha';
import catalogJson from './tenGodCatalog.json';
import {
  GROUP_MEMBERS,
  HIDDEN_ROLE_LABEL,
  TEN_GOD_GROUPS,
  TEN_GOD_GROUP_OF,
  hiddenStemsOf,
  tenGodOf,
  type HiddenRole,
  type TenGod,
  type TenGodGroup,
} from './tenGods';

// ─── catalog typing ───────────────────────────────────────────────────────────

export type TenGodRuleKind = 'tenGod' | 'yima' | 'taohua' | 'caiku' | 'clashMovement';

export interface TenGodCatalogRule {
  id: string;
  version: number;
  kind: TenGodRuleKind;
  name: string;
  label: string;
  description: string;
  source: string;
  scopes: Grain[];
  scopeFactors: Partial<Record<Grain, number>>;
  /** 神煞起算支（yima／taohua）。 */
  bases?: ('year' | 'day')[];
  activations?: Partial<Record<Activation, { factor: number; label: string }>>;
  natalAbsent?: { factor: number; reason: string; appliesTo: Activation[] };
  /** 神煞 emits。 */
  emits?: SignalTemplate[];
  /** clashMovement：原局位置 → emits。 */
  positions?: Record<string, SignalTemplate[]>;
}

export interface TenGodCatalog {
  schemaVersion: number;
  system: 'bazi';
  conventions: Record<string, string>;
  stemWeight: number;
  hiddenStemWeights: Record<HiddenRole, number>;
  groupEmits: Record<TenGodGroup, SignalTemplate[]>;
  tenGodEmits: Partial<Record<TenGod, SignalTemplate[]>>;
  rules: TenGodCatalogRule[];
}

export const BAZI_TENGOD_CATALOG = catalogJson as unknown as TenGodCatalog;

// ─── external sources ─────────────────────────────────────────────────────────

type ExternalKind = 'year' | 'decade' | 'month';
const EXTERNAL_LABEL: Record<ExternalKind, string> = { year: '流年', decade: '大運', month: '流月' };
const SCOPE_KIND: Record<Exclude<Grain, 'natal'>, ExternalKind> = { decade: 'decade', year: 'year', month: 'month' };
const NATAL_BRANCH_LABEL: Record<NatalPillar, string> = { year: '年支', month: '月支', day: '日支', hour: '時支' };

/** Fallback component id of a 流月 without one (the rule chart does not name 流月 components). */
export const LIU_YUE_COMPONENT_ID = 'liuYue';

interface Source {
  kind: ExternalKind;
  /** Target key: 'year', 'decade', 'decade@<start>', 'month', 'month@<start>'. */
  key: string;
  ganZhi: string;
  stem: Stem;
  branch: Branch;
  componentId: string;
}

function overlaps(start: string, end: string, w: SignalWindow): boolean {
  return start <= w.end && end >= w.start;
}

function source(kind: ExternalKind, key: string, ganZhi: string, componentId: string): Source {
  const { stem, branch } = parseGanZhi(ganZhi);
  return { kind, key, ganZhi, stem, branch, componentId };
}

function sourcesFor(chart: BaziRuleChart, scope: Grain, window: SignalWindow): Source[] {
  if (scope === 'decade') {
    const cycles = chart.luckCycles.filter((c) => overlaps(c.start, c.end, window));
    return cycles.map((c) =>
      source('decade', cycles.length > 1 ? `decade@${c.start}` : 'decade', c.ganZhi, c.componentId ?? `daYun_${c.index}`),
    );
  }
  if (scope === 'year') {
    const a = chart.annual;
    if (!a) return [];
    const start = a.start ?? `${String(a.year).padStart(4, '0')}-01-01`;
    const end = a.end ?? `${String(a.year).padStart(4, '0')}-12-31`;
    return overlaps(start, end, window) ? [source('year', 'year', a.ganZhi, a.componentId ?? 'liuNian')] : [];
  }
  if (scope === 'month') {
    const months = (chart.monthly ?? []).filter((m) => overlaps(m.start, m.end, window));
    return months.map((m) =>
      source('month', months.length > 1 ? `month@${m.start}` : 'month', m.ganZhi, m.componentId ?? LIU_YUE_COMPONENT_ID),
    );
  }
  return [];
}

// ─── hits ─────────────────────────────────────────────────────────────────────

export interface TenGodEmission extends SignalTemplate {
  modifiers: Modifier[];
}

export interface TenGodRuleHit extends RuleHit {
  /** Final (scaled) domain × trait emissions of this hit, deduped by domain×trait, canonical order. */
  emissions: TenGodEmission[];
}

export interface BaziTenGodRule extends Rule<BaziRuleChart> {
  kind: TenGodRuleKind;
  match(chart: BaziRuleChart, window: SignalWindow): TenGodRuleHit[];
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function templateOrder(a: { domain: Domain; trait: Trait }, b: { domain: Domain; trait: Trait }): number {
  return DOMAINS.indexOf(a.domain) - DOMAINS.indexOf(b.domain) || TRAITS.indexOf(a.trait) - TRAITS.indexOf(b.trait);
}

interface Candidate {
  template: SignalTemplate;
  modifiers: Modifier[];
}

/** Scale candidates by their modifiers, keep the strongest per domain×trait (first on ties), canonical order. */
function finalize(cands: readonly Candidate[]): TenGodEmission[] {
  const best = new Map<string, TenGodEmission>();
  for (const c of cands) {
    const factor = c.modifiers.reduce((p, m) => p * m.factor, 1);
    const e: TenGodEmission = {
      domain: c.template.domain,
      trait: c.template.trait,
      intensity: round4(c.template.intensity * factor),
      valence: c.template.valence,
      modifiers: c.modifiers.map((m) => ({ ...m })),
    };
    const k = `${e.domain}|${e.trait}`;
    const cur = best.get(k);
    if (!cur || e.intensity > cur.intensity) best.set(k, e);
  }
  return [...best.values()].sort(templateOrder);
}

/** Static union of every template a rule can emit (strongest base intensity per domain×trait). */
function staticEmits(templates: readonly SignalTemplate[]): SignalTemplate[] {
  return finalize(templates.map((t) => ({ template: t, modifiers: [] }))).map(({ domain, trait, intensity, valence }) => ({
    domain,
    trait,
    intensity,
    valence,
  }));
}

function scopeModifier(entry: TenGodCatalogRule, scope: Grain): Modifier[] {
  const f = entry.scopeFactors?.[scope] ?? 1;
  if (f === 1) return [];
  return [{ id: `${entry.id}.scope.${scope}`, factor: f, reason: `${EXTERNAL_LABEL[SCOPE_KIND[scope as Exclude<Grain, 'natal'>]]}強度係數` }];
}

function natalIdOf(chart: BaziRuleChart): string {
  return chart.natalComponentId ?? 'natal';
}

function dayMasterOf(chart: BaziRuleChart): Stem | null {
  return chart.pillars.day ? parseGanZhi(chart.pillars.day).stem : null;
}

// ─── 十神 ─────────────────────────────────────────────────────────────────────

type Where = 'stem' | HiddenRole;

interface Contribution {
  stem: Stem;
  where: Where;
  weight: number;
  tenGod: TenGod;
}

function contributionsOf(cat: TenGodCatalog, dm: Stem, s: Source): Contribution[] {
  const out: Contribution[] = [{ stem: s.stem, where: 'stem', weight: cat.stemWeight, tenGod: tenGodOf(dm, s.stem) }];
  for (const h of hiddenStemsOf(s.branch)) {
    out.push({ stem: h.stem, where: h.role, weight: cat.hiddenStemWeights[h.role], tenGod: tenGodOf(dm, h.stem) });
  }
  return out;
}

function weightModifier(c: Contribution): Modifier[] {
  if (c.weight === 1) return [];
  const where = c.where === 'stem' ? '天干' : `藏干${HIDDEN_ROLE_LABEL[c.where]}`;
  return [{ id: `bazi.tengod.weight.${c.where}`, factor: c.weight, reason: `${where}（${c.stem}）權重` }];
}

function describeContribution(s: Source, c: Contribution): string {
  const where = c.where === 'stem' ? '天干' : `${s.branch}${HIDDEN_ROLE_LABEL[c.where]}`;
  return `${c.stem}（${where}）${c.tenGod}`;
}

function matchTenGods(cat: TenGodCatalog, entry: TenGodCatalogRule, chart: BaziRuleChart, scope: Grain, window: SignalWindow): TenGodRuleHit[] {
  const dm = dayMasterOf(chart);
  if (!dm) return [];
  const hits: TenGodRuleHit[] = [];
  for (const s of sourcesFor(chart, scope, window)) {
    const contribs = contributionsOf(cat, dm, s);
    // strongest contribution per ten god (stable: stem > main > middle > residual on ties)
    const bestGod = new Map<TenGod, Contribution>();
    for (const c of contribs) {
      const cur = bestGod.get(c.tenGod);
      if (!cur || c.weight > cur.weight) bestGod.set(c.tenGod, c);
    }
    for (const group of TEN_GOD_GROUPS) {
      const gods = GROUP_MEMBERS[group].filter((g) => bestGod.has(g));
      if (!gods.length) continue;
      let groupBest: Contribution | null = null;
      for (const c of contribs) {
        if (TEN_GOD_GROUP_OF[c.tenGod] !== group) continue;
        if (!groupBest || c.weight > groupBest.weight) groupBest = c;
      }
      const scopeMods = scopeModifier(entry, scope);
      const cands: Candidate[] = (cat.groupEmits[group] ?? []).map((t) => ({
        template: t,
        modifiers: [...scopeMods, ...weightModifier(groupBest as Contribution)],
      }));
      for (const g of gods) {
        for (const t of cat.tenGodEmits[g] ?? []) {
          cands.push({ template: t, modifiers: [...scopeMods, ...weightModifier(bestGod.get(g) as Contribution)] });
        }
      }
      const parts = contribs.filter((c) => TEN_GOD_GROUP_OF[c.tenGod] === group).map((c) => describeContribution(s, c));
      hits.push({
        target: `${s.key}.tengod.${group}`,
        componentIds: [s.componentId, natalIdOf(chart)],
        text: `${EXTERNAL_LABEL[s.kind]}${s.ganZhi}（日主${dm}）${group}：${parts.join('、')}`,
        emissions: finalize(cands),
      });
    }
  }
  return hits;
}

// ─── 神煞 ─────────────────────────────────────────────────────────────────────

function natalBranches(chart: BaziRuleChart): Branch[] {
  const out: Branch[] = [];
  for (const p of ['year', 'month', 'day', 'hour'] as const) {
    const gz = chart.pillars[p];
    if (gz) out.push(parseGanZhi(gz).branch);
  }
  return out;
}

interface Star {
  branch: Branch;
  /** 'yima' | 'taohua' | 'caiku' */
  name: string;
  /** Target suffix, e.g. '@日支' or '@年支+日支' ('' for 財庫). */
  suffix: string;
  /** Human description of the star's derivation. */
  origin: string;
}

function starsFor(entry: TenGodCatalogRule, chart: BaziRuleChart): Star[] {
  if (entry.kind === 'caiku') {
    const dm = dayMasterOf(chart);
    if (!dm) return [];
    return [{ branch: caikuOf(dm), name: 'caiku', suffix: '', origin: `日主${dm}，財星${wealthElementOf(dm)}` }];
  }
  const lookup = entry.kind === 'yima' ? yimaOf : taohuaOf;
  const byStar = new Map<Branch, { labels: string[]; from: string[] }>();
  for (const base of entry.bases ?? []) {
    const gz = chart.pillars[base];
    if (!gz) continue;
    const b = parseGanZhi(gz).branch;
    const star = lookup(b);
    const cur = byStar.get(star) ?? { labels: [], from: [] };
    cur.labels.push(NATAL_BRANCH_LABEL[base]);
    cur.from.push(`${NATAL_BRANCH_LABEL[base]}${b}`);
    byStar.set(star, cur);
  }
  return [...byStar.entries()].map(([branch, v]) => ({
    branch,
    name: entry.kind,
    suffix: `@${v.labels.join('+')}`,
    origin: `由${v.from.join('、')}起`,
  }));
}

function matchShensha(entry: TenGodCatalogRule, chart: BaziRuleChart, scope: Grain, window: SignalWindow): TenGodRuleHit[] {
  const stars = starsFor(entry, chart);
  if (!stars.length) return [];
  const acts = entry.activations ?? {};
  const allowed = ACTIVATIONS.filter((a) => acts[a]);
  const natal = natalBranches(chart);
  const hits: TenGodRuleHit[] = [];
  for (const s of sourcesFor(chart, scope, window)) {
    for (const star of stars) {
      const act = activationOf(s.branch, star.branch, allowed);
      if (!act) continue;
      const a = acts[act] as { factor: number; label: string };
      const mods: Modifier[] = [...scopeModifier(entry, scope)];
      if (a.factor !== 1) mods.push({ id: `${entry.id}.${act}`, factor: a.factor, reason: `${a.label}強度係數` });
      const absent = entry.natalAbsent;
      if (absent && absent.appliesTo.includes(act) && !natal.includes(star.branch)) {
        mods.push({ id: `${entry.id}.natalAbsent`, factor: absent.factor, reason: absent.reason });
      }
      hits.push({
        target: `${s.key}×natal.${star.name}${star.suffix}`,
        componentIds: [s.componentId, natalIdOf(chart)],
        text: `${EXTERNAL_LABEL[s.kind]}${s.branch} ${a.label}${star.branch}（${entry.label}；${star.origin}）`,
        emissions: finalize((entry.emits ?? []).map((t) => ({ template: t, modifiers: mods }))),
      });
    }
  }
  return hits;
}

// ─── 沖動 ─────────────────────────────────────────────────────────────────────

const CLASH_POSITIONS: readonly { position: string; pillar: NatalPillar }[] = [
  { position: 'natal.day.branch', pillar: 'day' },
  { position: 'natal.month.branch', pillar: 'month' },
];

function matchClashMovement(entry: TenGodCatalogRule, chart: BaziRuleChart, scope: Grain, window: SignalWindow): TenGodRuleHit[] {
  const hits: TenGodRuleHit[] = [];
  for (const s of sourcesFor(chart, scope, window)) {
    for (const { position, pillar } of CLASH_POSITIONS) {
      const templates = entry.positions?.[position];
      const gz = chart.pillars[pillar];
      if (!templates || !gz) continue;
      const nb = parseGanZhi(gz).branch;
      if (!branchesClashEachOther(s.branch, nb)) continue;
      const mods = scopeModifier(entry, scope);
      hits.push({
        target: `${s.key}×natal.${pillar}`,
        componentIds: [s.componentId, natalIdOf(chart)],
        text: `${EXTERNAL_LABEL[s.kind]}${s.branch} 沖 ${NATAL_BRANCH_LABEL[pillar]}${nb}（${entry.label}）`,
        emissions: finalize(templates.map((t) => ({ template: t, modifiers: mods }))),
      });
    }
  }
  return hits;
}

// ─── Rule objects ─────────────────────────────────────────────────────────────

function templatesOf(cat: TenGodCatalog, entry: TenGodCatalogRule): SignalTemplate[] {
  if (entry.kind === 'tenGod') {
    return [...Object.values(cat.groupEmits).flat(), ...Object.values(cat.tenGodEmits).flat()] as SignalTemplate[];
  }
  if (entry.kind === 'clashMovement') return Object.values(entry.positions ?? {}).flat();
  return entry.emits ?? [];
}

function buildRule(cat: TenGodCatalog, entry: TenGodCatalogRule, scope: Grain): BaziTenGodRule {
  return {
    id: entry.id,
    version: entry.version,
    system: 'bazi',
    scope,
    kind: entry.kind,
    emits: staticEmits(templatesOf(cat, entry)),
    match(chart, window) {
      const c = normalizeChart(chart);
      const hits =
        entry.kind === 'tenGod'
          ? matchTenGods(cat, entry, c, scope, window)
          : entry.kind === 'clashMovement'
            ? matchClashMovement(entry, c, scope, window)
            : matchShensha(entry, c, scope, window);
      return hits.sort((a, b) => (a.target < b.target ? -1 : a.target > b.target ? 1 : 0));
    },
  };
}

/** Every 十神／神煞 rule, one `Rule` per (catalog id × scope), in catalog order. */
export const BAZI_TENGOD_RULES: readonly BaziTenGodRule[] = Object.freeze(
  BAZI_TENGOD_CATALOG.rules.flatMap((entry) => entry.scopes.map((scope) => buildRule(BAZI_TENGOD_CATALOG, entry, scope))),
);

// ─── evaluation ───────────────────────────────────────────────────────────────

export interface EvaluateBaziTenGodOptions {
  /** Rule scopes to run (default: only the window's own grain). */
  scopes?: readonly Grain[];
  /** Only evaluate these rule ids (default: all). */
  ruleIds?: readonly string[];
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function evaluateBaziTenGodRules(
  chart: BaziRuleChart,
  window: SignalWindow,
  opts: EvaluateBaziTenGodOptions = {},
): Signal[] {
  const scopes = new Set<Grain>(opts.scopes ?? [window.grain]);
  const only = opts.ruleIds ? new Set(opts.ruleIds) : null;
  const signals: Signal[] = [];
  for (const rule of BAZI_TENGOD_RULES) {
    if (!scopes.has(rule.scope)) continue;
    if (only && !only.has(rule.id)) continue;
    for (const hit of rule.match(chart, window)) {
      for (const e of hit.emissions) {
        signals.push(
          createSignal({
            system: 'bazi',
            ruleId: rule.id,
            ruleVersion: rule.version,
            domain: e.domain,
            trait: e.trait,
            intensity: e.intensity,
            valence: e.valence,
            window,
            target: hit.target,
            evidence: { componentIds: [...new Set(hit.componentIds)], text: hit.text, modifiers: e.modifiers },
          }),
        );
      }
    }
  }
  signals.sort(
    (a, b) =>
      cmp(a.ruleId, b.ruleId) ||
      cmp(a.target ?? '', b.target ?? '') ||
      DOMAINS.indexOf(a.domain) - DOMAINS.indexOf(b.domain) ||
      TRAITS.indexOf(a.trait) - TRAITS.indexOf(b.trait),
  );
  const seen = new Set<string>();
  for (const s of signals) {
    if (seen.has(s.id)) throw new Error(`evaluateBaziTenGodRules: duplicate signal id ${s.id} (${s.ruleId} ${s.target})`);
    seen.add(s.id);
  }
  return signals;
}
