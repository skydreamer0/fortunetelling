/** 伍 命盤 — one tab per system, each with its own chart and transparent scoring. */

import { useState } from 'react';
import {
  ELEMENT_KEY, baziStructure, kin, mingGua, numerology, radar as findRadar, rulesById, ziweiBoard,
} from '../../model/selectors';
import type { Radar as RadarData, Report, ScoringRule } from '../../model/types';
import { Radar, niceMax } from '../ui/Radar';
import { EmptyNote, Section, TabPanel, Tabs } from '../ui/primitives';
import { ZiweiBoard } from './ZiweiBoard';

type TabId = 'ziwei' | 'bazi' | 'numerology' | 'kin' | 'gua';

/** Human-readable calculation for an axis; falls back to the rule's raw formula. */
export function formulaText(axis: RadarData['axes'][number], rule: ScoringRule | undefined): string {
  const inputs = axis.inputs ?? {};
  const elementCount = Object.entries(inputs).find(([key]) => key.endsWith('Count') && key !== 'totalElements');
  if (axis.ruleId.startsWith('bazi_') && elementCount && 'totalElements' in inputs) {
    return `${elementCount[1]} ÷ ${inputs.totalElements} × 100% = ${axis.value}%`;
  }
  if (axis.ruleId === 'ziwei_palace_strength') {
    const aux = Math.min((inputs.auxiliaryStarCount ?? 0) * 10, 100);
    return `主星亮度 ${inputs.mainStarBrightness ?? 0} × 0.6 ＋ 輔星 ${aux} × 0.2 ＋ 四化 ${inputs.fourTransformBonus ?? 0} × 0.2 = ${axis.value}`;
  }
  return rule?.formula ?? axis.ruleId;
}

