/**
 * `ZiweiRuleChart`: the strongly-typed view of ZiweiEngine output that the
 * ziwei rules consume (V1-11). Built purely from engine components — this module
 * never imports iztro or the engine itself (D-016).
 *
 * Period dates (大限 / 流年) are derived from the chart's own data:
 *   - Birth lunar year comes from `natal_summary.lunarDate` (e.g. 一九九一年…).
 *   - 虛歲 n ↔ lunar year (birthLunarYear + n − 1); a lunar year Y spans
 *     春節(Y) … 春節(Y+1) − 1 day when `options.lunarNewYear` supplies 春節 dates
 *     (V1-05: `calculators/ziwei/toZiweiRuleChart`). Without it — or for a year it
 *     cannot resolve — the Gregorian year boundary is used as a fallback
 *     (`${Y}-01-01 … ${Y}-12-31`), the pre-V1-05 approximation.
 *   - 流年 year is recovered from its 干支 (the year nearest the component's asOf).
 *   - Multi-year 流年 and 流月 sequences are not engine components; they are
 *     passed in via `options.sequences` (chart-level ids such as 'liuNian_2027').
 */

export type MutagenKind = '祿' | '權' | '科' | '忌';
export const MUTAGEN_ORDER: readonly MutagenKind[] = ['祿', '權', '科', '忌'];

export interface ZiweiStar {
  name: string;
  kind: 'major' | 'minor';
  /** Raw brightness string (廟旺得利平不陷) or '' when the engine has none. */
  brightness: string;
  /** Engine-normalized brightness (BRIGHTNESS_WEIGHTS ÷ 7, D-005) or null. */
  brightnessScore: number | null;
  /** Birth-year 四化 on this star, if any. */
  mutagen: MutagenKind | null;
}

export interface ZiweiPalace {
  /** Engine component id, e.g. 'palace_3'. */
  componentId: string;
  /** 0–11, earthly-branch order starting at 寅. */
  index: number;
  name: string;
  earthlyBranch: string;
  isBodyPalace: boolean;
  stars: ZiweiStar[];
}

export interface ZiweiPeriod {
  /** Engine component id, e.g. 'daXian_4' or 'flyingStars_yearly'. */
  componentId: string;
  label: string;
  /** Natal palace index that serves as this period's 命宮. */
  palaceIndex: number;
  heavenlyStem: string;
  earthlyBranch: string;
  /** Star name per 四化, or null if the engine could not provide it. */
  mutagen: Record<MutagenKind, string> | null;
  /** ISO dates; null when the birth year is unknown. */
  start: string | null;
  end: string | null;
  /** Lunar year of a 流年 / 流月 period (null / absent for 大限). */
  lunarYear?: number | null;
  /** Lunar month 1–12 of a 流月 period. */
  lunarMonth?: number;
}

export interface ZiweiRuleChart {
  /** Lunar birth year (base for 虛歲), or null when not derivable. */
  birthLunarYear: number | null;
  /** Always 12 palaces, sorted by index. */
  palaces: ZiweiPalace[];
  /** Major-star name → 'mainStar_<name>' component id. */
  mainStarComponentIds: Record<string, string>;
  /** 四化 kind → 'mutagen_<kind>' component id (birth-year 四化). */
  natalMutagenComponentIds: Partial<Record<MutagenKind, string>>;
  /** Full 大限 sequence, sorted by start age. */
  decades: ZiweiPeriod[];
  /** 流年 at the engine's asOf (component `flyingStars_yearly`). */
  yearly: ZiweiPeriod | null;
  /** 流年 sequence (V1-05), sorted by lunar year; [] when not supplied. */
  yearlySequence: ZiweiPeriod[];
  /** 流月 sequence (V1-05), sorted by start; [] when not supplied. */
  monthlySequence: ZiweiPeriod[];
  /** Every component id seen plus the ids of supplied sequences, for evidence validation. */
  componentIds: string[];
}

/** Minimal shape of an engine component (SystemResult.components[n]). */
export interface ZiweiComponentLike {
  id: string;
  category?: string;
  value?: any;
}

