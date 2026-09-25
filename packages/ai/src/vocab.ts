/**
 * Anti re-derivation vocabulary (V5-04, ARCHITECTURE-V2 §9 後驗證 2).
 *
 * Any of these terms appearing in model output must also appear in the payload;
 * otherwise the model has computed (or hallucinated) chart facts on its own.
 * Lists are closed data; extend by adding entries (never regex heuristics on
 * single characters — 子／午 etc. are too common in ordinary Chinese).
 */

export type VocabKind = 'ganzhi' | 'star' | 'palace' | 'planet' | 'nakshatra' | 'sign';

export interface VocabEntry {
  kind: VocabKind;
  /** Surface form searched in model output. */
  term: string;
  /** Forms accepted as "present in payload" (any one suffices). */
  accept: string[];
  /** Latin terms: matched on word boundaries, case-insensitive. */
  latin?: boolean;
}

export const HEAVENLY_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
export const EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

/** The 60 甲子 in cycle order. */
export const SEXAGENARY: readonly string[] = Object.freeze(
  Array.from({ length: 60 }, (_, i) => HEAVENLY_STEMS[i % 10] + EARTHLY_BRANCHES[i % 12]),
);

/** 紫微 14 main stars. */
export const ZIWEI_MAIN_STARS = [
  '紫微', '天機', '太陽', '武曲', '天同', '廉貞', '天府',
  '太陰', '貪狼', '巨門', '天相', '天梁', '七殺', '破軍',
] as const;

/** Common 紫微 minor / auxiliary / adjective stars and 四化. */
export const ZIWEI_MINOR_STARS = [
  '文昌', '文曲', '左輔', '右弼', '天魁', '天鉞', '祿存', '天馬',
  '擎羊', '陀羅', '火星', '鈴星', '地空', '地劫',
  '化祿', '化權', '化科', '化忌',
  '紅鸞', '天喜', '天姚', '天刑', '咸池', '孤辰', '寡宿', '天哭', '天虛',
  '龍池', '鳳閣', '台輔', '封誥', '三台', '八座', '恩光', '天貴', '天官', '天福',
  '天巫', '天月', '陰煞', '解神', '華蓋', '蜚廉', '天壽', '截空', '旬空',
  '祿馬交馳',
  // Deliberately omitted (ordinary words): 天空 天才 破碎 博士 力士 青龍 將軍 官府 …
] as const;

/**
 * 12 palaces. `accept` lists the forms seen in charts (the engine writes both
 * "財帛宮" and bare "財帛" inside 三方四正). Bare forms of 兄弟／夫妻／子女／父母
 * are ordinary words, so only the 「…宮」 form is searched for those.
 */
export const ZIWEI_PALACES: ReadonlyArray<{ term: string; bare?: string }> = [
  { term: '命宮' },
  { term: '身宮' },
  { term: '兄弟宮', bare: '兄弟' },
  { term: '夫妻宮', bare: '夫妻' },
  { term: '子女宮', bare: '子女' },
  { term: '財帛宮', bare: '財帛' },
  { term: '疾厄宮', bare: '疾厄' },
  { term: '遷移宮', bare: '遷移' },
  { term: '交友宮', bare: '交友' },
  { term: '僕役宮', bare: '僕役' },
  { term: '官祿宮', bare: '官祿' },
  { term: '事業宮', bare: '事業' },
  { term: '田宅宮', bare: '田宅' },
  { term: '福德宮', bare: '福德' },
  { term: '父母宮', bare: '父母' },
];
/** Bare palace names distinctive enough to search on their own. */
const DISTINCT_BARE_PALACES = new Set(['財帛', '疾厄', '官祿', '田宅', '福德', '僕役']);

