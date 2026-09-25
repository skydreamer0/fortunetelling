/**
 * Signal layer types (ARCHITECTURE-V2 §5, §6; D-021, D-023, D-028).
 *
 * `DOMAINS` and `TRAITS` are CLOSED enumerations. Adding, removing or renaming a
 * member changes the meaning of every stored signal and aggregate, so any
 * extension requires a version bump of the signal schema (and of every rule
 * whose templates use the new member). Never reorder: `DOMAINS` order is also
 * the canonical output ordering of `aggregateSignals`.
 */

export const SYSTEM_IDS = [
  'bazi',
  'ziwei',
  'numerology',
  'tzolkin',
  'mingGua',
  'jyotish',
  'humanDesign',
] as const;
export type SystemId = (typeof SYSTEM_IDS)[number];

export const DOMAINS = [
  'self',
  'career',
  'wealth',
  'relationship',
  'family',
  'movement',
  'property',
  'learning',
  'contract',
  'health',
] as const;
export type Domain = (typeof DOMAINS)[number];

/** Closed list — extension requires a signal schema version bump. */
export const TRAITS = [
  'change',
  'growth',
  'stability',
  'pressure',
  'opportunity',
  'connection',
  'separation',
  'visibility',
  'leadership',
  'risk',
  'independence',
  'support',
  'conflict',
] as const;
export type Trait = (typeof TRAITS)[number];

export const GRAINS = ['natal', 'decade', 'year', 'month'] as const;
export type Grain = (typeof GRAINS)[number];

export interface SignalWindow {
  grain: Grain;
  /** Start, ISO date string (e.g. '2026-01-01'). */
  start: string;
  /** End, ISO date string. */
  end: string;
}

/** One multiplicative correction applied to a base trait weight (§5.1). */
export interface Modifier {
  id: string;
  factor: number;
  reason: string;
}

export interface SignalEvidence {
  componentIds: string[];
  text: string;
  modifiers: Modifier[];
}

/** §6 Signal. `id` is a deterministic hash — see `signalId`. */
export interface Signal {
  id: string;
  system: SystemId;
  ruleId: string;
  ruleVersion: number;
  /** Rule hit target (e.g. 'day_pillar'); stored so `id` can be recomputed from the signal alone. */
  target: string | null;
  domain: Domain;
  trait: Trait;
  /** 0–1: how strong the signal is. */
  intensity: number;
  /** -1–1: support (+) or pressure (−); 0 = pure change. */
  valence: number;
  window: SignalWindow;
  evidence: SignalEvidence;
}

/** What a rule emits once it hits: one domain × trait with base weights. */
export interface SignalTemplate {
  domain: Domain;
  trait: Trait;
  /** Base intensity 0–1 before modifiers. */
  intensity: number;
  /** -1–1. */
  valence: number;
}

/** One match produced by `Rule.match`. */
export interface RuleHit {
  /** What the rule matched on (e.g. 'natal.day×year.branch'); part of the signal id. */
  target: string;
  componentIds: string[];
  text: string;
  modifiers?: Modifier[];
}

/** §5 Rule: data + small pure matcher, generic over the calculator chart type. */
export interface Rule<TChart = unknown> {
  /** e.g. 'bazi.branch.clash' */
  id: string;
  version: number;
  system: SystemId;
  scope: Grain;
  match(chart: TChart, window: SignalWindow): RuleHit[];
  emits: SignalTemplate[];
}
