import { useCallback, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useFocusTrap } from '../../a11y/use-focus-trap';
import { resolveTimeFormat } from '../../core/config/calendar-config';
import type { CalendarSystem } from '../../core/date-adapter/zoned-date-time';
import type { CalendarEvent } from '../../core/model/calendar-event';
import type { CalendarResource } from '../../core/model/calendar-resource';
import { useCalendar, useDateAdapter } from '../../provider/calendar-context';
import { sanitizeStatusKey } from '../../theme/tokens';
import { hostZone } from '../internal/host';
import type { RenderEventDetail } from '../types';

/** Props for {@link CalEventDialog}. Names/semantics mirror the Angular inputs/outputs. */
export interface CalEventDialogProps<TMeta = unknown> {
  /** The event to show. `null` keeps the dialog closed. */
  readonly event?: CalendarEvent<TMeta> | null;
  /** Resources, used to resolve `resourceIds` to readable names in the default body. */
  readonly resources?: readonly CalendarResource<TMeta>[];
  readonly locale?: string | null;
  readonly timezone?: string | null;
  readonly calendarSystem?: CalendarSystem | null;

  readonly closed?: () => void;

  /** Replaces the default detail body (the `*calEventDetail` template equivalent). */
  readonly renderEventDetail?: RenderEventDetail<TMeta>;

  readonly className?: string;
}

/**
 * Accessible, theme-agnostic event-detail dialog. Bind `event` to open it; the
 * `closed` callback fires to dismiss. Renders a sensible default body (title,
 * status, date, time range, resources, "repeats") — or a host-supplied
 * `renderEventDetail` render prop for full customization (the "provide a
 * default, allow override" pattern).
 *
 * Dependency-free: `role="dialog"` + `aria-modal`, focus moves into the dialog
 * on open (and back to the opener on close), `Esc` / backdrop dismiss, SSR-safe.
 */
export function CalEventDialog<TMeta = unknown>(props: CalEventDialogProps<TMeta>): ReactNode {
  const adapter = useDateAdapter();
  const { config, intl } = useCalendar();
  const panel = useRef<HTMLDivElement>(null);

  const {
    event = null,
    resources = [],
    locale = null,
    timezone = null,
    calendarSystem = null,
    closed,
    renderEventDetail,
    className,
  } = props;

  const close = useCallback((): void => {
    closed?.();
  }, [closed]);

  // Focus trap while open; restores the opener's focus on dismiss/unmount.
  useFocusTrap(panel, event !== null);

  const zone = (): string => timezone ?? config.timezone ?? hostZone();
  const resolvedLocale = (): string => locale ?? config.locale;
  const system = (): CalendarSystem => calendarSystem ?? config.calendarSystem;

  const dateLabel = (ev: CalendarEvent<TMeta>): string =>
    adapter.format(adapter.toZoned(ev.start, zone()), 'full-date', resolvedLocale(), system());

  const timeLabel = (ev: CalendarEvent<TMeta>): string => {
    if (ev.allDay === true) {
      return intl.allDay;
    }
    const z = zone();
    const loc = resolvedLocale();
    const start = adapter.format(adapter.toZoned(ev.start, z), resolveTimeFormat(config.hour12), loc);
    if (ev.end === undefined) {
      return start;
    }
    const end = adapter.format(adapter.toZoned(ev.end, z), resolveTimeFormat(config.hour12), loc);
    return `${start} – ${end}`;
  };

  const statusColor = (ev: CalendarEvent<TMeta>): string => {
    if (ev.status === undefined) {
      return 'var(--cal-accent)';
    }
    return `var(--cal-event-${sanitizeStatusKey(ev.status)}, var(--cal-accent))`;
  };

  /** Ink proven AA against the status colour (so badge text stays legible). */
  const statusInk = (ev: CalendarEvent<TMeta>): string => {
    if (ev.status === undefined) {
      return 'var(--cal-accent-ink)';
    }
    return `var(--cal-event-${sanitizeStatusKey(ev.status)}-ink, var(--cal-accent-ink))`;
  };

  const resourceNames = (ev: CalendarEvent<TMeta>): string => {
    const ids = ev.resourceIds ?? [];
    if (ids.length === 0) {
      return '';
    }
    const byId = new Map(resources.map((r) => [r.id, r.name]));
    return ids.map((id) => byId.get(id) ?? id).join(', ');
  };

  const isRecurring = (ev: CalendarEvent<TMeta>): boolean =>
    ev.recurrenceRule !== undefined || ev.recurrenceId !== undefined;

  const onPanelKeydown = (dom: KeyboardEvent): void => {
    if (dom.key === 'Escape') {
      close();
    }
  };

  const names = event !== null ? resourceNames(event) : '';

  return (
    <div className={`cal-event-dialog${className ? ` ${className}` : ''}`}>
      {event !== null && (
        <div className="cal-evd__scrim">
          <div className="cal-evd__backdrop" onClick={close} aria-hidden="true"></div>
          <div
            ref={panel}
            className="cal-evd"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-label={event.title ?? 'Event'}
            onKeyDown={onPanelKeydown}
          >
            {renderEventDetail !== undefined ? (
              renderEventDetail(event, close)
            ) : (
              <>
                <header className="cal-evd__head">
                  <span
                    className="cal-evd__bar"
                    style={{ background: statusColor(event) }}
                    aria-hidden="true"
                  ></span>
                  <h2 className="cal-evd__title">{event.title ?? intl.untitledEvent}</h2>
                  <button
                    type="button"
                    className="cal-evd__close"
                    aria-label={intl.close}
                    onClick={close}
                  >
                    ×
                  </button>
                </header>

                <dl className="cal-evd__body">
                  <div className="cal-evd__row">
                    <dt>{intl.dialogWhen}</dt>
                    <dd>
                      {dateLabel(event)}
                      <br />
                      <span className="cal-evd__time">{timeLabel(event)}</span>
                    </dd>
                  </div>
                  {event.status !== undefined && event.status !== '' && (
                    <div className="cal-evd__row">
                      <dt>{intl.dialogStatus}</dt>
                      <dd>
                        <span
                          className="cal-evd__badge"
                          style={{ background: statusColor(event), color: statusInk(event) }}
                        >
                          {event.status}
                        </span>
                      </dd>
                    </div>
                  )}
                  {names !== '' && (
                    <div className="cal-evd__row">
                      <dt>{intl.resourcesHeader}</dt>
                      <dd>{names}</dd>
                    </div>
                  )}
                  {isRecurring(event) && (
                    <div className="cal-evd__row">
                      <dt>{intl.dialogRepeats}</dt>
                      <dd>{intl.recurringEvent}</dd>
                    </div>
                  )}
                </dl>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
