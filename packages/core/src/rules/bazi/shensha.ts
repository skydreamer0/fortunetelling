/**
 * 神煞查表（V1-10b）：驛馬、桃花、財庫，以及外部地支與神煞位置的關係判定。純函式。
 *
 * 只回答「哪一支是驛馬／桃花／財庫」與「外部地支與它構成哪種關係」，不含定性判斷（D-028）。
 *
 * 慣例（子平通例；catalog 亦有記載）：
 * - 驛馬：以年支或日支所屬三合局，取「局之長生支」的對沖支。
 *   申子辰→寅、寅午戌→申、巳酉丑→亥、亥卯未→巳。
 * - 桃花（咸池）：以年支或日支所屬三合局，取「局之沐浴支」。
 *   申子辰→酉、寅午戌→卯、巳酉丑→午、亥卯未→子。
 * - 財庫：日主所剋之五行（財星五行）的墓庫支。墓庫取長生十二宮的「墓」：
 *   木墓未、火墓戌、金墓丑、水墓辰；土依子平「土隨水」（水土同宮）墓於辰。
 *   故 甲乙→辰（土）、丙丁→丑（金）、戊己→辰（水）、庚辛→未（木）、壬癸→戌（火）。
 */
import {
  BRANCH_CLASHES,
  BRANCH_HARMONIES,
  BRANCH_MUTUAL_PUNISHMENTS,
  BRANCH_PUNISHMENT_SETS,
  BRANCH_TRINES,
  ELEMENT_CONTROLS,
  STEM_ELEMENT,
  type Branch,
  type Element,
  type Stem,
} from './relations';

function trineOf(branch: Branch): readonly Branch[] {
  const t = BRANCH_TRINES.find((e) => e.set.includes(branch));
  if (!t) throw new Error(`shensha: invalid branch ${JSON.stringify(branch)}`);
  return t.set;
}

/** 三合局（以局首之長生支為 key）→ 驛馬。 */
export const YIMA_BY_TRINE: Readonly<Record<string, Branch>> = Object.freeze({
  申子辰: '寅',
  寅午戌: '申',
  巳酉丑: '亥',
  亥卯未: '巳',
});

/** 三合局 → 桃花（咸池）。 */
export const TAOHUA_BY_TRINE: Readonly<Record<string, Branch>> = Object.freeze({
  申子辰: '酉',
  寅午戌: '卯',
  巳酉丑: '午',
  亥卯未: '子',
});

/** 五行墓庫（長生十二宮之墓；土隨水）。 */
export const ELEMENT_TOMB: Readonly<Record<Element, Branch>> = Object.freeze({
  木: '未',
  火: '戌',
  土: '辰',
  金: '丑',
  水: '辰',
});

export function yimaOf(branch: Branch): Branch {
  return YIMA_BY_TRINE[trineOf(branch).join('')];
}

export function taohuaOf(branch: Branch): Branch {
  return TAOHUA_BY_TRINE[trineOf(branch).join('')];
}

/** 日主的財星五行（日主所剋）。 */
export function wealthElementOf(dayMaster: Stem): Element {
  const e = STEM_ELEMENT[dayMaster];
  if (!e) throw new Error(`wealthElementOf: invalid stem ${JSON.stringify(dayMaster)}`);
  return ELEMENT_CONTROLS[e];
}

/** 財庫：財星五行的墓庫支。 */
export function caikuOf(dayMaster: Stem): Branch {
  return ELEMENT_TOMB[wealthElementOf(dayMaster)];
}

function inPairs(pairs: readonly { pair: readonly [Branch, Branch] }[], a: Branch, b: Branch): boolean {
  return pairs.some((e) => (e.pair[0] === a && e.pair[1] === b) || (e.pair[0] === b && e.pair[1] === a));
}

export function branchesClashEachOther(a: Branch, b: Branch): boolean {
  return inPairs(BRANCH_CLASHES, a, b);
}

export function branchesHarmonize(a: Branch, b: Branch): boolean {
  return inPairs(BRANCH_HARMONIES, a, b);
}

/** 兩個不同地支相刑（寅巳申／丑戌未任兩支、子卯）；自刑以「同支出現」另計。 */
export function branchesPunish(a: Branch, b: Branch): boolean {
  if (a === b) return false;
  if (inPairs(BRANCH_MUTUAL_PUNISHMENTS, a, b)) return true;
  return BRANCH_PUNISHMENT_SETS.some((s) => s.set.includes(a) && s.set.includes(b));
}

/** 外部地支觸動神煞位置的方式。 */
export const ACTIVATIONS = ['clash', 'appear', 'punish', 'combine'] as const;
export type Activation = (typeof ACTIVATIONS)[number];

/**
 * 外部地支 `external` 與神煞支 `target` 的關係，依 `allowed` 的順序取第一個成立者
 * （同一對地支可能同時沖與刑，例如丑未，只取優先者）。
 */
export function activationOf(external: Branch, target: Branch, allowed: readonly Activation[]): Activation | null {
  for (const a of allowed) {
    if (a === 'appear' && external === target) return a;
    if (a === 'clash' && branchesClashEachOther(external, target)) return a;
    if (a === 'punish' && branchesPunish(external, target)) return a;
    if (a === 'combine' && branchesHarmonize(external, target)) return a;
  }
  return null;
}
