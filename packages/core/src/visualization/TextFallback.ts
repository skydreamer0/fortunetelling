/**
 * @fileoverview Text-Based Visualization Fallback
 *
 * Provides text-only chart representations using Unicode block characters.
 * Useful as an accessibility fallback when Canvas is unavailable, and for
 * plain-text report generation.
 *
 * Block characters used:
 *   █ (U+2588) - Full block   → filled portion
 *   ▓ (U+2593) - Dark shade   → threshold marker
 *   ░ (U+2591) - Light shade  → empty portion
 *
 * @module visualization/TextFallback
 */

// ─── Constants ──────────────────────────────────────────────────────────────

const CHAR_FULL = '█';
const CHAR_THRESHOLD = '▓';
const CHAR_EMPTY = '░';
const DEFAULT_BAR_WIDTH = 20;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TextBarOptions {
  barWidth?: number;
  labelWidth?: number;
  showPercentage?: boolean;
  showValue?: boolean;
  threshold?: number | null;
}

export interface TextBarChartData {
  /** Chart title */
  title: string;
  /** Data items */
  items: { label: string; value: number }[];
  /** Explicit max (auto-detected if omitted) */
  maxValue?: number;
}

export interface TextRadarAxis {
  name: string;
  value: number;
  maxValue: number;
  percentage: number;
  scoringRule: { formula?: string; description?: string } | null | undefined;
}

export interface TextRadarData {
  /** Radar type identifier */
  type: string;
  /** Display title */
  title: string;
  axes: TextRadarAxis[];
  datasets?: { label: string; sourceSystem: string; values: number[] }[];
}

export interface TextRadarOptions {
  barWidth?: number;
  /** Append scoring rule references */
  showRules?: boolean;
  /** Show asset/liability for high/low axes */
  showAssets?: boolean;
}

export interface TextTimelineData {
  title?: string;
  periods: { startYear: number; endYear: number; label: string; highlight: boolean; metrics: Record<string, number> }[];
}

// ─── Single Bar Rendering ───────────────────────────────────────────────────

/**
 * Render a single text-based bar.
 *
 * Example output:
 *   水 ████████░░░░░░░░░░░░ 78%
 *
 * @param label    - Axis / category label
 * @param value    - Current value
 * @param maxValue - Maximum possible value
 * @param options.barWidth       - (default 20) Total bar character width
 * @param options.labelWidth      - (default 6) Padded label width
 * @param options.showPercentage - (default true)
 * @param options.showValue - (default false)
 * @param options.threshold - (default null) Optional threshold marker position
 */
export function renderTextBar(label: string, value: number, maxValue: number, options: TextBarOptions = {}): string {
  const {
    barWidth = DEFAULT_BAR_WIDTH,
    labelWidth = 6,
    showPercentage = true,
    showValue = false,
    threshold = null
  } = options;

  const clampedValue = Math.max(0, Math.min(value, maxValue));
  const percentage = maxValue > 0 ? (clampedValue / maxValue) * 100 : 0;
  const filledCount = Math.round((clampedValue / maxValue) * barWidth);
  const emptyCount = barWidth - filledCount;

  let bar = '';
  if (threshold !== null) {
    const thresholdPos = Math.round((threshold / maxValue) * barWidth);
    for (let i = 0; i < barWidth; i++) {
      if (i === thresholdPos) {
        bar += CHAR_THRESHOLD;
      } else if (i < filledCount) {
        bar += CHAR_FULL;
      } else {
        bar += CHAR_EMPTY;
      }
    }
  } else {
    bar = CHAR_FULL.repeat(filledCount) + CHAR_EMPTY.repeat(emptyCount);
  }

  const paddedLabel = label.padEnd(labelWidth, ' ');
  const suffixes: string[] = [];
  if (showPercentage) suffixes.push(`${Math.round(percentage)}%`);
  if (showValue) suffixes.push(`(${clampedValue}/${maxValue})`);

  return `${paddedLabel} ${bar} ${suffixes.join(' ')}`;
}

// ─── Bar Chart (Multiple Bars) ──────────────────────────────────────────────

/**
 * Render a complete text-based bar chart.
 *
 * @param data.title          - Chart title
 * @param data.items - Data items
 * @param data.maxValue     - Explicit max (auto-detected if omitted)
 * @param options.barWidth - (default 20)
 * @param options.sorted - (default false) Sort bars descending by value
 */
