/**
 * 干支關係表與純函式（V1-10，ARCHITECTURE-V2 §5）。
 *
 * 全部是資料表 + 查表函式，不含任何吉凶判斷（D-028）。每個 `find*` 函式接受一組
 * 「定位字元」（`Placed`：位置 key + 干或支），回傳結構化的關係命中，由 `evaluate.ts`
 * 依位置決定要不要保留（例如只保留包含流年的命中）。
 *
 * 慣例（皆為常見子平慣例，於 catalog.json 亦有記載）：
 * - 天干五合只標示「合化五行」，是否真化（需月令等條件）不在此判定。
 * - 地支半合只取含「旺支」（子午卯酉）的兩支（生旺、旺墓）；不含旺支的「拱合」不計。
 * - 三刑：寅巳申、丑戌未三支俱全為 complete；只見其中兩支為 partial。子卯相刑恆為 complete。
 *   自刑（辰午酉亥）必須同一地支出現兩次。
 * - 三會只計三支俱全。
 * - 被完整三合／三刑涵蓋的兩支組合，不再另報半合／部分三刑（避免重複計數）。
 */

export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
export type Stem = (typeof STEMS)[number];

export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;
export type Branch = (typeof BRANCHES)[number];

export const ELEMENTS = ['木', '火', '土', '金', '水'] as const;
export type Element = (typeof ELEMENTS)[number];

export const STEM_ELEMENT: Readonly<Record<Stem, Element>> = Object.freeze({
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
});

/** 地支本氣五行。 */
export const BRANCH_ELEMENT: Readonly<Record<Branch, Element>> = Object.freeze({
  子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
});

/** 五行相生：key 生 value。 */
export const ELEMENT_PRODUCES: Readonly<Record<Element, Element>> = Object.freeze({
  木: '火', 火: '土', 土: '金', 金: '水', 水: '木',
});

/** 五行相剋：key 剋 value。 */
export const ELEMENT_CONTROLS: Readonly<Record<Element, Element>> = Object.freeze({
  木: '土', 火: '金', 土: '水', 金: '木', 水: '火',
});

export interface PairEntry<C extends string> {
  pair: readonly [C, C];
  label: string;
  element?: Element;
}

export interface SetEntry<C extends string> {
  set: readonly C[];
  label: string;
  element?: Element;
  /** Set members that may form a half/partial relation (pairs). */
  partialPairs?: readonly (readonly [C, C])[];
  partialLabel?: string;
}

/** 天干五合。 */
export const STEM_COMBINATIONS: readonly PairEntry<Stem>[] = Object.freeze([
  { pair: ['甲', '己'], label: '五合（土）', element: '土' },
  { pair: ['乙', '庚'], label: '五合（金）', element: '金' },
  { pair: ['丙', '辛'], label: '五合（水）', element: '水' },
  { pair: ['丁', '壬'], label: '五合（木）', element: '木' },
  { pair: ['戊', '癸'], label: '五合（火）', element: '火' },
]);

/** 天干相沖（四沖；戊己居中無沖）。用於反吟判定。 */
export const STEM_CLASHES: readonly PairEntry<Stem>[] = Object.freeze([
  { pair: ['甲', '庚'], label: '相沖' },
  { pair: ['乙', '辛'], label: '相沖' },
  { pair: ['丙', '壬'], label: '相沖' },
  { pair: ['丁', '癸'], label: '相沖' },
]);

/** 地支六合（午未合依常見慣例標土）。 */
export const BRANCH_HARMONIES: readonly PairEntry<Branch>[] = Object.freeze([
  { pair: ['子', '丑'], label: '六合（土）', element: '土' },
  { pair: ['寅', '亥'], label: '六合（木）', element: '木' },
  { pair: ['卯', '戌'], label: '六合（火）', element: '火' },
  { pair: ['辰', '酉'], label: '六合（金）', element: '金' },
  { pair: ['巳', '申'], label: '六合（水）', element: '水' },
  { pair: ['午', '未'], label: '六合（土）', element: '土' },
]);

/** 地支六沖。 */
export const BRANCH_CLASHES: readonly PairEntry<Branch>[] = Object.freeze([
  { pair: ['子', '午'], label: '六沖' },
  { pair: ['丑', '未'], label: '六沖' },
  { pair: ['寅', '申'], label: '六沖' },
  { pair: ['卯', '酉'], label: '六沖' },
  { pair: ['辰', '戌'], label: '六沖' },
  { pair: ['巳', '亥'], label: '六沖' },
]);

