/**
 * @fileoverview Rule-based, cross-system plain-language chart summary.
 *
 * SummaryBuilder only interprets existing engine components. It does not run
 * new divination calculations, and every sentence carries the exact source
 * components that produced it so downstream UIs can keep the report auditable.
 *
 * @module analysis/SummaryBuilder
 */

import type { Component, SystemResultLike } from '../core/models/SystemResult';

/** Version of the summary payload shape and wording rules. */
export const SUMMARY_VERSION = 1;

/** Engine lookup result: absent when that engine did not run. */
type EngineLike = SystemResultLike | undefined;

const ELEMENT_ORDER = Object.freeze(['木', '火', '土', '金', '水']);

const DAY_MASTER_TRAITS: Readonly<Record<string, string>> = Object.freeze({
  木: '重視生長與延展，通常會先看事情如何向前推進',
  火: '反應直接而有帶動力，常用熱度與行動打開局面',
  土: '先穩住局面、承接責任，也重視能否長期落地',
  金: '重視界線、品質與判準，習慣替複雜問題整理秩序',
  水: '擅長觀察流動與變化，常從資訊、連結與彈性找到空間',
});

const STAR_TRAITS: Readonly<Record<string, string>> = Object.freeze({
  紫微: '統籌與主導感',
  天機: '觀察、策畫與應變力',
  太陽: '公開承擔與照應他人的傾向',
  武曲: '執行、取捨與資源意識',
  天同: '包容、感受與追求和諧的氣質',
  廉貞: '原則感與自我轉化的張力',
  天府: '穩健、管理與守成能力',
  太陰: '細膩、內省與安全感需求',
  貪狼: '好奇、社交與多元體驗的動力',
  巨門: '辨析、提問與表達能力',
  天相: '協調、規範與顧全局面的能力',
  天梁: '保護、原則與照顧他人的傾向',
  七殺: '決斷、承壓與突破慣性的動力',
  破軍: '重組、改革與重新開局的動力',
});

const LIFE_PATH_TRAITS: Readonly<Record<string, string>> = Object.freeze({
  1: '自主、開創與把想法化成第一步',
  2: '感受、協作與在關係中找到平衡',
  3: '表達、創意與讓氣氛流動起來',
  4: '結構、秩序與把事情穩定完成',
  5: '自由、探索與回應變化',
  6: '責任、照顧與對品質的要求',
  7: '內省、研究與追問事物本質',
  8: '目標、資源整合與成果意識',
  9: '同理、理想與較大的公共視角',
  11: '直覺、啟發與把敏銳感受傳達出去',
  22: '把長期願景拆成可落地的結構',
  33: '以照顧、教導與服務凝聚他人',
});

export interface SummarySource {
  engineId: string;
  engineName: string;
  componentId: string;
  componentName: string;
}

export interface SummarySentence {
  id: string;
  text: string;
  layer: 'L0';
  sources: SummarySource[];
}

export interface Summary {
  version: number;
  sentences: SummarySentence[];
  sourceSystems: string[];
  limitations: string[];
}

/** Return every component in a category, tolerant of serialized results. */
function componentsByCategory(engine: EngineLike, category: string): Component[] {
  if (!Array.isArray(engine?.components)) return [];
  return engine.components.filter(component => component?.category === category);
}

/** Return the first component in a category. */
function componentByCategory(engine: EngineLike, category: string): Component | null {
  return componentsByCategory(engine, category)[0] ?? null;
}

/** Build the small, stable source reference stored beside every sentence. */
function sourceRef(engine: EngineLike, component: Component): SummarySource {
  // Only called once a component was found, so the engine is present.
  return {
    engineId: engine!.engineId,
    engineName: engine!.engineName ?? engine!.engineId,
    componentId: component.id,
    componentName: component.name ?? component.category,
  };
}

