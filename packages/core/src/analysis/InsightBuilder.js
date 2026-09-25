/**
 * @fileoverview Re-groups existing engine output around user questions:
 * life domains, the current year, and non-prescriptive balancing suggestions.
 */

export const INSIGHT_VERSION = 1;

const DOMAIN_DEFINITIONS = Object.freeze([
  { id: 'career', title: '事業', palace: '官祿', tenGods: ['官殺', '食傷'], focus: '責任結構與輸出方式' },
  { id: 'relationship', title: '感情', palace: '夫妻', tenGods: ['財星', '比劫'], focus: '關係互動與資源界線' },
  { id: 'wealth', title: '財富', palace: '財帛', tenGods: ['財星', '食傷'], focus: '資源交換與價值產出' },
  { id: 'wellbeing', title: '身心節律', palace: '疾厄', tenGods: ['印星', '比劫'], focus: '休息、支持與日常節奏' },
]);

const PERSONAL_YEAR_THEMES = Object.freeze({
  1: '啟動與自主', 2: '協作與耐心', 3: '表達與創作', 4: '整理與打底', 5: '變化與嘗試',
  6: '責任與關係', 7: '內省與研究', 8: '執行與資源', 9: '收尾與整合',
});

const TAI_SUI_PAIRS = Object.freeze({
  沖: ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'],
  刑: ['子卯', '寅巳', '巳申', '申寅', '丑戌', '戌未', '未丑'],
  害: ['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌'],
  六合: ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'],
});

const ELEMENT_GUIDANCE = Object.freeze({
  木: { color: '青綠、木色', direction: '東方', habit: '替成長目標留出固定時段，並用散步或伸展切換狀態' },
  火: { color: '朱紅、暖橙', direction: '南方', habit: '安排適量日照、表達或創作活動，讓想法有可見出口' },
  土: { color: '米黃、陶土色', direction: '中央／居所', habit: '用規律作息、收納與可完成的小任務建立安定感' },
  金: { color: '白、銀灰', direction: '西方', habit: '精簡物品與待辦，替界線、規則與決策留下清楚文字' },
  水: { color: '深藍、墨色', direction: '北方', habit: '保留安靜反思與彈性移動的時間，避免行程排得過滿' },
});

function engineById(engines, id) {
  return (engines ?? []).find(engine => engine.engineId === id);
}

function component(engine, idOrCategory) {
  return engine?.components?.find(item => item.id === idOrCategory || item.category === idOrCategory);
}

function source(system, item) {
  return item ? { system, componentId: item.id, name: item.name } : null;
}