function RuleTable({ data, rules }: { data: RadarData; rules: Map<string, ScoringRule> }) {
  const descriptions = [...new Set(data.axes.map(axis => rules.get(axis.ruleId)?.description).filter(Boolean))];
  return (
    <details className="audit">
      <summary>逐軸計算方式</summary>
      {descriptions.length === 1 && <p className="audit__lede">{descriptions[0]}</p>}
      <table className="audit__table">
        <thead><tr><th scope="col">軸</th><th scope="col">值</th><th scope="col">計算</th></tr></thead>
        <tbody>
          {data.axes.map(axis => (
            <tr key={axis.key}>
              <th scope="row">{axis.label}</th>
              <td>{axis.value}{axis.unit}</td>
              <td><code>{formulaText(axis, rules.get(axis.ruleId))}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function AxisNotes({ data, threshold = 60 }: { data: RadarData; threshold?: number }) {
  const high = data.axes.filter(axis => axis.value >= threshold && (axis.assets?.length || axis.liabilities?.length));
  if (!high.length) return null;
  return (
    <div className="axis-notes">
      {high.map(axis => (
        <article key={axis.key} className="axis-note">
          <h4>{axis.label}<span>{axis.value}{axis.unit}</span></h4>
          <p><b className="axis-note__tag axis-note__tag--asset">天賦面</b>{axis.assets?.join('、') || '—'}</p>
          <p><b className="axis-note__tag axis-note__tag--liability">課題面</b>{axis.liabilities?.join('、') || '—'}</p>
        </article>
      ))}
    </div>
  );
}

function ZiweiPanel({ report, rules }: { report: Report; rules: Map<string, ScoringRule> }) {
  const board = ziweiBoard(report);
  const strength = findRadar(report, 'ziwei_palace_strength');
  if (!board) return <EmptyNote>出生時辰不確定或命盤資料不完整，暫不排出十二宮。</EmptyNote>;
  return (
    <>
      <ZiweiBoard board={board} name={report.input.name} />
      {strength && (
        <div className="split">
          <Radar title="紫微十二宮力量" labels={strength.axes.map(axis => axis.label)}
            series={[{ name: '宮位力量', values: strength.axes.map(axis => axis.value), tone: 'primary' }]} />
          <div>
            <AxisNotes data={strength} threshold={70} />
            <RuleTable data={strength} rules={rules} />
          </div>
        </div>
      )}
    </>
  );
}

function BaziPanel({ report, rules }: { report: Report; rules: Map<string, ScoringRule> }) {
  const structure = baziStructure(report);
  const balance = findRadar(report, 'bazi_element_balance');
  if (!structure) return <EmptyNote>出生時辰不確定，八字結構未計算。</EmptyNote>;
  const maxGod = Math.max(1, ...structure.tenGods.map(item => item.count));
  return (
    <div className="bazi">
      <div className="split">
        {balance && (
          <Radar title="八字五行出現占比" labels={balance.axes.map(axis => axis.label)} unit="%"
            max={niceMax(balance.axes.map(axis => axis.value))}
            series={[{ name: '五行占比', values: balance.axes.map(axis => axis.value), tone: 'primary' }]} />
        )}
        <div>
          <h3 className="subhead">五行出現次數<small>共 {structure.elementTotal} 個（含藏干與日主）</small></h3>
          <ul className="elements">
            {structure.elements.map(item => (
              <li key={item.element} data-element={ELEMENT_KEY[item.element]}>
                <span className="elements__name">{item.element}</span>
                <span className="elements__bar"><span style={{ width: `${item.share * 100}%` }} /></span>
                <span className="elements__count">{item.count}</span>
              </li>
            ))}
          </ul>
          <p className="footnote">※ {structure.elementLimitation}</p>
          {balance && <RuleTable data={balance} rules={rules} />}
        </div>
      </div>

      <div className="split split--even">
        <div>
          <h3 className="subhead">十神統計</h3>
          <ul className="gods">
            {structure.tenGods.map(item => (
              <li key={item.name}>
                <span className="gods__name">{item.name}</span>
                <span className="gods__bar"><span style={{ width: `${(item.count / maxGod) * 100}%` }} /></span>
                <span className="gods__count">{item.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="subhead">十神關係角色<small>顯＝天干透出　隱＝只在藏干</small></h3>
          <ul className="roles">
            {structure.groups.map(group => (
              <li key={group.group} className="role" data-presence={group.presence}>
                <span className="role__presence">{group.presence}</span>
                <span className="role__name">{group.group}<small>{group.context}</small></span>
                <span className="role__share">{Math.round(group.share * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {balance && <AxisNotes data={balance} threshold={30} />}
    </div>
  );
}

function NumerologyPanel({ report }: { report: Report }) {
  const data = numerology(report);
  if (!data) return <EmptyNote>沒有生命靈數資料。</EmptyNote>;
  return (
    <div className="split split--even">
      <div>
        <dl className="numbers">
          {data.cells.map(cell => (
            <div key={cell.key} className={cell.key === 'lifePath' ? 'numbers__main' : ''}>
              <dt>{cell.label}</dt>
              <dd>{cell.number}{cell.isMaster && <small>大師數</small>}</dd>
            </div>
          ))}
          {data.personalYear && (
            <div><dt>{data.personalYear.year} 個人年</dt><dd>{data.personalYear.number}</dd></div>
          )}
          {data.personalMonth && (
            <div><dt>{data.personalMonth.month} 月個人月</dt><dd>{data.personalMonth.number}</dd></div>
          )}
        </dl>
        {data.notes.map(note => <p key={note} className="footnote">※ {note}</p>)}
      </div>
      <figure className="ninegrid-figure">
        <div className="ninegrid" role="table" aria-label="生日數字九宮格">
          {data.grid.map(cell => (
            <div key={cell.digit} role="cell" className={`ninegrid__cell${cell.count ? ' is-on' : ''}`}
              aria-label={`${cell.digit}：出現 ${cell.count} 次`}>
              <span className="ninegrid__digit">{cell.digit}</span>
              <span className="ninegrid__dots" aria-hidden="true">
                {Array.from({ length: Math.min(cell.count, 6) }, (_, index) => <i key={index} />)}
              </span>
            </div>
          ))}
        </div>
        <figcaption className="footnote">出生日期中 1–9 各出現幾次（0 不計）；點數即次數。</figcaption>
      </figure>
    </div>
  );
}

function KinPanel({ report }: { report: Report }) {
  const data = kin(report);
  if (!data) return <EmptyNote>沒有馬雅曆資料。</EmptyNote>;
  return (
    <div className="kin" data-color={data.color}>
      <div className="kin__glyph" aria-hidden="true">
        <span className="kin__number">{data.kin}</span>
        <span className="kin__of">/ 260</span>
      </div>
      <dl className="kin__facts">
        <div><dt>印記</dt><dd>{data.signature}</dd></div>
        {data.tone && <div><dt>銀河音階</dt><dd>{data.tone.number}・{data.tone.name}</dd></div>}
        {data.seal && <div><dt>圖騰</dt><dd>{data.seal.number}・{data.seal.name}</dd></div>}
        <div><dt>曆法錨點</dt><dd className="kin__epoch">{data.epoch}</dd></div>
      </dl>
    </div>
  );
}

const COMPASS_ZH: Record<string, string> = { N: '北', NE: '東北', E: '東', SE: '東南', S: '南', SW: '西南', W: '西', NW: '西北' };

function GuaPanel({ report }: { report: Report }) {
  const data = mingGua(report);
  if (!data) return <EmptyNote>沒有八宅命卦資料。</EmptyNote>;
  const size = 280;
  const center = size / 2;
  return (
    <div className="split split--even">
      <div>
        <p className="gua__name">{data.name}<small>卦</small></p>
        <p className="gua__meta">{data.groupName}・五行屬{data.elementZh}・以 {data.yearForGua} 年計</p>
        <ul className="gua__list" aria-label="左欄四吉方，右欄四凶方">
          {[...data.compass].sort((a, b) => Number(b.good) - Number(a.good)).map(item => (
            <li key={item.code} data-good={item.good}>
              <span>{item.name}</span><span>{COMPASS_ZH[item.code]}</span>
            </li>
          ))}
        </ul>
      </div>
      <svg className="compass" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="八宅吉凶方位圖（上為南）">
        {data.compass.map((item, index) => {
          // Traditional charts put south at the top; rotate so S (index 4) is up.
          const angle = ((index - 4) * 45 - 90) * (Math.PI / 180);
          const next = ((index - 4) * 45 - 45) * (Math.PI / 180);
          const previous = ((index - 4) * 45 - 135) * (Math.PI / 180);
          const r = center - 8;
          const mid = (value: number) => [center + Math.cos(value) * r, center + Math.sin(value) * r];
          const [ax, ay] = mid((angle + previous) / 2);
          const [bx, by] = mid((angle + next) / 2);
          const [lx, ly] = [center + Math.cos(angle) * r * 0.66, center + Math.sin(angle) * r * 0.66];
          return (
            <g key={item.code} className={`compass__sector${item.good ? ' is-good' : ''}`}>
              <path d={`M${center},${center} L${ax.toFixed(1)},${ay.toFixed(1)} L${bx.toFixed(1)},${by.toFixed(1)} Z`} />
              <text x={lx.toFixed(1)} y={(ly - 7).toFixed(1)} textAnchor="middle" className="compass__dir">{COMPASS_ZH[item.code]}</text>
              <text x={lx.toFixed(1)} y={(ly + 11).toFixed(1)} textAnchor="middle" className="compass__name">{item.name}</text>
            </g>
          );
        })}
        <circle cx={center} cy={center} r={30} className="compass__hub" />
        <text x={center} y={center + 7} textAnchor="middle" className="compass__gua">{data.name}</text>
      </svg>
    </div>
  );
}

export function Charts({ report }: { report: Report }) {
  const [tab, setTab] = useState<TabId>(ziweiBoard(report) ? 'ziwei' : 'numerology');
  const rules = rulesById(report);
  const prefix = 'charts';
  const tabs: { id: TabId; label: string }[] = [
    { id: 'ziwei', label: '紫微斗數' },
    { id: 'bazi', label: '八字' },
    { id: 'numerology', label: '生命靈數' },
    { id: 'kin', label: '馬雅曆' },
    { id: 'gua', label: '八宅命卦' },
  ];
  return (
    <Section id="ch-charts" index="伍" title="命盤" lede="各系統分開呈現；圖上的每個數值都能展開看到計算方式。">
      <Tabs label="命盤系統" tabs={tabs} active={tab} onChange={setTab} idPrefix={prefix} />
      <TabPanel prefix={prefix} id="ziwei" active={tab === 'ziwei'}><ZiweiPanel report={report} rules={rules} /></TabPanel>
      <TabPanel prefix={prefix} id="bazi" active={tab === 'bazi'}><BaziPanel report={report} rules={rules} /></TabPanel>
      <TabPanel prefix={prefix} id="numerology" active={tab === 'numerology'}><NumerologyPanel report={report} /></TabPanel>
      <TabPanel prefix={prefix} id="kin" active={tab === 'kin'}><KinPanel report={report} /></TabPanel>
      <TabPanel prefix={prefix} id="gua" active={tab === 'gua'}><GuaPanel report={report} /></TabPanel>
    </Section>
  );
}
