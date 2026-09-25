/**
 * Trait-vector → signal hits for ziwei stars (ARCHITECTURE-V2 §5.1, D-028).
 *
 *   intensity = base trait × palace × brightness × 四化 × 煞曜同宮 (× rule-specific factors)
 *   valence   = traitValence[trait] + Σ valence shifts (四化, 煞曜同宮, …), clamped to [-1, 1]
 *
 * Every factor is a `Modifier` in `evidence.modifiers`, so
 * `intensity === base × Π modifier.factor` holds for every signal (a final
 * `clamp.max` modifier is appended when the product exceeds 1). All weights are
 * data (traits/ziwei.json, traits/ziweiModifiers.json); this file holds no
 * star-specific interpretation.
 */

import { TRAITS, type Domain, type Modifier, type RuleHit, type Trait } from '../../signals/types';
import traitData from '../../traits/ziwei.json';
import modifierData from '../../traits/ziweiModifiers.json';
import { oppositeOf, type MutagenKind, type ZiweiPalace, type ZiweiRuleChart, type ZiweiStar } from './chart';

// ─── Typed data tables ────────────────────────────────────────────────────

export interface StarTraitEntry {
  id: string;
  name: string;
  group: 'major' | 'auxiliary' | 'sha' | 'lucun' | 'tianma';
  traits: Partial<Record<Trait, number>>;
  notes: string;
}

export interface StarTraitTable {
  version: number;
  stars: StarTraitEntry[];
}

export interface PalaceDomain {
  domain: Domain;
  factor: number;
}

export interface ZiweiModifierTable {
  version: number;
  notes: Record<string, string>;
  palaceDomains: Record<string, PalaceDomain[]>;
  palaceAliases: Record<string, string>;
  brightness: { source: string; definition: string };
  traitValence: Record<Trait, number>;
  mutagen: Record<MutagenKind, { factor: number; valenceShift: number }>;
  shaSamePalace: { stars: string[]; factorPerStar: number; valenceShiftPerStar: number; maxStars: number };
  emptyPalaceBorrow: { factor: number };
  sanfang: { self: number; opposite: number; trine: number };
  labels: { domains: Record<Domain, string>; traits: Record<Trait, string> };
}

export const ZIWEI_TRAITS = traitData as unknown as StarTraitTable;
export const ZIWEI_MODIFIERS = modifierData as unknown as ZiweiModifierTable;

const STAR_BY_NAME: ReadonlyMap<string, StarTraitEntry> = new Map(
  ZIWEI_TRAITS.stars.map((s) => [s.name, s]),
);
const SHA_STARS: ReadonlySet<string> = new Set(ZIWEI_MODIFIERS.shaSamePalace.stars);

export const starTraitEntry = (name: string): StarTraitEntry | undefined => STAR_BY_NAME.get(name);
export const isShaStar = (name: string): boolean => SHA_STARS.has(name);

/** Palace name → canonical name (resolving iztro aliases). */
export function canonicalPalaceName(name: string): string {
  return ZIWEI_MODIFIERS.palaceAliases[name] ?? name;
}

/** Palace → [{ domain, factor }]; throws for a palace with no mapping. */
export function palaceDomains(name: string): PalaceDomain[] {
  const entry = ZIWEI_MODIFIERS.palaceDomains[canonicalPalaceName(name)];
  if (!Array.isArray(entry)) throw new Error(`ziwei: no domain mapping for palace ${JSON.stringify(name)}`);
  return entry;
}

export const domainLabel = (d: Domain) => ZIWEI_MODIFIERS.labels.domains[d] ?? d;
export const traitLabel = (t: Trait) => ZIWEI_MODIFIERS.labels.traits[t] ?? t;

/** Sorted trait entries in TRAITS order (deterministic). */
export function orderedTraits(traits: Partial<Record<Trait, number>>): [Trait, number][] {
  return TRAITS.filter((t) => typeof traits[t] === 'number').map((t) => [t, traits[t] as number]);
}

// ─── Hits ─────────────────────────────────────────────────────────────────

