import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { analyze, InsightBuilder } from '@fortune/core';
import { Guidance } from '../src/components/report/Guidance';
import type { Report } from '../src/model/types';

const BASE = {
  year: 1991, month: 10, day: 5, hour: 14, minute: 0, gender: 'female' as const,
  name: 'Synthetic guidance QA', timeKnown: true, calendarType: 'solar' as const,
};
const AS_OF = '2026-07-18';
const base = analyze(BASE, { asOf: AS_OF }) as unknown as Report;

function render(report: Report) {
  return renderToStaticMarkup(<Guidance report={report} />);
}

function expectCountOnly(html: string) {
  expect(html).toContain('五行出現次數');
  expect(html).toContain('未判定旺衰或喜忌');
  expect(html).toContain('不能據此提出補缺建議');
  for (const text of ['五行平衡', '開始小幅調整', '若想平衡', '<dt>色彩</dt>', '<dt>習慣</dt>']) {
    expect(html).not.toContain(text);
  }
}

describe('#65 count-only guidance (scoped SSR)', () => {
  // Exact count expectations follow the synthetic inputs and issue #65, not a recorded render.
  const cases = [
    { name: 'single minimum', counts: { 木: 2, 火: 3, 土: 4, 金: 5, 水: 0 }, text: '水最少（0 次）' },
    { name: 'tied minima', counts: { 木: 0, 火: 2, 土: 3, 金: 0, 水: 5 }, text: '木、金最少（0 次）' },
    { name: 'all equal', counts: { 木: 2, 火: 2, 土: 2, 金: 2, 水: 2 }, text: '五行出現次數皆為 2 次' },
  ];
  for (const fixture of cases) {
    test(fixture.name, () => {
      const insights = InsightBuilder.build([{ engineId: 'bazi', components: [{
        id: 'elements', name: '五行出現次數', category: 'elements',
        value: { counts: fixture.counts, limitation: '合成計數，不作命理判斷。' },
      }] }], [], { asOf: AS_OF });
      const html = render({ ...base, insights });
      expectCountOnly(html);
      expect(html).toContain(fixture.text);
    });
  }

  test('unknown birth time cannot imply a completed strength or preference judgment', () => {
    const unknown = analyze({ ...BASE, timeKnown: false }, { asOf: AS_OF });
    expect(unknown.insights.guidance.balance).toBeNull();
    const html = render(unknown as unknown as Report);
    expectCountOnly(html);
    expect(html).toContain('可用的五行出現次數資料不足');
    expect(html).not.toContain('未判定五行調整方向');
    expect(html).toContain('八宅四吉方');
  });

  for (const version of [undefined, 1]) {
    test(`legacy insight version ${String(version)} does not redisplay old supplementation text or fields`, () => {
      const legacy: Report = structuredClone(base);
      legacy.insights.version = version;
      legacy.insights.guidance!.balance = {
        element: '水', color: '舊色彩不應出現', direction: '舊方位不應出現', habit: '舊習慣不應出現',
        text: '五行出現次數中水最低。若想平衡「水」，可小幅調整。', limitation: '只計次數。',
      };
      const before = structuredClone(legacy);
      const html = render(legacy);
      expectCountOnly(html);
      for (const old of ['舊色彩不應出現', '舊方位不應出現', '舊習慣不應出現', '水最低']) expect(html).not.toContain(old);
      expect(html).toContain('此報告僅有五行出現次數資料');
      expect(html).toContain('八宅四吉方');
      expect(html).toContain('可作為提醒符號的數字');
      expect(legacy).toEqual(before);
    });
  }
});