export function renderTextBarChart(data: TextBarChartData, options: { barWidth?: number; sorted?: boolean } = {}): string {
  const { barWidth = DEFAULT_BAR_WIDTH, sorted = false } = options;

  let items = [...data.items];
  if (sorted) {
    items.sort((a, b) => b.value - a.value);
  }

  const maxValue = data.maxValue ?? Math.max(...items.map(i => i.value), 1);
  const maxLabelLen = Math.max(...items.map(i => i.label.length), 2);

  const lines: string[] = [];

  if (data.title) {
    lines.push(`┌─ ${data.title} ${'─'.repeat(Math.max(0, barWidth + maxLabelLen - data.title.length))}┐`);
    lines.push('');
  }

  for (const item of items) {
    lines.push(renderTextBar(item.label, item.value, maxValue, {
      barWidth,
      labelWidth: maxLabelLen + 1,
      showPercentage: true,
      showValue: true
    }));
  }

  if (data.title) {
    lines.push('');
    lines.push(`└${'─'.repeat(barWidth + maxLabelLen + 14)}┘`);
  }

  return lines.join('\n');
}

// ─── Radar Chart (Text) ────────────────────────────────────────────────────

/**
 * Render a full text-based radar representation.
 *
 * Since true radial layout is impractical in text, this renders as a
 * labelled bar list with a header. Each axis gets a bar with its scoring
 * rule reference.
 *
 * Example output:
 * ```
 * ╔═══════════════════════════════════════╗
 * ║  五行平衡雷達  Element Balance Radar  ║
 * ╠═══════════════════════════════════════╣
 * ║ 木   ████████████░░░░░░░░ 60%        ║
 * ║ 火   ██████████████░░░░░░ 70%        ║
 * ║ 土   ████░░░░░░░░░░░░░░░░ 20%        ║
 * ║ 金   ██████░░░░░░░░░░░░░░ 30%        ║
 * ║ 水   ████████████████████ 100%       ║
 * ╚═══════════════════════════════════════╝
 * ```
 *
 * @param radarData.type       - Radar type identifier
 * @param radarData.title      - Display title
 * @param options.barWidth - (default 20)
 * @param options.showRules   - (default true) Append scoring rule references
 * @param options.showAssets  - (default true) Show asset/liability for high/low axes
 */
export function renderTextRadar(radarData: TextRadarData, options: TextRadarOptions = {}): string {
  const {
    barWidth = DEFAULT_BAR_WIDTH,
    showRules = true,
    showAssets = true
  } = options;

  const axes = radarData.axes ?? [];
  const datasets = radarData.datasets ?? [];
  const maxLabelLen = Math.max(...axes.map(a => a.name.length), 2);
  const innerWidth = barWidth + maxLabelLen + 18;

  const lines: string[] = [];

  // Header
  lines.push(`╔${'═'.repeat(innerWidth)}╗`);
  const titleLine = `  ${radarData.title}  `;
  const titlePad = Math.max(0, innerWidth - titleLine.length);
  const leftPad = Math.floor(titlePad / 2);
  const rightPad = titlePad - leftPad;
  lines.push(`║${' '.repeat(leftPad)}${titleLine}${' '.repeat(rightPad)}║`);
  lines.push(`╠${'═'.repeat(innerWidth)}╣`);

  // If we have multiple datasets, render them separately
  if (datasets.length > 1) {
    for (const dataset of datasets) {
      lines.push(`║  ── ${dataset.label} (${ dataset.sourceSystem ?? '?' }) ──${' '.repeat(Math.max(0, innerWidth - dataset.label.length - (dataset.sourceSystem?.length ?? 1) - 12))}║`);
      for (let i = 0; i < axes.length; i++) {
        const axis = axes[i];
        const value = dataset.values[i] ?? 0;
        const bar = renderTextBar(axis.name, value, axis.maxValue, {
          barWidth,
          labelWidth: maxLabelLen + 1,
          showPercentage: true
        });
        const padded = bar.padEnd(innerWidth - 2);
        lines.push(`║ ${padded} ║`);
      }
      lines.push(`║${' '.repeat(innerWidth)}║`);
    }
  } else {
    // Single dataset – use axes directly
    for (const axis of axes) {
      const bar = renderTextBar(axis.name, axis.value, axis.maxValue, {
        barWidth,
        labelWidth: maxLabelLen + 1,
        showPercentage: true
      });
      let suffix = '';
      if (showAssets && axis.percentage !== undefined) {
        if (axis.percentage >= 80) suffix = ' ★ 資產';
        else if (axis.percentage <= 20) suffix = ' ▽ 負債';
      }
      const content = `${bar}${suffix}`;
      const padded = content.padEnd(innerWidth - 2);
      lines.push(`║ ${padded} ║`);
    }
  }

  // Scoring rules footer
  if (showRules && axes.some(a => a.scoringRule)) {
    lines.push(`╠${'═'.repeat(innerWidth)}╣`);
    lines.push(`║${'  評分規則：'.padEnd(innerWidth)}║`);
    for (const axis of axes) {
      if (axis.scoringRule) {
        const ruleText = `  ${axis.name}：${axis.scoringRule.formula ?? axis.scoringRule.description ?? '—'}`;
        const truncated = ruleText.length > innerWidth - 2
          ? ruleText.slice(0, innerWidth - 5) + '…'
          : ruleText;
        lines.push(`║ ${truncated.padEnd(innerWidth - 2)} ║`);
      }
    }
  }

  // Footer
  lines.push(`╚${'═'.repeat(innerWidth)}╝`);

  return lines.join('\n');
}

