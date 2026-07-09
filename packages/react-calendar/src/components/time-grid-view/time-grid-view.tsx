import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { resolveTimeFormat } from '../../core/config/calendar-config';
import type { CalendarSystem, ZonedDateTime } from '../../core/date-adapter/zoned-date-time';
import type { TimeAxisOrientation } from '../../core/model/view';
import type { CalendarEvent } from '../../core/model/calendar-event';
import { buildTimeGridView } from '../../core/view-model/build-time-grid-view';
import type { PositionedChip } from '../../core/view-model/positioned-chip';
import type { PositionedEvent } from '../../core/view-model/positioned-event';
import type { TimeColumn } from '../../core/view-model/time-grid-view-model';
import { sanitizeStatusKey } from '../../theme/tokens';
import type { CalThemeMode } from '../../theme/derive-theme';
import type { EventChange } from '../../interactions/event-change';
import { computeDragTimes, type DragKind } from '../../interactions/drag-preview';
import { useCalendar, useDateAdapter } from '../../provider/calendar-context';
import { expandForWindow, hostZone, useHostTheme, useViewPeriodChanged } from '../internal/host';
import type { RenderEvent } from '../types';

/** Internal record of an in-flight pointer gesture on the time grid. */
interface DragGesture {
  readonly kind: DragKind;
  readonly eventId: string;
  readonly originStartMs: number;
  readonly originEndMs: number;
  readonly pointerId: number;
  readonly startClientY: number;
  readonly pxPerMinute: number;
  readonly deltaMinutes: number;
  /** True once movement passed the start threshold (so a plain click still selects). */
  readonly active: boolean;
  /** For `create`: the column (day) the new event belongs to. */
  readonly columnEpoch?: number;
}

const DRAG_THRESHOLD_PX = 4;
/** Sentinel pointerId marking a keyboard-driven grab (vs a real pointer). */
const KEYBOARD_POINTER = -1;

/** Props for {@link CalTimeGridView}. Names/semantics mirror the Angular inputs/outputs. */
export interface CalTimeGridViewProps<TMeta = unknown> {
  // ── data ──────────────────────────────────────────────────────────────────
  readonly events: readonly CalendarEvent<TMeta>[];
  readonly viewDate: Date | ZonedDateTime;
  readonly days?: number;
  /**
   * Time-axis direction. `'vertical'` (default) stacks hours top→bottom with days as
   * columns; `'horizontal'` runs time left→right with days as stacked rows (week-as-rows).
   */
  readonly orientation?: TimeAxisOrientation;
  /**
   * Anchor the columns to the start of `viewDate`'s week. `null` (default) is smart:
   * a week/work-week (`days > 1`) anchors, a single-day view (`days === 1`) does not,
   * so `days={1}` shows `viewDate` itself. Set `true`/`false` to force it.
   */
  readonly anchorToWeek?: boolean | null;
  /** Vertical density: `'compact'` shrinks hour rows and type for dense schedules. */
  readonly density?: 'comfortable' | 'compact';
  readonly today?: Date | ZonedDateTime | null;
  readonly now?: Date | ZonedDateTime | null;
  readonly weekStartsOn?: number | null;
  readonly slotMinutes?: number | null;
  readonly dayStartMinutes?: number | null;
  readonly dayEndMinutes?: number | null;
  readonly excludeDays?: readonly number[] | null;
  readonly weekendDays?: readonly number[] | null;
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

  // ── interactions ──────────────────────────────────────────────────────────
  /** Whether events can be dragged / resized. */
  readonly editable?: boolean;
  /** Drag/resize quantisation in minutes; defaults to the config snap. */
  readonly snapMinutes?: number | null;
  /** Live veto: return false to reject an in-flight change (preview snaps back). */
  readonly validateChange?: ((change: EventChange<TMeta>) => boolean) | null;
  /** Enable single-/double-click inline editing of an event's title. */
  readonly inlineEdit?: boolean;

  // ── outputs ───────────────────────────────────────────────────────────────
  readonly eventClicked?: (payload: { event: CalendarEvent<TMeta> }) => void;
  readonly viewPeriodChanged?: (payload: {
    start: ZonedDateTime;
    end: ZonedDateTime;
    zone: string;
  }) => void;
  readonly slotSelected?: (payload: { date: ZonedDateTime; minutes: number }) => void;
  readonly eventChanged?: (change: EventChange<TMeta>) => void;

