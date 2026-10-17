/** @fileoverview Transparent two-person comparison built from two standard reports. */

import { analyze, VERSION, type AnalyzeInput, type Report } from './analyze';
import type { BirthData } from './models/BirthData';
import type { Component, SystemResult } from './models/SystemResult';
import type { BaziElementsValue } from '../engines/baziTypes';
import type { NumerologyNumberValue } from '../engines/numerologyTypes';
import type { MingGuaValue, MingGuaDirectionsValue } from '../engines/mingGuaTypes';

// Opaque local report view; exact category reads below use existing producer contracts.
// These type-only projections preserve legacy values without runtime validation.
type ComparisonComponent = Omit<Component, 'value'> & { value: unknown };
type ComparisonEngine = Pick<SystemResult, 'engineId'> & { components: ComparisonComponent[] };
type ComparisonReport = Pick<Report, 'input'> & { engines: ComparisonEngine[] };
type ComparisonElements = Partial<Pick<BaziElementsValue, 'counts' | 'total'>>;
type ComparisonLifePath = Pick<NumerologyNumberValue, 'number'>;
type ComparisonGua = Pick<MingGuaValue, 'group' | 'name' | 'groupName'>;
type ComparisonDirections = Partial<Pick<MingGuaDirectionsValue, 'auspicious'>>;

export const COMPATIBILITY_SCHEMA_VERSION = 1;

const ELEMENTS = Object.freeze(['木', '火', '土', '金', '水']);
const NUMBER_THEMES: Readonly<Record<string, string>> = Object.freeze({
  1: '自主與啟動', 2: '協調與合作', 3: '表達與創作', 4: '結構與穩定', 5: '變化與自由',
  6: '責任與照顧', 7: '分析與內省', 8: '執行與資源', 9: '整合與同理',
  11: '直覺與啟發', 22: '願景與建構', 33: '關懷與傳遞',
});

function engine(report: ComparisonReport, id: string): ComparisonEngine | undefined {
  return report.engines.find(item => item.engineId === id);
}

