/** Single-person birth-data form (solar or lunar date, 時辰 or unknown time, birthplace, time accuracy). */

import { useState, type FormEvent } from 'react';
import { DEFAULT_CITY_ID } from '../../lib/cities';
import { lunarToSolarDate, parseIsoDate, solarToLunarDate, toIsoDate } from '../../lib/core';
import type { BirthInput, Gender, LunarInput, TimeAccuracy } from '../../model/types';
import { CityPicker, Field, Segmented, ShichenPicker, TIME_ACCURACY_OPTIONS, representativeHour } from './fields';

export const EXAMPLE_INPUT: BirthInput = {
  name: 'Wang Xiaoming', year: 1991, month: 10, day: 5, hour: 14, minute: 0,
  timeKnown: true, gender: 'female', calendarType: 'solar', cityId: DEFAULT_CITY_ID, timeAccuracy: 'approx1h',
};

const pad = (value: number) => String(value).padStart(2, '0');

/** Saved inputs from before timeAccuracy existed: a 時辰 choice is ±1 hour. */
function initialAccuracy(input: BirthInput): TimeAccuracy {
  if (!input.timeKnown) return 'unknown';
  return input.timeAccuracy && input.timeAccuracy !== 'unknown' ? input.timeAccuracy : 'approx1h';
}

const ACCURACY_HINTS: Record<TimeAccuracy, string> = {
  exact: '以出生證明或醫院紀錄上的時刻為準。',
  approx15m: '誤差約 15 分鐘內；接近時辰或節氣交界時，相關結論會視為不確定。',
  approx1h: '只知道大約時辰；接近交界時，相關結論會視為不確定。',
  unknown: '',
};

export interface BirthFormState {
  name: string;
  gender: Gender;
  calendar: 'solar' | 'lunar';
  solarDate: string;
  lunar: LunarInput;
  time: { hour: number; timeKnown: boolean };
  accuracy: TimeAccuracy;
  /** 'HH:mm' or '' (only the 時辰 is known). */
  clock: string;
  cityId: string;
}

/** Form state → `analyze()` input. Throws on an invalid date (shown as the form error). */
export function formToInput(state: BirthFormState): BirthInput {
  const date = state.calendar === 'solar' ? parseIsoDate(state.solarDate) : lunarToSolarDate(state.lunar);
  const timeKnown = state.time.timeKnown && state.accuracy !== 'unknown';
  const exact = timeKnown && /^\d{2}:\d{2}$/.test(state.clock);
  return {
    name: state.name.trim(),
    year: date.year, month: date.month, day: date.day,
    hour: exact ? Number(state.clock.slice(0, 2)) : timeKnown ? state.time.hour : 12,
    minute: exact ? Number(state.clock.slice(3, 5)) : 0,
    timeKnown,
    gender: state.gender,
    calendarType: state.calendar,
    ...(state.calendar === 'lunar' ? { lunarInput: state.lunar } : {}),
    cityId: state.cityId,
    timeAccuracy: timeKnown ? state.accuracy : 'unknown',
  };
}

interface BirthFormProps {
  initial: BirthInput | null;
  onSubmit: (input: BirthInput) => void;
  onExample: () => void;
}