// ─── Frequency Distribution ─────────────────────────────────────────────────

/**
 * Render a numerology digit frequency distribution in text.
 *
 * Example:
 *   1 ████████░░ 4次
 *   2 ██░░░░░░░░ 1次
 *
 * @param frequencies - { "1": 4, "2": 1, ... }
 * @param options.barWidth - (default 10)
 */
export function renderDigitFrequency(frequencies: Record<string, number>, options: { barWidth?: number } = {}): string {
  const { barWidth = 10 } = options;
  const maxFreq = Math.max(...Object.values(frequencies), 1);

  const lines: string[] = [];
  lines.push('┌─ 數字頻率分佈 ─────────────┐');
  lines.push('');

  const sortedKeys = Object.keys(frequencies).sort((a, b) => Number(a) - Number(b));
  for (const digit of sortedKeys) {
    const count = frequencies[digit];
    const filled = Math.round((count / maxFreq) * barWidth);
    const empty = barWidth - filled;
    lines.push(`  ${digit} ${CHAR_FULL.repeat(filled)}${CHAR_EMPTY.repeat(empty)} ${count}次`);
  }

  lines.push('');
  lines.push('└────────────────────────────┘');
  return lines.join('\n');
}

// ─── Evolution Timeline (Text) ──────────────────────────────────────────────

/**
 * Render a text-based timeline for evolution data.
 */
export function renderTextTimeline(evolutionData: TextTimelineData, options: { barWidth?: number } = {}): string {
  const { barWidth = 8 } = options;
  const periods = evolutionData.periods ?? [];

  const lines: string[] = [];
  lines.push(`═══ ${evolutionData.title ?? '時間線演化'} ═══`);
  lines.push('');

  const timelineBar = periods
    .map(p => p.highlight ? `【${p.startYear}-${p.endYear}】` : `─${p.startYear}-${p.endYear}─`)
    .join('');
  lines.push(timelineBar);
  lines.push('');

  for (const period of periods) {
    const marker = period.highlight ? '▶' : '·';
    lines.push(`${marker} ${period.startYear}–${period.endYear}  ${period.label}`);
    if (period.metrics) {
      const metricEntries = Object.entries(period.metrics);
      for (const [key, val] of metricEntries) {
        const maxVal = 100;
        const filled = Math.round((val / maxVal) * barWidth);
        const empty = barWidth - filled;
        lines.push(`    ${key.padEnd(6)} ${CHAR_FULL.repeat(filled)}${CHAR_EMPTY.repeat(empty)} ${Math.round(val)}%`);
      }
    }
  }

  return lines.join('\n');
}

// ─── Composite Report ───────────────────────────────────────────────────────

/**
 * Render a complete text-based report with multiple radar charts.
 *
 * @param radarDataList - Array of radarData objects
 */
export function renderTextReport(radarDataList: TextRadarData[], options: TextRadarOptions = {}): string {
  const sections = radarDataList.map(rd => renderTextRadar(rd, options));
  return sections.join('\n\n');
}