/** Planets (中文). 太陽／火星 overlap with 紫微 stars; de-duplicated below. */
export const PLANETS_ZH = [
  '太陽', '月亮', '水星', '金星', '火星', '木星', '土星', '天王星', '海王星', '冥王星', '羅睺', '計都',
] as const;
export const PLANETS_LATIN = [
  'Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
  'Rahu', 'Ketu', 'Surya', 'Chandra', 'Mangala', 'Budha', 'Shukra', 'Shani',
] as const;

/** 27 nakshatras (common transliterations). */
export const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha',
  'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha',
  'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha',
  'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati',
] as const;

/** Zodiac signs (中文, both 牡羊／白羊 spellings). */
export const ZODIAC_SIGNS_ZH = [
  '牡羊座', '白羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座', '室女座',
  '天秤座', '天蠍座', '射手座', '人馬座', '摩羯座', '山羊座', '水瓶座', '寶瓶座', '雙魚座',
] as const;

function buildVocab(): VocabEntry[] {
  const out: VocabEntry[] = [];
  const seen = new Set<string>();
  const add = (e: VocabEntry) => {
    if (seen.has(e.term)) return;
    seen.add(e.term);
    out.push(e);
  };
  for (const gz of SEXAGENARY) add({ kind: 'ganzhi', term: gz, accept: [gz] });
  for (const s of [...ZIWEI_MAIN_STARS, ...ZIWEI_MINOR_STARS]) add({ kind: 'star', term: s, accept: [s] });
  for (const p of ZIWEI_PALACES) {
    add({ kind: 'palace', term: p.term, accept: p.bare ? [p.term, p.bare] : [p.term] });
    if (p.bare && DISTINCT_BARE_PALACES.has(p.bare)) add({ kind: 'palace', term: p.bare, accept: [p.bare] });
  }
  for (const p of PLANETS_ZH) add({ kind: 'planet', term: p, accept: [p] });
  for (const p of PLANETS_LATIN) add({ kind: 'planet', term: p, accept: [p], latin: true });
  for (const n of NAKSHATRAS) add({ kind: 'nakshatra', term: n, accept: [n], latin: true });
  for (const z of ZODIAC_SIGNS_ZH) add({ kind: 'sign', term: z, accept: [z] });
  return out;
}

export const VOCAB: readonly VocabEntry[] = Object.freeze(buildVocab());

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const LATIN_RE = new Map<string, RegExp>();
function latinRe(term: string): RegExp {
  let re = LATIN_RE.get(term);
  if (!re) {
    re = new RegExp(`\\b${escapeRe(term).replace(/ /g, '\\s+')}\\b`, 'i');
    LATIN_RE.set(term, re);
  }
  return re;
}

/** Vocabulary terms that occur in `text`. */
export function findVocabTerms(text: string, vocab: readonly VocabEntry[] = VOCAB): VocabEntry[] {
  return vocab.filter((e) => (e.latin ? latinRe(e.term).test(text) : text.includes(e.term)));
}

/**
 * The "known facts" corpus of a payload: its canonical JSON (lower-cased copy
 * for Latin terms) plus 干支 formed by adjacent `heavenlyStem`+`earthlyBranch`
 * fields (紫微 palaces store them separately).
 */
export interface VocabCorpus {
  text: string;
  lower: string;
  extra: Set<string>;
}

export function buildCorpus(payloadJson: string, payload: unknown): VocabCorpus {
  const extra = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.heavenlyStem === 'string' && typeof o.earthlyBranch === 'string') {
        extra.add(o.heavenlyStem + o.earthlyBranch);
      }
      if (typeof o.stem === 'string' && typeof o.branch === 'string') extra.add(o.stem + o.branch);
      Object.values(o).forEach(walk);
    }
  };
  walk(payload);
  return { text: payloadJson, lower: payloadJson.toLowerCase(), extra };
}

export function isInCorpus(entry: VocabEntry, corpus: VocabCorpus): boolean {
  return entry.accept.some((a) =>
    entry.latin ? corpus.lower.includes(a.toLowerCase()) : corpus.text.includes(a) || corpus.extra.has(a),
  );
}