function component(report: ComparisonReport, engineId: string, category: string): ComparisonComponent | undefined {
  return engine(report, engineId)?.components.find(item => item.category === category);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function shares(report: ComparisonReport): Record<string, number> | null {
  const elements = component(report, 'bazi', 'elements');
  if (!(elements?.value as ComparisonElements | null | undefined)?.counts || !(elements!.value as ComparisonElements).total!) return null;
  return Object.fromEntries(ELEMENTS.map(element => [element, (elements!.value as ComparisonElements).counts![element as keyof BaziElementsValue['counts']] / (elements!.value as ComparisonElements).total! * 100]));
}

function buildElementComparison(first: ComparisonReport, second: ComparisonReport) {
  const a = shares(first);
  const b = shares(second);
  if (!a || !b) {
    return {
      available: false,
      axes: [],
      overallComplement: null,
      overallFriction: null,
      limitation: '至少一方時辰不確定，因此不比較八字五行。',
    };
  }

  const axes = ELEMENTS.map(element => {
    const combinedShare = (a[element] + b[element]) / 2;
    // Complement rewards a combined profile close to an even 20% per element.
    const complement = clamp(100 - Math.abs(combinedShare - 20) * 5);
    // Friction only represents shared over-concentration, not ordinary difference.
    const friction = clamp(Math.max(0, combinedShare - 20) * 5);
    return {
      label: element,
      firstShare: Math.round(a[element] * 10) / 10,
      secondShare: Math.round(b[element] * 10) / 10,
      combinedShare: Math.round(combinedShare * 10) / 10,
      complement,
      friction,
    };
  });
  const average = (key: 'complement' | 'friction') => Math.round(axes.reduce((sum, axis) => sum + axis[key], 0) / axes.length);
  return {
    available: true,
    axes,
    overallComplement: average('complement'),
    overallFriction: average('friction'),
    formula: {
      complement: '100 − |雙方平均占比 − 20| × 5',
      friction: 'max(0, 雙方平均占比 − 20) × 5',
    },
    limitation: '五行比較使用出現次數占比，只描述共同分布，不等同合婚吉凶、旺衰或喜用神。',
  };
}

function buildNumerology(first: ComparisonReport, second: ComparisonReport) {
  const firstPath = component(first, 'numerology', 'lifePath');
  const secondPath = component(second, 'numerology', 'lifePath');
  if (!firstPath || !secondPath) return { available: false as const };
  const a: number = (firstPath.value as ComparisonLifePath).number;
  const b: number = (secondPath.value as ComparisonLifePath).number;
  const distance = Math.abs(a - b);
  const dynamic = a === b ? '同頻' : distance <= 2 ? '鄰近節奏' : '差異互補';
  return {
    available: true as const,
    first: { number: a, theme: NUMBER_THEMES[a] ?? '個人節奏' },
    second: { number: b, theme: NUMBER_THEMES[b] ?? '個人節奏' },
    distance,
    dynamic,
    text: a === b
      ? `兩人的生命靈數同為 ${a}，在「${NUMBER_THEMES[a]}」上較容易使用相近語言，也需留意共同盲點。`
      : `生命靈數 ${a}（${NUMBER_THEMES[a]}）與 ${b}（${NUMBER_THEMES[b]}）呈現${dynamic}；可觀察彼此如何分工，而不是把差異視為不合。`,
    limitation: '數字距離只是透明的分類規則，沒有科學上的關係預測效力。',
  };
}

function buildMingGua(first: ComparisonReport, second: ComparisonReport) {
  const firstGua = component(first, 'minggua', 'mingGua');
  const secondGua = component(second, 'minggua', 'mingGua');
  const firstDirections = component(first, 'minggua', 'directions');
  const secondDirections = component(second, 'minggua', 'directions');
  if (!firstGua || !secondGua) return { available: false as const };
  const sameGroup = (firstGua.value as ComparisonGua).group === (secondGua.value as ComparisonGua).group;
  const firstAuspicious = new Set(Object.values((firstDirections?.value as ComparisonDirections | null | undefined)?.auspicious ?? {}).map(item => item.zh));
  const secondAuspicious = new Set(Object.values((secondDirections?.value as ComparisonDirections | null | undefined)?.auspicious ?? {}).map(item => item.zh));
  const sharedDirections = [...firstAuspicious].filter(direction => secondAuspicious.has(direction));
  return {
    available: true as const,
    first: { name: (firstGua.value as ComparisonGua).name, group: (firstGua.value as ComparisonGua).groupName },
    second: { name: (secondGua.value as ComparisonGua).name, group: (secondGua.value as ComparisonGua).groupName },
    sameGroup,
    sharedDirections,
    text: sameGroup
      ? `兩人同屬${(firstGua.value as ComparisonGua).groupName}，空間偏好較容易找到共同方向${sharedDirections.length ? `（${sharedDirections.join('、')}）` : ''}。`
      : `兩人分屬${(firstGua.value as ComparisonGua).groupName}與${(secondGua.value as ComparisonGua).groupName}；可用各自工作／休息區域調整，不必把方位差異解讀成關係不合。`,
    limitation: '八宅分組只作空間偏好參考，不是關係品質評分。',
  };
}

function personSummary(report: ComparisonReport, label: string) {
  const lifePath: number | null = (component(report, 'numerology', 'lifePath')?.value as ComparisonLifePath | null | undefined)?.number ?? null;
  const gua = (component(report, 'minggua', 'mingGua')?.value as ComparisonGua | null | undefined) ?? null;
  return {
    label,
    name: report.input.name || label,
    input: report.input,
    lifePath,
    mingGua: gua ? `${gua.name}卦 · ${gua.groupName}` : null,
  };
}

/** Result of {@link analyzeCompatibility}. */
export type CompatibilityResult = ReturnType<typeof analyzeCompatibility>;

export function analyzeCompatibility(
  firstInput: AnalyzeInput | BirthData,
  secondInput: AnalyzeInput | BirthData,
  { asOf = null }: { asOf?: Date | string | null } = {},
) {
  const firstReport = analyze(firstInput, { asOf });
  const secondReport = analyze(secondInput, { asOf: firstReport.asOf });
  const elements = buildElementComparison(firstReport, secondReport);
  const numerology = buildNumerology(firstReport, secondReport);
  const minggua = buildMingGua(firstReport, secondReport);
  const strongestComplement = elements.available
    ? [...elements.axes].sort((a, b) => b.complement - a.complement)[0]
    : null;
  const strongestFriction = elements.available
    ? [...elements.axes].sort((a, b) => b.friction - a.friction)[0]
    : null;

  return {
    version: VERSION,
    schemaVersion: COMPATIBILITY_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    asOf: firstReport.asOf,
    people: [personSummary(firstReport, 'A'), personSummary(secondReport, 'B')],
    elements,
    numerology,
    minggua,
    narrative: {
      strength: strongestComplement
        ? `共同五行分布中，「${strongestComplement.label}」最接近均衡基準，可視為較容易互相補位的觀察軸。`
        : '八字資料不足，未產生五行互補敘事。',
      watchpoint: (strongestFriction?.friction as number) > 0
        ? `「${strongestFriction!.label}」呈現共同偏高，互動中可留意同一種做法被重複放大的情況。`
        : '沒有任何五行出現共同過度集中的量化訊號。',
      limitations: [
        '合盤只比較兩份報告的既有數值，不預測關係成敗，也不取代溝通與共同經驗。',
        elements.limitation,
        numerology.limitation,
        minggua.limitation,
      ].filter(Boolean),
    },
  };
}
