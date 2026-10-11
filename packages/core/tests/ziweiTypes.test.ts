import { expect, test } from 'bun:test';
import type { astro } from 'iztro';
import type { Language } from 'iztro/lib/data/types';
import { BirthData } from '../src/core/models/BirthData';
import { SystemResult } from '../src/core/models/SystemResult';
import { ZiweiEngine } from '../src/engines/ZiweiEngine';
import type { SerializedStar as LegacyStar, SerializedPalaceFacet as LegacyFacet } from '../src/engines/ZiweiEngine';
import type {
  SerializedStar, SerializedPalaceFacet, ZiweiComponent, ZiweiMetadata, ZiweiUnavailableMetadata,
  ZiweiDaXianValue, ZiweiPalaceValue, ZiweiXiaoXianValue, ZiweiFlyingStarsValue,
} from '../src/engines/ziweiTypes';

// These checks compile in the workspace typecheck, including widening probes.
type Assert<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Category = ZiweiComponent['category'];
type Part<C extends Category> = Extract<ZiweiComponent, { category: C }>;
type MissingFieldAccepted<T> = { [K in keyof T]-?: Omit<T, K> extends T ? K : never }[keyof T];
type BadValueCategories = { [C in Category]:
  null extends Part<C>['value'] ? C : undefined extends Part<C>['value'] ? C :
  string extends Part<C>['value'] ? C : MissingFieldAccepted<Part<C>['value']>
}[Category];
export type RequiredPayloads = Assert<Equal<BadValueCategories, never>>;
export type ExactCategories = Assert<Equal<Category,
  'natal' | 'palaces' | 'mainStars' | 'fourTransforms' | 'soulVsBody' |
  'sanFangSiZheng' | 'daXian' | 'xiaoXian' | 'flyingStars'>>;
export type ExactIds = Assert<Equal<{ [C in Category]: Part<C>['id'] }, {
  natal: 'natal_summary'; palaces: `palace_${number}`; mainStars: `mainStar_${string}`;
  fourTransforms: `mutagen_${string}`; soulVsBody: 'context_soul_vs_body';
  sanFangSiZheng: 'context_sanfang_soul' | 'context_sanfang_body';
  daXian: `daXian_${number}`; xiaoXian: 'xiaoXian_current'; flyingStars: 'flyingStars_yearly';
}>>;
export type PreserveStarExport = Assert<Equal<LegacyStar, SerializedStar>>;
export type PreserveFacetExport = Assert<Equal<LegacyFacet, SerializedPalaceFacet>>;
export type PreserveLocalizedMutagen = Assert<Equal<SerializedStar['mutagen'], string | null>>;
export type PreserveMainStarMutagen = Assert<Equal<Part<'mainStars'>['value']['mutagen'], string | null>>;
export type PreserveTransformMutagen = Assert<Equal<Part<'fourTransforms'>['value']['mutagen'], string>>;
export type PreserveBrightness = Assert<Equal<SerializedStar['brightness'], string>>;
export type PreserveBrightnessScore = Assert<Equal<SerializedStar['brightnessScore'], number | null>>;
export type PreserveDecadalRange = Assert<Equal<ZiweiPalaceValue['decadalRange'], [number, number] | null>>;
export type PreserveDaXianRange = Assert<Equal<ZiweiDaXianValue['range'], [number, number]>>;
export type PreserveDaXianMutagen = Assert<Equal<ZiweiDaXianValue['mutagen'], string[] | null>>;
export type PreserveFlyingMutagen = Assert<Equal<ZiweiFlyingStarsValue['mutagen'], string[]>>;
export type PreserveNominalAge = Assert<Equal<ZiweiXiaoXianValue['nominalAge'], number | null>>;
export type RequiredStar = Assert<Equal<MissingFieldAccepted<SerializedStar>, never>>;
export type RequiredFacet = Assert<Equal<MissingFieldAccepted<SerializedPalaceFacet>, never>>;
export type ExactMetadata = Assert<Equal<keyof ZiweiMetadata,
  'solarDate' | 'lunarDate' | 'chineseDate' | 'time' | 'fiveElementsClass' | 'copyright'>>;
