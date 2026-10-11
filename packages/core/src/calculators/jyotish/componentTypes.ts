/**
 * Internal Jyotish producer contracts (#21).
 * These mirror the existing component projection, not a new report schema.
 * Keep calculator nullability and omissions; this module has no runtime code.
 */
import type { JyotishChart } from './calculator';
import type {
  ActiveDasha, DashaPeriod, DivisionalChart, Graha, GrahaPosition,
  HouseLord, Mahadasha, TransitSnapshot, Vimshottari,
} from './jyotish';

export type JyotishSettingsValue = JyotishChart['settings']
  & { degrees: JyotishChart['ayanamsaDegrees'] };

export type JyotishHouseValue = HouseLord & { occupants: Graha[] };

export type JyotishDashaBalanceValue =
  Pick<Vimshottari, 'moonNakshatra' | 'elapsedFraction' | 'balanceYears' | 'yearDays'>
  & { lord: Vimshottari['moonNakshatraLord'] };

/** Julian days and antar's mahaLord are deliberately not projected. */
export type JyotishDashaPeriodValue = Pick<DashaPeriod, 'lord' | 'years' | 'start' | 'end'>;
export type JyotishMahadashaValue = Pick<Mahadasha, 'lord' | 'years' | 'start' | 'end'>
  & { antardashas: JyotishDashaPeriodValue[] };

export interface JyotishCurrentDashaValue {
  asOf: JyotishChart['current']['asOf'];
  maha: Pick<ActiveDasha['maha'], 'index' | 'lord' | 'start' | 'end'>;
  antar: Pick<ActiveDasha['antar'], 'lord' | 'start' | 'end'>;
}

/** The two current-category variants are distinguished by their fixed IDs. */
export type JyotishComponent =
  | { id: 'ayanamsa'; name: string; category: 'settings'; value: JyotishSettingsValue }
  | { id: 'lagna'; name: string; category: 'lagna'; value: JyotishChart['lagna'] }
  | { id: `graha_${Graha}`; name: string; category: 'graha'; value: GrahaPosition }
  | { id: `house_${number}`; name: string; category: 'house'; value: JyotishHouseValue }
  | { id: `varga_${DivisionalChart['id']}`; name: string; category: 'divisional'; value: DivisionalChart }
  | { id: 'dasha_balance'; name: string; category: 'dasha'; value: JyotishDashaBalanceValue }
  | { id: `mahadasha_${number}`; name: string; category: 'mahadasha'; value: JyotishMahadashaValue }
  | { id: 'current_dasha'; name: string; category: 'current'; value: JyotishCurrentDashaValue }
  | { id: 'transits'; name: string; category: 'current'; value: TransitSnapshot };