export interface FromZiweiComponentsOptions {
  /** Override the lunar birth year (otherwise parsed from natal_summary.lunarDate). */
  birthLunarYear?: number;
  /**
   * 春節 ISO date of a lunar year (null if unknown). When given, 大限 / 流年
   * spans use lunar-year boundaries instead of the Gregorian approximation.
   */
  lunarNewYear?: (lunarYear: number) => string | null;
  /** Flow sequences not present as engine components (V1-05). */
  sequences?: { yearly?: readonly ZiweiPeriod[]; monthly?: readonly ZiweiPeriod[] };
}

const CN_DIGITS: Record<string, number> = {
  〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

/** Parse the 4-digit lunar year from iztro's lunarDate ('一九九一年八月廿八'). */
export function parseLunarYear(lunarDate: unknown): number | null {
  if (typeof lunarDate !== 'string') return null;
  const m = /^(\S{4})年/.exec(lunarDate);
  if (!m) return null;
  let year = 0;
  for (const ch of m[1]) {
    const d = CN_DIGITS[ch] ?? (/[0-9]/.test(ch) ? Number(ch) : undefined);
    if (d === undefined) return null;
    year = year * 10 + d;
  }
  return year;
}

const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';

/** Gregorian year whose 干支 is stem+branch, nearest to (≤ 1 year before) `nearYear`. */
export function yearOfGanZhi(stem: string, branch: string, nearYear: number): number | null {
  const s = STEMS.indexOf(stem);
  const b = BRANCHES.indexOf(branch);
  if (s < 0 || b < 0) return null;
  for (const y of [nearYear, nearYear - 1, nearYear + 1]) {
    if ((((y - 4) % 10) + 10) % 10 === s && (((y - 4) % 12) + 12) % 12 === b) return y;
  }
  return null;
}

function toMutagen(v: unknown): MutagenKind | null {
  return v === '祿' || v === '權' || v === '科' || v === '忌' ? v : null;
}

function toMutagenRecord(v: unknown): Record<MutagenKind, string> | null {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((x) => typeof x === 'string' && x)) return null;
  return { 祿: v[0], 權: v[1], 科: v[2], 忌: v[3] };
}

function toStar(raw: any, kind: 'major' | 'minor'): ZiweiStar {
  return {
    name: String(raw?.name ?? ''),
    kind,
    brightness: typeof raw?.brightness === 'string' ? raw.brightness : '',
    brightnessScore: typeof raw?.brightnessScore === 'number' ? raw.brightnessScore : null,
    mutagen: toMutagen(raw?.mutagen),
  };
}

const pad4 = (y: number) => String(y).padStart(4, '0');

/** ISO date `days` after `iso` (UTC arithmetic, host-zone independent). */
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/** ISO span of lunar years [from, to]: precise when 春節 dates resolve, else Gregorian fallback. */
function lunarYearSpan(
  from: number,
  to: number,
  lunarNewYear: FromZiweiComponentsOptions['lunarNewYear'],
): { start: string; end: string } {
  const startLny = lunarNewYear?.(from) ?? null;
  const nextLny = lunarNewYear?.(to + 1) ?? null;
  return {
    start: startLny ?? `${pad4(from)}-01-01`,
    end: nextLny !== null ? addDaysIso(nextLny, -1) : `${pad4(to)}-12-31`,
  };
}

/**
 * Build a `ZiweiRuleChart` from ZiweiEngine components (the `components` array of
 * its SystemResult). Throws when the 12 palaces are not all present — e.g. the
 * engine skipped the chart because the birth time is unknown.
 */