export type MetadataStrings = Assert<Equal<ZiweiMetadata[keyof ZiweiMetadata], string>>;
export type UnavailableMessage = Assert<Equal<ZiweiUnavailableMetadata['unavailableMessage'], string>>;
export type RequiredMetadata = Assert<Equal<MissingFieldAccepted<ZiweiMetadata>, never>>;
export type RequiredUnavailable = Assert<Equal<MissingFieldAccepted<ZiweiUnavailableMetadata>, never>>;
export type ExactUnavailableReason = Assert<Equal<ZiweiUnavailableMetadata['unavailableReason'], 'unknown-time'>>;
export type RejectUnavailableAsMetadata = Assert<Equal<ZiweiUnavailableMetadata extends ZiweiMetadata ? true : false, false>>;
export type RejectMetadataAsUnavailable = Assert<Equal<ZiweiMetadata extends ZiweiUnavailableMetadata ? true : false, false>>;

export function payloadIdentity(component: ZiweiComponent): string | number | boolean {
  switch (component.category) {
    case 'natal': return component.value.soul;
    case 'palaces': return component.value.index;
    case 'mainStars': return component.value.star;
    case 'fourTransforms': return component.value.mutagen;
    case 'soulVsBody': return component.value.samePalace;
    case 'sanFangSiZheng': return component.value.anchor;
    case 'daXian': return component.value.range[0];
    case 'xiaoXian': return component.value.asOf;
    case 'flyingStars': return component.value.heavenlyStem;
    default: { const exhaustive: never = component; return exhaustive; }
  }
}

