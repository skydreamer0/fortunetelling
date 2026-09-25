import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, HonestyGuard } from '../src/index.js';

/** @type {import('../src/core/models/BirthData.js').BirthDataParams} */
const INPUT = { year: 1991, month: 10, day: 5, hour: 14, gender: 'female', name: 'Test Person' };
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
  assert.ok(report.insights.domains.find(domain => domain.id === 'wellbeing').limitations.length > 0);
});

test('本年視圖包含流年、四化與長期階段，且通過誠實語言稽核', () => {
  const report = analyze(INPUT, { asOf: AS_OF });
  const annual = report.insights.annual;
  assert.equal(annual.year, 2026);
  assert.deepEqual(annual.themes.map(theme => theme.id), ['year-rhythm', 'year-transforms', 'stage-background']);
  assert.equal(annual.themes[0].taiSui.relation, '六合');
  assert.match(annual.themes[0].text, /太歲/);
  assert.match(annual.themes[0].text, /丙午/);
  assert.match(annual.themes[1].text, /化祿/);
  assert.deepEqual(HonestyGuard.auditReport(report), []);
});

test('平衡建議完整列出八宅四吉方與非決定論限制', () => {
  const guidance = analyze(INPUT, { asOf: AS_OF }).insights.guidance;
  assert.equal(guidance.balance.element, '水');
  assert.equal(guidance.directions.length, 4);
  assert.deepEqual(guidance.directions.map(item => item.name), ['生氣', '天醫', '延年', '伏位']);
  assert.ok(guidance.numbers.includes(8));
  assert.ok(guidance.limitations.some(text => text.includes('不宣稱')));
  assert.ok(guidance.limitations.some(text => text.includes('不等同喜用神')));
});

test('時辰不確定時領域與五行建議安全降級，年度仍保留可算項目', () => {
  const report = analyze({ ...INPUT, timeKnown: false }, { asOf: AS_OF });
  assert.ok(report.insights.domains.every(domain => domain.insufficientData));
  assert.equal(report.insights.guidance.balance, null);
  assert.equal(report.insights.guidance.directions.length, 4);
  assert.ok(report.insights.annual.themes.some(theme => theme.id === 'year-rhythm'));
  assert.ok(!report.insights.annual.themes.some(theme => theme.id === 'year-transforms'));
});
