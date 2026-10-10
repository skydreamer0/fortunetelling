/** Internal contracts for the legacy Ziwei producer (#21).
 * Reuse calculator shapes without adopting its Traditional-Chinese-only
 * mutagen normalization: this producer preserves localized strings and ''.
 */
import type {
  ZiweiDecade, ZiweiNatalTransformation, ZiweiPalace, ZiweiStar, ZiweiYearly,
} from '../calculators/ziwei/types';

/** Compact star shape used in palace / facet components. */
export interface SerializedStar extends Omit<ZiweiStar, 'mutagen'> {
  mutagen: string | null;
}

/** Compact palace shape used by the L3 facets. */
export interface SerializedPalaceFacet extends Pick<ZiweiPalace, 'name' | 'index'> {
  earthlyBranch: ZiweiPalace['branch'];
  majorStars: SerializedStar[];
}

export interface ZiweiNatalValue {
  soul: string;
  body: string;
  fiveElementsClass: string;
  zodiac: string;
  sign: string;
  soulPalaceBranch: string;
  bodyPalaceBranch: string;
  lunarDate: string;
  chineseDate: string;
}

export interface ZiweiPalaceValue extends Pick<ZiweiPalace, 'index' | 'name' | 'isBodyPalace' | 'isOriginalPalace'> {
  heavenlyStem: ZiweiPalace['stem'];
  earthlyBranch: ZiweiPalace['branch'];
  decadalRange: ZiweiPalace['decadeRange'];
  majorStars: SerializedStar[];
  minorStars: SerializedStar[];
  adjectiveStars: SerializedStar[];
}

export interface ZiweiMainStarValue extends Pick<SerializedStar, 'brightness' | 'brightnessScore' | 'mutagen'> {
  star: string;
  palace: string;
  palaceIndex: number;
}

export interface ZiweiFourTransformValue extends Omit<ZiweiNatalTransformation, 'mutagen'> {
  mutagen: string;
}

export interface ZiweiSoulVsBodyValue {
  samePalace: boolean;
  soul: SerializedPalaceFacet;
  body: SerializedPalaceFacet;
}

export interface ZiweiSanFangSiZhengValue {
  anchor: string;
  target: SerializedPalaceFacet;
  opposite: SerializedPalaceFacet;
  wealth: SerializedPalaceFacet;
  career: SerializedPalaceFacet;
}

export interface ZiweiDaXianValue extends Omit<ZiweiDecade, 'stem' | 'branch'> {
  heavenlyStem: ZiweiDecade['stem'];
  earthlyBranch: ZiweiDecade['branch'];
}

export interface ZiweiXiaoXianValue extends Pick<ZiweiYearly, 'palaceIndex' | 'asOf'> {
  nominalAge: number | null;
  heavenlyStem: ZiweiYearly['stem'];
  earthlyBranch: ZiweiYearly['branch'];
}

export interface ZiweiFlyingStarsValue extends Omit<ZiweiYearly, 'stem' | 'branch'> {
  heavenlyStem: ZiweiYearly['stem'];
  earthlyBranch: ZiweiYearly['branch'];
}

/** Exact legacy category/id pairs; none emits component metadata. */
export type ZiweiComponent =
  | { id: 'natal_summary'; name: string; category: 'natal'; value: ZiweiNatalValue }
  | { id: `palace_${number}`; name: string; category: 'palaces'; value: ZiweiPalaceValue }
  | { id: `mainStar_${string}`; name: string; category: 'mainStars'; value: ZiweiMainStarValue }
  | { id: `mutagen_${string}`; name: string; category: 'fourTransforms'; value: ZiweiFourTransformValue }
  | { id: 'context_soul_vs_body'; name: string; category: 'soulVsBody'; value: ZiweiSoulVsBodyValue }
  | { id: `context_sanfang_${'soul' | 'body'}`; name: string; category: 'sanFangSiZheng'; value: ZiweiSanFangSiZhengValue }
  | { id: `daXian_${number}`; name: string; category: 'daXian'; value: ZiweiDaXianValue }
  | { id: 'xiaoXian_current'; name: string; category: 'xiaoXian'; value: ZiweiXiaoXianValue }
  | { id: 'flyingStars_yearly'; name: string; category: 'flyingStars'; value: ZiweiFlyingStarsValue };

export interface ZiweiMetadata {
  solarDate: string;
  lunarDate: string;
  chineseDate: string;
  time: string;
  fiveElementsClass: string;
  copyright: string;
}

export interface ZiweiUnavailableMetadata {
  unavailableReason: 'unknown-time';
  unavailableMessage: string;
}