/** Remove duplicate source references without losing their display order. */
function uniqueSources(sources: SummarySource[]): SummarySource[] {
  const seen = new Set<string>();
  return sources.filter(source => {
    const key = `${source.engineId}:${source.componentId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Prefer brighter stars, then retain source order for stars without scores. */
function featuredStars(stars: any): any[] {
  if (!Array.isArray(stars)) return [];
  return stars
    .filter((star: any) => typeof star?.name === 'string' && star.name.length > 0)
    .map((star: any, index: number) => ({ ...star, _sourceIndex: index }))
    .sort((a: any, b: any) => {
      const scoreA = typeof a.brightnessScore === 'number' ? a.brightnessScore : -1;
      const scoreB = typeof b.brightnessScore === 'number' ? b.brightnessScore : -1;
      return scoreB - scoreA || a._sourceIndex - b._sourceIndex;
    })
    .slice(0, 2);
}

function starTraitPhrase(stars: { name: string }[]): string {
  const traits = stars.map(star => STAR_TRAITS[star.name]).filter(Boolean);
  return [...new Set(traits)].join('，也帶有');
}

function buildDayMasterSentence(engine: EngineLike): SummarySentence | null {
  const component = componentByCategory(engine, 'dayMaster');
  const { stem, element, yinYang } = component?.value ?? {};
  const trait = DAY_MASTER_TRAITS[element];
  if (!component || !stem || !element || !trait) return null;

  const expression = yinYang === '陰'
    ? '陰性意象讓這份力量較含蓄，往往先在細節與持續投入中顯現'
    : yinYang === '陽'
      ? '陽性意象讓這份力量較外放，遇事通常更願意先承擔或推進'
      : '';

  return {
    id: 'bazi_day_master',
    text: `以八字的${stem}${element}日主作為核心意象，你較可能${trait}${expression ? `；${expression}` : ''}。`,
    layer: 'L0',
    sources: [sourceRef(engine, component)],
  };
}

function fallbackPalaceFacet(
  engine: EngineLike,
  name: string,
  predicate: (facet: any) => boolean = () => false,
): { component: Component; facet: any } | null {
  const component = componentsByCategory(engine, 'palaces')
    .find(item => item?.value?.name === name || predicate(item?.value));
  if (!component) return null;
  return { component, facet: component.value };
}

function buildZiweiSentence(engine: EngineLike): SummarySentence | null {
  const soulVsBody = componentByCategory(engine, 'soulVsBody');
  const soulFallback = fallbackPalaceFacet(engine, '命宮');
  const bodyFallback = fallbackPalaceFacet(engine, '', palace => palace?.isBodyPalace === true);
  const soul = soulVsBody?.value?.soul ?? soulFallback?.facet ?? null;
  const body = soulVsBody?.value?.body ?? bodyFallback?.facet ?? null;
  if (!soul) return null;

  const directStars = featuredStars(soul.majorStars);
  const sources = soulVsBody
    ? [sourceRef(engine, soulVsBody)]
    : [soulFallback, bodyFallback]
      .filter(Boolean)
      .map(item => sourceRef(engine, item!.component));

  let text = '';
  if (directStars.length > 0) {
    const names = directStars.map(star => star.name).join('、');
    const traits = starTraitPhrase(directStars);
    text = `紫微命宮見${names}，這組星曜為外在氣質添上${traits || '一組可供觀察的行動線索'}`;
  } else {
    const sanFang = componentsByCategory(engine, 'sanFangSiZheng')
      .find(component => component?.value?.anchor === '命宮');
    const opposite = sanFang?.value?.opposite;
    const borrowedStars = featuredStars(opposite?.majorStars);
    if (borrowedStars.length === 0) return null;

    const names = borrowedStars.map(star => star.name).join('、');
    const traits = starTraitPhrase(borrowedStars);
    text = `紫微命宮本身無主星，這裡改以對宮${opposite.name ?? ''}的${names}作為參考，呈現${traits || '可供觀察的性格線索'}；這是借宮閱讀，不等同命宮直接坐星`;
    sources.push(sourceRef(engine, sanFang!));
  }

  if (body) {
    const samePalace = soulVsBody?.value?.samePalace === true || soul.index === body.index;
    const bodyStars = featuredStars(body.majorStars);
    if (samePalace) {
      text += '。命身同宮時，內在設定與實際投入的方向通常較一致';
    } else if (bodyStars.length > 0) {
      const bodyNames = bodyStars.map(star => star.name).join('、');
      const bodyTraits = starTraitPhrase(bodyStars);
      text += `；身宮在${body.name ?? '另一宮位'}並見${bodyNames}，實際投入時還會帶出${bodyTraits || '另一層行動方式'}`;
    }
  }

  return {
    id: 'ziwei_soul_body',
    text: `${text}。`,
    layer: 'L0',
    sources: uniqueSources(sources),
  };
}

function buildLifePathSentence(engine: EngineLike): SummarySentence | null {
  const component = componentByCategory(engine, 'lifePath');
  const number = component?.value?.number;
  const trait = LIFE_PATH_TRAITS[number];
  if (!component || !trait) return null;

  const masterNote = component.value.isMaster ? '，也是主數，通常會放大這項主題的要求與潛力' : '';
  return {
    id: 'numerology_life_path',
    text: `生命靈數 ${number} 把人生主題拉向${trait}${masterNote}；它適合當作反覆核對的成長方向，而不是單一性格標籤。`,
    layer: 'L0',
    sources: [sourceRef(engine, component)],
  };
}

function percentage(count: number, total: number): number {
  return Math.round((count / total) * 100);
}

function buildElementDistributionSentence(engine: EngineLike): SummarySentence | null {
  const component = componentByCategory(engine, 'elements');
  const rawCounts = component?.value?.counts;
  if (!component || !rawCounts || typeof rawCounts !== 'object') return null;

  const counts = ELEMENT_ORDER.map(element => ({
    element,
    count: Number.isFinite(rawCounts[element]) ? rawCounts[element] : 0,
  }));
  const computedTotal = counts.reduce((sum, item) => sum + item.count, 0);
  const total = Number.isFinite(component.value.total) && component.value.total > 0
    ? component.value.total
    : computedTotal;
  if (!(total > 0)) return null;

  const maxCount = Math.max(...counts.map(item => item.count));
  const minCount = Math.min(...counts.map(item => item.count));
  const dominant = counts.filter(item => item.count === maxCount).map(item => item.element).join('、');
  const sparse = counts.filter(item => item.count === minCount).map(item => item.element).join('、');

  const distribution = maxCount === minCount
    ? '五種元素的出現次數相對平均'
    : `${dominant}較集中（${percentage(maxCount, total)}%），${sparse}${minCount === 0 ? '未出現' : `較少（${percentage(minCount, total)}%）`}`;

  return {
    id: 'bazi_element_distribution',
    text: `在八字五行「出現次數」這把量尺上，${distribution}；這能提示你觀察慣用與較少動用的面向，但不等同旺衰、喜用神或吉凶判定。`,
    layer: 'L0',
    sources: [sourceRef(engine, component)],
  };
}

/**
 * Assemble a 3–5 sentence overview from the strongest available L0 features.
 * Missing systems are skipped without inventing replacement content.
 */
export class SummaryBuilder {
  static build(systemResults: SystemResultLike[]): Summary {
    const engines = Array.isArray(systemResults) ? systemResults.filter(Boolean) : [];
    const byId = new Map(engines.map(engine => [engine.engineId, engine]));

    const candidates = [
      buildDayMasterSentence(byId.get('bazi')),
      buildZiweiSentence(byId.get('ziwei')),
      buildLifePathSentence(byId.get('numerology')),
      buildElementDistributionSentence(byId.get('bazi')),
    ].filter(Boolean) as SummarySentence[];

    const sentences = candidates.slice(0, 5);
    const sourceSystems = [...new Set(
      sentences.flatMap(sentence => sentence.sources.map(source => source.engineId)),
    )];

    return {
      version: SUMMARY_VERSION,
      sentences,
      sourceSystems,
      limitations: [
        '本段為既有命盤部件的規則式交叉整理，不是新增計算。',
        ...(sentences.some(sentence => sentence.id === 'bazi_element_distribution')
          ? ['五行採出現次數呈現，未宣稱旺衰或喜用神。']
          : []),
      ],
    };
  }
}
