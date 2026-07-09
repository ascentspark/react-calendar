import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { CalendarSystem, ZonedDateTime } from '../../core/date-adapter/zoned-date-time';
import type { CalendarEvent } from '../../core/model/calendar-event';
import { buildYearView } from '../../core/view-model/build-year-view';
import type { YearDay } from '../../core/view-model/year-view-model';
import { useCalendar, useDateAdapter } from '../../provider/calendar-context';
import type { CalThemeMode } from '../../theme/derive-theme';
import {
  expandForWindow,
  hostZone,
  isRtl,
  useHostTheme,
  useViewPeriodChanged,
} from '../internal/host';

/** Props for {@link CalYearView}. Names/semantics mirror the Angular inputs/outputs. */
export interface CalYearViewProps<TMeta = unknown> {
  // ── data ──────────────────────────────────────────────────────────────────
  readonly events: readonly CalendarEvent<TMeta>[];
  readonly viewDate: Date | ZonedDateTime;
  readonly today?: Date | ZonedDateTime | null;
  readonly weekStartsOn?: number | null;
  readonly timezone?: string | null;
  readonly locale?: string | null;
  readonly calendarSystem?: CalendarSystem | null;

  // ── theming ───────────────────────────────────────────────────────────────
  readonly baseColor?: string;
  readonly accentColor?: string;
  readonly themeMode?: CalThemeMode;
  readonly statusColors?: Record<string, string>;
  /** Optional hex override for on-accent text (`--cal-accent-ink`); null = auto. */
  readonly accentInk?: string | null;

  // ── outputs ───────────────────────────────────────────────────────────────
  readonly daySelected?: (payload: { date: ZonedDateTime }) => void;
  readonly monthSelected?: (payload: { date: ZonedDateTime }) => void;
  readonly viewPeriodChanged?: (payload: {
    start: ZonedDateTime;
    end: ZonedDateTime;
    zone: string;
  }) => void;

  readonly className?: string;
}

/**
 * Chunk a mini-month's flat day list into calendar weeks (rows of 7) so each
 * week can be a proper ARIA `row` of day gridcells.
 */
function weeksOf(days: readonly YearDay[]): readonly (readonly YearDay[])[] {
  const weeks: YearDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    const week = days.slice(i, i + 7);
    // Skip a trailing week that lies entirely outside the month — an all-blank
    // ARIA row would have no perceivable cell children.
    if (week.some((d) => d.inMonth)) {
      weeks.push(week);
    }
  }
  return weeks;
}

/** Density bucket 0–4 for heat styling. */
function density(day: YearDay): number {
  const c = day.eventCount;
  return c === 0 ? 0 : c === 1 ? 1 : c <= 3 ? 2 : c <= 6 ? 3 : 4;
}

/**
 * Standalone year overview: 12 compact mini-month grids with per-day event
 * density, "today" marking, theme-agnostic `--cal-*` styling, ARIA grid
 * semantics, roving-tabindex keyboard navigation, and drill-down to a day.
 */
