import { test } from 'vitest';
import assert from 'node:assert/strict';
import { analyze, HonestyGuard, InsightBuilder, INSIGHT_VERSION } from '../src/index';
import type { AnalyzeInput } from '../src/core/analyze';
import type { SystemResultLike } from '../src/core/models/SystemResult';
import countOnlyDelta from './fixtures/reportGolden.v0.9.1.delta.json';
import countOnlyExportDelta from './fixtures/export.v0.9.1.delta.json';

const INPUT: AnalyzeInput = { year: 1991, month: 10, day: 5, hour: 14, gender: 'female', name: 'Test Person' };
const AS_OF = '2026-07-18';

test('人生領域視圖聚合紫微宮位、八字結構與目前大限', () => {
  const report = analyze(INPUT, { asOf: AS_OF });
  assert.deepEqual(report.insights.domains.map(domain => domain.id), ['career', 'relationship', 'wealth', 'wellbeing']);
  for (const domain of report.insights.domains) {
    assert.ok(Number.isFinite(domain.score));
    assert.ok(domain.metrics.length >= 2);
    assert.ok(domain.sources.some(item => item.system === 'ziwei'));
    assert.ok(domain.sources.some(item => item.system === 'bazi'));
    assert.match(domain.stage, /目前大限/);
  }
  assert.ok(report.insights.domains.find(domain => domain.id === 'wellbeing')!.limitations.length > 0);
});

test('本年視圖包含流年、四化與長期階段，且通過誠實語言稽核', () => {
  const report = analyze(INPUT, { asOf: AS_OF });
  const annual = report.insights.annual;
  assert.equal(annual.year, 2026);
  assert.deepEqual(annual.themes.map(theme => theme.id), ['year-rhythm', 'year-transforms', 'stage-background']);
  assert.equal(annual.themes[0].taiSui!.relation, '六合');
  assert.match(annual.themes[0].text, /太歲/);
  assert.match(annual.themes[0].text, /丙午/);
  assert.match(annual.themes[1].text, /化祿/);
  assert.deepEqual(HonestyGuard.auditReport(report), []);
});

test('五行次數描述保留八宅四吉方與非決定論限制', () => {
  const guidance = analyze(INPUT, { asOf: AS_OF }).insights.guidance;
  assert.equal(guidance.balance!.element, '水');
  assert.deepEqual([guidance.balance!.color, guidance.balance!.direction, guidance.balance!.habit], ['', '', '']);
  assert.match(guidance.balance!.text, /未判定旺衰或喜忌，不能據此提出補缺建議/);
  assert.equal(guidance.directions.length, 4);
  assert.deepEqual(guidance.directions.map(item => item.name), ['生氣', '天醫', '延年', '伏位']);
  assert.ok(guidance.numbers.includes(8));
  assert.ok(guidance.limitations.some(text => text.includes('不宣稱')));
  assert.ok(guidance.limitations.some(text => text.includes('不等同喜用神')));
});

test('時辰不確定時不產生五行次數或補缺建議，年度仍保留可算項目', () => {
  const report = analyze({ ...INPUT, timeKnown: false }, { asOf: AS_OF });
  assert.ok(report.insights.domains.every(domain => domain.insufficientData));
  assert.equal(report.insights.guidance.balance, null);
  assert.equal(report.insights.guidance.directions.length, 4);
  assert.ok(report.insights.annual.themes.some(theme => theme.id === 'year-rhythm'));
  assert.ok(!report.insights.annual.themes.some(theme => theme.id === 'year-transforms'));
});

