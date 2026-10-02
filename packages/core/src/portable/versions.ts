/**
 * @fileoverview Version block attached to every MCP response and export (ROADMAP M0.5-04).
 * Pure: `asOf` is required, nothing reads the clock.
 * @module portable/versions
 */

import { VERSION, REPORT_SCHEMA_VERSION } from '../core/analyze';
import { PROFILE_SCHEMA_VERSION } from './profileFile';
import { BAZI_CALCULATOR_VERSION } from '../calculators/bazi/calculator';
import { ZIWEI_CALCULATOR_VERSION } from '../calculators/ziwei/calculator';
import { NUMEROLOGY_CALCULATOR_VERSION } from '../calculators/numerology/calculator';
import { TZOLKIN_CALCULATOR_VERSION } from '../calculators/tzolkin/calculator';
import { MINGGUA_CALCULATOR_VERSION } from '../calculators/mingGua/calculator';
import { JYOTISH_CALCULATOR_VERSION } from '../calculators/jyotish/calculator';
import { HUMAN_DESIGN_CALCULATOR_VERSION } from '../calculators/humanDesign/calculator';
import { TIMELINE_SCHEMA_VERSION } from '../timeline/buildTimeline';
import { CONSENSUS_SCHEMA_VERSION } from '../consensus/buildConsensus';
import baziCatalog from '../rules/bazi/catalog.json';
import baziTenGodCatalog from '../rules/bazi/tenGodCatalog.json';
import ziweiCatalog from '../rules/ziwei/catalog.json';
import ziweiTraits from '../traits/ziwei.json';
import ziweiModifiers from '../traits/ziweiModifiers.json';
import numerologyCatalog from '../timeline/numerologyCatalog.json';
import questionCatalog from '../questions/catalog.json';
import jyotishCatalog from '../calculators/jyotish/catalog.json';
import humanDesignCatalog from '../calculators/humanDesign/catalog.json';

export type EphemerisState = 'not_initialized' | 'moshier';

/** Systems whose calculators have not been cross-validated yet (D-039). */
export const EXPERIMENTAL_SYSTEMS: readonly string[] = Object.freeze(['jyotish', 'humanDesign']);

export type VersionInfo = {
  asOf: string;
  coreVersion: string;
  profileSchemaVersion: number;
  reportSchemaVersion: number;
  timelineSchemaVersion: number;
  consensusSchemaVersion: number;
  calculators: Record<string, string>;
  catalogs: Record<string, number>;
  ephemeris: EphemerisState;
  /** Systems reported as unverified; their outputs must be caveated (D-039). */
  experimentalSystems: readonly string[];
};

const versionOf = (catalog: { version?: number; schemaVersion?: number }): number =>
  catalog.version ?? catalog.schemaVersion ?? 0;

export function buildVersionInfo(opts: { asOf: string; ephemeris?: EphemerisState }): VersionInfo {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.asOf)) throw new Error(`asOf must be 'YYYY-MM-DD' (got ${JSON.stringify(opts.asOf)})`);
  return {
    asOf: opts.asOf,
    coreVersion: VERSION,
    profileSchemaVersion: PROFILE_SCHEMA_VERSION,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    timelineSchemaVersion: TIMELINE_SCHEMA_VERSION,
    consensusSchemaVersion: CONSENSUS_SCHEMA_VERSION,
    calculators: {
      bazi: BAZI_CALCULATOR_VERSION,
      ziwei: ZIWEI_CALCULATOR_VERSION,
      numerology: NUMEROLOGY_CALCULATOR_VERSION,
      tzolkin: TZOLKIN_CALCULATOR_VERSION,
      mingGua: MINGGUA_CALCULATOR_VERSION,
      jyotish: JYOTISH_CALCULATOR_VERSION,
      humanDesign: HUMAN_DESIGN_CALCULATOR_VERSION,
    },
    catalogs: {
      bazi: versionOf(baziCatalog),
      baziTenGod: versionOf(baziTenGodCatalog),
      ziwei: versionOf(ziweiCatalog),
      ziweiTraits: versionOf(ziweiTraits),
      ziweiModifiers: versionOf(ziweiModifiers),
      numerology: versionOf(numerologyCatalog),
      questions: versionOf(questionCatalog),
      jyotish: versionOf(jyotishCatalog),
      humanDesign: versionOf(humanDesignCatalog),
    },
    ephemeris: opts.ephemeris ?? 'not_initialized',
    experimentalSystems: EXPERIMENTAL_SYSTEMS,
  };
}
