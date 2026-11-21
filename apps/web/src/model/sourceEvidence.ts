import type { Component, Report } from './types';
import type { ZiweiPalaceValue } from '@fortune/core';

const text = (v: unknown) => typeof v === 'string' ? v : '';
function describe(system: string, component: Component): string {
  if (!component.value || typeof component.value !== 'object') return '';
  if (system === 'bazi') {
    const v = component.value as Record<string, unknown>;
    if (component.category === 'natal') {
      return [['年柱',v.year], ['月柱',v.month], ['日柱',v.day], ['時柱',v.time ?? v.hour]]
        .filter(([, value]) => text(value)).map(([label, value]) => `${label} ${text(value)}`).join('・');
    }
    if (component.category === 'dayMaster') return text(v.stem) || text(v.heavenlyStem);
  }
  if (system !== 'ziwei') return '';
  if (component.category === 'palaces') {
    const v = component.value as ZiweiPalaceValue;
    const transformed = [...(v.majorStars ?? []), ...(v.minorStars ?? []), ...(v.adjectiveStars ?? [])]
      .filter(s => s.mutagen).map(s => `${s.name}化${s.mutagen}`);
    return [`${v.name}・${v.heavenlyStem}${v.earthlyBranch}`, ...(v.majorStars ?? []).map(s => s.name), ...transformed].join('・');
  }
  if (component.category === 'mainStars') {
    const v = component.value as Record<string, unknown>;
    return [text(v.palace), text(v.star), text(v.mutagen) ? `生年化${text(v.mutagen)}` : ''].filter(Boolean).join('・');
  }
  if (component.category === 'fourTransforms') {
    const v = component.value as Record<string, unknown>;
    return text(v.star) && text(v.mutagen) && text(v.palace) ? `生年${text(v.star)}化${text(v.mutagen)}・${text(v.palace)}` : '';
  }
  if (component.category === 'flyingStars') {
    const v = component.value as Record<string, unknown>;
    if (!Array.isArray(v.mutagen) || !text(v.asOf)) return '';
    return `${v.asOf}・${v.heavenlyStem}${v.earthlyBranch}・${v.mutagen.map((star, i) => `${star}化${['祿', '權', '科', '忌'][i] ?? '?'}`).join('、')}`;
  }
  return '';
}

export type EvidenceLookup = (system: string, id: string, mode?: 'claim' | 'timeline') =>
  { name: string; detail: string } | undefined;

export function sourceEvidence(report: Pick<Report, 'engines'>): EvidenceLookup {
  const index = new Map<string, { name: string; detail: string; category: string }>();
  for (const engine of report.engines) {
    for (const component of engine.components) {
      index.set(`${engine.engineId}/${component.id}`, {
        name: component.name,
        detail: describe(engine.engineId, component),
        category: component.category,
      });
    }
  }
  return (system, id, mode = 'claim') => {
    const result = index.get(`${system}/${id}`);
    // Timeline refs can name a period of another year; never substitute the
    // headline report's as-of component value for a differently scoped hit.
    if (mode === 'timeline' && result?.category === 'flyingStars') return undefined;
    return result;
  };
}
