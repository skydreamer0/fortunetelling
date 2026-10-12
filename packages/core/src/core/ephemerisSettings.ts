/**
 * Pure effective chart settings shared by the strict timeline spec and legacy
 * standalone boundaries. No WASM loading, calculator imports or result identity.
 * Legacy nullish fallback and custom dasha years remain supported here; the
 * timeline spec validates its narrower public options before calling these.
 */
import type { Ayanamsa } from '../calculators/astro/ephemeris';

type NodeMode = 'mean' | 'true';

export interface JyotishChartSettings {
  ayanamsa: Ayanamsa;
  node: NodeMode;
  dashaYearDays: number;
  houseSystem: 'whole_sign';
}

export const JYOTISH_SETTINGS_DEFAULTS: Readonly<JyotishChartSettings> = Object.freeze({
  ayanamsa: 'lahiri', node: 'mean', dashaYearDays: 365.25, houseSystem: 'whole_sign',
});
export const HUMAN_DESIGN_SETTINGS_DEFAULTS: Readonly<{ node: NodeMode }> = Object.freeze({ node: 'true' });

/** Copy effective values once; do not freeze or otherwise mutate the legacy caller. */
export function resolveJyotishChartSettings(
  options: Partial<Pick<JyotishChartSettings, 'ayanamsa' | 'node' | 'dashaYearDays'>> = {},
): JyotishChartSettings {
  return {
    ayanamsa: options.ayanamsa ?? JYOTISH_SETTINGS_DEFAULTS.ayanamsa,
    node: options.node ?? JYOTISH_SETTINGS_DEFAULTS.node,
    dashaYearDays: options.dashaYearDays ?? JYOTISH_SETTINGS_DEFAULTS.dashaYearDays,
    houseSystem: JYOTISH_SETTINGS_DEFAULTS.houseSystem,
  };
}

export function resolveHumanDesignChartSettings(options: { node?: NodeMode } = {}): { node: NodeMode } {
  return { node: options.node ?? HUMAN_DESIGN_SETTINGS_DEFAULTS.node };
}
