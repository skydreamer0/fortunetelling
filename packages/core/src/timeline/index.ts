/**
 * @fileoverview ⑤ Timeline (V1-13): per-window domain scores built from signals.
 * @module timeline
 */
// Explicit exports keep the run-local orchestration capability internal.
export {
  TIMELINE_SCHEMA_VERSION, TIMELINE_SYSTEMS, DEFAULT_TIMELINE_YEARS, TOP_SIGNALS_PER_DOMAIN,
  TIMELINE_CONVENTIONS, TIMELINE_CONVENTIONS_HUMAN_DESIGN, timelineConventions, dominantPeriod,
  buildTimeline, buildTimelineAsync, restrictTimelineCell, restrictTimeline,
} from './buildTimeline';
export type {
  TimelineSkipReason, SkippedSystem, TimelineOptions, TimelineDomainCell, TimelineCell, Timeline,
  RestrictTimelineOptions,
} from './buildTimeline';
export * from './numerologyRules';
