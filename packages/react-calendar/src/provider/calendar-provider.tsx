import { useMemo, type ReactNode } from 'react';
import {
  DEFAULT_CALENDAR_CONFIG,
  type CalendarConfig,
} from '../core/config/calendar-config';
import type { DateAdapter } from '../core/date-adapter/date-adapter';
import type { RecurrenceAdapter } from '../core/recurrence/recurrence-adapter';
import type { CalTokenBridge } from '../theme/apply-theme';
import { CalCalendarIntl } from '../i18n/cal-calendar-intl';
import { CalCalendarA11y } from '../a11y/cal-calendar-a11y';
import {
  CalendarContext,
  DEFAULT_VIRTUALIZATION,
  type CalendarContextValue,
  type CalVirtualizationOptions,
} from './calendar-context';

/** Props for {@link CalendarProvider}. All optional; pass only what you use. */
export interface CalendarProviderProps {
  /** Overrides merged over the built-in {@link CalendarConfig} defaults. */
  readonly defaults?: Partial<CalendarConfig>;
  /** The date engine, e.g. `new DateFnsDateAdapter()` from `/date-fns`. */
  readonly dateAdapter?: DateAdapter;
  /** The recurrence engine, e.g. `new RruleRecurrenceAdapter()` from `/recurrence`. */
  readonly recurrenceAdapter?: RecurrenceAdapter;
  /**
   * Drive calendar colours from the host application's own design tokens. Each key
   * is a `--cal-*` property; each value is the consumer's CSS variable to defer to
   * (bare `--brand-500` or wrapped `var(--brand-500)`). Bridged tokens win over the
   * derived theme; unbridged tokens keep their derived values, so a partial map is fine.
   */
  readonly tokenBridge?: CalTokenBridge;
  /** Tune (or disable) row virtualization for long resource lists. */
  readonly virtualization?: CalVirtualizationOptions;
  /** Replace the visible UI labels (localisation). */
  readonly intl?: CalCalendarIntl;
  /** Replace the screen-reader strings (localisation). */
  readonly a11y?: CalCalendarA11y;
  readonly children?: ReactNode;
}

/**
 * Configure the calendar for a subtree — the React equivalent of the Angular
 * package's `provideCalendar(withDefaults, withDateAdapter, withTokenBridge,
 * withVirtualization)`:
 *
 * ```tsx
 * import { CalendarProvider, CalMonthView } from '@ascentsparksoftware/react-calendar';
 * import { DateFnsDateAdapter } from '@ascentsparksoftware/react-calendar/date-fns';
 *
 * const adapter = new DateFnsDateAdapter(); // module scope or useMemo — keep it stable
 *
 * <CalendarProvider dateAdapter={adapter} defaults={{ weekStartsOn: 1 }}>
 *   <CalMonthView events={events} viewDate={date} />
 * </CalendarProvider>
 * ```
 *
 * Providers nest: an inner provider fully replaces the outer context (it does not
 * inherit field-by-field), mirroring Angular's environment-injector semantics.
 */
export function CalendarProvider(props: CalendarProviderProps): ReactNode {
  const {
    defaults,
    dateAdapter,
    recurrenceAdapter,
    tokenBridge,
    virtualization,
    intl,
    a11y,
    children,
  } = props;

  const value = useMemo<CalendarContextValue>(() => {
    const config: CalendarConfig = { ...DEFAULT_CALENDAR_CONFIG, ...defaults };
    return {
      config,
      dateAdapter: dateAdapter ?? null,
      recurrenceAdapter: recurrenceAdapter ?? null,
      tokenBridge: tokenBridge ?? null,
      virtualization: { ...DEFAULT_VIRTUALIZATION, ...virtualization },
      intl: intl ?? new CalCalendarIntl(),
      a11y: a11y ?? new CalCalendarA11y(dateAdapter ?? null, config),
    };
  }, [defaults, dateAdapter, recurrenceAdapter, tokenBridge, virtualization, intl, a11y]);

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
}