/** 地支三合（生、旺、墓）；半合取生旺、旺墓。 */
export const BRANCH_TRINES: readonly SetEntry<Branch>[] = Object.freeze([
  { set: ['申', '子', '辰'], label: '三合水局', element: '水', partialPairs: [['申', '子'], ['子', '辰']], partialLabel: '半合水局' },
  { set: ['亥', '卯', '未'], label: '三合木局', element: '木', partialPairs: [['亥', '卯'], ['卯', '未']], partialLabel: '半合木局' },
  { set: ['寅', '午', '戌'], label: '三合火局', element: '火', partialPairs: [['寅', '午'], ['午', '戌']], partialLabel: '半合火局' },
  { set: ['巳', '酉', '丑'], label: '三合金局', element: '金', partialPairs: [['巳', '酉'], ['酉', '丑']], partialLabel: '半合金局' },
]);

/** 地支三會（方局），只計三支俱全。 */
export const BRANCH_DIRECTIONALS: readonly SetEntry<Branch>[] = Object.freeze([
  { set: ['寅', '卯', '辰'], label: '三會東方木', element: '木' },
  { set: ['巳', '午', '未'], label: '三會南方火', element: '火' },
  { set: ['申', '酉', '戌'], label: '三會西方金', element: '金' },
  { set: ['亥', '子', '丑'], label: '三會北方水', element: '水' },
]);

/** 三刑（寅巳申、丑戌未）；只見兩支為部分三刑。 */
export const BRANCH_PUNISHMENT_SETS: readonly SetEntry<Branch>[] = Object.freeze([
  {
    set: ['寅', '巳', '申'], label: '寅巳申三刑（無恩之刑）',
    partialPairs: [['寅', '巳'], ['巳', '申'], ['寅', '申']], partialLabel: '相刑（寅巳申缺一）',
  },
  {
    set: ['丑', '戌', '未'], label: '丑戌未三刑（恃勢之刑）',
    partialPairs: [['丑', '戌'], ['戌', '未'], ['丑', '未']], partialLabel: '相刑（丑戌未缺一）',
  },
]);

/** 子卯相刑（無禮之刑）。 */
export const BRANCH_MUTUAL_PUNISHMENTS: readonly PairEntry<Branch>[] = Object.freeze([
  { pair: ['子', '卯'], label: '子卯相刑（無禮之刑）' },
]);

/** 自刑：同一地支出現兩次。 */
export const SELF_PUNISHMENT_BRANCHES: readonly Branch[] = Object.freeze(['辰', '午', '酉', '亥']);
export const SELF_PUNISHMENT_LABEL = '自刑';

/** 地支六害（相穿）。 */
export const BRANCH_HARMS: readonly PairEntry<Branch>[] = Object.freeze([
  { pair: ['子', '未'], label: '六害' },
  { pair: ['丑', '午'], label: '六害' },
  { pair: ['寅', '巳'], label: '六害' },
  { pair: ['卯', '辰'], label: '六害' },
  { pair: ['申', '亥'], label: '六害' },
  { pair: ['酉', '戌'], label: '六害' },
]);

/** 地支六破。 */
export const BRANCH_BREAKS: readonly PairEntry<Branch>[] = Object.freeze([
  { pair: ['子', '酉'], label: '六破' },
  { pair: ['卯', '午'], label: '六破' },
  { pair: ['辰', '丑'], label: '六破' },
  { pair: ['未', '戌'], label: '六破' },
  { pair: ['寅', '亥'], label: '六破' },
  { pair: ['巳', '申'], label: '六破' },
]);

export const STEM_CONTROL_LABEL = '剋';
export const STEM_PRODUCE_LABEL = '生';

// ─── predicates ────────────────────────────────────────────────────────────────

export function isStem(c: unknown): c is Stem {
  return typeof c === 'string' && (STEMS as readonly string[]).includes(c);
}

export function isBranch(c: unknown): c is Branch {
  return typeof c === 'string' && (BRANCHES as readonly string[]).includes(c);
}

/** Split a 干支 string into stem + branch; throws on anything that is not one of the 60 甲子. */
export function parseGanZhi(ganZhi: string): { stem: Stem; branch: Branch } {
  const chars = typeof ganZhi === 'string' ? [...ganZhi] : [];
  const [stem, branch] = chars;
  if (chars.length !== 2 || !isStem(stem) || !isBranch(branch)) {
    throw new Error(`parseGanZhi: invalid 干支 ${JSON.stringify(ganZhi)}`);
  }
  if (STEMS.indexOf(stem) % 2 !== BRANCHES.indexOf(branch) % 2) {
    throw new Error(`parseGanZhi: ${ganZhi} is not one of the 60 甲子 (yin/yang mismatch)`);
  }
  return { stem, branch };
}

