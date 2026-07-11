/**
 * 契約測試：ScoringRules 透明計分登錄表。
 * 含審計偏差 2 的回歸：紫微亮度規則必須與 ZiweiEngine 的七級制同源一致。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScoringRules } from '../src/index.js';
import { BRIGHTNESS_WEIGHTS, brightnessScore } from '../src/engines/ZiweiEngine.js';

test('偏差2回歸：紫微亮度規則與引擎七級制一致', () => {
  const rules = new ScoringRules();
  const rule = rules.getRule('ziwei_star_brightness');
  assert.ok(rule, 'ziwei_star_brightness 規則不存在');

  // 公式必須揭露全部七級（含「不」）且權重與引擎同值
  for (const [state, weight] of Object.entries(BRIGHTNESS_WEIGHTS)) {
    assert.ok(rule.formula.includes(`${state}=${weight}`),
      `公式缺 ${state}=${weight}：${rule.formula}`);
  }

  // 範圍與引擎正規化一致：陷=1/7≈14%、廟=100%
  assert.equal(rule.maxValue, 100);
  assert.equal(rule.minValue, Math.round((1 / 7) * 100));
  assert.equal(brightnessScore('廟'), 1);
  assert.equal(brightnessScore('陷'), 0.14);
  assert.equal(brightnessScore('不'), 0.29);
  assert.equal(brightnessScore(''), null);
});

test('每條規則可印出完整計分方式（雷達陷阱防線）', () => {
  const rules = new ScoringRules();
  const snapshot = rules.exportRules();
  assert.ok(snapshot.totalRules > 0);

  for (const ruleSet of Object.values(snapshot.byRadarType)) {
    for (const rule of ruleSet) {
      const text = rules.formatRuleAsText(rule);
      assert.ok(text.includes('公式：'), `${rule.id} 印不出公式`);
      assert.ok(text.includes('範圍：'), `${rule.id} 印不出範圍`);
      assert.ok(text.includes('版本：'), `${rule.id} 印不出版本`);
    }
  }
});

test('重複註冊同 id 規則會拋錯', () => {
  const rules = new ScoringRules();
  const dup = rules.getRule('bazi_wood_strength');
  assert.throws(() => rules.addRule(dup));
});

test('自訂規則需通過欄位驗證', () => {
  const rules = new ScoringRules();
  assert.throws(() => rules.addRule({ id: 'bad_rule' }), /missing required field/);
  assert.throws(() => rules.addRule({
    id: 'bad_range', radarType: 't', axisName: 'a', sourceSystem: 's',
    formula: 'f', description: 'd', inputs: ['x'],
    maxValue: 0, minValue: 100, unit: '%', version: '1.0.0',
  }), /maxValue/);
});
