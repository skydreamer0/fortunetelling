/**
 * 黃金測試：引擎對已知向量的輸出（可覆核的計算正確性）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BirthData, ZiweiEngine, NumerologyEngine } from '../src/index.js';
import { reduceNumber, letterValue } from '../src/engines/NumerologyEngine.js';
import { LayerClassifier } from '../src/analysis/LayerClassifier.js';

const BIRTH = new BirthData({ year: 1991, month: 10, day: 5, hour: 14, gender: 'female', name: 'Test Person' });

test('靈數：1991-10-05 生命靈數 = 8', () => {
  const res = new NumerologyEngine().run(BIRTH);
  const lifePath = res.byCategory('lifePath')[0];
  assert.equal(lifePath.value.number, 8); // (1991→2) + (10→1) + 5 = 8
});

test('靈數：九宮格頻次符合出生日期各位數', () => {
  const res = new NumerologyEngine().run(BIRTH);
  const freq = res.byCategory('digitFrequency')[0].value;
  // 19911005 → 1×3, 9×2, 5×1（0 不計）
  assert.equal(freq[1], 3);
  assert.equal(freq[9], 2);
  assert.equal(freq[5], 1);
  assert.equal(freq[2] + freq[3] + freq[4] + freq[6] + freq[7] + freq[8], 0);
});

test('靈數：reduceNumber 保留大師數 11/22/33', () => {
  assert.equal(reduceNumber(29), 11);
  assert.equal(reduceNumber(22), 22);
  assert.equal(reduceNumber(33), 33);
  assert.equal(reduceNumber(1991), 2);
});

test('靈數：letterValue 畢達哥拉斯映射', () => {
  assert.equal(letterValue('A'), 1);
  assert.equal(letterValue('I'), 9);
  assert.equal(letterValue('J'), 1);
  assert.equal(letterValue('Z'), 8);
});

test('紫微：L3 情境部件（命宮vs身宮、三方四正）如實產出', () => {
  const res = new ZiweiEngine({ asOf: '2026-07-11' }).run(BIRTH);
  assert.equal(res.errors.length, 0, res.errors.join('; '));

  const soulVsBody = res.byCategory('soulVsBody');
  assert.equal(soulVsBody.length, 1);
  assert.ok(soulVsBody[0].value.soul.name);
  assert.ok(soulVsBody[0].value.body.name);
  assert.equal(typeof soulVsBody[0].value.samePalace, 'boolean');

  const sanfang = res.byCategory('sanFangSiZheng');
  assert.ok(sanfang.length >= 1);
  for (const facet of sanfang) {
    for (const key of ['target', 'opposite', 'wealth', 'career']) {
      assert.ok(facet.value[key]?.name, `${facet.name} 缺 ${key}`);
    }
  }
  // 命身異宮時兩組、同宮時一組
  assert.equal(sanfang.length, soulVsBody[0].value.samePalace ? 1 : 2);
});

test('紫微：大限全序列（12 步、range 遞增不重疊、每步四化 4 元素）', () => {
  const res = new ZiweiEngine({ asOf: '2026-07-11' }).run(BIRTH);
  assert.equal(res.errors.length, 0, res.errors.join('; '));

  const daXian = res.byCategory('daXian');
  assert.equal(daXian.length, 12);

  // 舊的單一 daXian_current 已移除；改為 daXian_1 … daXian_12
  assert.ok(!res.components.some(c => c.id === 'daXian_current'));
  for (let i = 1; i <= 12; i++) {
    assert.ok(daXian.some(c => c.id === `daXian_${i}`), `缺 daXian_${i}`);
  }

  const steps = [...daXian].sort((a, b) => a.value.index - b.value.index);
  let prevEnd = null;
  for (const step of steps) {
    const v = step.value;
    assert.equal(typeof v.index, 'number');
    assert.equal(typeof v.palaceIndex, 'number');
    assert.ok(v.palaceIndex >= 0 && v.palaceIndex <= 11);
    assert.ok(v.palaceName);
    assert.ok(v.heavenlyStem);
    assert.ok(v.earthlyBranch);
    assert.equal(typeof v.isCurrent, 'boolean');

    // range: [起虛歲, 迄虛歲]，跨 10 個虛歲，遞增且不重疊
    assert.ok(Array.isArray(v.range) && v.range.length === 2, `daXian_${v.index} range 非二元組`);
    assert.equal(v.range[1] - v.range[0], 9);
    if (prevEnd !== null) {
      assert.ok(v.range[0] > prevEnd, `daXian_${v.index} 與前一步重疊`);
    }
    prevEnd = v.range[1];

    // 每步大限四化為 4 元素陣列（祿權科忌）
    assert.ok(Array.isArray(v.mutagen), `daXian_${v.index} mutagen 非陣列`);
    assert.equal(v.mutagen.length, 4, `daXian_${v.index} mutagen 應為 4 元素`);
    for (const star of v.mutagen) assert.equal(typeof star, 'string');
  }
});

test('紫微：大限恰一步 isCurrent，且其 range 含 asOf 虛歲 36', () => {
  const res = new ZiweiEngine({ asOf: '2026-07-11' }).run(BIRTH);
  const current = res.byCategory('daXian').filter(c => c.value.isCurrent);
  assert.equal(current.length, 1);
  // 1991-10-05 生、asOf=2026-07-11 → 虛歲 36
  const [start, end] = current[0].value.range;
  assert.ok(start <= 36 && 36 <= end, `isCurrent range [${start},${end}] 不含虛歲 36`);
});

test('紫微：大限部件全部歸 L1', () => {
  const res = new ZiweiEngine({ asOf: '2026-07-11' }).run(BIRTH);
  const classification = new LayerClassifier().classify([res]);
  const daXian = classification.components.filter(c => c.category === 'daXian');
  assert.equal(daXian.length, 12);
  for (const comp of daXian) {
    assert.equal(comp.layer, 'L1', `${comp.id} 應歸 L1，實為 ${comp.layer}`);
    assert.ok(!comp.unclassified);
  }
});

test('紫微：主星皆帶亮度分數（0–1 或 null）', () => {
  const res = new ZiweiEngine({ asOf: '2026-07-11' }).run(BIRTH);
  const stars = res.byCategory('mainStars');
  assert.ok(stars.length > 0);
  for (const star of stars) {
    const s = star.value.brightnessScore;
    assert.ok(s === null || (s >= 0 && s <= 1), `${star.name} 分數越界: ${s}`);
  }
});
