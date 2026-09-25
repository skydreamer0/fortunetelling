/** Single-person birth-data form (solar or lunar date, 時辰 or unknown time). */

import { useState, type FormEvent } from 'react';
import { lunarToSolarDate, parseIsoDate, solarToLunarDate, toIsoDate } from '../../lib/core';
import type { BirthInput, Gender, LunarInput } from '../../model/types';
import { Field, Segmented, ShichenPicker } from './fields';

export const EXAMPLE_INPUT: BirthInput = {
  name: 'Wang Xiaoming', year: 1991, month: 10, day: 5, hour: 14, minute: 0,
  timeKnown: true, gender: 'female', calendarType: 'solar',
};

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
  const [error, setError] = useState('');

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
      const date = calendar === 'solar' ? parseIsoDate(solarDate) : lunarToSolarDate(lunar);
      onSubmit({
        name: name.trim(),
        year: date.year, month: date.month, day: date.day,
        hour: time.timeKnown ? time.hour : 12,
        minute: 0,
        timeKnown: time.timeKnown,
        gender,
        calendarType: calendar,
        ...(calendar === 'lunar' ? { lunarInput: lunar } : {}),
      });
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

      <ShichenPicker name="shichen" hour={time.hour} timeKnown={time.timeKnown} onChange={setTime} />

      <p className="form-error" role="alert">{error}</p>

      <div className="ledger__actions">
        <button type="submit" className="button button--seal">排盤</button>
        <button type="button" className="button button--quiet" onClick={onExample}>填入範例</button>
      </div>
    </form>
  );
}