// Oracle: issue #65 requires counts to remain counts, never a 補缺 recommendation.
// Synthetic count vectors and exact expected descriptions are authored here;
// they are not recorded from InsightBuilder or a calculator's output.
const COUNT_CASES = [
  { name: '木最低', counts: { 木: 0, 火: 2, 土: 3, 金: 4, 水: 5 }, element: '木', tied: ['木'], count: 0,
    text: '五行出現次數中木最少（0 次）。此處僅描述出現次數，未判定旺衰或喜忌，不能據此提出補缺建議。' },
  { name: '火最低', counts: { 木: 2, 火: 0, 土: 3, 金: 4, 水: 5 }, element: '火', tied: ['火'], count: 0,
    text: '五行出現次數中火最少（0 次）。此處僅描述出現次數，未判定旺衰或喜忌，不能據此提出補缺建議。' },
  { name: '土最低', counts: { 木: 2, 火: 3, 土: 0, 金: 4, 水: 5 }, element: '土', tied: ['土'], count: 0,
    text: '五行出現次數中土最少（0 次）。此處僅描述出現次數，未判定旺衰或喜忌，不能據此提出補缺建議。' },
  { name: '金最低', counts: { 木: 2, 火: 3, 土: 4, 金: 0, 水: 5 }, element: '金', tied: ['金'], count: 0,
    text: '五行出現次數中金最少（0 次）。此處僅描述出現次數，未判定旺衰或喜忌，不能據此提出補缺建議。' },
  { name: '水最低', counts: { 木: 2, 火: 3, 土: 4, 金: 5, 水: 1 }, element: '水', tied: ['水'], count: 1,
    text: '五行出現次數中水最少（1 次）。此處僅描述出現次數，未判定旺衰或喜忌，不能據此提出補缺建議。' },
  { name: '並列最低', counts: { 木: 0, 火: 2, 土: 3, 金: 0, 水: 5 }, element: '木', tied: ['木', '金'], count: 0,
    text: '五行出現次數中木、金最少（0 次）。此處僅描述出現次數，未判定旺衰或喜忌，不能據此提出補缺建議。' },
  { name: '全部相同', counts: { 木: 2, 火: 2, 土: 2, 金: 2, 水: 2 }, element: '木', tied: ['木', '火', '土', '金', '水'], count: 2,
    text: '五行出現次數皆為 2 次。此處僅描述出現次數，未判定旺衰或喜忌，不能據此提出補缺建議。' },
];

for (const fixture of COUNT_CASES) {
  test(`#65 ${fixture.name}只描述次數，所有舊補缺欄位皆為空`, () => {
    const engines: SystemResultLike[] = [{ engineId: 'bazi', components: [{
      id: 'elements', name: '五行出現次數', category: 'elements',
      value: { counts: fixture.counts, limitation: '合成計數，沒有旺衰或喜忌判準。' },
    }] }];
    const before = structuredClone(engines);
    const insights = InsightBuilder.build(engines, [], { asOf: AS_OF });
    assert.equal(INSIGHT_VERSION, 2);
    assert.equal(insights.version, 2);
    assert.deepEqual(insights.guidance, {
      balance: {
        element: fixture.element, tiedElements: fixture.tied, count: fixture.count,
        color: '', direction: '', habit: '', text: fixture.text,
        source: { system: 'bazi', componentId: 'elements', name: '五行出現次數' },
        limitation: '合成計數，沒有旺衰或喜忌判準。',
      },
      directions: [], numbers: [], numberLabel: '可作為提醒符號的數字',
      sources: [{ system: 'bazi', componentId: 'elements', name: '五行出現次數' }],
      limitations: [
        '八宅方位與數字屬於低風險的自我提醒，不宣稱能改變外在事件。',
        '五行出現次數不等同喜用神判定；完整喜用神仍需月令、旺衰與調候等另行評估。',
      ],
    });
    assert.deepEqual(engines, before, 'The source counts are not mutated');
    assert.doesNotMatch(insights.guidance.balance!.text, /若想平衡|小幅調整|補[木火土金水]/);
  });
}

test('#65 literal golden delta allows only the declared guidance and release fields', () => {
  assert.equal(countOnlyDelta.changes.length, 75);
  const paths = countOnlyDelta.changes.map(change => change.path.join('.'));
  assert.equal(new Set(paths).size, paths.length, 'No duplicate or overwritten deltas');
  for (const change of countOnlyDelta.changes) {
    const [group, , ...field] = change.path;
    const path = field.join('.');
    assert.ok(group === 'reports' || group === 'compatibility');
    if (path === 'version') {
      assert.equal(change.before, '0.9.0');
      assert.equal(change.after, '0.9.1');
    } else {
      assert.equal(group, 'reports');
      if (path === 'insights.version') {
        assert.equal(change.before, 1);
        assert.equal(change.after, 2);
      } else if (path === 'insights.guidance.limitations') {
        assert.deepEqual(change.after, [
          '八宅方位與數字屬於低風險的自我提醒，不宣稱能改變外在事件。',
          '五行出現次數不等同喜用神判定；完整喜用神仍需月令、旺衰與調候等另行評估。',
        ]);
      } else if (path === 'insights.guidance.balance.text') {
        assert.equal(typeof change.after, 'string');
        assert.match(change.after as string, /未判定旺衰或喜忌，不能據此提出補缺建議。$/);
      } else {
        assert.ok(['insights.guidance.balance.color', 'insights.guidance.balance.direction',
          'insights.guidance.balance.habit'].includes(path), `Unexpected delta ${change.path.join('.')}`);
        assert.equal(change.after, '');
      }
    }
  }
  assert.deepEqual(countOnlyExportDelta.changes, [
    { path: ['versions', 'coreVersion'], before: '0.9.0', after: '0.9.1' },
  ]);
});
