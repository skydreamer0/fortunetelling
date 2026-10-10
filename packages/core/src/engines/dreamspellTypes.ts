/** Internal producer contracts for the legacy Dreamspell components (#21).
 * These describe existing payloads, not calculation or predictive validation.
 */
import type { Castle, KinRef, Oracle, Wavespell } from '../calculators/tzolkin/tzolkin';

export interface DreamspellKinValue {
  kin: number;
  signature: string;
  color: string;
}

export interface DreamspellToneValue {
  number: number;
  name: string;
}

export interface DreamspellSealValue extends DreamspellToneValue {
  color: string;
}

export interface DreamspellWavespellValue extends Wavespell {
  name: string;
}

export interface DreamspellOracleKinValue extends KinRef {
  name: string;
}

export type DreamspellOracleValue = { [Role in keyof Oracle]: DreamspellOracleKinValue };

/** Each legacy category has its own payload; none emits component metadata. */
export type DreamspellComponent =
  | { id: 'kin'; name: string; category: 'kin'; value: DreamspellKinValue }
  | { id: 'tone'; name: string; category: 'tone'; value: DreamspellToneValue }
  | { id: 'seal'; name: string; category: 'seal'; value: DreamspellSealValue }
  | { id: 'wavespell'; name: string; category: 'wavespell'; value: DreamspellWavespellValue }
  | { id: 'castle'; name: string; category: 'castle'; value: Castle }
  | { id: 'oracle'; name: string; category: 'oracle'; value: DreamspellOracleValue };

export interface DreamspellMetadata {
  kin: number;
  fullSignature: string;
  epoch: string;
}