const INPUT = { year: 1991, month: 10, day: 5, hour: 14, gender: 'female' as const };
const ASOF = '2026-07-11';
const expectedBrightnessWeights: Record<string, number> = { 廟: 1, 旺: 0.86, 得: 0.71, 利: 0.57, 平: 0.43, 不: 0.29, 陷: 0.14 };
// Captured from the unchanged legacy producer before adding the contracts.
const vector = [
  {
    "id": "natal_summary",
    "name": "命盤總覽",
    "category": "natal",
    "value": {
      "soul": "祿存",
      "body": "天相",
      "fiveElementsClass": "木三局",
      "zodiac": "羊",
      "sign": "天秤座",
      "soulPalaceBranch": "寅",
      "bodyPalaceBranch": "辰",
      "lunarDate": "一九九一年八月廿八",
      "chineseDate": "辛未 丁酉 戊申 己未"
    }
  },
  {
    "id": "palace_0",
    "name": "命宮",
    "category": "palaces",
    "value": {
      "index": 0,
      "name": "命宮",
      "heavenlyStem": "庚",
      "earthlyBranch": "寅",
      "isBodyPalace": false,
      "isOriginalPalace": false,
      "decadalRange": [
        3,
        12
      ],
      "majorStars": [],
      "minorStars": [
        {
          "name": "天鉞",
          "type": "soft",
          "brightness": "",
          "brightnessScore": null,
          "mutagen": null
        }
      ],
      "adjectiveStars": [
        {
          "name": "天喜",
          "type": "flower",
          "brightness": "",
          "brightnessScore": null,
          "mutagen": null
        },
        {
          "name": "解神",
          "type": "helper",
          "brightness": "",
          "brightnessScore": null,
          "mutagen": null
        },
        {
          "name": "三台",
          "type": "adjective",
          "brightness": "",
          "brightnessScore": null,
          "mutagen": null
        }
      ]
    }
  },
  {
    "id": "mainStar_天府",
    "name": "天府",
    "category": "mainStars",
    "value": {
      "star": "天府",
      "palace": "父母",
      "palaceIndex": 1,
      "brightness": "得",
      "brightnessScore": 0.71,
      "mutagen": ""
    }
  },
  {
    "id": "mutagen_忌",
    "name": "文昌 化忌",
    "category": "fourTransforms",
    "value": {
      "star": "文昌",
      "mutagen": "忌",
      "palace": "父母",
      "palaceIndex": 1
    }
  },
  {
    "id": "context_soul_vs_body",
    "name": "命宮 vs 身宮",
    "category": "soulVsBody",
    "value": {
      "samePalace": false,
      "soul": {
        "name": "命宮",
        "index": 0,
        "earthlyBranch": "寅",
        "majorStars": []
      },
      "body": {
        "name": "福德",
        "index": 2,
        "earthlyBranch": "辰",
        "majorStars": [
          {
            "name": "太陰",
            "type": "major",
            "brightness": "陷",
            "brightnessScore": 0.14,
            "mutagen": ""
          }
        ]
      }
    }
  },
  {
    "id": "context_sanfang_soul",
    "name": "命宮三方四正",
    "category": "sanFangSiZheng",
    "value": {
      "anchor": "命宮",
      "target": {
        "name": "命宮",
        "index": 0,
        "earthlyBranch": "寅",
        "majorStars": []
      },
      "opposite": {
        "name": "遷移",
        "index": 6,
        "earthlyBranch": "申",
        "majorStars": [
          {
            "name": "天同",
            "type": "major",
            "brightness": "旺",
            "brightnessScore": 0.86,
            "mutagen": ""
          },
          {
            "name": "天梁",
            "type": "major",
            "brightness": "陷",
            "brightnessScore": 0.14,
            "mutagen": ""
          }
        ]
      },
      "wealth": {
        "name": "財帛",
        "index": 8,
        "earthlyBranch": "戌",
        "majorStars": [
          {
            "name": "太陽",
            "type": "major",
            "brightness": "不",
            "brightnessScore": 0.29,
            "mutagen": "權"
          }
        ]
      },
      "career": {
        "name": "官祿",
        "index": 4,
        "earthlyBranch": "午",
        "majorStars": [
          {
            "name": "巨門",
            "type": "major",
            "brightness": "旺",
            "brightnessScore": 0.86,
            "mutagen": "祿"
          }
        ]
      }
    }
  },
  {
    "id": "daXian_1",
    "name": "第1大限（命宮，虛歲 3–12）",
    "category": "daXian",
    "value": {
      "index": 1,
      "palaceIndex": 0,
      "palaceName": "命宮",
      "range": [
        3,
        12
      ],
      "heavenlyStem": "庚",
      "earthlyBranch": "寅",
      "mutagen": [
        "太陽",
        "武曲",
        "太陰",
        "天同"
      ],
      "isCurrent": false
    }
  },
  {
    "id": "xiaoXian_current",
    "name": "小限（虛歲 36）",
    "category": "xiaoXian",
    "value": {
      "nominalAge": 36,
      "heavenlyStem": "庚",
      "earthlyBranch": "寅",
      "palaceIndex": 0,
      "asOf": "2026-07-11"
    }
  },
  {
    "id": "flyingStars_yearly",
    "name": "流年四化",
    "category": "flyingStars",
    "value": {
      "heavenlyStem": "丙",
      "earthlyBranch": "午",
      "mutagen": [
        "天同",
        "天機",
        "文昌",
        "廉貞"
      ],
      "palaceIndex": 4,
      "asOf": "2026-07-11"
    }
  }
] satisfies ZiweiComponent[];

test('all nine actual producer categories preserve the legacy vector and metadata omission', () => {
  const result = new ZiweiEngine({ asOf: ASOF }).run(new BirthData(INPUT));
  expect(result.errors).toEqual([]);
  for (const component of vector) {
    expect(result.components.find(c => c.id === component.id)).toEqual(component);
    expect(payloadIdentity(component)).toBeDefined();
  }
  expect(vector.map(c => [c.category, result.byCategory(c.category).length])).toEqual([["natal",1],["palaces",12],["mainStars",14],["fourTransforms",4],["soulVsBody",1],["sanFangSiZheng",2],["daXian",12],["xiaoXian",1],["flyingStars",1]]);
  expect(result.components.every(c => !Object.hasOwn(c, 'meta'))).toBe(true);
  const { copyright, ...metadata } = result.meta;
  expect(metadata).toEqual({
  "solarDate": "1991-10-5",
  "lunarDate": "一九九一年八月廿八",
  "chineseDate": "辛未 丁酉 戊申 己未",
  "time": "未時",
  "fiveElementsClass": "木三局"
} satisfies Omit<ZiweiMetadata, 'copyright'>);
  expect(copyright).toStartWith('copyright © 2023-');
});

