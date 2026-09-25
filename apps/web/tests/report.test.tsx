import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompatReport } from '../src/components/compat/CompatReport';
import { formulaText } from '../src/components/report/Charts';
import { band } from '../src/components/report/Domains';
import { ReportView } from '../src/components/report/ReportView';
import { analyze, analyzeCompatibility } from '../src/lib/core';
import {
  baziStructure, identity, kin, mingGua, notices, numerology, pillars, soulStars, ziweiBoard,
} from '../src/model/selectors';
import type { BirthInput } from '../src/model/types';

const BASE: BirthInput = {
  name: 'Wang Xiaoming', year: 1991, month: 10, day: 5, hour: 14, minute: 0,
  timeKnown: true, gender: 'female', calendarType: 'solar',
};
const report = analyze(BASE);
const unknownTime = analyze({ ...BASE, name: '', timeKnown: false });

describe('selectors', () => {
  test('pillars read right-to-left (時 日 月 年) with element tags', () => {
    const columns = pillars(report)!;
    expect(columns.map(column => column.key)).toEqual(['time', 'day', 'month', 'year']);
    expect(columns.map(column => column.stem + column.branch)).toEqual(['己未', '戊申', '丁酉', '辛未']);
    expect(columns[1].stemElement).toBe('土');
  });

  test('Zi Wei board places all twelve palaces on distinct border cells', () => {
    const board = ziweiBoard(report)!;
    expect(board.palaces).toHaveLength(12);
    const cells = new Set(board.palaces.map(palace => `${palace.row},${palace.column}`));
    expect(cells.size).toBe(12);
    for (const palace of board.palaces) {
      const onBorder = palace.row === 1 || palace.row === 4 || palace.column === 1 || palace.column === 4;
      expect(onBorder).toBe(true);
      expect(palace.score).toBeGreaterThanOrEqual(0);
      expect(palace.score).toBeLessThanOrEqual(100);
    }
    expect(board.palaces.filter(palace => palace.isSoul)).toHaveLength(1);
    expect(board.palaces.filter(palace => palace.isCurrentDecade)).toHaveLength(1);
  });

  test('an empty soul palace borrows the opposite palace and says so', () => {
    const soul = soulStars(report)!;
    expect(soul.borrowed).toBe(true);
    expect(soul.text).toContain('借遷移');
  });

  test('identity ledger covers all five systems', () => {
    expect(identity(report).map(row => row.system)).toEqual(['bazi', 'ziwei', 'numerology', 'dreamspell', 'minggua']);
  });

  test('BaZi structure shares sum to one', () => {
    const structure = baziStructure(report)!;
    const total = structure.elements.reduce((sum, item) => sum + item.share, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(structure.groups.every(group => ['顯', '隱', '無'].includes(group.presence))).toBe(true);
  });

  test('numerology grid uses the 3-6-9 / 2-5-8 / 1-4-7 layout', () => {
    expect(numerology(report)!.grid.map(cell => cell.digit).join('')).toBe('369258147');
  });

  test('八宅 compass has four auspicious and four inauspicious directions', () => {
    const compass = mingGua(report)!.compass;
    expect(compass).toHaveLength(8);
    expect(compass.filter(item => item.good)).toHaveLength(4);
  });

  test('unknown birth time drops time-dependent systems and reports why', () => {
    expect(pillars(unknownTime)).toBeNull();
    expect(ziweiBoard(unknownTime)).toBeNull();
    expect(kin(unknownTime)).not.toBeNull();
    expect(notices(unknownTime).unavailable).toHaveLength(2);
    expect(identity(unknownTime).map(row => row.system)).toEqual(['numerology', 'dreamspell', 'minggua']);
  });
});

describe('rendering', () => {
  test('full report renders every chapter and escapes user text', () => {
    const html = renderToStaticMarkup(
      <ReportView report={{ ...report, input: { ...report.input, name: '<img src=x onerror=alert(1)>' } }} onBack={() => {}} />,
    );
    for (const title of ['命格', '本年', '領域', '命盤', '運程', '情境', '建議', '方法']) expect(html).toContain(title);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    // Every tab panel is rendered (hidden) so print can show them all.
    expect(html.match(/role="tabpanel"/g)).toHaveLength(5);
  });

  test('unknown-time report renders with a scope notice instead of failing', () => {
    const html = renderToStaticMarkup(<ReportView report={unknownTime} onBack={() => {}} />);
    expect(html).toContain('計算範圍');
    expect(html).toContain('八字四柱未排出');
  });

  test('compatibility report renders both people and the overlay radar', () => {
    const result = analyzeCompatibility(BASE, { ...BASE, name: '李小華', year: 1986, month: 5, day: 29, gender: 'male' });
    const html = renderToStaticMarkup(<CompatReport result={result} onBack={() => {}} />);
    expect(html).toContain('李小華');
    expect(html).toContain('兩人五行占比疊圖');
    expect(html.match(/class="radar__series/g)).toHaveLength(2);
  });
});

describe('display helpers', () => {
  test('domain bands', () => {
    expect([20, 40, 60, 80].map(band)).toEqual(['低', '中', '中高', '高']);
  });

  test('formulas are rendered from the actual inputs', () => {
    const balance = report.radars.find(radar => radar.id === 'bazi_element_balance')!;
    const wood = balance.axes.find(axis => axis.key === 'wood')!;
    expect(formulaText(wood, undefined)).toBe(`2 ÷ 14 × 100% = ${wood.value}%`);
    const strength = report.radars.find(radar => radar.id === 'ziwei_palace_strength')!;
    expect(formulaText(strength.axes[0], undefined)).toStartWith('主星亮度');
  });
});
