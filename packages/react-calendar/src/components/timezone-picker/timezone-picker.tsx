import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';

/** A small, sensible default IANA zone list when the host supplies none. */
const DEFAULT_ZONES: readonly string[] = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
];

/**
 * Component-scoped styles (the Angular original inlines these on the component;
 * there is no separate stylesheet). Hoisted + deduped by React 19 via
 * `href`/`precedence`.
 */
const STYLES = `
.cal-timezone-picker {
  display: inline-block;
  color: var(--cal-ink, inherit);
  font-family: inherit;
}
.cal-tzp {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
}
.cal-tzp__label {
  color: var(--cal-ink-muted);
}
.cal-tzp__select {
  font: inherit;
  font-size: 0.82rem;
  padding: 0.25rem 0.4rem;
  border: 1px solid var(--cal-line-strong, currentColor);
  border-radius: var(--cal-radius-sm, 6px);
  background: var(--cal-bg, transparent);
  color: var(--cal-ink, inherit);
}
.cal-tzp__select:focus-visible {
  outline: 2px solid var(--cal-ring);
}
`;

/** Props for {@link CalTimezonePicker}. Names/semantics mirror the Angular inputs/outputs. */
export interface CalTimezonePickerProps {
  /** Selected IANA zone (two-way). */
  readonly value?: string;
  /** Fires with the newly selected zone (the `[(value)]` write half). */
  readonly valueChange?: (value: string) => void;
  /** Restrict/order the offered zones; falls back to a default list. */
  readonly zones?: readonly string[] | null;
  readonly locale?: string;
  readonly label?: string;

  readonly className?: string;
}

/**
 * Standalone timezone picker. Two-way binds the selected IANA zone via `value`
 * + `valueChange`. The list is the host-supplied `zones` (e.g. the calendar's
 * `timezonePickerZones`) or a sensible default. Each option shows the zone's
 * current GMT offset so a dispatcher can pick the right region quickly.
 */
export function CalTimezonePicker(props: CalTimezonePickerProps): ReactNode {
  const {
    value: valueProp = 'UTC',
    valueChange,
    zones = null,
    locale = 'en-US',
    label = 'Time zone',
    className,
  } = props;

  // Two-way `value`: internal state, resynced whenever the prop changes.
  const [value, setValue] = useState(valueProp);
  const [prevValueProp, setPrevValueProp] = useState(valueProp);
  if (valueProp !== prevValueProp) {
    setPrevValueProp(valueProp);
    setValue(valueProp);
  }

  const options = useMemo(() => {
    const list = zones ?? DEFAULT_ZONES;
    return list.map((id) => ({
      id,
      label: `${id.replace(/_/g, ' ')} (${offsetLabel(id, locale)})`,
    }));
  }, [zones, locale]);

  const onChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const zone = event.target.value;
    setValue(zone);
    valueChange?.(zone);
  };

  return (
    <div className={`cal-timezone-picker${className ? ` ${className}` : ''}`}>
      <style href="cal-timezone-picker" precedence="default">
        {STYLES}
      </style>
      <label className="cal-tzp">
        <span className="cal-tzp__label">{label}</span>
        <select className="cal-tzp__select" aria-label={label} value={value} onChange={onChange}>
          {options.map((z) => (
            <option key={z.id} value={z.id}>
              {z.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Current GMT offset label for an IANA zone, e.g. "GMT-4". */
function offsetLabel(zone: string, locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}
