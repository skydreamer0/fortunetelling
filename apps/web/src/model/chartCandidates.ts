import type { Report } from './types';

type Snapshot = NonNullable<Report['replay']>['snapshot'];
type Bazi = Extract<Snapshot['natal']['bazi'], { status: 'computed' }>['chart']['pillars']['pillars'];
type Ziwei = Extract<Snapshot['natal']['ziwei'], { status: 'computed' }>['chart']['primary'];

export type Comparison = {
  label: string;
  columns: readonly [string, string];
  rows: { label: string; a: string; b: string }[];
};

const PILLARS = [['year', '年柱'], ['month', '月柱'], ['day', '日柱'], ['hour', '時柱']] as const;
const fourTransformLabel = (z: Ziwei, mutagen: string) => {
  const hit = z.natalTransformations.find(item => item.mutagen === mutagen);
  return hit ? `${hit.star}・${hit.palace}` : '未提供';
};
function baziRows(a: Bazi, b: Bazi) {
  return PILLARS.map(([key, label]) => ({ label, a: a[key], b: b[key] }));
}
function ziweiRows(a: Ziwei, b: Ziwei) {
  const palaceText = (chart: Ziwei, name: string) => {
    const p = chart.palaces.find(item => item.name === name);
    return p ? `${p.stem}${p.branch}・${p.majorStars.map(star => star.name).join('、') || '無主星'}` : '未提供';
  };
  return [
    { label: '身宮', a: a.bodyPalace?.name ?? '未提供', b: b.bodyPalace?.name ?? '未提供' },
    { label: '五行局', a: a.fiveElementBureau ?? '未提供', b: b.fiveElementBureau ?? '未提供' },
    ...a.palaces.map(p => ({ label: p.name, a: palaceText(a, p.name), b: palaceText(b, p.name) })),
    ...['祿', '權', '科', '忌'].map(m => ({ label: `生年化${m}`, a: fourTransformLabel(a, m), b: fourTransformLabel(b, m) })),
  ];
}

const REASONS: Record<string, string> = {
  near_shichen_boundary: '時辰交界',
  near_jie_boundary: '交節交界',
  zi_hour_convention: '子時換日口徑',
  civil_time: '民用時間口徑',
};

export function chartCandidates(snapshot: Snapshot): Comparison[] {
  const { bazi, ziwei } = snapshot.natal;
  const compareBazi = bazi.status === 'computed' ? bazi.chart.pillars : null;
  const compareZiwei = ziwei.status === 'computed' ? ziwei.chart : null;
  return [
    ...(compareBazi?.alternatives.map(alt => ({
      label: `八字｜${REASONS[alt.reason]}`,
      columns: ['主盤', `候選盤：${alt.detail}`] as const,
      rows: baziRows(compareBazi.pillars, alt.pillars),
    })) ?? []),
    ...(compareZiwei?.alternatives.map(({ time, natal }, index) => ({
      label: `紫微｜${compareZiwei.time.alternatives[index]?.reasons.map(reason => REASONS[reason]).join('、') || '候選口徑'}`,
      columns: [`主盤：${compareZiwei.time.wallTime.slice(0, 16).replace('T', ' ')}`, `候選盤：${time.wallTime.slice(0, 16).replace('T', ' ')}`] as const,
      rows: ziweiRows(compareZiwei.primary, natal),
    })) ?? []),
  ];
}

/** Explicit civil time hypotheses only; not an inference of an unknown time. */
export function proposedTime(replay: NonNullable<Report['replay']>, clock: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) throw new Error('請輸入有效的候選時間。');
  const [hour, minute] = clock.split(':').map(Number);
  const [year, month, day] = replay.snapshot.identity.input.date.split('-').map(Number);
  return { ...replay.spec.source.input, year, month, day, hour, minute, timeKnown: true as const, timeAccuracy: 'exact' as const };
}

export function compareChosenTimes(a: Snapshot, b: Snapshot, first: string, second: string): Comparison[] {
  const result: Comparison[] = [];
  const aa = a.natal, bb = b.natal;
  if (aa.bazi.status === 'computed' && bb.bazi.status === 'computed') {
    result.push({ label: '八字｜自選時間', columns: [first, second], rows: baziRows(aa.bazi.chart.pillars.pillars, bb.bazi.chart.pillars.pillars) });
  }
  if (aa.ziwei.status === 'computed' && bb.ziwei.status === 'computed') {
    result.push({ label: '紫微｜自選時間', columns: [first, second], rows: ziweiRows(aa.ziwei.chart.primary, bb.ziwei.chart.primary) });
  }
  return result;
}
