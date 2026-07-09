/**
 * Centralised, provider-overridable **visible** UI labels (distinct from
 * {@link CalCalendarA11y}, which owns screen-reader strings). Replace wholesale
 * for localisation by passing a subclass (or duck-typed object) to the
 * `CalendarProvider`:
 *
 * ```tsx
 * <CalendarProvider intl={new MyFrenchIntl()}>…</CalendarProvider>
 * ```
 *
 * Date/number text (weekday names, day numbers, times) is produced by the active
 * date adapter via `Intl` and is already locale-aware; this class only covers
 * the library's own fixed words.
 */
export class CalCalendarIntl {
  /** All-day band / agenda label for all-day events. */
  allDay = 'All day';
  /** Agenda heading for a day with no events. */
  noEvents = 'No events';
  /** Frozen resource-column header (timeline). */
  resourcesHeader = 'Resources';

  /** Generic close-button label (event dialog, overflow popover). */
  close = 'Close';
  /** Fallback title for an event with no `title`. */
  untitledEvent = '(untitled)';
  /** Event-dialog field labels. */
  dialogWhen = 'When';
  dialogStatus = 'Status';
  dialogRepeats = 'Repeats';
  /** Event-dialog value shown for a recurring event. */
  recurringEvent = 'Recurring event';

  /** "+N" overflow control text (month). */
  moreLabel(count: number): string {
    return `+${count}`;
  }
}
