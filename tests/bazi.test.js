import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BirthData, createEngines } from '../src/index.js';

const TAIPEI_CONVENTION = {
  calendar: 'gregorian',
  timezone: 'Asia/Taipei',
  dayBoundary: 'lunar-javascript sect=2',
  trueSolarTime: false,
  library: 'lunar-javascript@1.7.7',
};

function getBaZiEngine() {
  const engine = createEngines({ asOf: '2026-07-11' }).find(item => item.id === 'bazi');
  assert.ok(engine, '預設引擎必須註冊 bazi');
  return engine;
}

test('八字：1986-05-29 辰時產出固定四柱與時間慣例', () => {
  const result = getBaZiEngine().run(new BirthData({
    year: 1986, month: 5, day: 29, hour: 8, minute: 0,
  }));

  assert.equal(result.errors.length, 0, result.errors.join('; '));
  const natal = result.byCategory('natal')[0];
  const dayMaster = result.byCategory('dayMaster')[0];

  assert.deepEqual(natal.value, {
    year: '丙寅', month: '癸巳', day: '癸酉', time: '丙辰',
    convention: TAIPEI_CONVENTION,
  });
  assert.deepEqual(dayMaster.value, { stem: '癸', element: '水', yinYang: '陰' });
});

test('八字：五行與十神以十四次出現統計且包含日干', () => {
  const result = getBaZiEngine().run(new BirthData({
    year: 1986, month: 5, day: 29, hour: 8, minute: 0,
  }));
  const elements = result.byCategory('elements')[0];
  const tenGods = result.byCategory('tenGods')[0];

  assert.deepEqual(elements.value.counts, { 木: 2, 火: 4, 土: 3, 金: 2, 水: 3 });
  assert.equal(elements.value.total, 14);
  assert.equal(elements.value.includesHiddenStems, true);
  assert.equal(elements.value.includesDayMaster, true);
  assert.equal(elements.value.metric, 'occurrence-count');
  assert.match(elements.value.limitation, /不代表旺衰/);

  assert.equal(tenGods.value.total, 14);
  assert.equal(tenGods.value.includesDayMaster, true);
  assert.equal(Object.values(tenGods.value.counts).reduce((sum, count) => sum + count, 0), 14);
});

test('八字：1991-10-05 14:00 產出四個完整 L0 component', () => {
  const result = getBaZiEngine().run(new BirthData({
    year: 1991, month: 10, day: 5, hour: 14, minute: 0, gender: 'female',
  }));

  assert.equal(result.errors.length, 0, result.errors.join('; '));
  assert.deepEqual(result.components.map(component => component.category), [
    'natal', 'dayMaster', 'elements', 'tenGods',
  ]);
  const elements = result.byCategory('elements')[0].value;
  const tenGods = result.byCategory('tenGods')[0].value;
  assert.equal(tenGods.total, elements.total);
  assert.ok(tenGods.total > 0);
});
