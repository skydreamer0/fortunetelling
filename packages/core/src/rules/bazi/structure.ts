/**
 * 八字原局結構事實層（#64 限定切片，內部使用）。
 *
 * 從四柱干支與既有藏干表（`tenGods.ts::HIDDEN_STEMS`）推導純結構事實：
 * - 月令（月支）與其藏干本氣／中氣／餘氣；
 * - 透干：四柱天干等於任一地支藏干者，記錄天干柱位、地支柱位與藏干角色；
 * - 通根：四柱天干 × 地支，地支藏干含同五行者，只記錄角色與柱位；
 * - 鄰接：六組柱位對是否相鄰（年月、月日、日時相鄰）；
 * - 干支關係：沿用 `relations.ts` 的 find* 命中原樣複製，另附 `transformation: 'not_evaluated'`。
 *
 * 明確不做：
 * - 不分根之強弱、不給權重、不判斷身強弱或旺衰；
 * - 不判定合化：`element` 只是關係表上的合化／局五行標示，`transformation`
 *   恆為 'not_evaluated'，不能讀成「已化」；
 * - 不判斷格局成立或破格（#32）；
 * - 不接入 Report、MCP、web 或公開 barrel。
 *
 * 藏干順序依本 repo `HIDDEN_STEMS` 慣例（巳取丙庚戊、申取庚壬戊）；部分典籍排序不同，
 * 本層不對此做選擇。`schema` 為暫定識別，#27 定案後遷移。
 */
import {
  findBranchBreaks,
  findBranchClashes,
  findBranchDirectionals,
  findBranchHarmonies,
  findBranchHarms,
  findBranchPunishments,
  findBranchTrines,
  findStemClashes,
  findStemCombines,
  findStemControls,
  findStemProductions,
  parseGanZhi,
  STEM_ELEMENT,
  type Branch,
  type Element,
  type Placed,
  type RelationHit,
  type Stem,
} from './relations';
import { hiddenStemsOf, type HiddenRole, type HiddenStem } from './tenGods';

export const BAZI_NATAL_STRUCTURE_SCHEMA = 'bazi.natalStructure.provisional.v0' as const;

export const PILLAR_POSITIONS = ['year', 'month', 'day', 'hour'] as const;
export type PillarPosition = (typeof PILLAR_POSITIONS)[number];

/** 四柱干支字串（與 `BaziPillars` 同形）。 */
export type BaziPillarStrings = Readonly<Record<PillarPosition, string>>;

export interface BaziStructurePillar {
  position: PillarPosition;
  stem: Stem;
  branch: Branch;
  hiddenStems: HiddenStem[];
}

export interface BaziRevealedStem {
  /** 透出的天干。 */
  stem: Stem;
  stemPosition: PillarPosition;
  /** 藏有此干的地支與其柱位。 */
  branch: Branch;
  branchPosition: PillarPosition;
  role: HiddenRole;
}

export interface BaziStemRoot {
  stem: Stem;
  stemPosition: PillarPosition;
  element: Element;
  branch: Branch;
  branchPosition: PillarPosition;
  /** 地支中同五行的藏干。 */
  hiddenStem: Stem;
  role: HiddenRole;
}

export interface BaziPillarAdjacency {
  a: PillarPosition;
  b: PillarPosition;
  adjacent: boolean;
}

export type BaziStructureRelation = (RelationHit<Stem> | RelationHit<Branch>) & {
  domain: 'stem' | 'branch';
  /** 本層不判定合化；恆為 'not_evaluated'。 */
  transformation: 'not_evaluated';
};

export interface BaziNatalStructure {
  schema: typeof BAZI_NATAL_STRUCTURE_SCHEMA;
  dayMaster: Stem;
  pillars: BaziStructurePillar[];
  monthBranch: { branch: Branch; hiddenStems: HiddenStem[] };
  revealed: BaziRevealedStem[];
  roots: BaziStemRoot[];
  adjacency: BaziPillarAdjacency[];
  relations: BaziStructureRelation[];
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

/** 由四柱干支建立原局結構事實；同輸入恆得同輸出，回傳值深度凍結。 */
export function buildBaziNatalStructure(source: BaziPillarStrings): BaziNatalStructure {
  const pillars: BaziStructurePillar[] = PILLAR_POSITIONS.map((position) => {
    const { stem, branch } = parseGanZhi(source[position]);
    return { position, stem, branch, hiddenStems: hiddenStemsOf(branch) };
  });
  const byPosition = (p: PillarPosition) => pillars[PILLAR_POSITIONS.indexOf(p)];
  const month = byPosition('month');

  const revealed: BaziRevealedStem[] = [];
  const roots: BaziStemRoot[] = [];
  for (const s of pillars) {
    const element = STEM_ELEMENT[s.stem];
    for (const b of pillars) {
      for (const h of b.hiddenStems) {
        if (h.stem === s.stem) {
          revealed.push({ stem: s.stem, stemPosition: s.position, branch: b.branch, branchPosition: b.position, role: h.role });
        }
        if (STEM_ELEMENT[h.stem] === element) {
          roots.push({
            stem: s.stem, stemPosition: s.position, element,
            branch: b.branch, branchPosition: b.position, hiddenStem: h.stem, role: h.role,
          });
        }
      }
    }
  }

  const adjacency: BaziPillarAdjacency[] = [];
  for (let i = 0; i < PILLAR_POSITIONS.length; i++) {
    for (let j = i + 1; j < PILLAR_POSITIONS.length; j++) {
      adjacency.push({ a: PILLAR_POSITIONS[i], b: PILLAR_POSITIONS[j], adjacent: j - i === 1 });
    }
  }

  const stems: Placed<Stem>[] = pillars.map((p) => ({ key: p.position, char: p.stem }));
  const branches: Placed<Branch>[] = pillars.map((p) => ({ key: p.position, char: p.branch }));
  const stemHits = [findStemCombines, findStemClashes, findStemControls, findStemProductions].flatMap((f) => f(stems));
  const branchHits = [
    findBranchHarmonies, findBranchClashes, findBranchTrines, findBranchDirectionals,
    findBranchPunishments, findBranchHarms, findBranchBreaks,
  ].flatMap((f) => f(branches));
  const relations: BaziStructureRelation[] = [
    ...stemHits.map((hit) => ({ ...structuredClone(hit), domain: 'stem' as const, transformation: 'not_evaluated' as const })),
    ...branchHits.map((hit) => ({ ...structuredClone(hit), domain: 'branch' as const, transformation: 'not_evaluated' as const })),
  ];

  return freezeDeep({
    schema: BAZI_NATAL_STRUCTURE_SCHEMA,
    dayMaster: byPosition('day').stem,
    pillars,
    monthBranch: { branch: month.branch, hiddenStems: month.hiddenStems.map((h) => ({ ...h })) },
    revealed,
    roots,
    adjacency,
    relations,
  });
}
