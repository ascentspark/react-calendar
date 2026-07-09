/*
 * Public API surface of @ascentsparksoftware/react-calendar.
 * Only symbols re-exported here are part of the semver contract.
 */

// ── Theming engine ──────────────────────────────────────────────────────────
export { deriveTheme, type CalThemeMode } from './theme/derive-theme';
export { applyTheme, type CalTokenBridge } from './theme/apply-theme';
export {
  COLOR_TOKEN_NAMES,
  STATIC_TOKEN_NAMES,
  THEME_TOKEN_NAMES,
  STATIC_TOKENS,
  sanitizeStatusKey,
  type CalThemeTokens,
  type ColorTokenName,
  type StaticTokenName,
  type ThemeTokenName,
} from './theme/tokens';

// ── Date adapter & instant model ────────────────────────────────────────────
export {
  type ZonedDateTime,
  type CalendarSystem,
  type EraFields,
} from './core/date-adapter/zoned-date-time';
export { type DateAdapter } from './core/date-adapter/date-adapter';

// ── Recurrence contract ─────────────────────────────────────────────────────
export {
  type RecurrenceAdapter,
  type RecurrenceParts,
  type RecurrenceFreq,
  type RecurrenceEnd,
  type RecurrenceEditScope,
} from './core/recurrence/recurrence-adapter';
export {
  expandRecurringEvents,
  type ExpandContext,
} from './core/recurrence/expand-recurring-events';
export {
  addRecurrenceException,
  splitSeriesAt,
  type SeriesSplit,
} from './core/recurrence/recurrence-edit';

// ── Core data model ─────────────────────────────────────────────────────────
export { type CalendarEvent } from './core/model/calendar-event';
export { type CalendarResource } from './core/model/calendar-resource';
export { type WorkingHours } from './core/model/working-hours';
export { type CalendarViewName, type TimeAxisOrientation } from './core/model/view';

// ── Headless layout primitives (pure, DOM-free) ─────────────────────────────
export { overlaps, type Interval } from './core/layout/interval';
export { packRows, type LanePlacement, type RowPacking } from './core/layout/pack-rows';
export {
  packColumns,
  type ColumnPlacement,
  type ColumnPacking,
} from './core/layout/pack-columns';
export {
  clampFraction,
  offsetFraction,
  sizeFraction,
  valueAtFraction,
  snapValue,
  type ProjectionRange,
} from './core/layout/projection';
export { computeRowWindow, type VirtualWindow } from './core/layout/virtual-window';

// ── Configuration & provider ────────────────────────────────────────────────
export {
  DEFAULT_CALENDAR_CONFIG,
  resolveTimeFormat,
  type CalendarConfig,
} from './core/config/calendar-config';
export {
  CalendarProvider,
  type CalendarProviderProps,
} from './provider/calendar-provider';
export {
  CalendarContext,
  useCalendar,
  useCalendarConfig,
  useDateAdapter,
  DEFAULT_VIRTUALIZATION,
  type CalendarContextValue,
  type CalVirtualizationOptions,
} from './provider/calendar-context';

// ── View-models ─────────────────────────────────────────────────────────────
export { type ViewPeriod } from './core/view-model/view-period';
export { type PositionedChip } from './core/view-model/positioned-chip';
export {
  type MonthDay,
  type MonthWeek,
  type MonthViewModel,
  type MonthViewArgs,
} from './core/view-model/month-view-model';
export { buildMonthView } from './core/view-model/build-month-view';
export {
  type YearDay,
  type YearMonth,
  type YearViewModel,
  type YearViewArgs,
} from './core/view-model/year-view-model';
export { buildYearView } from './core/view-model/build-year-view';
export {
  type PositionedEvent,
  type ShadeBand,
} from './core/view-model/positioned-event';
export {
  type TimeColumn,
  type TimeTick,
  type TimeGridViewModel,
  type TimeGridViewArgs,
} from './core/view-model/time-grid-view-model';
export { buildTimeGridView } from './core/view-model/build-time-grid-view';
export {
  flattenResources,
  type FlatResource,
} from './core/view-model/flatten-resources';
export {
  type TimeHeaderCell,
  type TimeHeaderUnit,
  type TimeHeaderRow,
  type ResourceRow,
  type TimelineViewModel,
  type TimelineViewArgs,
} from './core/view-model/timeline-view-model';
export { buildTimelineView } from './core/view-model/build-timeline-view';
export {
  type AgendaDay,
  type AgendaViewModel,
  type AgendaViewArgs,
} from './core/view-model/agenda-view-model';
export { buildAgendaView } from './core/view-model/build-agenda-view';
export {
  detectConflicts,
  filterByStatus,
  type EventConflict,
} from './core/view-model/event-queries';

// ── Accessibility & i18n ────────────────────────────────────────────────────
export { CalCalendarA11y } from './a11y/cal-calendar-a11y';
export { useFocusTrap } from './a11y/use-focus-trap';
export { CalCalendarIntl } from './i18n/cal-calendar-intl';

// ── Render-prop slot types ──────────────────────────────────────────────────
export {
  type RenderEvent,
  type RenderCell,
  type RenderOverflow,
  type RenderResourceHeader,
  type RenderEventDetail,
} from './components/types';

// ── Components ───────────────────────────────────────────────────────────────
export { CalMonthView, type CalMonthViewProps } from './components/month-view/month-view';
export { CalYearView, type CalYearViewProps } from './components/year-view/year-view';
export {
  CalTimeGridView,
  type CalTimeGridViewProps,
} from './components/time-grid-view/time-grid-view';
export {
  CalTimelineView,
  type CalTimelineViewProps,
} from './components/timeline-view/timeline-view';
export { CalAgendaView, type CalAgendaViewProps } from './components/agenda-view/agenda-view';
export {
  CalEventDialog,
  type CalEventDialogProps,
} from './components/event-dialog/event-dialog';
export {
  CalRecurrenceEditor,
  type CalRecurrenceEditorProps,
} from './components/recurrence-editor/recurrence-editor';
export {
  CalTimezonePicker,
  type CalTimezonePickerProps,
} from './components/timezone-picker/timezone-picker';

// ── Interactions ────────────────────────────────────────────────────────────
export { type EventChange, type EventChangeKind } from './interactions/event-change';
export {
  computeDragTimes,
  type DragKind,
  type DragInput,
  type DragTimes,
} from './interactions/drag-preview';