function uniqueSources(items) {
  const seen = new Set();
  return items.filter(Boolean).filter(item => {
    const key = `${item.system}/${item.componentId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function describeTaiSui(natalGanZhi, annualGanZhi) {
  const natalBranch = natalGanZhi?.slice(-1);
  const annualBranch = annualGanZhi?.slice(-1);
  if (!natalBranch || !annualBranch) return null;
  const pair = `${natalBranch}${annualBranch}`;
  const reversePair = `${annualBranch}${natalBranch}`;
  let relation = '無直接配對';
  if (natalBranch === annualBranch) {
    relation = '值太歲';
  } else {
    for (const [name, pairs] of Object.entries(TAI_SUI_PAIRS)) {
      if (pairs.includes(pair) || pairs.includes(reversePair)) {
        relation = name === '六合' ? name : `${name}太歲`;
        break;
      }
    }
  }
  const description = relation === '無直接配對'
    ? `生肖年支${natalBranch}與流年太歲${annualBranch}未見值、沖、刑、害或六合的直接配對`
    : `生肖年支${natalBranch}與流年太歲${annualBranch}呈${relation}`;
  return { natalBranch, annualBranch, relation, description };
}

function buildDomains(engines, radars) {
  const ziwei = engineById(engines, 'ziwei');
  const bazi = engineById(engines, 'bazi');
  const palaceComponents = ziwei?.components?.filter(item => item.category === 'palaces') ?? [];
  const palaceRadar = (radars ?? []).find(radar => radar.id === 'ziwei_palace_strength');
  const context = component(bazi, 'tenGodsContext');
  const groups = context?.value?.groups ?? [];
  const currentDaXian = ziwei?.components?.find(item => item.category === 'daXian' && item.value?.isCurrent);

  return DOMAIN_DEFINITIONS.map(definition => {
    const palace = palaceComponents.find(item => item.value?.name === definition.palace);
    const axis = palaceRadar?.axes?.find(item => item.label === definition.palace);
    const relatedGroups = definition.tenGods
      .map(name => groups.find(group => group.group === name))
      .filter(Boolean);
    const metrics = [];
    if (axis) metrics.push({ label: `${definition.palace}宮力量`, value: Math.round(axis.value), unit: '分' });
    for (const group of relatedGroups) {
      metrics.push({ label: group.group, value: Math.round(group.share * 100), unit: '%結構占比' });
    }

    const stars = palace?.value?.majorStars?.map(star => star.name) ?? [];
    const starText = stars.length ? `主星為${stars.join('、')}` : '本宮無主星，需連同對宮閱讀';
    const structureText = relatedGroups.length
      ? relatedGroups.map(group => `${group.group}${Math.round(group.share * 100)}%`).join('、')
      : '';
    const hasEvidence = Boolean(palace || relatedGroups.length);
    const parts = [];
    if (palace && axis) parts.push(`${definition.palace}宮力量為 ${Math.round(axis.value)} 分，${starText}`);
    if (structureText) parts.push(`八字可同步觀察${structureText}`);
    parts.push(hasEvidence
      ? `適合把這張卡當作「${definition.focus}」的自我觀察入口`
      : '可用資料不足，本卡不產生領域推論');

    return {
      ...definition,
      score: axis ? Math.round(axis.value) : null,
      insufficientData: !hasEvidence,
      metrics,
      insight: parts.join('；') + '。',
      stage: currentDaXian
        ? `目前大限落在${currentDaXian.value.palaceName}宮（虛歲 ${currentDaXian.value.range.join('–')}），可將它視為這一階段的背景重心。`
        : '',
      sources: uniqueSources([
        source('ziwei', palace),
        source('bazi', context),
        source('ziwei', currentDaXian),
      ]),
      limitations: definition.id === 'wellbeing'
        ? ['此處只談生活節律的象徵性觀察，不是醫療評估或健康診斷。']
        : [],
    };
  });
}

function buildAnnual(engines, asOf) {
  const year = Number(String(asOf).slice(0, 4));
  const bazi = engineById(engines, 'bazi');
  const ziwei = engineById(engines, 'ziwei');
  const numerology = engineById(engines, 'numerology');
  const natal = component(bazi, 'natal');
  const liuNian = component(bazi, 'liuNian');
  const taiSui = describeTaiSui(natal?.value?.year, liuNian?.value?.ganZhi);
  const currentDaYun = bazi?.components?.find(item => item.category === 'daYun' && item.value?.isCurrent);
  const flyingStars = component(ziwei, 'flyingStars');
  const xiaoXian = component(ziwei, 'xiaoXian');
  const currentDaXian = ziwei?.components?.find(item => item.category === 'daXian' && item.value?.isCurrent);
  const personalYear = component(numerology, 'personalYear');
  const palaces = ziwei?.components?.filter(item => item.category === 'palaces') ?? [];
  const yearlyPalace = palaces.find(item => item.value?.index === flyingStars?.value?.palaceIndex);
  const themes = [];

  if (liuNian || personalYear) {
    const fragments = [];
    if (liuNian) fragments.push(`八字流年為${liuNian.value.ganZhi}`);
    if (taiSui) fragments.push(`${taiSui.description}；這裡只比對年支，不延伸為吉凶判定`);
    if (personalYear) {
      const number = personalYear.value.number;
      fragments.push(`生命靈數走個人年 ${number}，主題偏向${PERSONAL_YEAR_THEMES[number] ?? '年度整理'}`);
    }
    themes.push({
      id: 'year-rhythm',
      title: '年度節奏',
      text: `${fragments.join('；')}。這些是年度觀察標籤，不代表事件必然發生。`,
      taiSui,
      sources: uniqueSources([source('bazi', natal), source('bazi', liuNian), source('numerology', personalYear)]),
    });
  }

  if (flyingStars) {
    const labels = ['祿', '權', '科', '忌'];
    const transforms = flyingStars.value.mutagen
      .map((star, index) => `${star}化${labels[index]}`)
      .join('、');
    themes.push({
      id: 'year-transforms',
      title: '流年四化',
      text: `${year} 年四化為${transforms}${yearlyPalace ? `，流年盤定位在${yearlyPalace.value.name}宮` : ''}；適合用來追蹤今年注意力落點。`,
      sources: uniqueSources([source('ziwei', flyingStars), source('ziwei', yearlyPalace)]),
    });
  }

  if (currentDaYun || currentDaXian || xiaoXian) {
    const fragments = [];
    if (currentDaYun) fragments.push(`八字在${currentDaYun.value.ganZhi}大運（${currentDaYun.value.startYear}–${currentDaYun.value.endYear}）`);
    if (currentDaXian) fragments.push(`紫微大限落${currentDaXian.value.palaceName}宮`);
    if (xiaoXian) fragments.push(`本年小限落第 ${xiaoXian.value.palaceIndex + 1} 宮位`);
    themes.push({
      id: 'stage-background',
      title: '階段背景',
      text: `${fragments.join('；')}。年度訊號宜放在這個十年背景下交叉觀察。`,
      sources: uniqueSources([source('bazi', currentDaYun), source('ziwei', currentDaXian), source('ziwei', xiaoXian)]),
    });
  }

  return {
    year,
    title: `${year} 本年運勢觀察`,
    headline: themes.length ? '先看年度節奏，再回到你正在經歷的長期階段。' : '可用的年度資料不足，本區不補寫推論。',
    themes,
    limitations: ['本年內容是象徵性觀察與回顧提示，不構成投資、醫療或人生決策建議。'],
  };
}

function buildGuidance(engines) {
  const bazi = engineById(engines, 'bazi');
  const numerology = engineById(engines, 'numerology');
  const minggua = engineById(engines, 'minggua');
  const elements = component(bazi, 'elements');
  const directions = component(minggua, 'directions');
  const lifePath = component(numerology, 'lifePath');
  const personalYear = component(numerology, 'personalYear');
  let balance = null;

  if (elements?.value?.counts) {
    const counts = Object.entries(elements.value.counts);
    const minimum = Math.min(...counts.map(([, count]) => count));
    const weakest = counts.filter(([, count]) => count === minimum).map(([element]) => element);
    const element = weakest[0];
    balance = {
      element,
      tiedElements: weakest,
      count: minimum,
      ...ELEMENT_GUIDANCE[element],
      text: `五行出現次數中${weakest.join('、')}最低。若想平衡「${element}」所象徵的面向，可以從色彩、空間方位與日常節奏做小幅嘗試。`,
      source: source('bazi', elements),
      limitation: elements.value.limitation,
    };
  }

  const auspicious = Object.entries(directions?.value?.auspicious ?? {}).map(([name, value]) => ({
    name,
    code: value.code,
    direction: value.zh,
  }));
  const numbers = [...new Set([
    lifePath?.value?.number,
    personalYear?.value?.number,
  ].filter(Number.isFinite))];

  return {
    balance,
    directions: auspicious,
    numbers,
    numberLabel: '可作為提醒符號的數字',
    sources: uniqueSources([
      source('bazi', elements), source('minggua', directions),
      source('numerology', lifePath), source('numerology', personalYear),
    ]),
    limitations: [
      '顏色、方位與數字屬於低風險的自我提醒，不宣稱能改變外在事件。',
      '五行出現次數不等同喜用神判定；完整喜用神仍需月令、旺衰與調候等另行評估。',
    ],
  };
}

export class InsightBuilder {
  /**
   * @param {Object[]} engines
   * @param {Object[]} radars
   * @param {{ asOf?: Date|string }} [options]
   */
  static build(engines, radars, { asOf } = {}) {
    return {
      version: INSIGHT_VERSION,
      domains: buildDomains(engines, radars),
      annual: buildAnnual(engines, asOf),
      guidance: buildGuidance(engines),
    };
  }
}
