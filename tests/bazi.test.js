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
  assert.deepEqual(
    result.components
      .map(c => c.category)
      .filter(cat => ['natal', 'dayMaster', 'elements', 'tenGods'].includes(cat)),
    ['natal', 'dayMaster', 'elements', 'tenGods']
  );
  const elements = result.byCategory('elements')[0].value;
  const tenGods = result.byCategory('tenGods')[0].value;
  assert.equal(tenGods.total, elements.total);
  assert.ok(tenGods.total > 0);
});

test('八字：B2 大運與流年驗證 1991-10-05 14:00 女 asOf=2026-07-11', () => {
  const engine = createEngines({ asOf: '2026-07-11' }).find(item => item.id === 'bazi');
  const result = engine.run(new BirthData({
    year: 1991, month: 10, day: 5, hour: 14, minute: 0, gender: 'female',
  }));

  assert.equal(result.errors.length, 0, result.errors.join('; '));
  
  const daYuns = result.byCategory('daYun');
  assert.equal(daYuns.length, 10, '應恰好產出 10 步大運');
  
  let currentCount = 0;
  for (let i = 0; i < 10; i++) {
    const v = daYuns[i].value;
    assert.equal(v.index, i + 1, 'index 必須是 1 到 10');
    assert.equal(v.endYear - v.startYear, 9, '年份差固定為 9');
    if (i > 0) {
      assert.ok(v.startYear > daYuns[i-1].value.startYear, 'startYear 遞增');
    }
    if (v.isCurrent) currentCount++;
  }
  
  assert.equal(currentCount, 1, '剛好一步大運是 isCurrent: true');

  const liuNian = result.byCategory('liuNian')[0];
  assert.equal(liuNian.value.year, 2026);
  assert.equal(liuNian.value.ganZhi, '丙午');
});

test('八字：B2 2030-01-01 大運靜態不變與己酉流年', () => {
  const engine26 = createEngines({ asOf: '2026-07-11' }).find(item => item.id === 'bazi');
  const engine30 = createEngines({ asOf: '2030-01-01' }).find(item => item.id === 'bazi');
  
  const birth = new BirthData({
    year: 1991, month: 10, day: 5, hour: 14, minute: 0, gender: 'female',
  });
  
  const res26 = engine26.run(birth);
  const res30 = engine30.run(birth);
  
  const dyn26 = res26.byCategory('daYun');
  const dyn30 = res30.byCategory('daYun');
  
  for (let i = 0; i < 10; i++) {
    assert.equal(dyn26[i].value.ganZhi, dyn30[i].value.ganZhi);
    assert.equal(dyn26[i].value.startYear, dyn30[i].value.startYear);
  }
  
  const liuNian30 = res30.byCategory('liuNian')[0];
  assert.equal(liuNian30.value.year, 2030);
  assert.equal(liuNian30.value.ganZhi, '己酉');
});

test('八字：B2 asOf 格式與性別驗證錯誤', () => {
  const invalidInputs = [
    { asOf: '2026-07-11T00:00:00Z', error: /asOf in YYYY-MM-DD/ },
    { asOf: null, error: /asOf in YYYY-MM-DD/ },
    { asOf: '2026-02-30', error: /valid calendar date/ },
  ];

  for (const input of invalidInputs) {
    const engine = createEngines({ asOf: input.asOf }).find(item => item.id === 'bazi');
    const result = engine.run(new BirthData({
      year: 1991, month: 10, day: 5, hour: 14, minute: 0, gender: 'female',
    }));
    assert.ok(result.errors.length > 0, `Should have error for asOf: ${input.asOf}`);
    assert.match(result.errors[0], input.error);
  }

  const engine2 = createEngines({ asOf: '2026-07-11' }).find(item => item.id === 'bazi');
  // bypassing BirthData validation to test internal engine strictness
  assert.throws(() => {
    engine2._compute({ year: 1991, month: 10, day: 5, hour: 14, minute: 0, gender: 'alien' });
  }, /'male' or 'female'/);
});
