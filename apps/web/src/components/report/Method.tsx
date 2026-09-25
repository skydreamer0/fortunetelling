/** 附 方法 — layers, honesty audit and calculation conventions, collapsed by default. */

import { SYSTEM_NAMES } from '../../model/selectors';
import type { Report } from '../../model/types';
import { Section } from '../ui/primitives';

export function Method({ report }: { report: Report }) {
  const layers = report.layers;
  const bazi = report.engines.find(item => item.engineId === 'bazi');
  const convention = bazi?.components.find(item => item.category === 'natal')?.value?.convention;
  return (
    <Section id="ch-method" index="附" title="方法" lede="報告怎麼算、用什麼語氣說話，以及目前的已知限制。">
      <div className="method">
        <details className="audit">
          <summary>動靜四層：每個部件屬於哪個時間尺度</summary>
          <div className="layers">
            {layers.layerDefinitions.map(definition => {
              const components = layers.components.filter(item => item.layer === definition.code);
              return (
                <article key={definition.code} className="layer">
                  <h4><span className="layer__code">{definition.code}</span>{definition.name}</h4>
                  <p className="layer__meta">{definition.timeScale}・語氣「{definition.languageRule}」</p>
                  <p>{definition.description}</p>
                  <p className="layer__parts">
                    {components.map(item => (
                      <span key={`${item.sourceSystem}/${item.id}`} data-system={item.sourceSystem}
                        title={item.unclassified ? '尚無分類規則，保守歸入此層' : SYSTEM_NAMES[item.sourceSystem]}>
                        {item.name}{item.unclassified ? '＊' : ''}
                      </span>
                    ))}
                  </p>
                </article>
              );
            })}
          </div>
        </details>

        <details className="audit">
          <summary>語氣稽核</summary>
          <p>
            報告文字依層級限制語氣：只有恆定層可以說「你是」，其餘層級只能描述時期或情境。
            本次稽核{report.honesty?.violations?.length ? `發現 ${report.honesty.violations.length} 處違規。` : '沒有發現違規。'}
          </p>
        </details>

        <details className="audit">
          <summary>計算約定與已知限制</summary>
          <ul className="method__list">
            <li>出生時間一律視為台灣時間（Asia/Taipei）。{convention?.trueSolarTime === false && '目前尚未做真太陽時校正。'}</li>
            <li>五行數值是天干、地支與藏干的出現次數，不代表旺衰、月令或喜用神。</li>
            <li>紫微宮位力量＝主星亮度 60%＋輔星 20%＋四化 20%，公式可在「命盤」各圖展開查看。</li>
            <li>馬雅曆以 1987-07-26 = Kin 34 為錨點。</li>
            <li>計分規則共 {report.scoringRules?.totalRules ?? 0} 條，全部隨報告匯出。</li>
          </ul>
        </details>

        <p className="method__stamp">
          評估基準日 {report.asOf}・核心 v{report.version}・報告格式 v{report.schemaVersion}
        </p>
      </div>
    </Section>
  );
}
