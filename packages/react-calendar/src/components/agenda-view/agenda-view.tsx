import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { resolveTimeFormat } from '../../core/config/calendar-config';
import type { CalendarSystem, ZonedDateTime } from '../../core/date-adapter/zoned-date-time';
import type { CalendarEvent } from '../../core/model/calendar-event';
import { buildAgendaView } from '../../core/view-model/build-agenda-view';
import type { AgendaDay } from '../../core/view-model/agenda-view-model';
import { useCalendar, useDateAdapter } from '../../provider/calendar-context';
import type { CalThemeMode } from '../../theme/derive-theme';
import {
  eventDotColor,
  expandForWindow,
  hostZone,
  useHostTheme,
  useViewPeriodChanged,
} from '../internal/host';

/** Props for {@link CalAgendaView}. Names/semantics mirror the Angular inputs/outputs. */
export interface CalAgendaViewProps<TMeta = unknown> {
  // ── data ──────────────────────────────────────────────────────────────────
  readonly events: readonly CalendarEvent<TMeta>[];
  readonly viewDate: Date | ZonedDateTime;
  /** Number of consecutive days to list. */
  readonly days?: number;
  readonly today?: Date | ZonedDateTime | null;
  readonly hideEmptyDays?: boolean;
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
  readonly eventClicked?: (payload: { event: CalendarEvent<TMeta> }) => void;
  readonly viewPeriodChanged?: (payload: {
    start: ZonedDateTime;
    end: ZonedDateTime;
    zone: string;
  }) => void;

  readonly className?: string;
}

/**
 * Agenda (list) view: events grouped under day headings, all-day first then by
 * start. Theme-agnostic `--cal-*`, list ARIA semantics, date math via the
 * adapter. The most compact, mobile-friendly view (and the narrow-width fallback).
 */
export function CalAgendaView<TMeta = unknown>(props: CalAgendaViewProps<TMeta>): ReactNode {
  const adapter = useDateAdapter();
  const { config, recurrenceAdapter, a11y, intl } = useCalendar();
  const host = useRef<HTMLDivElement>(null);
  useHostTheme(host, props);

  const {
    events,
    viewDate,
    days = 7,
    today = null,
    hideEmptyDays = false,
    timezone = null,
    locale = null,
    calendarSystem = null,
    eventClicked,
    viewPeriodChanged,
    className,
  } = props;

  const resolvedLocale = locale ?? config.locale;
  const resolvedSystem = calendarSystem ?? config.calendarSystem;
  const resolvedZone = timezone ?? config.timezone ?? hostZone();

  const viewModel = useMemo(() => {
    const anchor = adapter.toZoned(viewDate, resolvedZone);
    // Probe the agenda window (events don't affect the period) then expand into it.
    const probe = buildAgendaView<TMeta>(adapter, { viewDate: anchor, events: [], days });
    const expanded = expandForWindow(
      events,
      recurrenceAdapter,
      adapter,
      probe.period.start,
      probe.period.end,
      resolvedZone,
    );
    return buildAgendaView<TMeta>(adapter, {
      viewDate: anchor,
      events: expanded,
      days,
      hideEmptyDays,
      ...(today !== null ? { today: adapter.toZoned(today, resolvedZone) } : {}),
    });
  }, [adapter, recurrenceAdapter, events, viewDate, days, hideEmptyDays, today, resolvedZone]);

  useViewPeriodChanged(viewModel.period, resolvedZone, viewPeriodChanged);

  const dayHeading = (day: AgendaDay<TMeta>): string =>
    adapter.format(day.date, 'full-date', resolvedLocale, resolvedSystem);

  const timeLabel = (event: CalendarEvent<TMeta>): string => {
    if (event.allDay === true) {
      return intl.allDay;
    }
    const start = adapter.toZoned(event.start, resolvedZone);
    const startLabel = adapter.format(start, resolveTimeFormat(config.hour12), resolvedLocale);
    if (event.end === undefined) {
      return startLabel;
    }
    const end = adapter.toZoned(event.end, resolvedZone);
    return `${startLabel} – ${adapter.format(end, resolveTimeFormat(config.hour12), resolvedLocale)}`;
  };

  const eventLabel = (event: CalendarEvent<TMeta>): string =>
    `${timeLabel(event)}, ${a11y.eventLabel(event)}`;

  const dotStyle = (event: CalendarEvent<TMeta>): CSSProperties => ({
    background: eventDotColor(event.status),
  });

  return (
    <div ref={host} className={`cal-agenda-view${className ? ` ${className}` : ''}`}>
      <div className="cal-agenda">
        {viewModel.days.map((day) => (
          <section
            key={day.date.epochMs}
            className={['cal-agenda__day', day.isToday ? 'cal-agenda__day--today' : '']
              .filter(Boolean)
              .join(' ')}
          >
            <h3 className="cal-agenda__date">{dayHeading(day)}</h3>
            {day.events.length === 0 ? (
              <p className="cal-agenda__empty">{intl.noEvents}</p>
            ) : (
              <ul className="cal-agenda__list" role="list">
                {day.events.map((event) => (
                  <li key={event.id} className="cal-agenda__item" role="listitem">
                    <button
                      type="button"
                      className={['cal-agenda__row', event.cssClass ?? '']
                        .filter(Boolean)
                        .join(' ')}
                      aria-label={eventLabel(event)}
                      onClick={() => eventClicked?.({ event })}
                    >
                      <span
                        className="cal-agenda__dot"
                        style={dotStyle(event)}
                        aria-hidden="true"
                      ></span>
                      <span className="cal-agenda__time">{timeLabel(event)}</span>
                      <span className="cal-agenda__title">{event.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
