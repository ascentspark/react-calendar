import { createContext, useContext } from 'react';
import {
  DEFAULT_CALENDAR_CONFIG,
  type CalendarConfig,
} from '../core/config/calendar-config';
import type { DateAdapter } from '../core/date-adapter/date-adapter';
import type { RecurrenceAdapter } from '../core/recurrence/recurrence-adapter';
import type { CalTokenBridge } from '../theme/apply-theme';
import { CalCalendarIntl } from '../i18n/cal-calendar-intl';
import { CalCalendarA11y } from '../a11y/cal-calendar-a11y';

/** Tuning for list/range virtualization (currently the timeline's resource rows). */
export interface CalVirtualizationOptions {
  /** Turn windowing on/off. Default `true`. */
  readonly enabled?: boolean;
  /** Only virtualize once a view has more than this many rows. Default `40`. */
  readonly rowThreshold?: number;
  /** Extra pixels rendered beyond the viewport (both axes) to avoid blank flashes. Default `400`. */
  readonly overscanPx?: number;
}

/** Built-in virtualization defaults; merged with any provider overrides. */
export const DEFAULT_VIRTUALIZATION: Required<CalVirtualizationOptions> = {
  enabled: true,
  rowThreshold: 40,
  overscanPx: 400,
};

/**
 * Everything the view components read from their nearest {@link CalendarProvider}.
 * The value is immutable per provider render — components treat it as plain data
 * (React Compiler-safe; no mutable stable references).
 */
export interface CalendarContextValue {
  /** Resolved config: built-in defaults merged with the provider's `defaults`. */
  readonly config: CalendarConfig;
  /** Active date engine, or `null` when the consumer has not supplied one. */
  readonly dateAdapter: DateAdapter | null;
  /** Active recurrence engine, or `null` (recurring events pass through unexpanded). */
  readonly recurrenceAdapter: RecurrenceAdapter | null;
  /** `--cal-*` → host CSS variable bridge; bridged tokens win over the derived theme. */
  readonly tokenBridge: CalTokenBridge | null;
  /** Resolved virtualization settings. */
  readonly virtualization: Required<CalVirtualizationOptions>;
  /** Visible UI labels (localisable). */
  readonly intl: CalCalendarIntl;
  /** Screen-reader strings (localisable). */
  readonly a11y: CalCalendarA11y;
}

const DEFAULT_CONTEXT: CalendarContextValue = {
  config: DEFAULT_CALENDAR_CONFIG,
  dateAdapter: null,
  recurrenceAdapter: null,
  tokenBridge: null,
  virtualization: DEFAULT_VIRTUALIZATION,
  intl: new CalCalendarIntl(),
  a11y: new CalCalendarA11y(null, DEFAULT_CALENDAR_CONFIG),
};

/**
 * Context carrying the calendar configuration. Views render with built-in
 * defaults when no provider is present, but need a {@link CalendarProvider}
 * with a date adapter to do anything useful.
 */
export const CalendarContext = createContext<CalendarContextValue>(DEFAULT_CONTEXT);

/** The nearest provider's resolved context (or the built-in defaults). */
export function useCalendar(): CalendarContextValue {
  return useContext(CalendarContext);
}

/** The nearest provider's resolved {@link CalendarConfig}. */
export function useCalendarConfig(): CalendarConfig {
  return useContext(CalendarContext).config;
}

/**
 * The active {@link DateAdapter}. Throws when no adapter was supplied — every
 * view needs one, and failing fast beats rendering an empty grid.
 */
export function useDateAdapter(): DateAdapter {
  const { dateAdapter } = useContext(CalendarContext);
  if (dateAdapter === null) {
    throw new Error(
      '@ascentsparksoftware/react-calendar: no DateAdapter. ' +
        'Wrap your views in <CalendarProvider dateAdapter={new DateFnsDateAdapter()}> ' +
        "(adapter from '@ascentsparksoftware/react-calendar/date-fns').",
    );
  }
  return dateAdapter;
}
