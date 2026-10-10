/** Internal producer contracts for the legacy Numerology components (#21).
 * Reuse calculator payloads; this module adds no runtime logic or interpretation.
 */
import type { NumerologyChart, NumerologyNumber } from '../calculators/numerology/calculator';
import type { NumerologyPeriod } from '../calculators/numerology/numerology';
import type { BirthData } from '../core/models/BirthData';

/** The legacy number payload predates the calculator's derived display field. */
export type NumerologyNumberValue = Pick<NumerologyNumber, 'number' | 'isMaster'>;

/** Every digit 1–9 is emitted, including digits whose frequency is zero. */
export type NumerologyDigitFrequencyValue = NonNullable<NumerologyChart['digitFrequency']>
  & Record<'1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9', number>;

export type NumerologyPinnacleValue = NumerologyPeriod & Pick<NumerologyNumber, 'isMaster'>;

/** The legacy sequence also records its starting year and requested length. */
export interface NumerologyPersonalYearsValue {
  fromYear: number;
  count: number;
  years: NumerologyChart['personalYears'];
}

/** Each legacy category has its own payload; none emits component metadata. */
export type NumerologyComponent =
  | { id: 'life_path'; name: string; category: 'lifePath'; value: NumerologyNumberValue }
  | { id: 'expression'; name: string; category: 'expression'; value: NumerologyNumberValue }
  | { id: 'soul_urge'; name: string; category: 'soulUrge'; value: NumerologyNumberValue }
  | { id: 'personality'; name: string; category: 'personality'; value: NumerologyNumberValue }
  | { id: 'digit_frequency'; name: string; category: 'digitFrequency'; value: NumerologyDigitFrequencyValue }
  | { id: 'personal_year'; name: string; category: 'personalYear'; value: NonNullable<NumerologyChart['personalYear']> }
  | { id: 'personal_month'; name: string; category: 'personalMonth'; value: NonNullable<NumerologyChart['personalMonth']> }
  | { id: 'birthday_number'; name: string; category: 'birthdayNumber'; value: NumerologyNumberValue }
  | { id: 'attitude'; name: string; category: 'attitude'; value: NumerologyNumberValue }
  | { id: `pinnacle_${number}`; name: string; category: 'pinnacles'; value: NumerologyPinnacleValue }
  | { id: `challenge_${number}`; name: string; category: 'challenges'; value: NumerologyPeriod }
  | { id: 'personal_years'; name: string; category: 'personalYears'; value: NumerologyPersonalYearsValue };

export interface NumerologyMetadata {
  name: BirthData['name'];
}
