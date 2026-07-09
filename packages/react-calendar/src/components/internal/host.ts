import { useEffect, useMemo, type RefObject } from 'react';
import { useCalendar } from '../../provider/calendar-context';
import { applyTheme } from '../../theme/apply-theme';
import { deriveTheme, type CalThemeMode } from '../../theme/derive-theme';
import type { CalendarEvent } from '../../core/model/calendar-event';
import type { DateAdapter } from '../../core/date-adapter/date-adapter';
import type { ZonedDateTime } from '../../core/date-adapter/zoned-date-time';
import type { RecurrenceAdapter } from '../../core/recurrence/recurrence-adapter';
import { expandRecurringEvents } from '../../core/recurrence/expand-recurring-events';
import { sanitizeStatusKey } from '../../theme/tokens';

export const FALLBACK_BASE = '#ffffff';
export const FALLBACK_ACCENT = '#3b82f6';

/** Resolve the host timezone, SSR-safe (falls back to UTC off the browser). */
export function hostZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.length > 0 ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Theming props shared by every view component. */
export interface CalThemeProps {
  /** Neutral anchor colour (hex). */
  readonly baseColor?: string;
  /** Interactive accent colour (hex). */
  readonly accentColor?: string;
  readonly themeMode?: CalThemeMode;
  /** Per-status/event colours; each runs through the accent pipeline. */
  readonly statusColors?: Record<string, string>;
  /** Optional hex override for on-accent text (`--cal-accent-ink`); null/omitted = auto. */
  readonly accentInk?: string | null;
}

/**
 * Derive the `--cal-*` theme from the component's theming props and write it to
 * the host element as inline custom properties (scoped; no global leakage).
 * Bridged tokens from the provider's `tokenBridge` win over derived values.
 * Effect-based: SSR-safe and StrictMode-idempotent (re-applying is pure overwrite).
 */
export function useHostTheme(host: RefObject<HTMLElement | null>, props: CalThemeProps): void {
  const { tokenBridge } = useCalendar();
  const {
    baseColor = FALLBACK_BASE,
    accentColor = FALLBACK_ACCENT,
    themeMode = 'light',
    statusColors,
    accentInk = null,
  } = props;

  const theme = useMemo(() => {
    try {
      return deriveTheme(baseColor, accentColor, themeMode, statusColors ?? {}, accentInk);
    } catch {
      return deriveTheme(FALLBACK_BASE, FALLBACK_ACCENT, themeMode, statusColors ?? {});
    }
  }, [baseColor, accentColor, themeMode, statusColors, accentInk]);

  useEffect(() => {
    if (host.current !== null) {
      applyTheme(host.current, theme, tokenBridge);
    }
  }, [host, theme, tokenBridge]);
}

/**
 * Emit `viewPeriodChanged` whenever the visible period actually moves (compared
 * by epoch, so re-renders with an identical period stay silent).
 */
export function useViewPeriodChanged(
  period: { readonly start: ZonedDateTime; readonly end: ZonedDateTime },
  zone: string,
  viewPeriodChanged?: (period: { start: ZonedDateTime; end: ZonedDateTime; zone: string }) => void,
): void {
  const startMs = period.start.epochMs;
  const endMs = period.end.epochMs;
  const start = period.start;
  const end = period.end;
  useEffect(() => {
    viewPeriodChanged?.({ start, end, zone });
    // Fire on actual movement only — start/end object identity changes every build.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMs, endMs, zone]);
}

/** Expand recurring events into `[windowStart, windowEnd)` when an engine is present. */
export function expandForWindow<TMeta>(
  events: readonly CalendarEvent<TMeta>[],
  recurrence: RecurrenceAdapter | null,
  dates: DateAdapter,
  windowStart: ZonedDateTime,
  windowEnd: ZonedDateTime,
  zone: string,
): readonly CalendarEvent<TMeta>[] {
  if (recurrence === null || !events.some((e) => e.recurrenceRule !== undefined)) {
    return events;
  }
  return expandRecurringEvents<TMeta>(events, { recurrence, dates, windowStart, windowEnd, zone });
}

/** Status-tinted background/on-colour pair for an event, falling back to the accent. */
export function eventColors(status: string | undefined): { bg: string; fg: string } {
  const key = status !== undefined ? sanitizeStatusKey(status) : '';
  return {
    bg: key !== '' ? `var(--cal-event-${key}, var(--cal-accent))` : 'var(--cal-accent)',
    fg:
      key !== ''
        ? `var(--cal-event-${key}-ink, var(--cal-accent-ink))`
        : 'var(--cal-accent-ink)',
  };
}

/** Status colour token for a leading dot / band, falling back to the accent. */
export function eventDotColor(status: string | undefined): string {
  if (status === undefined) {
    return 'var(--cal-accent)';
  }
  return `var(--cal-event-${sanitizeStatusKey(status)}, var(--cal-accent))`;
}

/** Whether the element (or an ancestor) renders right-to-left. */
export function isRtl(el: HTMLElement | null): boolean {
  if (el === null) {
    return false;
  }
  try {
    return getComputedStyle(el).direction === 'rtl';
  } catch {
    return false;
  }
}