  // ── render-prop slots ─────────────────────────────────────────────────────
  readonly renderEvent?: RenderEvent<TMeta>;

  readonly className?: string;
}

/**
 * Time-grid workhorse for week / work-week / day. Renders the pure
 * {@link buildTimeGridView} model: a time gutter, an all-day band, day columns
 * with side-by-side packed timed events, working-hours shading hooks, and a live
 * now-indicator. Theme-agnostic `--cal-*`; date math delegated to the adapter.
 */
export function CalTimeGridView<TMeta = unknown>(props: CalTimeGridViewProps<TMeta>): ReactNode {
  const adapter = useDateAdapter();
  const { config, recurrenceAdapter, a11y, intl } = useCalendar();
  const host = useRef<HTMLDivElement>(null);
  useHostTheme(host, props);

  const {
    events,
    viewDate,
    days = 7,
    orientation = 'vertical',
    anchorToWeek = null,
    density = 'comfortable',
    today = null,
    now = null,
    weekStartsOn = null,
    slotMinutes = null,
    dayStartMinutes = null,
    dayEndMinutes = null,
    excludeDays = null,
    weekendDays = null,
    timezone = null,
    locale = null,
    calendarSystem = null,
    editable = true,
    snapMinutes = null,
    validateChange = null,
    inlineEdit = true,
    eventClicked,
    viewPeriodChanged,
    slotSelected,
    eventChanged,
    renderEvent,
    className,
  } = props;

  const resolvedLocale = locale ?? config.locale;
  const resolvedZone = timezone ?? config.timezone ?? hostZone();
  const resolvedSystem = calendarSystem ?? config.calendarSystem;
  const resolvedSnap = snapMinutes ?? config.snapMinutes;
  const minDurationMinutes = Math.max(5, config.slotMinutes);

  const viewModel = useMemo(() => {
    const zone = resolvedZone;
    const args = {
      viewDate: adapter.toZoned(viewDate, zone),
      days,
      weekStartsOn: weekStartsOn ?? config.weekStartsOn,
      orientation,
      slotMinutes: slotMinutes ?? config.slotMinutes,
      dayStartMinutes: dayStartMinutes ?? config.dayStartMinutes,
      dayEndMinutes: dayEndMinutes ?? config.dayEndMinutes,
      locale: resolvedLocale,
      hour12: config.hour12,
      anchorToWeek: anchorToWeek ?? days !== 1,
      ...(today !== null ? { today: adapter.toZoned(today, zone) } : {}),
      ...(now !== null ? { now: adapter.toZoned(now, zone) } : {}),
      ...(excludeDays !== null ? { excludeDays } : {}),
      ...(weekendDays !== null ? { weekendDays } : {}),
    };
    // Probe the grid window (events don't affect the period) then expand into it.
    const probe = buildTimeGridView<TMeta>(adapter, { ...args, events: [] });
    const expanded = expandForWindow(
      events,
      recurrenceAdapter,
      adapter,
      probe.period.start,
      probe.period.end,
      zone,
    );
    return buildTimeGridView<TMeta>(adapter, { ...args, events: expanded });
  }, [
    adapter,
    recurrenceAdapter,
    events,
    viewDate,
    days,
    orientation,
    anchorToWeek,
    today,
    now,
    weekStartsOn,
    slotMinutes,
    dayStartMinutes,
    dayEndMinutes,
    excludeDays,
    weekendDays,
    resolvedZone,
    resolvedLocale,
    config,
  ]);

  useViewPeriodChanged(viewModel.period, resolvedZone, viewPeriodChanged);

  /** In-flight drag/resize gesture, or null. Drives the live preview. */
  const [dragState, setDragState] = useState<DragGesture | null>(null);
  /**
   * Synchronous mirror of {@link dragState}. The Angular source reads the gesture
   * through a signal, which makes a `set(null)` in one handler immediately visible
   * to another handler firing in the same DOM dispatch (e.g. pointer-up on a resize
   * handle bubbling to its parent event). React state only updates on the next
   * render, so gesture handlers read/write through this ref and the state exists
   * purely to drive the live preview render.
   */
  const dragRef = useRef<DragGesture | null>(null);
  const setDrag = (value: DragGesture | null): void => {
    dragRef.current = value;
    setDragState(value);
  };
  /** Id of the event whose title is being inline-edited, or null. */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Live-region text announced during keyboard drag (screen readers). */
  const [announcement, setAnnouncement] = useState('');
  const inlineInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingId !== null) {
      const el = inlineInput.current;
      if (el) {
        el.focus();
        el.select();
      }
    }
  }, [editingId]);

  /** Number of all-day band lanes (for reserving band height). */
  const allDayLanes = useMemo(() => {
    let max = -1;
    for (const chip of viewModel.allDay) {
      if (chip.lane > max) {
        max = chip.lane;
      }
    }
    return max + 1;
  }, [viewModel]);

  const columnHeaders = useMemo(
    () =>
      viewModel.columns.map((c) => ({
        weekday: adapter.format(c.date, 'EEE', resolvedLocale, resolvedSystem),
        day: adapter.format(c.date, 'd', resolvedLocale, resolvedSystem),
        isToday: c.isToday,
        isWeekend: c.isWeekend,
      })),
    [adapter, viewModel, resolvedLocale, resolvedSystem],
  );

  /** Max overlapping lanes across all day-columns (sizes the horizontal day-rows). */
  const maxColumnLanes = useMemo(() => {
    let max = 1;
    for (const col of viewModel.columns) {
      for (const ev of col.events) {
        if (ev.laneCount > max) {
          max = ev.laneCount;
        }
      }
    }
    return max;
  }, [viewModel]);

  /** Hover tooltip: title + localized time range (events truncate at small sizes). */
  const tooltip = (event: CalendarEvent<TMeta>): string => {
    const title = event.title ?? '';
    if (event.allDay === true) {
      return `${title} · ${intl.allDay}`.trim();
    }
    const start = adapter.format(
      adapter.toZoned(event.start, resolvedZone),
      resolveTimeFormat(config.hour12),
      resolvedLocale,
    );
    if (event.end === undefined) {
      return `${title} · ${start}`.trim();
    }
    const end = adapter.format(
      adapter.toZoned(event.end, resolvedZone),
      resolveTimeFormat(config.hour12),
      resolvedLocale,
    );
    return `${title} · ${start}–${end}`.trim();
  };

  // ── time-axis helpers (Y for vertical, X for horizontal) ───────────────────
  /** Pointer coordinate along the time axis. */
  const axisClient = (dom: { clientX: number; clientY: number }): number =>
    orientation === 'horizontal' ? dom.clientX : dom.clientY;
  /** Element size along the time axis. */
  const axisSize = (rect: { width: number; height: number }): number =>
    orientation === 'horizontal' ? rect.width : rect.height;
  /** Element start edge along the time axis (left for horizontal, top for vertical). */
  const axisStart = (rect: { left: number; top: number }): number =>
    orientation === 'horizontal' ? rect.left : rect.top;

  /** Whether this event is the one currently being dragged/resized. */
  const isDragging = (ev: PositionedEvent<TMeta>): boolean =>
    dragState !== null && dragState.active && dragState.eventId === ev.event.id;

  /** Time-axis geometry, replaced by the live preview while this event is dragged. */
  const previewGeometry = (
    ev: PositionedEvent<TMeta>,
    column: TimeColumn<TMeta>,
  ): { startOffset: number; span: number } => {
    const drag = dragState;
    if (drag === null || !drag.active || drag.eventId !== ev.event.id) {
      return { startOffset: ev.startOffset, span: ev.span };
    }
    const vm = viewModel;
    const total = vm.dayEndMinutes - vm.dayStartMinutes;
    const times = computeDragTimes({
      kind: drag.kind,
      originStartMs: drag.originStartMs,
      originEndMs: drag.originEndMs,
      deltaMinutes: drag.deltaMinutes,
      snapMinutes: resolvedSnap,
      minDurationMinutes,
    });
    const dayStart0 = adapter.startOfDay(column.date);
    const sMin = adapter.differenceInMinutes(
      adapter.toZoned(new Date(times.startMs), resolvedZone),
      dayStart0,
    );
    const eMin = adapter.differenceInMinutes(
      adapter.toZoned(new Date(times.endMs), resolvedZone),
      dayStart0,
    );
    const cs = Math.max(vm.dayStartMinutes, Math.min(sMin, vm.dayEndMinutes));
    const ce = Math.max(cs, Math.min(eMin, vm.dayEndMinutes));
    return { startOffset: (cs - vm.dayStartMinutes) / total, span: (ce - cs) / total };
  };

  /** Inline geometry for a timed event (time axis + cross-axis lane), status-tinted. */
  const eventStyle = (ev: PositionedEvent<TMeta>, column: TimeColumn<TMeta>): CSSProperties => {
    const key = ev.event.status !== undefined ? sanitizeStatusKey(ev.event.status) : '';
    const bg = key !== '' ? `var(--cal-event-${key}, var(--cal-accent))` : 'var(--cal-accent)';
    const fg =
      key !== ''
        ? `var(--cal-event-${key}-ink, var(--cal-accent-ink))`
        : 'var(--cal-accent-ink)';
    const geo = previewGeometry(ev, column);
    const widthPct = (ev.columnSpan / ev.laneCount) * 100;
    const leftPct = (ev.lane / ev.laneCount) * 100;
    return {
      '--ev-start': `${geo.startOffset * 100}%`,
      '--ev-size': `${geo.span * 100}%`,
      '--ev-cross-start': `${leftPct}%`,
      '--ev-cross-size': `${widthPct}%`,
      // Lane index — horizontal orientation stacks overlapping events by fixed lane height.
      '--ev-lane': `${ev.lane}`,
      background: bg,
      color: fg,
    } as CSSProperties;
  };

  // ── pointer move / resize ──────────────────────────────────────────────────

  /** Begin a move/resize gesture on pointer-down over an event (or its handle). */
  const onEventPointerDown = (
    ev: PositionedEvent<TMeta>,
    kind: DragKind,
    dom: PointerEvent<HTMLElement>,
  ): void => {
    if (!editable || ev.event.isReadonly === true || ev.event.editable === false) {
      return;
    }
    if (kind === 'move' && ev.event.draggable === false) {
      return;
    }
    const colEl = (dom.currentTarget as HTMLElement).closest<HTMLElement>('.cal-tg__col');
    if (colEl === null) {
      return;
    }
    const vm = viewModel;
    const total = vm.dayEndMinutes - vm.dayStartMinutes;
    const pxPerMinute = axisSize(colEl.getBoundingClientRect()) / Math.max(1, total);
    const start = adapter.toZoned(ev.event.start, resolvedZone);
    const end = ev.event.end === undefined ? start : adapter.toZoned(ev.event.end, resolvedZone);
    const target = dom.currentTarget as HTMLElement;
    if (typeof target.setPointerCapture === 'function') {
      try {
        target.setPointerCapture(dom.pointerId);
      } catch {
        // setPointerCapture is best-effort (not critical to the gesture).
      }
    }
    dom.stopPropagation();
    setDrag({
      kind,
      eventId: ev.event.id,
      originStartMs: start.epochMs,
      originEndMs: end.epochMs,
      pointerId: dom.pointerId,
      startClientY: axisClient(dom),
      pxPerMinute,
      deltaMinutes: 0,
      active: false,
    });
  };

  const onEventPointerMove = (dom: PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== dom.pointerId) {
      return;
    }
    const dyPx = axisClient(dom) - drag.startClientY;
    const active = drag.active || Math.abs(dyPx) > DRAG_THRESHOLD_PX;
    setDrag({ ...drag, deltaMinutes: dyPx / drag.pxPerMinute, active });
  };

  const onEventPointerUp = (ev: PositionedEvent<TMeta>, dom: PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== dom.pointerId) {
      return;
    }
    if (!drag.active) {
      // No real movement → treat as a click/select.
      setDrag(null);
      eventClicked?.({ event: ev.event });
      return;
    }
    commitGesture(ev, drag);
  };

  /** Build, validate, and emit the change for a finished move/resize gesture. */
  const commitGesture = (ev: PositionedEvent<TMeta>, drag: DragGesture): void => {
    const times = computeDragTimes({
      kind: drag.kind,
      originStartMs: drag.originStartMs,
      originEndMs: drag.originEndMs,
      deltaMinutes: drag.deltaMinutes,
      snapMinutes: resolvedSnap,
      minDurationMinutes,
    });
    const change: EventChange<TMeta> = {
      kind: drag.kind === 'move' ? 'move' : 'resize',
      event: ev.event,
      start: adapter.toZoned(new Date(times.startMs), resolvedZone),
      end: adapter.toZoned(new Date(times.endMs), resolvedZone),
    };
    setDrag(null);
    if (validateChange !== null && !validateChange(change)) {
      return; // vetoed → preview already cleared (snaps back)
    }
    eventChanged?.(change);
  };

  const onEventPointerCancel = (dom: PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    if (drag !== null && drag.pointerId === dom.pointerId) {
      setDrag(null);
    }
  };

  // ── keyboard move / resize (a11y) ──────────────────────────────────────────

  const announce = (message: string): void => {
    setAnnouncement(message);
  };

  const zonedFromMs = (epochMs: number): ZonedDateTime =>
    adapter.toZoned(new Date(epochMs), resolvedZone);

  const announceGesture = (
    kind: 'move' | 'resize-end',
    drag: DragGesture,
    deltaMinutes: number,
  ): void => {
    if (kind === 'resize-end') {
      announce(a11y.resizedLabel(zonedFromMs(drag.originEndMs + deltaMinutes * 60_000)));
    } else {
      announce(a11y.movedLabel(zonedFromMs(drag.originStartMs + deltaMinutes * 60_000)));
    }
  };

  /**
   * Keyboard move/resize on a focused event (a11y). Enter/Space grabs; Arrow
   * Up/Down move by one snap step (Shift = resize the end); Enter drops, Escape
   * cancels. Uses the same `dragState` preview + commit path as pointer drag.
   */
  const onEventKeydown = (ev: PositionedEvent<TMeta>, dom: KeyboardEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    const grabbing =
      drag !== null && drag.pointerId === KEYBOARD_POINTER && drag.eventId === ev.event.id;
    const snap = resolvedSnap;

    if (!grabbing) {
      if (dom.key === 'F2') {
        // F2 is the conventional "rename" key — make inline edit keyboard-reachable.
        startInlineEdit(ev, dom);
        return;
      }
      if (dom.key === 'Enter' || dom.key === ' ') {
        if (!editable || ev.event.isReadonly === true || ev.event.editable === false) {
          return;
        }
        dom.preventDefault();
        const start = adapter.toZoned(ev.event.start, resolvedZone);
        const end =
          ev.event.end === undefined ? start : adapter.toZoned(ev.event.end, resolvedZone);
        setDrag({
          kind: 'move',
          eventId: ev.event.id,
          originStartMs: start.epochMs,
          originEndMs: end.epochMs,
          pointerId: KEYBOARD_POINTER,
          startClientY: 0,
          pxPerMinute: 1,
          deltaMinutes: 0,
          active: true,
        });
        announce(a11y.grabbedLabel(ev.event));
      }
      return;
    }

    switch (dom.key) {
      case 'ArrowUp': {
        dom.preventDefault();
        const kind = dom.shiftKey ? 'resize-end' : 'move';
        const deltaMinutes = drag.deltaMinutes - snap;
        setDrag({ ...drag, kind, deltaMinutes });
        announceGesture(kind, drag, deltaMinutes);
        break;
      }
      case 'ArrowDown': {
        dom.preventDefault();
        const kind = dom.shiftKey ? 'resize-end' : 'move';
        const deltaMinutes = drag.deltaMinutes + snap;
        setDrag({ ...drag, kind, deltaMinutes });
        announceGesture(kind, drag, deltaMinutes);
        break;
      }
      case 'Enter':
      case ' ':
        dom.preventDefault();
        announce(
          a11y.droppedLabel(
            ev.event,
            zonedFromMs(drag.originStartMs + drag.deltaMinutes * 60_000),
          ),
        );
        commitGesture(ev, drag);
        break;
      case 'Escape':
        dom.preventDefault();
        setDrag(null);
        announce(a11y.moveCancelledLabel(ev.event));
        break;
      default:
        break;
    }
  };

  // ── inline title editing ───────────────────────────────────────────────────

  const isEditing = (ev: PositionedEvent<TMeta>): boolean => editingId === ev.event.id;

  const startInlineEdit = (
    ev: PositionedEvent<TMeta>,
    dom: { stopPropagation(): void },
  ): void => {
    if (!inlineEdit || ev.event.isReadonly === true) {
      return;
    }
    dom.stopPropagation();
    setDrag(null);
    setEditingId(ev.event.id);
  };

  const commitInlineEdit = (ev: PositionedEvent<TMeta>, value: string): void => {
    if (editingId !== ev.event.id) {
      return;
    }
    setEditingId(null);
    const title = value.trim();
    if (title !== (ev.event.title ?? '')) {
      eventChanged?.({ kind: 'inline-edit', event: ev.event, title });
    }
  };

  const cancelInlineEdit = (): void => {
    setEditingId(null);
  };

  const onInlineKeydown = (ev: PositionedEvent<TMeta>, dom: KeyboardEvent<HTMLInputElement>): void => {
    if (dom.key === 'Enter') {
      dom.preventDefault();
      commitInlineEdit(ev, (dom.target as HTMLInputElement).value);
    } else if (dom.key === 'Escape') {
      dom.preventDefault();
      cancelInlineEdit();
    }
  };

  // ── all-day chips / now indicator / plain clicks ───────────────────────────

  const chipStyle = (chip: PositionedChip<TMeta>): CSSProperties => {
    const key = chip.event.status !== undefined ? sanitizeStatusKey(chip.event.status) : '';
    const bg =
      key !== ''
        ? `var(--cal-event-${key}-soft, var(--cal-accent-soft))`
        : 'var(--cal-accent-soft)';
    const fg =
      key !== ''
        ? `var(--cal-event-${key}-soft-ink, var(--cal-accent-soft-ink))`
        : 'var(--cal-accent-soft-ink)';
    return {
      gridColumn: `${chip.startColumn + 1} / span ${chip.span}`,
      gridRow: `${chip.lane + 1}`,
      background: bg,
      color: fg,
    };
  };

  const nowStyle = (offset: number): CSSProperties =>
    ({ '--now-pos': `${offset * 100}%` }) as CSSProperties;

  const onEventClick = (event: CalendarEvent<TMeta>, dom: MouseEvent): void => {
    dom.stopPropagation();
    eventClicked?.({ event });
  };

  // ── drag-create on empty grid space ────────────────────────────────────────

  /** Begin a drag-create on empty grid space (pointer-down on the column itself). */
  const onColumnPointerDown = (column: TimeColumn<TMeta>, dom: PointerEvent<HTMLElement>): void => {
    // Ignore if the gesture started on an event/handle (those stopPropagation).
    if (!editable) {
      return;
    }
    const colEl = dom.currentTarget as HTMLElement;
    const vm = viewModel;
    const total = vm.dayEndMinutes - vm.dayStartMinutes;
    const rect = colEl.getBoundingClientRect();
    const pxPerMinute = axisSize(rect) / Math.max(1, total);
    const frac = (axisClient(dom) - axisStart(rect)) / Math.max(1, axisSize(rect));
    const minutes = vm.dayStartMinutes + Math.max(0, Math.min(1, frac)) * total;
    const anchorMs = adapter.addMinutes(column.date, Math.round(minutes)).epochMs;
    if (typeof colEl.setPointerCapture === 'function') {
      try {
        colEl.setPointerCapture(dom.pointerId);
      } catch {
        // best-effort
      }
    }
    setDrag({
      kind: 'create',
      eventId: '',
      originStartMs: anchorMs,
      originEndMs: anchorMs,
      pointerId: dom.pointerId,
      startClientY: axisClient(dom),
      pxPerMinute,
      deltaMinutes: 0,
      active: false,
      columnEpoch: column.date.epochMs,
    });
  };

  const onColumnPointerMove = (dom: PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    if (drag === null || drag.kind !== 'create' || drag.pointerId !== dom.pointerId) {
      return;
    }
    const dyPx = axisClient(dom) - drag.startClientY;
    const active = drag.active || Math.abs(dyPx) > DRAG_THRESHOLD_PX;
    setDrag({ ...drag, deltaMinutes: dyPx / drag.pxPerMinute, active });
  };

  const onColumnPointerUp = (column: TimeColumn<TMeta>, dom: PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current;
    if (drag === null || drag.kind !== 'create' || drag.pointerId !== dom.pointerId) {
      return;
    }
    if (!drag.active) {
      // No drag → a plain slot click.
      setDrag(null);
      const minutes = adapter.differenceInMinutes(
        adapter.toZoned(new Date(drag.originStartMs), resolvedZone),
        adapter.startOfDay(column.date),
      );
      slotSelected?.({
        date: adapter.toZoned(new Date(drag.originStartMs), resolvedZone),
        minutes: Math.round(minutes),
      });
      return;
    }
    const times = createTimes(drag);
    const change: EventChange<TMeta> = {
      kind: 'create',
      event: null,
      start: adapter.toZoned(new Date(times.startMs), resolvedZone),
      end: adapter.toZoned(new Date(times.endMs), resolvedZone),
    };
    setDrag(null);
    if (validateChange !== null && !validateChange(change)) {
      return;
    }
    eventChanged?.(change);
  };

  /** Preview geometry for the in-flight create ghost in a given column, or null. */
  const createGhostStyle = (column: TimeColumn<TMeta>): CSSProperties | null => {
    const drag = dragState;
    if (
      drag === null ||
      drag.kind !== 'create' ||
      !drag.active ||
      drag.columnEpoch !== column.date.epochMs
    ) {
      return null;
    }
    const vm = viewModel;
    const total = vm.dayEndMinutes - vm.dayStartMinutes;
    const times = createTimes(drag);
    const dayStart0 = adapter.startOfDay(column.date);
    const sMin = adapter.differenceInMinutes(
      adapter.toZoned(new Date(times.startMs), resolvedZone),
      dayStart0,
    );
    const eMin = adapter.differenceInMinutes(
      adapter.toZoned(new Date(times.endMs), resolvedZone),
      dayStart0,
    );
    const cs = Math.max(vm.dayStartMinutes, Math.min(sMin, vm.dayEndMinutes));
    const ce = Math.max(cs, Math.min(eMin, vm.dayEndMinutes));
    return {
      '--ev-start': `${((cs - vm.dayStartMinutes) / total) * 100}%`,
      '--ev-size': `${((ce - cs) / total) * 100}%`,
    } as CSSProperties;
  };

  const createTimes = (drag: DragGesture): { startMs: number; endMs: number } =>
    computeDragTimes({
      kind: 'create',
      originStartMs: drag.originStartMs,
      originEndMs: drag.originEndMs,
      deltaMinutes: 0,
      pointerMs: drag.originStartMs + drag.deltaMinutes * 60_000,
      snapMinutes: resolvedSnap,
      minDurationMinutes,
    });

  // ── render ─────────────────────────────────────────────────────────────────

  const vm = viewModel;
  const hostClasses = [
    'cal-time-grid-view',
    density === 'compact' ? 'cal-tg--compact' : '',
    orientation === 'horizontal' ? 'cal-tg--horizontal' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={host} className={hostClasses}>
      <div
        className="cal-tg"
        role="grid"
        aria-label="Time grid"
        aria-colcount={vm.columns.length}
        aria-rowcount={3}
        style={
          {
            '--cal-tg-cols': vm.columns.length,
            '--cal-tg-hours': (vm.dayEndMinutes - vm.dayStartMinutes) / 60,
            '--cal-tg-allday-lanes': allDayLanes,
            '--cal-tg-max-lanes': maxColumnLanes,
          } as CSSProperties
        }
      >
        {/* Header: corner + column day headers */}
        <div className="cal-tg__corner" aria-hidden="true"></div>
        <div className="cal-tg__headers" role="row">
          {columnHeaders.map((h, i) => (
            <div
              key={i}
              className={[
                'cal-tg__colhead',
                h.isToday ? 'cal-tg__colhead--today' : '',
                h.isWeekend ? 'cal-tg__colhead--weekend' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="columnheader"
            >
              <span className="cal-tg__colhead-wd">{h.weekday}</span>
              <span className="cal-tg__colhead-day">{h.day}</span>
            </div>
          ))}
        </div>

        {/* All-day band */}
        <div className="cal-tg__allday-gutter" aria-hidden="true">
          {intl.allDay}
        </div>
        <div className="cal-tg__allday" role="row" aria-label="All-day events">
          <div
            className="cal-tg__allday-cells"
            role="gridcell"
            style={{ gridTemplateColumns: `repeat(${vm.columns.length}, 1fr)` }}
          >
            {vm.allDay.map((chip) => (
              <button
                key={`${chip.event.id}:${chip.startColumn}`}
                type="button"
                className="cal-tg__chip"
                style={chipStyle(chip)}
                aria-label={a11y.eventLabel(chip.event)}
                onClick={(e) => onEventClick(chip.event, e)}
              >
                <span className="cal-tg__chip-title">{chip.event.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Time gutter */}
        <div className="cal-tg__gutter" aria-hidden="true">
          {vm.ticks
            .filter((tick) => tick.major)
            .map((tick) => (
              <div
                key={tick.minutes}
                className="cal-tg__tick"
                style={{ '--tick-pos': `${tick.offset * 100}%` } as CSSProperties}
              >
                <span className="cal-tg__tick-label">{tick.label}</span>
              </div>
            ))}
        </div>

        {/* Day columns */}
        <div className="cal-tg__cols" role="row">
          {vm.columns.map((column) => {
            const ghost = createGhostStyle(column);
            return (
              <div
                key={column.date.epochMs}
                className={[
                  'cal-tg__col',
                  column.isToday ? 'cal-tg__col--today' : '',
                  column.isWeekend ? 'cal-tg__col--weekend' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="gridcell"
                aria-label={a11y.dayLabel(column.date)}
                onPointerDown={(e) => onColumnPointerDown(column, e)}
                onPointerMove={onColumnPointerMove}
                onPointerUp={(e) => onColumnPointerUp(column, e)}
                onPointerCancel={onEventPointerCancel}
              >
                {vm.ticks.map((tick) => (
                  <div
                    key={tick.minutes}
                    className={['cal-tg__line', !tick.major ? 'cal-tg__line--minor' : '']
                      .filter(Boolean)
                      .join(' ')}
                    style={{ '--tick-pos': `${tick.offset * 100}%` } as CSSProperties}
                    aria-hidden="true"
                  ></div>
                ))}

                {ghost !== null && (
                  <div className="cal-tg__create-ghost" style={ghost} aria-hidden="true"></div>
                )}

                {column.events.map((ev) => (
                  <button
                    key={ev.event.id}
                    type="button"
                    className={[
                      'cal-tg__event',
                      ev.continuesBefore ? 'cal-tg__event--continues-before' : '',
                      ev.continuesAfter ? 'cal-tg__event--continues-after' : '',
                      isDragging(ev) ? 'cal-tg__event--dragging' : '',
                      ev.event.cssClass ?? '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={eventStyle(ev, column)}
                    aria-label={a11y.eventLabel(ev.event)}
                    title={tooltip(ev.event)}
                    onPointerDown={(e) => onEventPointerDown(ev, 'move', e)}
                    onPointerMove={onEventPointerMove}
                    onPointerUp={(e) => onEventPointerUp(ev, e)}
                    onPointerCancel={onEventPointerCancel}
                    onDoubleClick={(e) => startInlineEdit(ev, e)}
                    onKeyDown={(e) => onEventKeydown(ev, e)}
                  >
                    {isEditing(ev) ? (
                      <input
                        ref={inlineInput}
                        type="text"
                        className="cal-tg__inline"
                        defaultValue={ev.event.title ?? ''}
                        aria-label="Edit title"
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => onInlineKeydown(ev, e)}
                        onBlur={(e: FocusEvent<HTMLInputElement>) =>
                          commitInlineEdit(ev, e.target.value)
                        }
                      />
                    ) : renderEvent !== undefined ? (
                      renderEvent(ev.event)
                    ) : (
                      <span className="cal-tg__event-title">{ev.event.title}</span>
                    )}

                    {editable && ev.event.isReadonly !== true && (
                      <>
                        <span
                          className="cal-tg__resize cal-tg__resize--start"
                          aria-hidden="true"
                          onPointerDown={(e) => onEventPointerDown(ev, 'resize-start', e)}
                          onPointerMove={onEventPointerMove}
                          onPointerUp={(e) => onEventPointerUp(ev, e)}
                          onPointerCancel={onEventPointerCancel}
                        ></span>
                        <span
                          className="cal-tg__resize cal-tg__resize--end"
                          aria-hidden="true"
                          onPointerDown={(e) => onEventPointerDown(ev, 'resize-end', e)}
                          onPointerMove={onEventPointerMove}
                          onPointerUp={(e) => onEventPointerUp(ev, e)}
                          onPointerCancel={onEventPointerCancel}
                        ></span>
                      </>
                    )}
                  </button>
                ))}

                {column.nowOffset !== null && (
                  <div className="cal-tg__now" style={nowStyle(column.nowOffset)} aria-hidden="true">
                    <span className="cal-tg__now-dot"></span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Screen-reader announcements for keyboard move/resize (grab, step, drop, cancel). */}
      <div className="cal-tg__sr" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
