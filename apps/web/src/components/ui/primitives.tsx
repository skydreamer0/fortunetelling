/** Small shared building blocks used across the report. */

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { segmentGlossary } from '../../lib/glossary';
import { SYSTEM_NAMES } from '../../model/selectors';

/** Text with glossary terms marked (first occurrence within this text). */
export function Gloss({ text }: { text: string }) {
  return (
    <>
      {segmentGlossary(text).map((segment, index) => typeof segment === 'string'
        ? segment
        : (
          <abbr key={index} className="term" tabIndex={0} data-definition={segment.definition} aria-label={`${segment.term}：${segment.definition}`}>
            {segment.term}
          </abbr>
        ))}
    </>
  );
}

export interface SourceChip { system: string; componentId: string; name: string }

export function Sources({ items, label = '資料來源' }: { items?: SourceChip[]; label?: string }) {
  if (!items?.length) return null;
  const unique = items.filter((item, index) =>
    items.findIndex(other => other.system === item.system && other.componentId === item.componentId) === index);
  return (
    <ul className="sources" aria-label={label}>
      {unique.map(item => (
        <li key={`${item.system}/${item.componentId}`} className="source" data-system={item.system} title={`${item.system}/${item.componentId}`}>
          <span className="source__system">{SYSTEM_NAMES[item.system] ?? item.system}</span>
          <span className="source__name">{item.name}</span>
        </li>
      ))}
    </ul>
  );
}

interface SectionProps {
  id: string;
  index: string;
  title: string;
  lede?: string;
  children: ReactNode;
  className?: string;
}

/** Numbered report chapter (壹、貳、參…) with a hairline rule. */
export function Section({ id, index, title, lede, children, className = '' }: SectionProps) {
  return (
    <section id={id} className={`chapter ${className}`} aria-labelledby={`${id}-title`} data-chapter>
      <header className="chapter__head">
        <span className="chapter__index" aria-hidden="true">{index}</span>
        <div>
          <h2 id={`${id}-title`} className="chapter__title">{title}</h2>
          {lede && <p className="chapter__lede">{lede}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

/** Horizontal 0–100 meter with quarter ticks. */
export function Meter({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} aria-label={label}>
      <span className="meter__fill" style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="empty-note">{children}</p>;
}

interface TabsProps<T extends string> {
  label: string;
  tabs: { id: T; label: string; hint?: string }[];
  active: T;
  onChange: (id: T) => void;
  idPrefix?: string;
}

/** WAI-ARIA tablist with arrow/Home/End keyboard support. */
export function Tabs<T extends string>({ label, tabs, active, onChange, idPrefix }: TabsProps<T>) {
  const fallbackId = useId();
  const prefix = idPrefix ?? fallbackId;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    const keys: Record<string, number> = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = keys[event.key];
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={node => { refs.current[index] = node; }}
          type="button"
          role="tab"
          id={`${prefix}-tab-${tab.id}`}
          aria-controls={`${prefix}-panel-${tab.id}`}
          aria-selected={tab.id === active}
          tabIndex={tab.id === active ? 0 : -1}
          className="tabs__tab"
          onClick={() => onChange(tab.id)}
          onKeyDown={event => onKeyDown(event, index)}
        >
          {tab.label}
          {tab.hint && <small className="tabs__hint">{tab.hint}</small>}
        </button>
      ))}
    </div>
  );
}

/** Tab panel that stays in the DOM (hidden) so print can show every panel. */
export function TabPanel({ prefix, id, active, children }: { prefix: string; id: string; active: boolean; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${prefix}-panel-${id}`} aria-labelledby={`${prefix}-tab-${id}`} hidden={!active} className="tabpanel" tabIndex={0}>
      {children}
    </div>
  );
}