export function fromZiweiComponents(
  components: readonly ZiweiComponentLike[],
  options: FromZiweiComponentsOptions = {},
): ZiweiRuleChart {
  const palaces: ZiweiPalace[] = [];
  const mainStarComponentIds: Record<string, string> = {};
  const natalMutagenComponentIds: Partial<Record<MutagenKind, string>> = {};
  const decadeRaw: { c: ZiweiComponentLike; start: number }[] = [];
  let natal: any = null;
  let yearlyRaw: ZiweiComponentLike | null = null;

  for (const c of components) {
    const v = c.value ?? {};
    switch (c.category) {
      case 'natal':
        if (c.id === 'natal_summary') natal = v;
        break;
      case 'palaces':
        palaces.push({
          componentId: c.id,
          index: v.index,
          name: v.name,
          earthlyBranch: v.earthlyBranch,
          isBodyPalace: Boolean(v.isBodyPalace),
          stars: [
            ...(v.majorStars ?? []).map((s: any) => toStar(s, 'major')),
            ...(v.minorStars ?? []).map((s: any) => toStar(s, 'minor')),
          ],
        });
        break;
      case 'mainStars':
        if (typeof v.star === 'string') mainStarComponentIds[v.star] = c.id;
        break;
      case 'fourTransforms': {
        const k = toMutagen(v.mutagen);
        if (k) natalMutagenComponentIds[k] = c.id;
        break;
      }
      case 'daXian':
        if (Array.isArray(v.range)) decadeRaw.push({ c, start: v.range[0] });
        break;
      case 'flyingStars':
        if (c.id === 'flyingStars_yearly') yearlyRaw = c;
        break;
      default:
        break;
    }
  }

  palaces.sort((a, b) => a.index - b.index);
  if (palaces.length !== 12 || palaces.some((p, i) => p.index !== i)) {
    throw new Error(`fromZiweiComponents: expected 12 palaces indexed 0–11, got ${palaces.length}`);
  }

  const birthLunarYear = options.birthLunarYear ?? parseLunarYear(natal?.lunarDate);

  const decades: ZiweiPeriod[] = decadeRaw
    .sort((a, b) => a.start - b.start)
    .map(({ c }) => {
      const v = c.value;
      const [s, e] = v.range as [number, number];
      const span = birthLunarYear !== null ? lunarYearSpan(birthLunarYear + s - 1, birthLunarYear + e - 1, options.lunarNewYear) : null;
      return {
        componentId: c.id,
        label: `第${v.index}大限（虛歲 ${s}–${e}）`,
        palaceIndex: v.palaceIndex,
        heavenlyStem: v.heavenlyStem,
        earthlyBranch: v.earthlyBranch,
        mutagen: toMutagenRecord(v.mutagen),
        start: span?.start ?? null,
        end: span?.end ?? null,
      };
    });

  let yearly: ZiweiPeriod | null = null;
  if (yearlyRaw) {
    const v = yearlyRaw.value;
    const asOfYear = typeof v.asOf === 'string' ? Number(v.asOf.slice(0, 4)) : NaN;
    const y = Number.isFinite(asOfYear) ? yearOfGanZhi(v.heavenlyStem, v.earthlyBranch, asOfYear) : null;
    const span = y !== null ? lunarYearSpan(y, y, options.lunarNewYear) : null;
    yearly = {
      componentId: yearlyRaw.id,
      label: `${v.heavenlyStem}${v.earthlyBranch}流年${y !== null ? `（${y}）` : ''}`,
      palaceIndex: v.palaceIndex,
      heavenlyStem: v.heavenlyStem,
      earthlyBranch: v.earthlyBranch,
      mutagen: toMutagenRecord(v.mutagen),
      start: span?.start ?? null,
      end: span?.end ?? null,
      lunarYear: y,
    };
  }

  const yearlySequence = [...(options.sequences?.yearly ?? [])].sort((a, b) => (a.lunarYear ?? 0) - (b.lunarYear ?? 0));
  const monthlySequence = [...(options.sequences?.monthly ?? [])].sort((a, b) =>
    (a.start ?? '') < (b.start ?? '') ? -1 : (a.start ?? '') > (b.start ?? '') ? 1 : 0,
  );
  const ids = [
    ...components.map((c) => c.id),
    ...yearlySequence.map((p) => p.componentId),
    ...monthlySequence.map((p) => p.componentId),
  ];

  return {
    birthLunarYear,
    palaces,
    mainStarComponentIds,
    natalMutagenComponentIds,
    decades,
    yearly,
    yearlySequence,
    monthlySequence,
    componentIds: [...new Set(ids)].sort(),
  };
}

/** Index arithmetic for 三方四正 (valid because palace index follows branch order). */
export const oppositeOf = (i: number) => (i + 6) % 12;
export const trinesOf = (i: number): [number, number] => [(i + 4) % 12, (i + 8) % 12];
