/** Two-person entry form for the compatibility comparison. */

import { useState, type FormEvent } from 'react';
import { parseIsoDate, toIsoDate } from '../../lib/core';
import type { BirthInput, Gender } from '../../model/types';
import { Field, SHICHEN, Segmented, representativeHour } from './fields';

interface PersonState {
  name: string;
  gender: Gender;
  date: string;
  hour: number;
  timeKnown: boolean;
}

function toState(input: BirthInput | undefined, fallbackDate: string, fallbackGender: Gender): PersonState {
  return {
    name: input?.name ?? '',
    gender: input?.gender ?? fallbackGender,
    date: input ? toIsoDate(input) : fallbackDate,
    hour: representativeHour(input?.hour ?? 12),
    timeKnown: input?.timeKnown ?? true,
  };
}

function toInput(person: PersonState): BirthInput {
  const date = parseIsoDate(person.date);
  return {
    name: person.name.trim(),
    ...date,
    gender: person.gender,
    hour: person.timeKnown ? person.hour : 12,
    minute: 0,
    timeKnown: person.timeKnown,
    calendarType: 'solar',
  };
}

function PersonFields({ id, label, person, onChange }: {
  id: 'a' | 'b';
  label: string;
  person: PersonState;
  onChange: (next: PersonState) => void;
}) {
  const set = (patch: Partial<PersonState>) => onChange({ ...person, ...patch });
  return (
    <fieldset className="pair__person">
      <legend className="pair__legend"><span className="pair__seal">{label}</span>{id === 'a' ? '第一位' : '第二位'}</legend>
      <Field label="姓名／暱稱" htmlFor={`c-${id}-name`}>
        <input id={`c-${id}-name`} className="input" value={person.name} maxLength={120}
          placeholder={id === 'a' ? '例如：自己' : '例如：對方'} onChange={event => set({ name: event.target.value })} />
      </Field>
      <Segmented legend="性別" name={`c-${id}-gender`} value={person.gender} onChange={gender => set({ gender })}
        options={[{ value: 'male', label: '男' }, { value: 'female', label: '女' }]} />
      <Field label="國曆生日" htmlFor={`c-${id}-date`}>
        <input id={`c-${id}-date`} className="input input--date" type="date" min="1900-01-01" max="2100-12-31"
          value={person.date} onChange={event => set({ date: event.target.value })} />
      </Field>
      <Field label="出生時辰" htmlFor={`c-${id}-hour`}>
        <select id={`c-${id}-hour`} className="input" disabled={!person.timeKnown} value={person.hour}
          onChange={event => set({ hour: Number(event.target.value) })}>
          {SHICHEN.map(item => <option key={item.hour} value={item.hour}>{item.name}時　{item.range}</option>)}
        </select>
      </Field>
      <label className="check">
        <input type="checkbox" checked={!person.timeKnown} onChange={event => set({ timeKnown: !event.target.checked })} />
        <span>不確定出生時辰</span>
      </label>
    </fieldset>
  );
}

export function CompatForm({ initial, onSubmit }: {
  initial: { first: BirthInput; second: BirthInput } | null;
  onSubmit: (first: BirthInput, second: BirthInput) => void;
}) {
  const [first, setFirst] = useState(() => toState(initial?.first, '1991-10-05', 'female'));
  const [second, setSecond] = useState(() => toState(initial?.second, '1986-05-29', 'male'));
  const [error, setError] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      onSubmit(toInput(first), toInput(second));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  return (
    <form className="ledger" onSubmit={submit} noValidate>
      <div className="pair">
        <PersonFields id="a" label="甲" person={first} onChange={setFirst} />
        <div className="pair__join" aria-hidden="true">合</div>
        <PersonFields id="b" label="乙" person={second} onChange={setSecond} />
      </div>
      <p className="field__hint">只記得農曆生日時，可先到「單人」切換農曆，確認轉換後的國曆日期。</p>
      <p className="form-error" role="alert">{error}</p>
      <div className="ledger__actions">
        <button type="submit" className="button button--seal">比較兩張命盤</button>
      </div>
    </form>
  );
}
