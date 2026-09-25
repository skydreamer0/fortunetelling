/**
 * Life events (V4-03; ARCHITECTURE-V2 §10; D-029).
 *
 * A life event is something that actually happened to the person, entered by
 * the person. It is sensitive data: in the browser build it never leaves the
 * device (D-029). The `domains` field is what the backtest scores — the
 * category only suggests domains and is kept for display / later analysis.
 *
 * @module backtest/lifeEvents
 */

import { QUESTION_CATALOG } from '../questions/engine';
import { DOMAINS, type Domain } from '../signals/types';

/** Question categories (V5 catalog) reused where sensible, plus three life-event-only ones. */
export const LIFE_EVENT_CATEGORIES = [
  'job_change',
  'startup_timing',
  'relationship_timing',
  'relocation',
  'property_purchase',
  'vehicle_purchase',
  'investment',
  'study_exam',
  'education',
  'health_event',
  'other',
] as const;
export type LifeEventCategory = (typeof LIFE_EVENT_CATEGORIES)[number];

/** 繁中 labels for UI. The first eight mirror the question catalog ids. */
export const LIFE_EVENT_CATEGORY_LABELS: Readonly<Record<LifeEventCategory, string>> = Object.freeze({
  job_change: '工作變動',
  startup_timing: '創業',
  relationship_timing: '感情',
  relocation: '搬遷／移居',
  property_purchase: '購屋',
  vehicle_purchase: '購車',
  investment: '投資',
  study_exam: '進修／考試',
  education: '學業／畢業',
  health_event: '健康事件',
  other: '其他',
});

export const LIFE_EVENT_CONFIDENCES = ['certain', 'approx'] as const;
export type LifeEventConfidence = (typeof LIFE_EVENT_CONFIDENCES)[number];

export interface LifeEvent {
  /** Caller-chosen stable id (unique per person). */
  id: string;
  /** 'YYYY-MM' or 'YYYY-MM-DD'. */
  date: string;
  category: LifeEventCategory;
  /** Domains the event belongs to (≥ 1, unique). Each (event, domain) pair is one backtest trial. */
  domains: Domain[];
  description?: string;
  /** 'approx' = the person is unsure of the exact month. */
  confidence: LifeEventConfidence;
}

export const MAX_LIFE_EVENT_DESCRIPTION = 500;

export type LifeEventValidation =
  | { ok: true; value: LifeEvent; errors: [] }
  | { ok: false; value?: undefined; errors: string[] };

const DATE_RE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

/** Calendar year of a valid life-event date. */
export function lifeEventYear(date: string): number {
  return Number(date.slice(0, 4));
}

function validDate(date: unknown): boolean {
  if (typeof date !== 'string') return false;
  const m = DATE_RE.exec(date);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (y < 1 || mo < 1 || mo > 12) return false;
  if (m[3] === undefined) return true;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Strict validation; returns a normalised copy (domains in DOMAINS order, description trimmed). */
export function validateLifeEvent(input: unknown): LifeEventValidation {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, errors: ['event must be an object'] };
  const errors: string[] = [];
  const x = input as Record<string, unknown>;
  if (typeof x.id !== 'string' || x.id.trim() === '' || x.id.length > 64) errors.push('id must be a non-empty string (≤ 64 chars)');
  if (!validDate(x.date)) errors.push(`date must be 'YYYY-MM' or 'YYYY-MM-DD', got ${JSON.stringify(x.date)}`);
  if (!(LIFE_EVENT_CATEGORIES as readonly unknown[]).includes(x.category)) errors.push(`unknown category ${JSON.stringify(x.category)}`);
  if (!Array.isArray(x.domains) || x.domains.length === 0) errors.push('domains must be a non-empty array');
  else {
    for (const d of x.domains) if (!(DOMAINS as readonly unknown[]).includes(d)) errors.push(`unknown domain ${JSON.stringify(d)}`);
    if (new Set(x.domains).size !== x.domains.length) errors.push('domains must be unique');
  }
  if (x.description !== undefined && (typeof x.description !== 'string' || x.description.length > MAX_LIFE_EVENT_DESCRIPTION)) {
    errors.push(`description must be a string of ≤ ${MAX_LIFE_EVENT_DESCRIPTION} chars`);
  }
  if (!(LIFE_EVENT_CONFIDENCES as readonly unknown[]).includes(x.confidence)) errors.push(`confidence must be 'certain' or 'approx'`);
  if (errors.length) return { ok: false, errors };
  const domains = DOMAINS.filter((d) => (x.domains as unknown[]).includes(d));
  const description = typeof x.description === 'string' ? x.description.trim() : '';
  return {
    ok: true,
    errors: [],
    value: {
      id: x.id as string,
      date: x.date as string,
      category: x.category as LifeEventCategory,
      domains,
      ...(description ? { description } : {}),
      confidence: x.confidence as LifeEventConfidence,
    },
  };
}

/**
 * Domains suggested for a category (UI pre-fill only): the catalog's highest-weight
 * domain(s) for question categories; fixed mappings for the three extra ones.
 */
export function suggestedDomains(category: LifeEventCategory): Domain[] {
  if (category === 'education') return ['learning'];
  if (category === 'health_event') return ['health'];
  if (category === 'other') return [];
  const c = QUESTION_CATALOG.categories.find((q) => q.id === category);
  if (!c) return [];
  const max = Math.max(...c.domains.map((d) => d.weight));
  return DOMAINS.filter((d) => c.domains.some((x) => x.domain === d && x.weight === max));
}
