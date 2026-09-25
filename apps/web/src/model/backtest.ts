/**
 * Selectors for the 人生事件 panel (V4-03/V4-04). Pure functions over the core
 * `BacktestResult`; the component never reads core structures directly (D-030).
 * Wording rule: never claim predictive validity; n < 30 is always labelled
 * 「樣本不足，僅供參考」.
 */

import {
  BACKTEST_METHOD, INSUFFICIENT_SAMPLE, LIFE_EVENT_CATEGORIES, LIFE_EVENT_CATEGORY_LABELS,
  type BacktestGroup, type BacktestMetrics, type BacktestResult, type LifeEvent, type LifeEventCategory,
} from '../lib/core';
import { SIGNAL_SYSTEM_NAMES, TIMELINE_DOMAINS, type TimelineDomain } from './selectors';
import type { Report } from './types';

export const INSUFFICIENT_LABEL = '樣本不足，僅供參考';
export const SUFFICIENT_LABEL = '樣本足夠可評估（仍不代表預測力）';

export const CATEGORY_OPTIONS: readonly { value: LifeEventCategory; label: string }[] =
  LIFE_EVENT_CATEGORIES.map(value => ({ value, label: LIFE_EVENT_CATEGORY_LABELS[value] }));

export const DOMAIN_OPTIONS = TIMELINE_DOMAINS.map(({ domain, label, icon }) => ({ domain, label, icon }));

const domainMeta = (domain: string) => TIMELINE_DOMAINS.find(item => item.domain === domain);
const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

export interface BacktestRowView {
  key: string;
  label: string;
  n: number;
  hits: number;
  hitRate: string;
  baseline: string;
  randomBaseline: string;
  lift: string;
  insufficient: boolean;
  status: string;
  /** Validation-set summary, e.g. '驗證集 2 筆'. */
  validation: string;
}

function row(key: string, label: string, m: BacktestMetrics, validation: BacktestMetrics): BacktestRowView {
  const insufficient = m.status === INSUFFICIENT_SAMPLE;
  return {
    key,
    label,
    n: m.n,
    hits: m.hits,
    hitRate: pct(m.hitRate),
    baseline: pct(m.baseline),
    randomBaseline: pct(m.randomBaseline),
    lift: m.lift === null ? '—' : `×${m.lift.toFixed(2)}`,
    insufficient,
    status: insufficient ? INSUFFICIENT_LABEL : SUFFICIENT_LABEL,
    validation: validation.n === 0 ? '驗證集 0 筆' : `驗證集 ${validation.n} 筆，命中 ${validation.hits}`,
  };
}

export interface BacktestView {
  overall: BacktestRowView;
  domains: BacktestRowView[];
  systems: BacktestRowView[];
  trials: { key: string; eventId: string; year: number; domain: string; score: string; hit: boolean; split: string }[];
  allInsufficient: boolean;
  events: number;
  excluded: number;
  range: string;
  minSample: number;
  disclaimer: string;
}

export function selectBacktestView(result: BacktestResult): BacktestView {
  const domains = result.byDomain.map((g: BacktestGroup) => {
    const meta = domainMeta(g.key);
    return row(g.key, meta ? `${meta.icon}${meta.label}` : g.key, g.all, g.validation);
  });
  const systems = result.bySystem.map(g => row(g.key, SIGNAL_SYSTEM_NAMES[g.key] ?? g.key, g.all, g.validation));
  const overall = row('overall', '全部', result.overall.all, result.overall.validation);
  return {
    overall,
    domains,
    systems,
    trials: result.trials.map(t => ({
      key: `${t.eventId}:${t.domain}`,
      eventId: t.eventId,
      year: t.year,
      domain: domainMeta(t.domain)?.label ?? t.domain,
      score: Number.isInteger(t.score) ? String(t.score) : t.score.toFixed(1),
      hit: t.hit,
      split: t.split === 'validation' ? '驗證' : '訓練',
    })),
    allInsufficient: [result.overall, ...result.byDomain, ...result.bySystem].every(g => g.all.status === INSUFFICIENT_SAMPLE),
    events: result.events.used,
    excluded: result.events.excluded.length,
    range: `${result.timeline.fromYear}–${result.timeline.toYear}`,
    minSample: BACKTEST_METHOD.minSample,
    disclaimer: result.disclaimer,
  };
}

/** Backtesting needs the v4 time context (report v3 has none). */
export function canBacktest(report: Report): boolean {
  return Boolean(report.timeContext && typeof report.asOf === 'string' && report.schemaVersion >= 4);
}

export interface EventListItem {
  id: string;
  date: string;
  category: string;
  domains: string;
  description: string;
  approx: boolean;
}

export function selectEventList(events: readonly LifeEvent[]): EventListItem[] {
  return events.map(event => ({
    id: event.id,
    date: event.date,
    category: LIFE_EVENT_CATEGORY_LABELS[event.category] ?? event.category,
    domains: event.domains.map(domain => domainMeta(domain)?.label ?? domain).join('、'),
    description: event.description ?? '',
    approx: event.confidence === 'approx',
  }));
}

export type { TimelineDomain };
