/** Form controls shared by the single and two-person forms. */

import type { ReactNode } from 'react';

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