function findPair<C extends string>(table: readonly PairEntry<C>[], a: C, b: C): PairEntry<C> | null {
  for (const e of table) {
    if ((e.pair[0] === a && e.pair[1] === b) || (e.pair[0] === b && e.pair[1] === a)) return e;
  }
  return null;
}

/** 天干五合：回傳合化五行，無合回 null。 */
export function stemCombine(a: Stem, b: Stem): Element | null {
  return findPair(STEM_COMBINATIONS, a, b)?.element ?? null;
}
export function stemsClash(a: Stem, b: Stem): boolean {
  return findPair(STEM_CLASHES, a, b) !== null;
}
/** a 剋 b（依五行）。 */
export function stemControls(a: Stem, b: Stem): boolean {
  return ELEMENT_CONTROLS[STEM_ELEMENT[a]] === STEM_ELEMENT[b];
}
/** a 生 b（依五行）。 */
export function stemProduces(a: Stem, b: Stem): boolean {
  return ELEMENT_PRODUCES[STEM_ELEMENT[a]] === STEM_ELEMENT[b];
}
/** 地支六合：回傳五行，無合回 null。 */
export function branchHarmony(a: Branch, b: Branch): Element | null {
  return findPair(BRANCH_HARMONIES, a, b)?.element ?? null;
}
export function branchesClash(a: Branch, b: Branch): boolean {
  return findPair(BRANCH_CLASHES, a, b) !== null;
}
export function branchesHarm(a: Branch, b: Branch): boolean {
  return findPair(BRANCH_HARMS, a, b) !== null;
}
export function branchesBreak(a: Branch, b: Branch): boolean {
  return findPair(BRANCH_BREAKS, a, b) !== null;
}

// ─── finders over placed characters ──────────────────────────────────────────

export interface Placed<C extends string = string> {
  /** Unique position key, e.g. 'natal.day' or 'year'. */
  key: string;
  char: C;
}

export type RelationKind =
  | 'stemCombine'
  | 'stemClash'
  | 'stemControl'
  | 'stemProduce'
  | 'branchHarmony'
  | 'branchClash'
  | 'branchTrine'
  | 'branchDirectional'
  | 'branchPunishment'
  | 'branchHarm'
  | 'branchBreak';

export interface RelationHit<C extends string = string> {
  relation: RelationKind;
  /** Members in table order (directed relations: [actor, receiver]). */
  members: Placed<C>[];
  /** Neutral relation label (e.g. '六沖', '半合水局'). */
  label: string;
  /** false for 半合 / 三刑缺一. */
  complete: boolean;
  /** Element produced (合化／局), where the relation defines one. */
  element?: Element;
  /** 'self' for 自刑, 'mutual' for 子卯, 'set' for 三刑, 'directed' for 生剋. */
  variant?: string;
}

function assertUniqueKeys(items: readonly Placed[]): void {
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.key)) throw new Error(`relations: duplicate position key ${it.key}`);
    seen.add(it.key);
  }
}

function pairs<C extends string>(items: readonly Placed<C>[]): [Placed<C>, Placed<C>][] {
  const out: [Placed<C>, Placed<C>][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) out.push([items[i], items[j]]);
  }
  return out;
}

/** Pair hits against an unordered pair table; members returned in table order. */
function pairTableHits<C extends string>(
  items: readonly Placed<C>[],
  table: readonly PairEntry<C>[],
  relation: RelationKind,
  variant?: string,
): RelationHit<C>[] {
  assertUniqueKeys(items);
  const out: RelationHit<C>[] = [];
  for (const [a, b] of pairs(items)) {
    const e = findPair(table, a.char, b.char);
    if (!e) continue;
    const members = e.pair[0] === a.char ? [a, b] : [b, a];
    const hit: RelationHit<C> = { relation, members, label: e.label, complete: true };
    if (e.element) hit.element = e.element;
    if (variant) hit.variant = variant;
    out.push(hit);
  }
  return out;
}

/** All combinations picking one item per set member (cartesian product), in set order. */
function setCombos<C extends string>(items: readonly Placed<C>[], set: readonly C[]): Placed<C>[][] {
  let combos: Placed<C>[][] = [[]];
  for (const c of set) {
    const matches = items.filter((it) => it.char === c);
    if (matches.length === 0) return [];
    const next: Placed<C>[][] = [];
    for (const combo of combos) for (const m of matches) next.push([...combo, m]);
    combos = next;
  }
  return combos;
}