type Astrolabe = ReturnType<typeof astro.bySolar>;
class SeamEngine extends ZiweiEngine {
  calls = 0;
  constructor(private readonly change: (chart: Astrolabe) => void, language: Language = 'zh-TW') {
    super({ asOf: ASOF, language });
  }
  protected override _createAstrolabe(birth: BirthData): Astrolabe {
    this.calls++;
    const chart = super._createAstrolabe(birth);
    this.change(chart);
    return chart;
  }
}
const replace = (object: object, key: PropertyKey, value: unknown) => Object.defineProperty(object, key, { value, configurable: true, writable: true });

test('unknown birth time emits only exact unavailable metadata without creating a chart', () => {
  const engine = new SeamEngine(() => { throw new Error('must not create a chart'); });
  const result = engine.run(new BirthData({ ...INPUT, timeKnown: false }));
  expect(engine.calls).toBe(0);
  expect(result.components).toEqual([]);
  expect(result.errors).toEqual([]);
  expect(result.meta).toEqual({
    unavailableReason: 'unknown-time',
    unavailableMessage: '出生時辰不確定，因此紫微十二宮、命身宮與大限未計算。',
  } satisfies ZiweiUnavailableMetadata);
});

for (const language of ['zh-TW', 'zh-CN', 'en-US', 'ja-JP', 'ko-KR', 'vi-VN'] satisfies Language[]) {
  test("localized strings remain raw in palace, main-star and transformation producers: " + language, () => {
    let checkedStars = 0;
    let chart: Astrolabe | undefined;
    const result = new SeamEngine(value => { chart = value; }, language).run(new BirthData(INPUT));
    expect(chart).toBeDefined();
    for (const palace of chart!.palaces) {
      const emitted = result.byCategory('palaces').find(c => c.value.index === palace.index)!;
      for (const group of ['majorStars', 'minorStars', 'adjectiveStars'] as const) {
        expect(emitted.value[group]).toEqual(palace[group].map(star => ({
          name: star.name, type: star.type, brightness: star.brightness ?? '',
          brightnessScore: expectedBrightnessWeights[star.brightness ?? ''] ?? null,
          mutagen: star.mutagen ?? null,
        })));
        for (const star of palace[group]) {
          checkedStars++;
          const transformed = result.byCategory('fourTransforms').filter(c => c.value.star === star.name && c.value.palaceIndex === palace.index);
          expect(transformed.map(c => c.value.mutagen)).toEqual(star.mutagen ? [star.mutagen] : []);
          if (group === 'majorStars') expect(result.byCategory('mainStars').find(c => c.value.star === star.name)!.value.mutagen).toBe(star.mutagen ?? null);
        }
      }
    }
    expect(checkedStars).toBeGreaterThan(14);
  });
}

test('empty and nullish star fields preserve brightness defaults and falsy four-transform omission', () => {
  for (const missing of [undefined, null, '']) {
    let palaceIndex = -1, name = '';
    const result = new SeamEngine(chart => {
      const palace = chart.palaces.find(p => p.majorStars.length)!;
      const star = palace.majorStars[0];
      palaceIndex = palace.index; name = star.name;
      replace(star, 'brightness', missing); replace(star, 'mutagen', missing);
    }).run(new BirthData(INPUT));
    const main = result.byCategory('mainStars').find(c => c.value.star === name)!;
    expect(main.value).toMatchObject({ brightness: '', brightnessScore: null, mutagen: missing === '' ? '' : null });
    expect(result.byCategory('palaces').find(c => c.value.index === palaceIndex)!.value.majorStars[0]).toMatchObject({ brightness: '', brightnessScore: null, mutagen: missing === '' ? '' : null });
    expect(result.byCategory('fourTransforms').some(c => c.value.star === name && c.value.palaceIndex === palaceIndex)).toBe(false);
  }
});

test('missing decadal ranges omit only the corresponding decade and retain null palace range', () => {
  for (const missing of [undefined, null]) {
    const result = new SeamEngine(chart => { replace(chart.palaces[0], 'decadal', missing); }).run(new BirthData(INPUT));
    expect(result.byCategory('palaces')[0].value.decadalRange).toBeNull();
    expect(result.byCategory('daXian')).toHaveLength(11);
    expect(result.byCategory('daXian').some(c => c.value.palaceIndex === 0)).toBe(false);
  }
});

