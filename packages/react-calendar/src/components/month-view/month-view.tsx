import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { resolveTimeFormat } from '../../core/config/calendar-config';
import type { CalendarSystem, ZonedDateTime } from '../../core/date-adapter/zoned-date-time';
import type { CalendarEvent } from '../../core/model/calendar-event';
import { buildMonthView } from '../../core/view-model/build-month-view';
import type { MonthDay, MonthWeek } from '../../core/view-model/month-view-model';
import type { PositionedChip } from '../../core/view-model/positioned-chip';
import { useCalendar, useDateAdapter } from '../../provider/calendar-context';
import type { CalThemeMode } from '../../theme/derive-theme';
import {
  eventColors,
  eventDotColor,
  expandForWindow,
  hostZone,
  isRtl,
  useHostTheme,
  useViewPeriodChanged,
} from '../internal/host';
import type { RenderCell, RenderEvent, RenderOverflow } from '../types';

/** Props for {@link CalMonthView}. Names/semantics mirror the Angular inputs/outputs. */
export interface CalMonthViewProps<TMeta = unknown> {
  // ── data ──────────────────────────────────────────────────────────────────
  readonly events: readonly CalendarEvent<TMeta>[];
  readonly viewDate: Date | ZonedDateTime;
  readonly today?: Date | ZonedDateTime | null;
  readonly weekStartsOn?: number | null;
  readonly maxLanes?: number | null;
  readonly weekendDays?: readonly number[] | null;
  readonly timezone?: string | null;
  readonly locale?: string | null;
  readonly calendarSystem?: CalendarSystem | null;

  // ── theming ───────────────────────────────────────────────────────────────
  readonly baseColor?: string;
  readonly accentColor?: string;
  readonly themeMode?: CalThemeMode;
  readonly statusColors?: Record<string, string>;
  readonly accentInk?: string | null;

  // ── outputs ───────────────────────────────────────────────────────────────
  readonly eventClicked?: (payload: { event: CalendarEvent<TMeta> }) => void;
  readonly daySelected?: (payload: { date: ZonedDateTime }) => void;
  readonly viewPeriodChanged?: (payload: {
    start: ZonedDateTime;
    end: ZonedDateTime;
    zone: string;
  }) => void;

  // ── render-prop slots ─────────────────────────────────────────────────────
  readonly renderCell?: RenderCell<TMeta>;
  readonly renderEvent?: RenderEvent<TMeta>;
  readonly renderOverflow?: RenderOverflow<TMeta>;

  readonly className?: string;
}

/**
 * Month grid. Renders the pure {@link buildMonthView} view-model with
 * theme-agnostic `--cal-*` styling, ARIA `grid` semantics, multi-day spanning
 * chips, status colours, and "+N more" overflow. All date math is delegated to
 * the provider's {@link DateAdapter}; the component holds no layout logic.
 */