export function BirthForm({ initial, onSubmit, onExample }: BirthFormProps) {
  const start = initial ?? { ...EXAMPLE_INPUT, name: '' };
  const [name, setName] = useState(start.name);
  const [gender, setGender] = useState<Gender>(start.gender);
  const [calendar, setCalendar] = useState<'solar' | 'lunar'>(start.calendarType);
  const [solarDate, setSolarDate] = useState(toIsoDate(start));
  const [lunar, setLunar] = useState<LunarInput>(start.lunarInput ?? solarToLunarDate(start));
  const [time, setTime] = useState({ hour: start.hour, timeKnown: start.timeKnown });
  const [accuracy, setAccuracy] = useState<TimeAccuracy>(initialAccuracy(start));
  const [clock, setClock] = useState(
    start.timeKnown && (start.timeAccuracy === 'exact' || start.timeAccuracy === 'approx15m' || start.minute)
      ? `${pad(start.hour)}:${pad(start.minute ?? 0)}` : '');
  const [cityId, setCityId] = useState(start.cityId ?? DEFAULT_CITY_ID);
  const [error, setError] = useState('');

  // 時辰 grid → clears a clock time from another 時辰; "unknown" ↔ accuracy 'unknown'.
  function pickShichen(next: { hour: number; timeKnown: boolean }) {
    setTime(next);
    if (!next.timeKnown) {
      setAccuracy('unknown');
      setClock('');
      return;
    }
    if (accuracy === 'unknown') setAccuracy('approx1h');
    if (clock && representativeHour(Number(clock.slice(0, 2))) !== next.hour) setClock('');
  }

  // Exact clock time → selects its 時辰; typing minutes implies better than ±1 hour.
  function pickClock(value: string) {
    setClock(value);
    if (!/^\d{2}:\d{2}$/.test(value)) return;
    setTime({ hour: representativeHour(Number(value.slice(0, 2))), timeKnown: true });
    if (accuracy === 'unknown' || accuracy === 'approx1h') setAccuracy('exact');
  }

  function pickAccuracy(next: TimeAccuracy) {
    setAccuracy(next);
    if (next === 'unknown') {
      setTime(previous => ({ ...previous, timeKnown: false }));
      setClock('');
    } else {
      setTime(previous => ({ ...previous, timeKnown: true }));
    }
  }

  function switchCalendar(next: 'solar' | 'lunar') {
    setError('');
    try {
      if (next === 'lunar' && calendar === 'solar') setLunar(solarToLunarDate(parseIsoDate(solarDate)));
      if (next === 'solar' && calendar === 'lunar') setSolarDate(lunarToSolarDate(lunar).iso);
      setCalendar(next);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      onSubmit(formToInput({ name, gender, calendar, solarDate, lunar, time, accuracy, clock, cityId }));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  const lunarField = (key: 'year' | 'month' | 'day', value: number) =>
    setLunar(previous => ({ ...previous, [key]: value }));

  return (
    <form className="ledger" onSubmit={submit} noValidate>
      <Field label="姓名" htmlFor="f-name" hint="選填。輸入英文拼音時會另外計算表達數、靈魂數與人格數。">
        <input id="f-name" className="input" value={name} onChange={event => setName(event.target.value)}
          placeholder="例如：王小明／Wang Xiaoming" autoComplete="name" maxLength={120} />
      </Field>

      <Segmented legend="性別" name="gender" value={gender} onChange={setGender}
        options={[{ value: 'male', label: '男' }, { value: 'female', label: '女' }]} />

      <div className="ledger__date">
        <Segmented legend="曆法" name="calendar" value={calendar} onChange={switchCalendar}
          options={[{ value: 'solar', label: '國曆' }, { value: 'lunar', label: '農曆' }]} />
        {calendar === 'solar' ? (
          <Field label="出生日期" htmlFor="f-date">
            <input id="f-date" className="input input--date" type="date" min="1900-01-01" max="2100-12-31"
              value={solarDate} onChange={event => setSolarDate(event.target.value)} required />
          </Field>
        ) : (
          <fieldset className="lunar">
            <legend className="field__label">農曆生日</legend>
            <div className="lunar__row">
              <label className="lunar__part">
                <input className="input" type="number" min={1900} max={2100} value={lunar.year}
                  onChange={event => lunarField('year', Number.parseInt(event.target.value, 10))} aria-label="農曆年" />
                <span>年</span>
              </label>
              <label className="lunar__part">
                <select className="input" value={lunar.month} onChange={event => lunarField('month', Number(event.target.value))} aria-label="農曆月">
                  {Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}
                </select>
                <span>月</span>
              </label>
              <label className="lunar__part">
                <select className="input" value={lunar.day} onChange={event => lunarField('day', Number(event.target.value))} aria-label="農曆日">
                  {Array.from({ length: 30 }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}
                </select>
                <span>日</span>
              </label>
            </div>
            <label className="check">
              <input type="checkbox" checked={lunar.isLeap} onChange={event => setLunar(previous => ({ ...previous, isLeap: event.target.checked }))} />
              <span>閏月</span>
            </label>
          </fieldset>
        )}
      </div>

      <ShichenPicker name="shichen" hour={time.hour} timeKnown={time.timeKnown} onChange={pickShichen} />

      <div className="ledger__time">
        <Field label="出生時刻（選填）" htmlFor="f-clock" hint="知道幾點幾分時填寫；只知道時辰可以留空。">
          <input id="f-clock" className="input input--date" type="time" value={clock}
            onChange={event => pickClock(event.target.value)} disabled={!time.timeKnown} />
        </Field>
        <div className="field">
          <Segmented legend="時間精確度" name="time-accuracy" value={accuracy} onChange={pickAccuracy}
            options={TIME_ACCURACY_OPTIONS} />
          {ACCURACY_HINTS[accuracy] && <p className="field__hint">{ACCURACY_HINTS[accuracy]}</p>}
        </div>
      </div>

      <CityPicker id="f-city" value={cityId} onChange={setCityId} />

      <p className="form-error" role="alert">{error}</p>

      <div className="ledger__actions">
        <button type="submit" className="button button--seal">排盤</button>
        <button type="button" className="button button--quiet" onClick={onExample}>填入範例</button>
      </div>
    </form>
  );
}