function setTableHits<C extends string>(
  items: readonly Placed<C>[],
  table: readonly SetEntry<C>[],
  relation: RelationKind,
  variant?: string,
): RelationHit<C>[] {
  assertUniqueKeys(items);
  const out: RelationHit<C>[] = [];
  for (const e of table) {
    const full = setCombos(items, e.set);
    for (const members of full) {
      const hit: RelationHit<C> = { relation, members, label: e.label, complete: true };
      if (e.element) hit.element = e.element;
      if (variant) hit.variant = variant;
      out.push(hit);
    }
    for (const pp of e.partialPairs ?? []) {
      for (const members of setCombos(items, pp)) {
        const keys = members.map((m) => m.key);
        const subsumed = full.some((f) => keys.every((k) => f.some((m) => m.key === k)));
        if (subsumed) continue;
        const hit: RelationHit<C> = { relation, members, label: e.partialLabel ?? e.label, complete: false };
        if (e.element) hit.element = e.element;
        if (variant) hit.variant = variant;
        out.push(hit);
      }
    }
  }
  return out;
}

export function findStemCombines(items: readonly Placed<Stem>[]): RelationHit<Stem>[] {
  return pairTableHits(items, STEM_COMBINATIONS, 'stemCombine');
}

export function findStemClashes(items: readonly Placed<Stem>[]): RelationHit<Stem>[] {
  return pairTableHits(items, STEM_CLASHES, 'stemClash');
}

/** 天干相剋（依五行）；members = [剋者, 受剋者]。 */
export function findStemControls(items: readonly Placed<Stem>[]): RelationHit<Stem>[] {
  assertUniqueKeys(items);
  const out: RelationHit<Stem>[] = [];
  for (const [a, b] of pairs(items)) {
    if (stemControls(a.char, b.char)) out.push({ relation: 'stemControl', members: [a, b], label: STEM_CONTROL_LABEL, complete: true, variant: 'directed' });
    else if (stemControls(b.char, a.char)) out.push({ relation: 'stemControl', members: [b, a], label: STEM_CONTROL_LABEL, complete: true, variant: 'directed' });
  }
  return out;
}

/** 天干相生（依五行）；members = [生者, 受生者]。 */
export function findStemProductions(items: readonly Placed<Stem>[]): RelationHit<Stem>[] {
  assertUniqueKeys(items);
  const out: RelationHit<Stem>[] = [];
  for (const [a, b] of pairs(items)) {
    if (stemProduces(a.char, b.char)) out.push({ relation: 'stemProduce', members: [a, b], label: STEM_PRODUCE_LABEL, complete: true, variant: 'directed' });
    else if (stemProduces(b.char, a.char)) out.push({ relation: 'stemProduce', members: [b, a], label: STEM_PRODUCE_LABEL, complete: true, variant: 'directed' });
  }
  return out;
}

export function findBranchHarmonies(items: readonly Placed<Branch>[]): RelationHit<Branch>[] {
  return pairTableHits(items, BRANCH_HARMONIES, 'branchHarmony');
}

export function findBranchClashes(items: readonly Placed<Branch>[]): RelationHit<Branch>[] {
  return pairTableHits(items, BRANCH_CLASHES, 'branchClash');
}

/** 三合（complete）與半合（complete=false）。 */
export function findBranchTrines(items: readonly Placed<Branch>[]): RelationHit<Branch>[] {
  return setTableHits(items, BRANCH_TRINES, 'branchTrine');
}

export function findBranchDirectionals(items: readonly Placed<Branch>[]): RelationHit<Branch>[] {
  return setTableHits(items, BRANCH_DIRECTIONALS, 'branchDirectional');
}

/** 三刑（含缺一）、子卯相刑、自刑。 */
export function findBranchPunishments(items: readonly Placed<Branch>[]): RelationHit<Branch>[] {
  const out = [
    ...setTableHits(items, BRANCH_PUNISHMENT_SETS, 'branchPunishment', 'set'),
    ...pairTableHits(items, BRANCH_MUTUAL_PUNISHMENTS, 'branchPunishment', 'mutual'),
  ];
  for (const [a, b] of pairs(items)) {
    if (a.char === b.char && SELF_PUNISHMENT_BRANCHES.includes(a.char)) {
      out.push({ relation: 'branchPunishment', members: [a, b], label: SELF_PUNISHMENT_LABEL, complete: true, variant: 'self' });
    }
  }
  return out;
}

export function findBranchHarms(items: readonly Placed<Branch>[]): RelationHit<Branch>[] {
  return pairTableHits(items, BRANCH_HARMS, 'branchHarm');
}

export function findBranchBreaks(items: readonly Placed<Branch>[]): RelationHit<Branch>[] {
  return pairTableHits(items, BRANCH_BREAKS, 'branchBreak');
}