export function CalMonthView<TMeta = unknown>(props: CalMonthViewProps<TMeta>): ReactNode {
  const adapter = useDateAdapter();
  const { config, recurrenceAdapter, a11y, intl } = useCalendar();
  const host = useRef<HTMLDivElement>(null);
  useHostTheme(host, props);

  const {
    events,
    viewDate,
    today = null,
    weekStartsOn = null,
    maxLanes = null,
    weekendDays = null,
    timezone = null,
    locale = null,
    calendarSystem = null,
    eventClicked,
    daySelected,
    viewPeriodChanged,
    renderCell,
    renderEvent,
    renderOverflow,
    className,
  } = props;

  const resolvedLocale = locale ?? config.locale;
  const resolvedSystem = calendarSystem ?? config.calendarSystem;
  const resolvedZone = timezone ?? config.timezone ?? hostZone();
  const resolvedWeekStart = weekStartsOn ?? config.weekStartsOn;

  const viewModel = useMemo(() => {
    const anchor = adapter.toZoned(viewDate, resolvedZone);
    const baseArgs = {
      viewDate: anchor,
      weekStartsOn: resolvedWeekStart,
      ...(today !== null ? { today: adapter.toZoned(today, resolvedZone) } : {}),
      ...(maxLanes !== null ? { maxLanes } : {}),
      ...(weekendDays !== null ? { weekendDays } : {}),
    };
    // Probe the grid window (events don't affect the period) then expand into it.
    const probe = buildMonthView<TMeta>(adapter, {
      viewDate: anchor,
      events: [],
      weekStartsOn: resolvedWeekStart,
    });
    const expanded = expandForWindow(
      events,
      recurrenceAdapter,
      adapter,
      probe.period.start,
      probe.period.end,
      resolvedZone,
    );
    return buildMonthView<TMeta>(adapter, { ...baseArgs, events: expanded });
  }, [
    adapter,
    recurrenceAdapter,
    events,
    viewDate,
    today,
    maxLanes,
    weekendDays,
    resolvedZone,
    resolvedWeekStart,
  ]);

  useViewPeriodChanged(viewModel.period, resolvedZone, viewPeriodChanged);

  /** The selected day (epoch of start-of-day), for highlight. */
  const [selectedEpoch, setSelectedEpoch] = useState<number | null>(null);
  /** The day currently holding roving focus (tabindex 0); null ⇒ use the default. */
  const [focusedEpoch, setFocusedEpoch] = useState<number | null>(null);

  /** Flattened day cells in reading order (for keyboard navigation). */
  const flatDays = useMemo(() => viewModel.weeks.flatMap((w) => w.days), [viewModel]);

  /** The effective roving-focus target: explicit focus, else today, else first in-month. */
  const effectiveFocus = useMemo(() => {
    if (focusedEpoch !== null && flatDays.some((d) => d.date.epochMs === focusedEpoch)) {
      return focusedEpoch;
    }
    const todayDay = flatDays.find((d) => d.isToday);
    if (todayDay !== undefined) {
      return todayDay.date.epochMs;
    }
    const firstIn = flatDays.find((d) => d.inMonth) ?? flatDays[0];
    return firstIn?.date.epochMs ?? null;
  }, [flatDays, focusedEpoch]);

  /** Weekday header labels (short) in the configured locale + calendar system. */
  const weekdayLabels = useMemo(() => {
    const week = viewModel.weeks[0];
    if (week === undefined) {
      return [];
    }
    return week.days.map((day) => ({
      short: adapter.format(day.date, 'EEE', resolvedLocale, resolvedSystem),
      narrow: adapter.format(day.date, 'EEEEE', resolvedLocale, resolvedSystem),
    }));
  }, [adapter, viewModel, resolvedLocale, resolvedSystem]);

  // ── "+N more" overflow popover ─────────────────────────────────────────────
  const [openMoreEpoch, setOpenMoreEpoch] = useState<number | null>(null);
  const [morePlacement, setMorePlacement] = useState({ flipX: false, flipY: false });
  const morePanel = useRef<HTMLDivElement>(null);
  const moreTrigger = useRef<HTMLElement | null>(null);

  // Move focus into the overflow popover when it opens (a11y).
  useEffect(() => {
    if (openMoreEpoch !== null) {
      morePanel.current?.focus();
    }
  }, [openMoreEpoch]);

  const onDayClick = useCallback(
    (day: MonthDay<TMeta>): void => {
      setSelectedEpoch(day.date.epochMs);
      daySelected?.({ date: day.date });
    },
    [daySelected],
  );

  const onEventClick = useCallback(
    (event: CalendarEvent<TMeta>, dom: MouseEvent): void => {
      dom.stopPropagation();
      eventClicked?.({ event });
    },
    [eventClicked],
  );

  /** Open the overflow popover for a day, listing every event covering it. */
  const openMore = useCallback((day: MonthDay<TMeta>, dom: MouseEvent): void => {
    dom.stopPropagation();
    moreTrigger.current = dom.currentTarget as HTMLElement;
    setMorePlacement({ flipX: false, flipY: false });
    setOpenMoreEpoch(day.date.epochMs);
    // Measure once the popover has laid out, then flip it in-bounds if needed.
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        const panel = morePanel.current;
        const hostEl = host.current;
        if (!panel || !hostEl) {
          return;
        }
        const p = panel.getBoundingClientRect();
        const h = hostEl.getBoundingClientRect();
        setMorePlacement({ flipX: p.right > h.right + 1, flipY: p.bottom > h.bottom + 1 });
      });
    }
  }, []);

  const closeMore = useCallback((): void => {
    setOpenMoreEpoch((open) => {
      if (open === null) {
        return open;
      }
      moreTrigger.current?.focus();
      moreTrigger.current = null;
      return null;
    });
  }, []);

  /** Roving-tabindex keyboard navigation over the day grid (RTL-aware). */
  const onGridKeydown = (dom: KeyboardEvent): void => {
    const current = flatDays.findIndex((d) => d.date.epochMs === effectiveFocus);
    if (current === -1) {
      return;
    }
    const rtl = isRtl(host.current);
    const col = current % 7;
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
        target = current - col;
        break;
      case 'End':
        target = current + (6 - col);
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
      const day = flatDays[current];
      if (day !== undefined) {
        onDayClick(day);
      }
      return;
    }
    if (target < 0 || target >= flatDays.length) {
      return;
    }
    const next = flatDays[target];
    if (next !== undefined) {
      setFocusedEpoch(next.date.epochMs);
      host.current
        ?.querySelector<HTMLElement>(`[data-epoch="${next.date.epochMs}"]`)
        ?.focus();
    }
  };

  /**
   * Inline style for a chip: status-tinted background + guaranteed-contrast
   * on-colour, positioned absolutely so a multi-day span overflows rightward
   * across sibling cells while staying logically inside its start gridcell.
   */
  const chipStyle = (chip: PositionedChip<TMeta>): CSSProperties => {
    const { bg, fg } = eventColors(chip.event.status);
    return {
      top: `calc(var(--cal-day-head) + ${chip.lane} * var(--cal-chip-row))`,
      left: '1px',
      width: `calc(${chip.span} * 100% - 2px)`,
      background: bg,
      color: fg,
    };
  };

  /** `top` for the "+N more" pill: the row immediately below the day's last visible chip. */
  const moreTop = (day: MonthDay<TMeta>): string => {
    const lastLane = day.events.reduce((max, chip) => Math.max(max, chip.lane), -1);
    return `calc(var(--cal-day-head) + ${lastLane + 1} * var(--cal-chip-row))`;
  };

  /** Lane rows to reserve in a week (max visible lane + an overflow row if any). */
  const weekLanes = (week: MonthWeek<TMeta>): number => {
    let maxLane = -1;
    let hasOverflow = false;
    for (const day of week.days) {
      for (const chip of day.events) {
        if (chip.lane > maxLane) {
          maxLane = chip.lane;
        }
      }
      if (day.overflowCount > 0) {
        hasOverflow = true;
      }
    }
    return maxLane + 1 + (hasOverflow ? 1 : 0);
  };

  /** Localized "h:mm a" (or "All day") prefix for an event in the popover. */
  const morePopoverTime = (event: CalendarEvent<TMeta>): string => {
    if (event.allDay === true) {
      return intl.allDay;
    }
    return adapter.format(
      adapter.toZoned(event.start, resolvedZone),
      resolveTimeFormat(config.hour12),
      resolvedLocale,
    );
  };

  return (
    <div ref={host} className={`cal-month-view${className ? ` ${className}` : ''}`}>
      {/* Roving-tabindex grid: cells are the focus targets; arrow/Home/End/Enter are
          handled centrally here (APG grid pattern), so the container itself is
          intentionally not a tab stop. */}
      <div className="cal-month" role="grid" aria-label="Month view" onKeyDown={onGridKeydown}>
        <div className="cal-month__weekdays" role="row">
          {weekdayLabels.map((wd, i) => (
            <div key={i} className="cal-month__weekday" role="columnheader">
              <span aria-hidden="true">{wd.short}</span>
            </div>
          ))}
        </div>

        {viewModel.weeks.map((week, wi) => (
          <div
            key={wi}
            className="cal-month__week"
            role="row"
            style={{ '--cal-week-lanes': weekLanes(week) } as CSSProperties}
          >
            {week.days.map((day, col) => {
              const selected = selectedEpoch === day.date.epochMs;
              const moreOpen = openMoreEpoch === day.date.epochMs;
              const dayClasses = [
                'cal-day',
                !day.inMonth ? 'cal-day--out' : '',
                day.isToday ? 'cal-day--today' : '',
                day.isWeekend ? 'cal-day--weekend' : '',
                selected ? 'cal-day--selected' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div
                  key={day.date.epochMs}
                  className={dayClasses}
                  role="gridcell"
                  aria-label={a11y.dayLabel(day.date)}
                  aria-selected={selected}
                  tabIndex={effectiveFocus === day.date.epochMs ? 0 : -1}
                  data-col={col}
                  data-epoch={day.date.epochMs}
                  onClick={() => onDayClick(day)}
                >
                  {renderCell !== undefined ? (
                    renderCell(day)
                  ) : (
                    <>
                      <div className="cal-day__head">
                        <span className="cal-day__num" aria-hidden="true">
                          {adapter.format(day.date, 'd', resolvedLocale, resolvedSystem)}
                        </span>
                      </div>

                      {day.events.map((chip) => (
                        <button
                          key={`${chip.event.id}:${chip.startColumn}`}
                          type="button"
                          className={[
                            'cal-chip',
                            chip.continuesBefore ? 'cal-chip--continues-before' : '',
                            chip.continuesAfter ? 'cal-chip--continues-after' : '',
                            chip.event.cssClass ?? '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={chipStyle(chip)}
                          aria-label={a11y.eventLabel(chip.event)}
                          onClick={(e) => onEventClick(chip.event, e)}
                        >
                          {renderEvent !== undefined ? (
                            renderEvent(chip.event, chip)
                          ) : (
                            <span className="cal-chip__title">{chip.event.title}</span>
                          )}
                        </button>
                      ))}

                      {day.overflowCount > 0 &&
                        (renderOverflow !== undefined ? (
                          renderOverflow(day.overflowCount, day)
                        ) : (
                          <button
                            type="button"
                            className="cal-day__more"
                            style={{ top: moreTop(day) }}
                            aria-label={a11y.moreLabel(day.overflowCount)}
                            aria-expanded={moreOpen}
                            onClick={(e) => openMore(day, e)}
                          >
                            {intl.moreLabel(day.overflowCount)}
                          </button>
                        ))}

                      {moreOpen && (
                        <>
                          <div
                            className="cal-more__backdrop"
                            onClick={(e) => {
                              e.stopPropagation();
                              closeMore();
                            }}
                            aria-hidden="true"
                          ></div>
                          <div
                            ref={morePanel}
                            className={[
                              'cal-more',
                              morePlacement.flipX ? 'cal-more--flip-x' : '',
                              morePlacement.flipY ? 'cal-more--flip-y' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            role="dialog"
                            aria-modal="true"
                            tabIndex={-1}
                            aria-label={a11y.dayLabel(day.date)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                closeMore();
                                e.stopPropagation();
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="cal-more__head">
                              <span className="cal-more__date">
                                {adapter.format(day.date, 'EEE d', resolvedLocale, resolvedSystem)}
                              </span>
                              <button
                                type="button"
                                className="cal-more__close"
                                aria-label={intl.close}
                                onClick={closeMore}
                              >
                                ×
                              </button>
                            </div>
                            <ul className="cal-more__list">
                              {day.dayEvents.map((event) => (
                                <li key={event.id}>
                                  <button
                                    type="button"
                                    className="cal-more__item"
                                    onClick={(e) => {
                                      onEventClick(event, e);
                                      closeMore();
                                    }}
                                  >
                                    <span
                                      className="cal-more__dot"
                                      style={{ background: eventDotColor(event.status) }}
                                    ></span>
                                    <span className="cal-more__time">{morePopoverTime(event)}</span>
                                    <span className="cal-more__title">{event.title}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
