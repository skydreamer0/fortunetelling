/**
 * Uniform response shell (M1-08): every tool answers `{ asOf, versions, caveats, data }`.
 * Caveats tell the model what NOT to over-trust; the size cap keeps "query on demand" honest.
 * The ~500-byte `versions` block is only sent by list_profiles / get_profile; every other tool sends
 * `versionsHash` (same hash, so a changed hash means a different core / catalog / calculator set).
 */

import { createHash } from 'node:crypto';
import { buildVersionInfo, canonicalStringify, type VersionInfo } from '@fortune/core';
import type { Analysis } from './compute';
import { ToolError } from './errors';

export const MAX_RESPONSE_CHARS = 60_000;

export type Caveat = { code: string; message: string };

export type Envelope<T = unknown> = {
  /** `null` when the answer does not depend on time (list_profiles, get_profile). */
  asOf: string | null;
  /** Short stable hash of the version block (asOf excluded, it is already in the envelope). */
  versionsHash: string;
  /** Only present when the tool was asked to include it (list_profiles, get_profile). */
  versions?: VersionInfo;
  caveats: Caveat[];
  data: T;
};

/** Caveats every time-dependent answer carries, derived from the analysis (never hand-written per tool). */
export function caveatsFor(analysis: Pick<Analysis, 'ctx' | 'timeline'>): Caveat[] {
  const caveats: Caveat[] = [
    {
      code: 'scores_uncalibrated',
      message: 'Scores are rule-weighted tendencies, not calibrated probabilities (D-033). Do not present them as accuracy or certainty.',
    },
  ];
  for (const flag of analysis.ctx.flags) caveats.push({ code: `time:${flag.code}`, message: flag.detail });
  for (const skipped of analysis.timeline.skippedSystems) {
    caveats.push({ code: `system_skipped:${skipped.system}`, message: `${skipped.system} did not contribute (${skipped.reason}).` });
  }
  for (const system of analysis.timeline.systems) {
    if (system === 'jyotish' || system === 'humanDesign') {
      caveats.push({
        code: `experimental:${system}`,
        message: `${system} is not yet cross-validated against public calculators (verified: false, D-039). Do not count it as equal confidence to verified systems, nor toward 'high consensus'.`,
      });
    }
  }
  return caveats;
}

/** 12 hex chars of sha256 over the canonical version block, without its `asOf`. */
export function hashVersions(versions: VersionInfo): string {
  const { asOf: _asOf, ...rest } = versions;
  return createHash('sha256').update(canonicalStringify(rest)).digest('hex').slice(0, 12);
}

export function ok<T>(input: {
  asOf: string | null;
  data: T;
  caveats?: Caveat[];
  ephemeris?: 'moshier' | 'not_initialized';
  /** Attach the full version block (default false: only `versionsHash`). */
  includeVersions?: boolean;
}): Envelope<T> {
  const versions = buildVersionInfo({ asOf: input.asOf, ephemeris: input.ephemeris ?? 'moshier' });
  return {
    asOf: input.asOf,
    versionsHash: hashVersions(versions),
    ...(input.includeVersions ? { versions } : {}),
    caveats: input.caveats ?? [],
    data: input.data,
  };
}

/** Canonical JSON text of an envelope; throws `response_too_large` instead of flooding the context. */
export function render(envelope: Envelope, maxChars = MAX_RESPONSE_CHARS): string {
  const text = canonicalStringify(envelope);
  if (text.length > maxChars) {
    throw new ToolError(
      'response_too_large',
      `Response is ${text.length} chars (limit ${maxChars}).`,
      'Narrow the query: add domain/system/range filters, lower limit, or use detail="summary".',
    );
  }
  return text;
}

export function renderError(error: unknown): string {
  const e = error instanceof ToolError ? error : new ToolError('internal', error instanceof Error ? error.message : String(error));
  return canonicalStringify({ error: { code: e.code, message: e.message, ...(e.hint ? { hint: e.hint } : {}), ...(e.details ? { details: e.details } : {}) } });
}
