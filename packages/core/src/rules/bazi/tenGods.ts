/**
 * 十神（V1-10b）：任一天干（及地支藏干）相對日主的十神關係，純查表函式。
 *
 * 只描述「是哪一種十神」，不含任何定性判斷（D-028）；十神 → 領域／特徵的權重在
 * tenGodCatalog.json。
 *
 * 規則（子平通例）：以日主五行為「我」，
 * - 同我：比肩（同陰陽）／劫財（異陰陽）
 * - 我生：食神（同）／傷官（異）
 * - 我剋：偏財（同）／正財（異）
 * - 剋我：七殺（同）／正官（異）
 * - 生我：偏印（同）／正印（異）
 *
 * 地支藏干表（本氣、中氣、餘氣）與 lunar-javascript `LunarUtil.ZHI_HIDE_GAN`
 * （即舊版 BaZiEngine 的十神計數）相同；巳取「丙庚戊」、申取「庚壬戊」。
 */
import {
  ELEMENT_CONTROLS,
  ELEMENT_PRODUCES,
  STEMS,
  STEM_ELEMENT,
  type Branch,
  type Stem,
} from './relations';

export const TEN_GODS = ['比肩', '劫財', '食神', '傷官', '偏財', '正財', '七殺', '正官', '偏印', '正印'] as const;
export type TenGod = (typeof TEN_GODS)[number];

export const TEN_GOD_GROUPS = ['比劫', '食傷', '財星', '官殺', '印星'] as const;
export type TenGodGroup = (typeof TEN_GOD_GROUPS)[number];

export const TEN_GOD_GROUP_OF: Readonly<Record<TenGod, TenGodGroup>> = Object.freeze({
  比肩: '比劫', 劫財: '比劫',
  食神: '食傷', 傷官: '食傷',
  偏財: '財星', 正財: '財星',
  七殺: '官殺', 正官: '官殺',
  偏印: '印星', 正印: '印星',
});

export const GROUP_MEMBERS: Readonly<Record<TenGodGroup, readonly [TenGod, TenGod]>> = Object.freeze({
  比劫: ['比肩', '劫財'],
  食傷: ['食神', '傷官'],
  財星: ['偏財', '正財'],
  官殺: ['七殺', '正官'],
  印星: ['偏印', '正印'],
});

/** 陽干：甲丙戊庚壬（STEMS 偶數索引）。 */
export function isYangStem(stem: Stem): boolean {
  return STEMS.indexOf(stem) % 2 === 0;
}

/** `stem` 相對日主 `dayMaster` 的十神。 */
export function tenGodOf(dayMaster: Stem, stem: Stem): TenGod {
  const me = STEM_ELEMENT[dayMaster];
  const it = STEM_ELEMENT[stem];
  if (!me || !it) throw new Error(`tenGodOf: invalid stem ${JSON.stringify(dayMaster)} / ${JSON.stringify(stem)}`);
  const same = isYangStem(dayMaster) === isYangStem(stem);
  if (it === me) return same ? '比肩' : '劫財';
  if (ELEMENT_PRODUCES[me] === it) return same ? '食神' : '傷官';
  if (ELEMENT_CONTROLS[me] === it) return same ? '偏財' : '正財';
  if (ELEMENT_CONTROLS[it] === me) return same ? '七殺' : '正官';
  return same ? '偏印' : '正印';
}

export function tenGodGroupOf(dayMaster: Stem, stem: Stem): TenGodGroup {
  return TEN_GOD_GROUP_OF[tenGodOf(dayMaster, stem)];
}

export const HIDDEN_ROLES = ['main', 'middle', 'residual'] as const;
/** main＝本氣、middle＝中氣、residual＝餘氣。 */
export type HiddenRole = (typeof HIDDEN_ROLES)[number];

export const HIDDEN_ROLE_LABEL: Readonly<Record<HiddenRole, string>> = Object.freeze({
  main: '本氣',
  middle: '中氣',
  residual: '餘氣',
});

/** 地支藏干（依序：本氣、中氣、餘氣）。 */
export const HIDDEN_STEMS: Readonly<Record<Branch, readonly Stem[]>> = Object.freeze({
  子: ['癸'],
  丑: ['己', '癸', '辛'],
  寅: ['甲', '丙', '戊'],
  卯: ['乙'],
  辰: ['戊', '乙', '癸'],
  巳: ['丙', '庚', '戊'],
  午: ['丁', '己'],
  未: ['己', '丁', '乙'],
  申: ['庚', '壬', '戊'],
  酉: ['辛'],
  戌: ['戊', '辛', '丁'],
  亥: ['壬', '甲'],
});

export interface HiddenStem {
  stem: Stem;
  role: HiddenRole;
}

export function hiddenStemsOf(branch: Branch): HiddenStem[] {
  const list = HIDDEN_STEMS[branch];
  if (!list) throw new Error(`hiddenStemsOf: invalid branch ${JSON.stringify(branch)}`);
  return list.map((stem, i) => ({ stem, role: HIDDEN_ROLES[i] }));
}

export interface BranchTenGod extends HiddenStem {
  tenGod: TenGod;
  group: TenGodGroup;
}

/** 地支各藏干相對日主的十神（依本氣、中氣、餘氣排序）。 */
export function branchTenGods(dayMaster: Stem, branch: Branch): BranchTenGod[] {
  return hiddenStemsOf(branch).map((h) => {
    const tenGod = tenGodOf(dayMaster, h.stem);
    return { ...h, tenGod, group: TEN_GOD_GROUP_OF[tenGod] };
  });
}

/** 地支本氣十神。 */
export function branchMainTenGod(dayMaster: Stem, branch: Branch): TenGod {
  return tenGodOf(dayMaster, HIDDEN_STEMS[branch][0]);
}
