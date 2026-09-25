import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SummaryBuilder, SUMMARY_VERSION } from '../src/index.js';

function component(id, name, category, value) {
  return { id, name, category, value };
}

function engine(engineId, engineName, components) {
  return { engineId, engineName, components };
}

const BAZI = engine('bazi', '八字', [
  component('day_master', '日主', 'dayMaster', { stem: '戊', element: '土', yinYang: '陽' }),
  component('elements', '五行出現次數', 'elements', {
    counts: { 木: 2, 火: 1, 土: 6, 金: 1, 水: 0 },
    total: 10,
  }),
]);

const ZIWEI = engine('ziwei', '紫微斗數', [
  component('context_soul_vs_body', '命宮 vs 身宮', 'soulVsBody', {
    samePalace: false,
    soul: {
      index: 0,
      name: '命宮',
      majorStars: [{ name: '紫微', brightnessScore: 1 }, { name: '天相', brightnessScore: 0.8 }],
    },
    body: {
      index: 4,
      name: '官祿',
      majorStars: [{ name: '武曲', brightnessScore: 0.9 }],
    },
  }),
]);

const NUMEROLOGY = engine('numerology', '生命靈數', [
  component('life_path', '生命靈數', 'lifePath', { number: 22, isMaster: true }),
]);

test('SummaryBuilder 產生 3–5 句跨系統白話摘要，且每句來源可追溯', () => {
  const engines = [BAZI, ZIWEI, NUMEROLOGY];
  const summary = SummaryBuilder.build(engines);

  assert.equal(summary.version, SUMMARY_VERSION);
  assert.equal(summary.sentences.length, 4);
  assert.deepEqual(summary.sourceSystems, ['bazi', 'ziwei', 'numerology']);
  assert.deepEqual(
    summary.sentences.map(sentence => sentence.id),
    ['bazi_day_master', 'ziwei_soul_body', 'numerology_life_path', 'bazi_element_distribution'],
  );

  for (const sentence of summary.sentences) {
    assert.equal(sentence.layer, 'L0');
    assert.ok(sentence.text.length > 20);
    assert.ok(sentence.sources.length > 0);
    for (const source of sentence.sources) {
      const sourceEngine = engines.find(item => item.engineId === source.engineId);
      assert.ok(sourceEngine, `來源引擎不存在：${source.engineId}`);
      assert.ok(
        sourceEngine.components.some(item => item.id === source.componentId),
        `來源部件不存在：${source.engineId}/${source.componentId}`,
      );
    }
  }

  assert.match(summary.sentences[0].text, /戊土日主/);
  assert.match(summary.sentences[1].text, /紫微、天相/);
  assert.match(summary.sentences[2].text, /生命靈數 22/);
  assert.match(summary.sentences[3].text, /土較集中（60%）/);
  assert.match(summary.sentences[3].text, /不等同旺衰、喜用神或吉凶判定/);
});

test('命宮無主星時改用真實對宮星曜，並同時標示借宮來源', () => {
  const ziwei = engine('ziwei', '紫微斗數', [
    component('context_soul_vs_body', '命宮 vs 身宮', 'soulVsBody', {
      samePalace: false,
      soul: { index: 0, name: '命宮', majorStars: [] },
      body: { index: 3, name: '福德', majorStars: [{ name: '太陰' }] },
    }),
    component('context_sanfang_soul', '命宮三方四正', 'sanFangSiZheng', {
      anchor: '命宮',
      opposite: {
        name: '遷移',
        majorStars: [{ name: '天同' }, { name: '天梁' }],
      },
    }),
  ]);

  const summary = SummaryBuilder.build([ziwei]);
  assert.equal(summary.sentences.length, 1);
  assert.match(summary.sentences[0].text, /對宮遷移的天同、天梁/);
  assert.match(summary.sentences[0].text, /借宮閱讀/);
  assert.deepEqual(
    summary.sentences[0].sources.map(source => source.componentId),
    ['context_soul_vs_body', 'context_sanfang_soul'],
  );
});

test('資料缺失時略過依賴部件，不補寫替代結論', () => {
  const onlyDayMaster = engine('bazi', '八字', [
    component('day_master', '日主', 'dayMaster', { stem: '癸', element: '水', yinYang: '陰' }),
  ]);

  const partial = SummaryBuilder.build([onlyDayMaster]);
  assert.equal(partial.sentences.length, 1);
  assert.equal(partial.sentences[0].id, 'bazi_day_master');

  const empty = SummaryBuilder.build([]);
  assert.deepEqual(empty.sentences, []);
  assert.deepEqual(empty.sourceSystems, []);
});