export function CalYearView<TMeta = unknown>(props: CalYearViewProps<TMeta>): ReactNode {
  const adapter = useDateAdapter();
  const { config, recurrenceAdapter, a11y } = useCalendar();
  const host = useRef<HTMLDivElement>(null);
  useHostTheme(host, props);

  const {
    events,
    viewDate,
    today = null,
    weekStartsOn = null,
    timezone = null,
    locale = null,
    calendarSystem = null,
    daySelected,
    monthSelected,
    viewPeriodChanged,
    className,
  } = props;

  const resolvedLocale = locale ?? config.locale;
  const resolvedSystem = calendarSystem ?? config.calendarSystem;
  const resolvedZone = timezone ?? config.timezone ?? hostZone();
  const resolvedWeekStart = weekStartsOn ?? config.weekStartsOn;

  const viewModel = useMemo(() => {
    const anchor = adapter.toZoned(viewDate, resolvedZone);
    // Expand recurring events across the visible year when a recurrence adapter
    // is present. A zero-event probe supplies the year's day window (events
    // don't affect the grid), avoiding the probe entirely when nothing recurs.
    let expanded: readonly CalendarEvent<TMeta>[] = events;
    if (recurrenceAdapter !== null && events.some((e) => e.recurrenceRule !== undefined)) {
      const probe = buildYearView<TMeta>(adapter, {
        viewDate: anchor,
        events: [],
        weekStartsOn: resolvedWeekStart,
        locale: resolvedLocale,
        calendarSystem: resolvedSystem,
      });
      const months = probe.months;
      const firstDay = months[0]?.days[0]?.date ?? anchor;
      const lastDays = months[months.length - 1]?.days ?? [];
      const lastDay = lastDays[lastDays.length - 1]?.date ?? anchor;
      expanded = expandForWindow(
        events,
        recurrenceAdapter,
        adapter,
        firstDay,
        adapter.addDays(lastDay, 1),
        resolvedZone,
      );
    }
    return buildYearView<TMeta>(adapter, {
      viewDate: anchor,
      events: expanded,
      weekStartsOn: resolvedWeekStart,
      locale: resolvedLocale,
      calendarSystem: resolvedSystem,
      ...(today !== null ? { today: adapter.toZoned(today, resolvedZone) } : {}),
    });
  }, [
    adapter,
    recurrenceAdapter,
    events,
    viewDate,
    today,
    resolvedZone,
    resolvedWeekStart,
    resolvedLocale,
    resolvedSystem,
  ]);

  // Emit the visible year span so hosts can load events per view (VM has no period).
  const period = useMemo(() => {
    const anchor = adapter.toZoned(viewDate, resolvedZone);
    const months = viewModel.months;
    const start = months[0]?.days[0]?.date ?? anchor;
    const lastDays = months[months.length - 1]?.days ?? [];
    const last = lastDays[lastDays.length - 1]?.date ?? anchor;
    return { start, end: adapter.addDays(last, 1) };
  }, [adapter, viewModel, viewDate, resolvedZone]);
  useViewPeriodChanged(period, period.start.zone, viewPeriodChanged);

  /** The day currently holding roving focus (tabindex 0); null ⇒ use the default. */
  const [focusedEpoch, setFocusedEpoch] = useState<number | null>(null);

  /** In-month day cells across the whole year, in reading order (keyboard nav). */
  const navDays = useMemo(
    () => viewModel.months.flatMap((m) => m.days.filter((d) => d.inMonth)),
    [viewModel],
  );

  const effectiveFocus = useMemo(() => {
    if (focusedEpoch !== null && navDays.some((d) => d.date.epochMs === focusedEpoch)) {
      return focusedEpoch;
    }
    const todayDay = navDays.find((d) => d.isToday);
    return todayDay?.date.epochMs ?? navDays[0]?.date.epochMs ?? null;
  }, [navDays, focusedEpoch]);

  /** Weekday initials for the mini-month header row. */
  const weekdayInitials = useMemo(() => {
    const month = viewModel.months[0];
    if (month === undefined) {
      return [];
    }
    return month.days
      .slice(0, 7)
      .map((d) => adapter.format(d.date, 'EEEEE', resolvedLocale, resolvedSystem));
  }, [adapter, viewModel, resolvedLocale, resolvedSystem]);

  const dayNumber = (day: YearDay): string =>
    adapter.format(day.date, 'd', resolvedLocale, resolvedSystem);

  const dayLabel = (day: YearDay): string => {
    const base = a11y.dayLabel(day.date);
    if (day.eventCount === 0) {
      return base;
    }
    const noun = day.eventCount === 1 ? 'event' : 'events';
    return `${base}, ${day.eventCount} ${noun}`;
  };

  const isFocusTarget = (day: YearDay): boolean => effectiveFocus === day.date.epochMs;

  const onDayClick = useCallback(
    (day: YearDay): void => {
      setFocusedEpoch(day.date.epochMs);
      daySelected?.({ date: day.date });
    },
    [daySelected],
  );

  const onMonthClick = (monthIndex: number): void => {
    const month = viewModel.months[monthIndex];
    const firstIn = month?.days.find((d) => d.inMonth);
    if (firstIn !== undefined) {
      monthSelected?.({ date: firstIn.date });
    }
  };

  const onGridKeydown = (dom: KeyboardEvent): void => {
    const current = navDays.findIndex((d) => d.date.epochMs === effectiveFocus);
    if (current === -1) {
      return;
    }
    const rtl = isRtl(host.current);
    let target = current;
    let select = false;
    switch (dom.key) {
      case 'ArrowRight':
        target = current + (rtl ? -1 : 1);
        break;
      case 'ArrowLeft':
        target = current + (rtl ? 1 : -1);
        break;
      case 'ArrowDown':
        target = current + 7;
        break;
      case 'ArrowUp':
        target = current - 7;
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = navDays.length - 1;
        break;
      case 'Enter':
      case ' ':
        select = true;
        break;
      default:
        return;
    }
    dom.preventDefault();
    if (select) {
      const day = navDays[current];
      if (day !== undefined) {
        onDayClick(day);
      }
      return;
    }
    if (target < 0 || target >= navDays.length) {
      return;
    }
    const next = navDays[target];
    if (next !== undefined) {
      setFocusedEpoch(next.date.epochMs);
      host.current
        ?.querySelector<HTMLElement>(`[data-epoch="${next.date.epochMs}"]`)
        ?.focus();
    }
  };

  return (
    <div ref={host} className={`cal-year-view${className ? ` ${className}` : ''}`}>
      {/* Roving-tabindex grid: day cells are the focus targets; arrow/Home/End/Enter/Space
          are handled centrally here, so the container is intentionally not a tab stop. */}
      <div className="cal-year" onKeyDown={onGridKeydown}>
        <div className="cal-year__grid">
          {viewModel.months.map((month, mi) => (
            <section key={mi} className="cal-mini" aria-label={month.label}>
              <header className="cal-mini__head">
                <button type="button" className="cal-mini__title" onClick={() => onMonthClick(mi)}>
                  {month.label}
                </button>
              </header>
              <div className="cal-mini__grid" role="grid" aria-label={month.label}>
                <div className="cal-mini__wdrow" role="row">
                  {weekdayInitials.map((wd, i) => (
                    <div key={i} className="cal-mini__wd" role="columnheader">
                      <span aria-hidden="true">{wd}</span>
                    </div>
                  ))}
                </div>
                {weeksOf(month.days).map((week, wi) => (
                  <div key={wi} className="cal-mini__week" role="row">
                    {week.map((day) =>
                      day.inMonth ? (
                        <button
                          key={day.date.epochMs}
                          type="button"
                          className={[
                            'cal-mini__day',
                            day.isToday ? 'cal-mini__day--today' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          data-density={density(day)}
                          data-epoch={day.date.epochMs}
                          tabIndex={isFocusTarget(day) ? 0 : -1}
                          aria-label={dayLabel(day)}
                          role="gridcell"
                          onClick={() => onDayClick(day)}
                        >
                          <span className="cal-mini__num" aria-hidden="true">
                            {dayNumber(day)}
                          </span>
                          {day.eventCount > 0 && (
                            <span className="cal-mini__dot" aria-hidden="true"></span>
                          )}
                        </button>
                      ) : (
                        <span
                          key={day.date.epochMs}
                          className="cal-mini__day cal-mini__day--blank"
                          role="gridcell"
                          aria-hidden="true"
                        ></span>
                      ),
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