test('missing period objects are omitted and nullish nominal age remains null', () => {
  for (const missing of [undefined, null]) {
    const result = new SeamEngine(chart => {
      const horoscope = chart.horoscope.bind(chart);
      replace(chart, 'horoscope', (...args: Parameters<Astrolabe['horoscope']>) => {
        const period = horoscope(...args);
        replace(period, 'age', missing); replace(period, 'yearly', missing); replace(period, 'decadal', missing);
        return period;
      });
    }).run(new BirthData(INPUT));
    expect(result.byCategory('xiaoXian')).toEqual([]);
    expect(result.byCategory('flyingStars')).toEqual([]);
    expect(result.byCategory('daXian')).toHaveLength(12);
    expect(result.byCategory('daXian').every(c => c.value.mutagen === null && c.value.isCurrent === false)).toBe(true);
    expect(result.errors).toEqual([]);
    const age = new SeamEngine(chart => {
      const horoscope = chart.horoscope.bind(chart);
      replace(chart, 'horoscope', (...args: Parameters<Astrolabe['horoscope']>) => {
        const period = horoscope(...args); replace(period.age, 'nominalAge', missing); return period;
      });
    }).run(new BirthData(INPUT));
    expect(age.byCategory('xiaoXian')[0].value.nominalAge).toBeNull();
    expect(age.byCategory('xiaoXian')[0].name).toBe('小限（虛歲 ?）');
    expect(age.byCategory('daXian').every(c => !c.value.isCurrent)).toBe(true);
  }
});

test('decade mutagen preserves string-array lengths and probe failure warnings', () => {
  for (const mutagen of [[], ['raw'], ['祿', '权', 'honor', '기', 'extra'], null, undefined]) {
    const result = new SeamEngine(chart => {
      const horoscope = chart.horoscope.bind(chart);
      replace(chart, 'horoscope', (...args: Parameters<Astrolabe['horoscope']>) => {
        const period = horoscope(...args); replace(period.decadal, 'mutagen', mutagen); return period;
      });
    }).run(new BirthData(INPUT));
    expect(result.byCategory('daXian').map(c => c.value.mutagen)).toEqual(Array(12).fill(mutagen ?? null));
  }
  const failed = new SeamEngine(chart => { replace(chart, 'horoscope', () => { throw new Error('period seam'); }); }).run(new BirthData(INPUT));
  expect(failed.byCategory('natal')).toHaveLength(1);
  expect(failed.byCategory('daXian')).toHaveLength(12);
  expect(failed.byCategory('daXian').every(c => c.value.mutagen === null && !c.value.isCurrent)).toBe(true);
  expect(failed.byCategory('xiaoXian')).toEqual([]);
  expect(failed.byCategory('flyingStars')).toEqual([]);
  expect(failed.errors).toHaveLength(13);
  expect(failed.errors[0]).toBe('運限計算失敗（2026-07-11）：period seam');
  expect(failed.errors.slice(1).every(error => error.includes('四化計算失敗') && error.endsWith('period seam'))).toBe(true);
});

test('context lookup failures retain natal and time-varying components with the existing warning', () => {
  const failed = new SeamEngine(chart => { replace(chart, 'surroundedPalaces', () => { throw new Error('facet seam'); }); }).run(new BirthData(INPUT));
  expect(failed.byCategory('soulVsBody')).toHaveLength(1);
  expect(failed.byCategory('sanFangSiZheng')).toEqual([]);
  expect(failed.byCategory('flyingStars')).toHaveLength(1);
  expect(failed.errors).toEqual(['L3 情境部件計算失敗：facet seam']);
});

test('all nine legacy categories preserve generic nullish normalization and metadata omission', () => {
  for (const { category } of vector) for (const value of [undefined, null]) for (const meta of [undefined, null]) {
    const component = SystemResult.component({ category, value, meta });
    expect(component).toEqual({ id: category, name: category, category, value: null });
    expect(Object.hasOwn(component, 'meta')).toBe(false);
  }
});