/** A rule hit that already carries its domain × trait and modifier chain. */
export interface ZiweiHit extends RuleHit {
  domain: Domain;
  trait: Trait;
  /** Base intensity before modifiers. */
  baseIntensity: number;
  /** Base valence before shifts. */
  baseValence: number;
  /** Sum of valence shifts from modifiers. */
  valenceShift: number;
  modifiers: Modifier[];
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Apply the modifier chain: returns final intensity/valence and the full modifier list. */
export function finalizeHit(hit: ZiweiHit): { intensity: number; valence: number; modifiers: Modifier[] } {
  const modifiers = hit.modifiers.map((m) => ({ ...m }));
  let raw = hit.baseIntensity;
  for (const m of modifiers) raw *= m.factor;
  let intensity = raw;
  if (raw > 1) {
    modifiers.push({ id: 'clamp.max', factor: round6(1 / raw), reason: `強度上限 1（修正後原值 ${round6(raw)}）` });
    intensity = 1;
  }
  intensity = round6(clamp(intensity, 0, 1));
  const valence = round6(clamp(hit.baseValence + hit.valenceShift, -1, 1));
  return { intensity, valence, modifiers };
}

// ─── Star modifier chain ──────────────────────────────────────────────────

export interface ChainPart {
  modifiers: Modifier[];
  valenceShift: number;
}

export function palaceModifier(palace: ZiweiPalace, pd: PalaceDomain): Modifier {
  return {
    id: `palace.${canonicalPalaceName(palace.name)}.${pd.domain}`,
    factor: pd.factor,
    reason: `${palace.name}對應${domainLabel(pd.domain)}領域（宮位因子 ${pd.factor}）`,
  };
}

export function brightnessModifier(star: ZiweiStar): Modifier | null {
  if (!star.brightness || star.brightnessScore === null) return null;
  return {
    id: `brightness.${star.brightness}`,
    factor: star.brightnessScore,
    reason: `${star.name}亮度「${star.brightness}」，因子取引擎 brightnessScore（D-005 七級 ÷7）`,
  };
}

export function mutagenPart(star: ZiweiStar, kind: MutagenKind | null, source: string): ChainPart {
  if (!kind) return { modifiers: [], valenceShift: 0 };
  const m = ZIWEI_MODIFIERS.mutagen[kind];
  return {
    modifiers: [
      {
        id: `mutagen.${source}.${kind}`,
        factor: m.factor,
        reason: `${star.name}${source === 'natal' ? '生年' : ''}化${kind}：強度 ×${m.factor}，傾向 ${m.valenceShift >= 0 ? '+' : ''}${m.valenceShift}`,
      },
    ],
    valenceShift: m.valenceShift,
  };
}

/** Other 六煞 in the same palace (excluding `selfName`). */
export function shaInPalace(palace: ZiweiPalace, selfName?: string): string[] {
  return palace.stars.filter((s) => isShaStar(s.name) && s.name !== selfName).map((s) => s.name);
}

export function shaSamePalacePart(palace: ZiweiPalace, selfName?: string): ChainPart {
  const cfg = ZIWEI_MODIFIERS.shaSamePalace;
  const sha = shaInPalace(palace, selfName);
  const n = Math.min(sha.length, cfg.maxStars);
  if (n === 0) return { modifiers: [], valenceShift: 0 };
  const factor = round6(cfg.factorPerStar ** n);
  const shift = round6(cfg.valenceShiftPerStar * n);
  return {
    modifiers: [
      {
        id: `sha_same_palace.${n}`,
        factor,
        reason: `${palace.name}同宮煞曜 ${sha.join('、')}（計 ${n} 顆）：強度 ×${factor}，傾向 ${shift}`,
      },
    ],
    valenceShift: shift,
  };
}

/** Stars of `palace` that have trait entries, plus borrowed opposite major stars when empty. */
export interface PlacedStar {
  star: ZiweiStar;
  entry: StarTraitEntry;
  /** Palace the star physically sits in. */
  sourcePalace: ZiweiPalace;
  borrowed: boolean;
}

export function placedStars(chart: ZiweiRuleChart, palace: ZiweiPalace): PlacedStar[] {
  const out: PlacedStar[] = [];
  for (const star of palace.stars) {
    const entry = starTraitEntry(star.name);
    if (entry) out.push({ star, entry, sourcePalace: palace, borrowed: false });
  }
  if (!palace.stars.some((s) => s.kind === 'major')) {
    const opp = chart.palaces[oppositeOf(palace.index)];
    for (const star of opp.stars) {
      if (star.kind !== 'major') continue;
      const entry = starTraitEntry(star.name);
      if (entry) out.push({ star, entry, sourcePalace: opp, borrowed: true });
    }
  }
  return out;
}

export interface StarTraitHitOptions {
  /** Target prefix, e.g. 'natal' or 'daXian_4'. */
  targetPrefix: string;
  /** Extra leading modifiers (e.g. an overlay factor). */
  extraModifiers?: Modifier[];
  /** Extra component ids (e.g. the period component). */
  extraComponentIds?: string[];
  /**
   * Force every hit onto these domains instead of the palace mapping; the
   * palace modifier is then omitted (the caller supplies its own via extraModifiers).
   */
  domainsOverride?: PalaceDomain[];
  /** Text prefix for evidence. */
  textPrefix?: string;
}

/** Component ids for a placed star: its palace, plus mainStar_/mutagen_ components where they exist. */
export function starComponentIds(chart: ZiweiRuleChart, ps: PlacedStar, host: ZiweiPalace): string[] {
  const ids = [host.componentId];
  if (ps.sourcePalace !== host) ids.push(ps.sourcePalace.componentId);
  const main = chart.mainStarComponentIds[ps.star.name];
  if (main) ids.push(main);
  if (ps.star.mutagen) {
    const mc = chart.natalMutagenComponentIds[ps.star.mutagen];
    if (mc) ids.push(mc);
  }
  return ids;
}

/**
 * Trait hits for every star shown in `palace` (own stars + borrowed opposite
 * major stars when the palace has none). One hit per (star, domain, trait).
 */
export function starTraitHits(chart: ZiweiRuleChart, palace: ZiweiPalace, opts: StarTraitHitOptions): ZiweiHit[] {
  const hits: ZiweiHit[] = [];
  const domains = opts.domainsOverride ?? palaceDomains(palace.name);
  const borrowCfg = ZIWEI_MODIFIERS.emptyPalaceBorrow;

  for (const ps of placedStars(chart, palace)) {
    const { star, entry } = ps;
    const bright = brightnessModifier(star);
    const mut = mutagenPart(star, star.mutagen, 'natal');
    const sha = shaSamePalacePart(palace, star.name);
    const borrow: Modifier | null = ps.borrowed
      ? {
          id: 'borrow_opposite',
          factor: borrowCfg.factor,
          reason: `${palace.name}無主星，借對宮${ps.sourcePalace.name}的${star.name}（因子 ${borrowCfg.factor}）`,
        }
      : null;
    const componentIds = [...(opts.extraComponentIds ?? []), ...starComponentIds(chart, ps, palace)];
    const brightText = star.brightness ? `（${star.brightness}）` : '';
    const where = ps.borrowed ? `借自${ps.sourcePalace.name}` : `坐${palace.name}`;

    for (const pd of domains) {
      for (const [trait, base] of orderedTraits(entry.traits)) {
        const modifiers: Modifier[] = [
          ...(opts.extraModifiers ?? []),
          // With a domain override the caller's extra modifier carries the placement factor.
          ...(opts.domainsOverride ? [] : [palaceModifier(palace, pd)]),
          ...(bright ? [bright] : []),
          ...(borrow ? [borrow] : []),
          ...mut.modifiers,
          ...sha.modifiers,
        ];
        hits.push({
          target: `${opts.targetPrefix}:${palace.componentId}:${star.name}${ps.borrowed ? ':borrowed' : ''}`,
          componentIds,
          text:
            `${opts.textPrefix ?? ''}${star.name}${brightText}${where}，` +
            `對應${domainLabel(pd.domain)}領域的「${traitLabel(trait)}」特徵（基礎權重 ${base}）`,
          domain: pd.domain,
          trait,
          baseIntensity: base,
          baseValence: ZIWEI_MODIFIERS.traitValence[trait],
          valenceShift: mut.valenceShift + sha.valenceShift,
          modifiers,
        });
      }
    }
  }
  return hits;
}

/** Natal star-trait hits over all 12 palaces. */
export function natalStarTraitHits(chart: ZiweiRuleChart): ZiweiHit[] {
  return chart.palaces.flatMap((p) => starTraitHits(chart, p, { targetPrefix: 'natal' }));
}
