/** Inline definitions for specialist terms. */

export const GLOSSARY: Readonly<Record<string, string>> = Object.freeze({
  太歲: '流年地支的傳統稱呼。此處只比對出生年支與當年地支的配對關係，不把它直接解讀成吉凶。',
  三方四正: '以某一宮位為中心，連同對宮及三合宮一起閱讀，觀察不同領域如何互相牽動。',
  四化: '紫微斗數中的祿、權、科、忌四種變化標記，用來描述星曜在特定時間或命盤中的作用方向。',
  化祿: '四化之一，常用來觀察資源、吸引力與容易投入之處；不等同必然得財。',
  化權: '四化之一，常用來觀察主導、責任與推動力集中的位置。',
  化科: '四化之一，常用來觀察名聲、學習、整理與被看見的方式。',
  化忌: '四化之一，常用來觀察卡點、牽掛與需要反覆調整的地方；不等同災禍。',
  藏干: '每個地支內含的天干成分，用來補充八字五行與十神的內在結構。',
  十神: '八字依日主與其他天干的生剋、陰陽關係建立的十種角色，用來描述資源、表達、規範與互動方式。',
  日主: '八字出生日的天干，作為判讀其他五行與十神關係的中心點。',
  身宮: '紫微斗數中偏向後天投入與實際行動的宮位，通常和命宮一起對照。',
  命宮: '紫微斗數觀察基本性格與人生主軸的核心宮位。',
  大運: '八字約十年一段的階段週期，用來觀察長期背景如何變化。',
  大限: '紫微斗數約十年一段的階段宮位，用來觀察當期生活重心。',
  流年: '以一年為尺度更新的時間訊號，適合當作年度回顧與觀察提示。',
  喜用神: '八字在完整旺衰、月令與調候判斷後，用來討論平衡方向的概念；不能只靠五行數量決定。',
  五行局: '紫微斗數用五行與局數標示命盤運行規則的基礎資訊之一。',
});

export type GlossarySegment = string | { term: string; definition: string };

const TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);

/**
 * Split text so the first occurrence of each glossary term becomes a term segment.
 * Terms already in `seen` stay plain text; newly marked terms are added to it.
 */
export function segmentGlossary(text: string, seen: Set<string> = new Set()): GlossarySegment[] {
  const segments: GlossarySegment[] = [];
  let rest = text;
  for (;;) {
    let best: { term: string; index: number } | null = null;
    for (const term of TERMS) {
      if (seen.has(term)) continue;
      const index = rest.indexOf(term);
      if (index !== -1 && (best === null || index < best.index)) best = { term, index };
    }
    if (!best) break;
    if (best.index > 0) segments.push(rest.slice(0, best.index));
    segments.push({ term: best.term, definition: GLOSSARY[best.term] });
    seen.add(best.term);
    rest = rest.slice(best.index + best.term.length);
  }
  if (rest) segments.push(rest);
  return segments;
}
