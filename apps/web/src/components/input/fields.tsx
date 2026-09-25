/** Form controls shared by the single and two-person forms. */

import { useState, type ReactNode } from 'react';
import { cityById, cityLabel, searchCities, type City } from '../../lib/cities';
import type { TimeAccuracy } from '../../model/types';

export const SHICHEN: { hour: number; name: string; range: string }[] = [
  { hour: 0, name: '子', range: '23–01' }, { hour: 2, name: '丑', range: '01–03' },
  { hour: 4, name: '寅', range: '03–05' }, { hour: 6, name: '卯', range: '05–07' },
  { hour: 8, name: '辰', range: '07–09' }, { hour: 10, name: '巳', range: '09–11' },
  { hour: 12, name: '午', range: '11–13' }, { hour: 14, name: '未', range: '13–15' },
  { hour: 16, name: '申', range: '15–17' }, { hour: 18, name: '酉', range: '17–19' },
  { hour: 20, name: '戌', range: '19–21' }, { hour: 22, name: '亥', range: '21–23' },
];

/** Map any clock hour to the representative hour of its 時辰. */
export function representativeHour(hour = 12): number {
  if (hour >= 23 || hour < 1) return 0;
  return Math.floor((hour + 1) / 2) * 2;
}

export function shichenLabel(hour: number): string {
  const item = SHICHEN.find(entry => entry.hour === representativeHour(hour));
  return item ? `${item.name}時` : '';
}

interface SegmentedProps<T extends string> {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hideLegend?: boolean;
}

/** Native radio group styled as a segmented control. */
export function Segmented<T extends string>({ legend, name, value, options, onChange, hideLegend }: SegmentedProps<T>) {
  return (
    <fieldset className="segmented">
      <legend className={hideLegend ? 'sr-only' : 'field__label'}>{legend}</legend>
      <div className="segmented__track">
        {options.map(option => (
          <label key={option.value} className="segmented__option">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

interface ShichenPickerProps {
  name: string;
  hour: number;
  timeKnown: boolean;
  onChange: (next: { hour: number; timeKnown: boolean }) => void;
}

/** Twelve 時辰 as a 6×2 (desktop) / 4×3 (mobile) grid plus an "unknown" option. */
export function ShichenPicker({ name, hour, timeKnown, onChange }: ShichenPickerProps) {
  const selected = representativeHour(hour);
  return (
    <fieldset className="shichen">
      <legend className="field__label">出生時辰</legend>
      <div className="shichen__grid">
        {SHICHEN.map(item => (
          <label key={item.hour} className="shichen__option">
            <input
              type="radio"
              name={name}
              checked={timeKnown && selected === item.hour}
              onChange={() => onChange({ hour: item.hour, timeKnown: true })}
            />
            <span className="shichen__name">{item.name}</span>
            <span className="shichen__range">{item.range}</span>
          </label>
        ))}
      </div>
      <label className="shichen__unknown">
        <input
          type="radio"
          name={name}
          checked={!timeKnown}
          onChange={() => onChange({ hour, timeKnown: false })}
        />
        <span>不確定出生時辰</span>
      </label>
      {!timeKnown && (
        <p className="field__hint">仍會計算生命靈數、馬雅曆與八宅命卦；八字與紫微需要時辰，會標示為未計算。</p>
      )}
    </fieldset>
  );
}

export const TIME_ACCURACY_OPTIONS: { value: TimeAccuracy; label: string }[] = [
  { value: 'exact', label: '精確' },
  { value: 'approx15m', label: '約15分' },
  { value: 'approx1h', label: '約1小時' },
  { value: 'unknown', label: '不知道' },
];

const degrees = (value: number, positive: string, negative: string) =>
  `${Math.abs(value).toFixed(2)}°${value >= 0 ? positive : negative}`;

interface CityPickerProps {
  id: string;
  value: string;
  onChange: (cityId: string) => void;
}

/**
 * Birthplace: a search box that filters a native select grouped 台灣 / 海外.
 * Typing picks the first match when the current city no longer matches, so
 * 「台南」 or 「tokyo」 alone is enough; the select stays usable without typing.
 */
export function CityPicker({ id, value, onChange }: CityPickerProps) {
  const [query, setQuery] = useState('');
  const results = searchCities(query);
  const selected = cityById(value);
  const matches = [...results.taiwan, ...results.overseas];
  const withSelected = (list: City[], taiwan: boolean) =>
    selected && (selected.country === 'TW') === taiwan && !list.includes(selected) ? [selected, ...list] : list;
  const taiwan = withSelected(results.taiwan, true);
  const overseas = withSelected(results.overseas, false);

  function search(next: string) {
    setQuery(next);
    const found = searchCities(next);
    const all = [...found.taiwan, ...found.overseas];
    if (all.length && !all.some(city => city.id === value)) onChange(all[0].id);
  }

  return (
    <fieldset className="city">
      <legend className="field__label">出生地</legend>
      <div className="city__row">
        <input type="search" className="input city__search" value={query} onChange={event => search(event.target.value)}
          placeholder="搜尋：台南、Tokyo…" aria-label="搜尋出生城市（中文或英文）" aria-controls={id} autoComplete="off" />
        <select id={id} className="input city__select" value={value} onChange={event => onChange(event.target.value)} aria-label="出生城市">
          {taiwan.length > 0 && (
            <optgroup label="台灣">
              {taiwan.map(city => <option key={city.id} value={city.id}>{cityLabel(city)}</option>)}
            </optgroup>
          )}
          {overseas.length > 0 && (
            <optgroup label="海外">
              {overseas.map(city => <option key={city.id} value={city.id}>{`${cityLabel(city)}　${city.nameEn}`}</option>)}
            </optgroup>
          )}
        </select>
      </div>
      {query && matches.length === 0 && (
        <p className="field__hint" role="status">找不到「{query}」。可改用英文，或選擇最近的城市。</p>
      )}
      <p className="field__hint">
        {selected
          ? `${selected.nameZh}・${selected.nameEn}・${degrees(selected.lng, 'E', 'W')} ${degrees(selected.lat, 'N', 'S')}・${selected.timezone}。`
          : ''}
        出生地決定時區與經度；找不到時選最近的城市即可。
      </p>
    </fieldset>
  );
}
