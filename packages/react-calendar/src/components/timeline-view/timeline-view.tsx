import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type UIEvent,
} from 'react';
import { resolveTimeFormat } from '../../core/config/calendar-config';
import type { CalendarSystem, ZonedDateTime } from '../../core/date-adapter/zoned-date-time';
import type { TimeAxisOrientation } from '../../core/model/view';
import type { CalendarEvent } from '../../core/model/calendar-event';
import type { CalendarResource } from '../../core/model/calendar-resource';
import { buildTimelineView } from '../../core/view-model/build-timeline-view';
import { computeRowWindow, type VirtualWindow } from '../../core/layout/virtual-window';
import type { TimeHeaderUnit, ResourceRow } from '../../core/view-model/timeline-view-model';
import type { PositionedEvent, ShadeBand } from '../../core/view-model/positioned-event';
import type { EventChange } from '../../interactions/event-change';
import type { CalThemeMode } from '../../theme/derive-theme';
import { useCalendar, useDateAdapter } from '../../provider/calendar-context';
import {
  eventColors,
  expandForWindow,
  hostZone,
  isRtl,
  useHostTheme,
  useViewPeriodChanged,
} from '../internal/host';
import type { RenderEvent, RenderResourceHeader } from '../types';

/** Movement past this many px before a press is treated as a drag (not a click). */
const DRAG_THRESHOLD_PX = 4;

/** In-flight gesture moving/resizing a timeline block along time / across lanes. */
interface TimelineDrag {
  readonly eventId: string;
  readonly kind: 'move' | 'resize-start' | 'resize-end';
  readonly originStartMs: number;
  readonly originEndMs: number;
  readonly originResourceId: string;
  /** Resource lane the block will land in (keyboard lane moves change this). */
  readonly targetResourceId: string;
  readonly pointerId: number;
  /** Pointer coordinate along the time axis at grab (X horizontal, Y vertical). */
  readonly startAxis: number;
  readonly deltaMinutes: number;
  readonly active: boolean;
}

/** In-flight drag-to-create gesture on an empty lane. */
interface CreateDrag {
  readonly resourceId: string;
  readonly anchorMin: number;
  readonly deltaMin: number;
  readonly pointerId: number;
  readonly startAxis: number;
  readonly active: boolean;
}

/** Sentinel pointerId marking a keyboard-driven grab (vs a real pointer). */
const KEYBOARD_POINTER = -1;

const DEFAULT_HEADER_GROUPINGS: readonly TimeHeaderUnit[] = ['day', 'hour'];

/** Absolute epoch ms of a `Date | ZonedDateTime`. */
function epochOf(value: Date | ZonedDateTime): number {
  return value instanceof Date ? value.getTime() : value.epochMs;
}

/** Props for {@link CalTimelineView}. Names/semantics mirror the Angular inputs/outputs. */
export interface CalTimelineViewProps<TMeta = unknown> {
  // ── data ──────────────────────────────────────────────────────────────────
  readonly events: readonly CalendarEvent<TMeta>[];
  readonly resources: readonly CalendarResource<TMeta>[];
  readonly viewDate: Date | ZonedDateTime;
  readonly days?: number;
  readonly dayStartMinutes?: number | null;
  readonly dayEndMinutes?: number | null;
  readonly headerGroupings?: readonly TimeHeaderUnit[];
  /**
   * Whether the time axis runs horizontally (time on X, resources as rows — the
   * default and original behaviour) or vertically (time on Y, resources as columns
   * across the top). Mirrors the same prop on the time-grid view.
   */
  readonly orientation?: TimeAxisOrientation;
  readonly today?: Date | ZonedDateTime | null;
  readonly now?: Date | ZonedDateTime | null;
  readonly weekStartsOn?: number | null;
  readonly timezone?: string | null;
  readonly locale?: string | null;
  readonly calendarSystem?: CalendarSystem | null;
  /** Pixel width of one hour along the time axis (controls horizontal density). */
  readonly hourWidth?: number;
  /** Pixel height of one event sub-lane. */
  readonly laneHeight?: number;

  // ── theming ───────────────────────────────────────────────────────────────
  readonly baseColor?: string;
  readonly accentColor?: string;
  readonly themeMode?: CalThemeMode;
  readonly statusColors?: Record<string, string>;
  /** Optional hex override for on-accent text (`--cal-accent-ink`); null = auto. */
  readonly accentInk?: string | null;

  // ── interactions ──────────────────────────────────────────────────────────
  /** Whether blocks can be dragged to reschedule / reassign. */
  readonly editable?: boolean;
  /** Drag quantisation in minutes; defaults to the config snap. */
  readonly snapMinutes?: number | null;
  /** Live veto: return false to reject an in-flight change (the block snaps back). */
  readonly validateChange?: ((change: EventChange<TMeta>) => boolean) | null;

  // ── outputs ───────────────────────────────────────────────────────────────
  readonly eventClicked?: (payload: { event: CalendarEvent<TMeta> }) => void;
  readonly viewPeriodChanged?: (payload: {
    start: ZonedDateTime;
    end: ZonedDateTime;
    zone: string;
  }) => void;
  /** Fired when a block is dragged to a new time and/or resource lane. */
  readonly eventChanged?: (change: EventChange<TMeta>) => void;
  readonly slotSelected?: (payload: { date: ZonedDateTime; resourceId: string }) => void;
  readonly resourceToggled?: (payload: {
    resource: CalendarResource<TMeta>;
    expanded: boolean;
  }) => void;
  /**
   * Fired when an external item (e.g. an unassigned job from a side list) is
   * dropped onto a resource lane. Carries the drop time, target resource, and the
   * dropped `text/plain` payload so the host can create/assign the event.
   */
  readonly externalDrop?: (payload: {
    date: ZonedDateTime;
    resourceId: string;
    data: string;
  }) => void;

  // ── render-prop slots ─────────────────────────────────────────────────────
  readonly renderEvent?: RenderEvent<TMeta>;
  readonly renderResourceHeader?: RenderResourceHeader;

  readonly className?: string;
}

/**
 * Resource × time dispatch board. Renders the pure {@link buildTimelineView}
 * model with a frozen resource-header column, sticky multi-level time headers,
 * per-resource lanes of positioned event blocks, off-hours / block-out shading,
 * a live now-line, and expand/collapse of the resource tree. Theme-agnostic
 * `--cal-*`; all date math delegated to the adapter.
 */
export function CalTimelineView<TMeta = unknown>(props: CalTimelineViewProps<TMeta>): ReactNode {
  const adapter = useDateAdapter();
  const { config, recurrenceAdapter, virtualization, a11y, intl } = useCalendar();
  const host = useRef<HTMLDivElement>(null);
  useHostTheme(host, props);

  const {
    events,
    resources,
    viewDate,
    days = 1,
    dayStartMinutes = null,
    dayEndMinutes = null,
    headerGroupings = DEFAULT_HEADER_GROUPINGS,
    orientation = 'horizontal',
    today = null,
    now = null,
    weekStartsOn = null,
    timezone = null,
    locale = null,
    hourWidth = 60,
    laneHeight = 34,
    editable = true,
    snapMinutes = null,
    validateChange = null,
    eventClicked,
    viewPeriodChanged,
    eventChanged,
    slotSelected,
    resourceToggled,
    externalDrop,
    renderEvent,
    renderResourceHeader,
    className,
  } = props;

  const resolvedLocale = locale ?? config.locale;
  const resolvedZone = timezone ?? config.timezone ?? hostZone();

  /** Local collapse overrides (id → collapsed), so the board is self-contained. */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  /** Resources with local collapse applied (expanded:false for collapsed ids). */
  const effectiveResources = useMemo<readonly CalendarResource<TMeta>[]>(() => {
    if (collapsed.size === 0) {
      return resources;
    }
    return resources.map((r) => (collapsed.has(r.id) ? { ...r, expanded: false } : r));
  }, [collapsed, resources]);

  const viewModel = useMemo(() => {
    const args = {
      viewDate: adapter.toZoned(viewDate, resolvedZone),
      resources: effectiveResources,
      days,
      dayStartMinutes: dayStartMinutes ?? config.dayStartMinutes,
      dayEndMinutes: dayEndMinutes ?? config.dayEndMinutes,
      headerGroupings,
      orientation,
      weekStartsOn: weekStartsOn ?? config.weekStartsOn,
      locale: resolvedLocale,
      hour12: config.hour12,
      ...(now !== null ? { now: adapter.toZoned(now, resolvedZone) } : {}),
      ...(today !== null ? { today: adapter.toZoned(today, resolvedZone) } : {}),
    };
    // Expand recurring events against the timeline window when an engine is present
    // (probe the period with an empty event set — events don't affect the period).
    let expanded = events;
    if (recurrenceAdapter !== null && events.some((e) => e.recurrenceRule !== undefined)) {
      const probe = buildTimelineView<TMeta>(adapter, { ...args, events: [] });
      expanded = expandForWindow(
        events,
        recurrenceAdapter,
        adapter,
        probe.period.start,
        probe.period.end,
        resolvedZone,
      );
    }
    return buildTimelineView<TMeta>(adapter, { ...args, events: expanded });
  }, [
    adapter,
    recurrenceAdapter,
    events,
    effectiveResources,
    viewDate,
    days,
    dayStartMinutes,
    dayEndMinutes,
    headerGroupings,
    orientation,
    today,
    now,
    weekStartsOn,
    resolvedLocale,
    resolvedZone,
    config,
  ]);

  useViewPeriodChanged(viewModel.period, resolvedZone, viewPeriodChanged);

  /** Total hours along the axis (for the time-area extent). */
  const totalHours = useMemo(
    () => adapter.differenceInMinutes(viewModel.period.end, viewModel.period.start) / 60,
    [adapter, viewModel],
  );

  /** True when the time axis runs vertically (resources are columns). */
  const vertical = orientation === 'vertical';

  /** The pointer coordinate along the time axis (X for horizontal, Y for vertical). */
  const axisClient = (dom: { clientX: number; clientY: number }): number =>
    vertical ? dom.clientY : dom.clientX;

  /** Fraction (0–1) along the time axis for a pointer over `target`. Time always
   *  increases downward on Y (vertical); RTL only flips the horizontal X axis. */
  const axisFraction = (target: HTMLElement, client: number): number => {
    const rect = target.getBoundingClientRect();
    if (vertical) {
      const y = client - rect.top;
      return Math.max(0, Math.min(1, y / Math.max(1, rect.height)));
    }
    const rtl = isRtl(target);
    const x = rtl ? rect.right - client : client - rect.left;
    return Math.max(0, Math.min(1, x / Math.max(1, rect.width)));
  };

  // ── Virtualization (rows windowed vertically, events culled horizontally) ────
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);

  /** The slice of resource rows to render, plus the spacer heights that preserve scroll height. */
  const rowWindow = useMemo<VirtualWindow>(() => {
    const rows = viewModel.resourceRows;
    // Row-windowing assumes resources stack vertically; in vertical orientation they
    // are columns, so render them all. Also disabled/unmeasured/modest ⇒ render everything.
    if (
      vertical ||
      !virtualization.enabled ||
      rows.length <= virtualization.rowThreshold ||
      viewportHeight <= 0
    ) {
      return { start: 0, end: rows.length, padTop: 0, padBottom: 0 };
    }
    const heights = rows.map((r) => r.laneCount * laneHeight);
    return computeRowWindow(heights, scrollTop, viewportHeight, virtualization.overscanPx);
  }, [viewModel, vertical, virtualization, laneHeight, scrollTop, viewportHeight]);

  /** The resource rows currently in (or near) the viewport. */
  const visibleRows = useMemo(
    () => viewModel.resourceRows.slice(rowWindow.start, rowWindow.end),
    [viewModel, rowWindow],
  );

  /**
   * Events in a lane that intersect the horizontal viewport (+overscan) — so a wide
   * month timeline doesn't render thousands of off-screen event nodes. Falls back to
   * the full lane when virtualization is off or the width isn't measured yet.
   */
  const visibleEvents = (row: ResourceRow<TMeta>): readonly PositionedEvent<TMeta>[] => {
    // Horizontal event-culling assumes time on X; skip it in vertical orientation.
    if (vertical || !virtualization.enabled || viewportWidth <= 0) {
      return row.events;
    }
    const totalW = totalHours * hourWidth;
    const left = scrollLeft - virtualization.overscanPx;
    const right = scrollLeft + viewportWidth + virtualization.overscanPx;
    return row.events.filter((e) => {
      const x0 = e.startOffset * totalW;
      const x1 = (e.startOffset + e.span) * totalW;
      return x1 >= left && x0 <= right;
    });
  };

  const onScroll = (dom: UIEvent<HTMLDivElement>): void => {
    const target = dom.currentTarget;
    setScrollTop(target.scrollTop);
    setScrollLeft(target.scrollLeft);
  };

  // Track the scroll viewport's size (browser-only) so windowing + culling know
  // how much to render on each axis. Idempotent under StrictMode double-invoke.
  useEffect(() => {
    const el = scroller.current;
    if (el === null || typeof ResizeObserver === 'undefined') {
      return;
    }
    const measure = (): void => {
      setViewportHeight(el.clientHeight);
      setViewportWidth(el.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const eventLabel = (event: CalendarEvent<TMeta>): string => a11y.eventLabel(event);

  /** Hover tooltip: title + localized time range. */
  const tooltip = (event: CalendarEvent<TMeta>): string => {
    const title = event.title ?? '';
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

  const rowHeightPx = (row: ResourceRow<TMeta>): number => row.laneCount * laneHeight;

  const shadeStyle = (band: ShadeBand): CSSProperties =>
    ({
      '--band-start': `${band.startOffset * 100}%`,
      '--band-size': `${band.span * 100}%`,
    }) as CSSProperties;

  const nowStyle = (): CSSProperties =>
    ({ '--now-pos': `${(viewModel.nowOffset ?? 0) * 100}%` }) as CSSProperties;

  const toggle = (row: ResourceRow<TMeta>): void => {
    if (!row.hasChildren) {
      return;
    }
    const id = row.resource.id;
    const next = new Set(collapsed);
    const willCollapse = !next.has(id);
    if (willCollapse) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setCollapsed(next);
    resourceToggled?.({ resource: row.resource, expanded: !willCollapse });
  };

  const isCollapsed = (row: ResourceRow<TMeta>): boolean => collapsed.has(row.resource.id);

  // ── drag/resize gestures ──────────────────────────────────────────────────
  // Gesture state lives in refs (authoritative, updated synchronously mid-gesture)
  // mirrored into state (drives the live preview render). Handlers read the refs;
  // render reads the state.
  /** In-flight block drag, or null. Drives the live preview. */
  const dragRef = useRef<TimelineDrag | null>(null);
  const [drag, setDragState] = useState<TimelineDrag | null>(null);
  const setDrag = (d: TimelineDrag | null): void => {
    dragRef.current = d;
    setDragState(d);
  };
  /** Set briefly after an active drag so the trailing click doesn't also fire. */
  const suppressClick = useRef(false);
  /** Live-region text announced during keyboard move/resize. */
  const [announcement, setAnnouncement] = useState('');
  /** Lane order (resource ids top→bottom) for keyboard lane navigation. */
  const laneOrder = useMemo(() => viewModel.resourceRows.map((r) => r.resource.id), [viewModel]);
  /** In-flight drag-to-create gesture on an empty lane, or null. */
  const createDragRef = useRef<CreateDrag | null>(null);
  const [createDrag, setCreateDragState] = useState<CreateDrag | null>(null);
  const setCreateDrag = (c: CreateDrag | null): void => {
    createDragRef.current = c;
    setCreateDragState(c);
  };

  const snap = snapMinutes ?? config.snapMinutes;

  const onEventClick = (event: CalendarEvent<TMeta>, dom: MouseEvent): void => {
    dom.stopPropagation();
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    eventClicked?.({ event });
  };

  const onEventPointerDown = (
    ev: PositionedEvent<TMeta>,
    row: ResourceRow<TMeta>,
    kind: 'move' | 'resize-start' | 'resize-end',
    dom: PointerEvent<HTMLElement>,
  ): void => {
    if (!editable || ev.event.isReadonly === true || dom.button !== 0) {
      return;
    }
    if (kind === 'move' && ev.event.draggable === false) {
      return;
    }
    dom.stopPropagation();
    const startMs = epochOf(ev.event.start);
    const endMs = ev.event.end !== undefined ? epochOf(ev.event.end) : startMs + 3_600_000;
    setDrag({
      eventId: ev.event.id,
      kind,
      originStartMs: startMs,
      originEndMs: endMs,
      originResourceId: row.resource.id,
      targetResourceId: row.resource.id,
      pointerId: dom.pointerId,
      startAxis: axisClient(dom),
      deltaMinutes: 0,
      active: false,
    });
    const target = dom.currentTarget;
    if (typeof target.setPointerCapture === 'function') {
      try {
        target.setPointerCapture(dom.pointerId);
      } catch {
        /* best-effort: not critical to the gesture */
      }
    }
  };

  const onEventPointerMove = (dom: PointerEvent<HTMLElement>): void => {
    const d = dragRef.current;
    if (d === null || d.pointerId !== dom.pointerId) {
      return;
    }
    const delta = axisClient(dom) - d.startAxis;
    // Time increases downward on Y (vertical); RTL only flips the horizontal X axis.
    const eff = vertical ? delta : isRtl(host.current) ? -delta : delta;
    const pxPerMinute = hourWidth / 60;
    const minutes = Math.round(eff / pxPerMinute / snap) * snap;
    const active = d.active || Math.abs(delta) > DRAG_THRESHOLD_PX;
    setDrag({ ...d, deltaMinutes: minutes, active });
  };

  const onEventPointerUp = (ev: PositionedEvent<TMeta>, dom: PointerEvent<HTMLElement>): void => {
    const d = dragRef.current;
    if (d === null || d.pointerId !== dom.pointerId) {
      return;
    }
    setDrag(null);
    if (!d.active) {
      return; // a plain click; let onClick handle selection
    }
    suppressClick.current = true;
    // Only a move can change lanes; a resize stays on its own lane.
    const targetResource =
      d.kind === 'move'
        ? (resourceAtPoint(dom.clientX, dom.clientY) ?? d.originResourceId)
        : d.originResourceId;
    commitDrag(ev.event, { ...d, targetResourceId: targetResource });
  };

  /** Build the change for a gesture, run it past `validateChange`, and emit if allowed. */
  const commitDrag = (event: CalendarEvent<TMeta>, d: TimelineDrag): void => {
    const deltaMs = d.deltaMinutes * 60_000;
    if (deltaMs === 0 && d.targetResourceId === d.originResourceId) {
      return; // no net change
    }
    let startMs = d.originStartMs;
    let endMs = d.originEndMs;
    if (d.kind === 'move') {
      startMs += deltaMs;
      endMs += deltaMs;
    } else if (d.kind === 'resize-end') {
      endMs = Math.max(startMs + 60_000, endMs + deltaMs);
    } else {
      startMs = Math.min(endMs - 60_000, startMs + deltaMs); // resize-start
    }
    const change: EventChange<TMeta> = {
      kind: d.kind === 'move' ? 'move' : 'resize',
      event,
      start: adapter.toZoned(new Date(startMs), resolvedZone),
      end: adapter.toZoned(new Date(endMs), resolvedZone),
      resourceId: d.targetResourceId,
    };
    if (validateChange !== null && !validateChange(change)) {
      return; // vetoed — preview already cleared, so the block snaps back
    }
    eventChanged?.(change);
  };

  const onEventPointerCancel = (dom: PointerEvent<HTMLElement>): void => {
    const d = dragRef.current;
    if (d !== null && d.pointerId === dom.pointerId) {
      setDrag(null);
    }
    const c = createDragRef.current;
    if (c !== null && c.pointerId === dom.pointerId) {
      setCreateDrag(null);
    }
  };

  /**
   * Keyboard move/resize on a focused block (a11y). Enter/Space grabs; Left/Right move
   * by one snap step (Shift = resize the end); Up/Down move across resource lanes; Enter
   * drops (→ `validateChange` → `eventChanged`), Escape cancels.
   */
  const onEventKeydown = (
    ev: PositionedEvent<TMeta>,
    row: ResourceRow<TMeta>,
    dom: KeyboardEvent<HTMLElement>,
  ): void => {
    if (!editable || ev.event.isReadonly === true) {
      return;
    }
    const d = dragRef.current;
    const grabbing = d !== null && d.pointerId === KEYBOARD_POINTER && d.eventId === ev.event.id;

    if (!grabbing) {
      if (dom.key === 'Enter' || dom.key === ' ') {
        dom.preventDefault();
        const startMs = epochOf(ev.event.start);
        const endMs = ev.event.end !== undefined ? epochOf(ev.event.end) : startMs + 3_600_000;
        setDrag({
          eventId: ev.event.id,
          kind: 'move',
          originStartMs: startMs,
          originEndMs: endMs,
          originResourceId: row.resource.id,
          targetResourceId: row.resource.id,
          pointerId: KEYBOARD_POINTER,
          startAxis: 0,
          deltaMinutes: 0,
          active: true,
        });
        setAnnouncement(a11y.grabbedLabel(ev.event));
      }
      return;
    }

    // Axis-aware arrows: the time axis is X (horizontal) or Y (vertical); the resource
    // (lane) axis is the other one. Arrows follow the visual transposition.
    const timeBack = vertical ? 'ArrowUp' : 'ArrowLeft';
    const timeFwd = vertical ? 'ArrowDown' : 'ArrowRight';
    const laneBack = vertical ? 'ArrowLeft' : 'ArrowUp';
    const laneFwd = vertical ? 'ArrowRight' : 'ArrowDown';
    switch (dom.key) {
      case timeBack:
        dom.preventDefault();
        nudge(d, dom.shiftKey ? 'resize-end' : 'move', -snap);
        break;
      case timeFwd:
        dom.preventDefault();
        nudge(d, dom.shiftKey ? 'resize-end' : 'move', snap);
        break;
      case laneBack:
        dom.preventDefault();
        moveLane(d, -1);
        break;
      case laneFwd:
        dom.preventDefault();
        moveLane(d, 1);
        break;
      case 'Enter':
      case ' ':
        dom.preventDefault();
        setDrag(null);
        setAnnouncement(
          a11y.droppedLabel(ev.event, zonedFromMs(d.originStartMs + d.deltaMinutes * 60_000)),
        );
        commitDrag(ev.event, d);
        break;
      case 'Escape':
        dom.preventDefault();
        setDrag(null);
        setAnnouncement(a11y.moveCancelledLabel(ev.event));
        break;
      default:
        break;
    }
  };

  const nudge = (d: TimelineDrag, kind: 'move' | 'resize-end', step: number): void => {
    const deltaMinutes = d.deltaMinutes + step;
    setDrag({ ...d, kind, deltaMinutes });
    if (kind === 'resize-end') {
      setAnnouncement(a11y.resizedLabel(zonedFromMs(d.originEndMs + deltaMinutes * 60_000)));
    } else {
      setAnnouncement(a11y.movedLabel(zonedFromMs(d.originStartMs + deltaMinutes * 60_000)));
    }
  };

  const moveLane = (d: TimelineDrag, dir: number): void => {
    const idx = laneOrder.indexOf(d.targetResourceId);
    const next = laneOrder[Math.min(laneOrder.length - 1, Math.max(0, idx + dir))];
    if (next !== undefined && next !== d.targetResourceId) {
      setDrag({ ...d, targetResourceId: next });
      const name = resources.find((r) => r.id === next)?.name ?? next;
      setAnnouncement(`Moved to lane ${name}`);
    }
  };

  const zonedFromMs = (epochMs: number): ZonedDateTime =>
    adapter.toZoned(new Date(epochMs), resolvedZone);

  const isDragging = (ev: PositionedEvent<TMeta>): boolean =>
    drag !== null && drag.active && drag.eventId === ev.event.id;

  /** Live geometry for a block: shifts/resizes the dragged block's start/span in place. */
  const previewGeo = (ev: PositionedEvent<TMeta>): { startOffset: number; span: number } => {
    const d = drag;
    if (d === null || !d.active || d.eventId !== ev.event.id) {
      return { startOffset: ev.startOffset, span: ev.span };
    }
    const totalMin = Math.max(1, totalHours * 60);
    const minSpan = 1 / totalMin;
    const df = d.deltaMinutes / totalMin;
    if (d.kind === 'resize-end') {
      return { startOffset: ev.startOffset, span: Math.max(minSpan, ev.span + df) };
    }
    if (d.kind === 'resize-start') {
      return { startOffset: ev.startOffset + df, span: Math.max(minSpan, ev.span - df) };
    }
    return { startOffset: ev.startOffset + df, span: ev.span }; // move
  };

  const eventStyle = (ev: PositionedEvent<TMeta>): CSSProperties => {
    const { bg, fg } = eventColors(ev.event.status);
    const geo = previewGeo(ev);
    // Axis-neutral geometry; the CSS maps --ev-start/--ev-size to the time axis and
    // --ev-lane/--ev-lane-size to the cross (sub-lane) axis per orientation.
    return {
      '--ev-start': `${geo.startOffset * 100}%`,
      '--ev-size': `calc(${geo.span * 100}% - 2px)`,
      '--ev-lane': `${ev.lane * laneHeight}px`,
      '--ev-lane-size': `${laneHeight - 3}px`,
      background: bg,
      color: fg,
    } as CSSProperties;
  };

  /** Resolve the resource lane under a viewport point (for cross-lane reassignment). */
  const resourceAtPoint = (x: number, y: number): string | null => {
    const doc = host.current?.ownerDocument ?? null;
    if (doc === null || typeof doc.elementFromPoint !== 'function') {
      return null;
    }
    let el: Element | null;
    try {
      el = doc.elementFromPoint(x, y);
    } catch {
      return null;
    }
    const lane = el === null ? null : el.closest('.cal-tl__row');
    return lane?.getAttribute('data-resource-id') ?? null;
  };

  const onRowClick = (row: ResourceRow<TMeta>, dom: MouseEvent<HTMLElement>): void => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return; // trailing click after a drag-create
    }
    const total = adapter.differenceInMinutes(viewModel.period.end, viewModel.period.start);
    const target = dom.currentTarget;
    const frac = axisFraction(target, axisClient(dom));
    const date = adapter.addMinutes(viewModel.period.start, Math.round(frac * total));
    slotSelected?.({ date, resourceId: row.resource.id });
  };

  // ── drag-to-create on an empty lane ──────────────────────────────────────────
  const laneMinutes = (target: HTMLElement, client: number): number => {
    const total = adapter.differenceInMinutes(viewModel.period.end, viewModel.period.start);
    const raw = axisFraction(target, client) * total;
    return Math.round(raw / snap) * snap;
  };

  const onLanePointerDown = (row: ResourceRow<TMeta>, dom: PointerEvent<HTMLElement>): void => {
    if (!editable || dom.button !== 0) {
      return;
    }
    const target = dom.currentTarget;
    setCreateDrag({
      resourceId: row.resource.id,
      anchorMin: laneMinutes(target, axisClient(dom)),
      deltaMin: 0,
      pointerId: dom.pointerId,
      startAxis: axisClient(dom),
      active: false,
    });
    if (typeof target.setPointerCapture === 'function') {
      try {
        target.setPointerCapture(dom.pointerId);
      } catch {
        /* best-effort */
      }
    }
  };

  const onLanePointerMove = (dom: PointerEvent<HTMLElement>): void => {
    const c = createDragRef.current;
    if (c === null || c.pointerId !== dom.pointerId) {
      return;
    }
    const delta = axisClient(dom) - c.startAxis;
    const eff = vertical ? delta : isRtl(host.current) ? -delta : delta;
    const deltaMin = Math.round(eff / (hourWidth / 60) / snap) * snap;
    setCreateDrag({ ...c, deltaMin, active: c.active || Math.abs(delta) > DRAG_THRESHOLD_PX });
  };

  const onLanePointerUp = (dom: PointerEvent<HTMLElement>): void => {
    const c = createDragRef.current;
    if (c === null || c.pointerId !== dom.pointerId) {
      return;
    }
    setCreateDrag(null);
    if (!c.active) {
      return; // a plain click → onRowClick emits slotSelected
    }
    suppressClick.current = true;
    const startMin = Math.min(c.anchorMin, c.anchorMin + c.deltaMin);
    const dur = Math.max(snap, Math.abs(c.deltaMin));
    const change: EventChange<TMeta> = {
      kind: 'create',
      event: null,
      start: adapter.addMinutes(viewModel.period.start, startMin),
      end: adapter.addMinutes(viewModel.period.start, startMin + dur),
      resourceId: c.resourceId,
    };
    if (validateChange !== null && !validateChange(change)) {
      return;
    }
    eventChanged?.(change);
  };

  /** Geometry for the create-ghost while dragging on a lane, or null. */
  const createGhostStyle = (row: ResourceRow<TMeta>): CSSProperties | null => {
    const c = createDrag;
    if (c === null || !c.active || c.resourceId !== row.resource.id) {
      return null;
    }
    const total = Math.max(
      1,
      adapter.differenceInMinutes(viewModel.period.end, viewModel.period.start),
    );
    const startMin = Math.min(c.anchorMin, c.anchorMin + c.deltaMin);
    const dur = Math.max(snap, Math.abs(c.deltaMin));
    return {
      '--ev-start': `${(startMin / total) * 100}%`,
      '--ev-size': `${(dur / total) * 100}%`,
    } as CSSProperties;
  };

  /** Map a pointer position on a lane back to a drop time (axis- and RTL-aware). */
  const dropTime = (target: HTMLElement, client: number): ZonedDateTime => {
    const total = adapter.differenceInMinutes(viewModel.period.end, viewModel.period.start);
    const frac = axisFraction(target, client);
    return adapter.addMinutes(viewModel.period.start, Math.round(frac * total));
  };

  /** Allow a native drag to drop on a lane. */
  const onLaneDragOver = (dom: DragEvent<HTMLElement>): void => {
    dom.preventDefault();
    if (dom.dataTransfer) {
      dom.dataTransfer.dropEffect = 'copy';
    }
  };

  /** Handle an external item dropped onto a lane → resolve (time, resource, payload). */
  const onExternalDrop = (row: ResourceRow<TMeta>, dom: DragEvent<HTMLElement>): void => {
    dom.preventDefault();
    const target = dom.currentTarget;
    const date = dropTime(target, axisClient(dom));
    const data = dom.dataTransfer?.getData('text/plain') ?? '';
    externalDrop?.({ date, resourceId: row.resource.id, data });
  };

  const rootClasses = [
    'cal-timeline-view',
    vertical ? 'cal-tl--vertical' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={host} className={rootClasses}>
      <div
        ref={scroller}
        className="cal-tl"
        style={
          {
            '--cal-tl-time-extent': `${totalHours * hourWidth}px`,
            '--cal-tl-hour-w': `${hourWidth}px`,
          } as CSSProperties
        }
        onScroll={onScroll}
      >
        <div className="cal-tl__grid" role="grid" aria-label="Resource timeline">
          {/* Corner (frozen top-left). Decorative: resource lanes are self-labelled. */}
          <div className="cal-tl__corner" aria-hidden="true">
            <span className="cal-tl__corner-label">{intl.resourcesHeader}</span>
          </div>

          {/* Sticky multi-level time headers */}
          <div className="cal-tl__timehead" role="rowgroup">
            {viewModel.headerRows.map((hrow, hi) => (
              <div key={hi} className="cal-tl__hrow" role="row">
                {hrow.cells.map((cell, ci) => (
                  <div
                    key={ci}
                    className={['cal-tl__hcell', cell.isNow ? 'cal-tl__hcell--now' : '']
                      .filter(Boolean)
                      .join(' ')}
                    role="columnheader"
                    style={
                      {
                        '--hc-start': `${cell.offset * 100}%`,
                        '--hc-size': `${cell.span * 100}%`,
                      } as CSSProperties
                    }
                  >
                    <span className="cal-tl__hcell-label">{cell.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Resource rows: frozen header + lane body. The display:contents wrapper is
              the ARIA row (rowheader + gridcell) without disturbing the CSS grid.
              Long resource lists are virtualized: only rows near the viewport render,
              with top/bottom spacers preserving the scroll height (see rowWindow). */}
          {rowWindow.padTop > 0 && (
            <div
              className="cal-tl__spacer"
              style={{ blockSize: `${rowWindow.padTop}px` }}
              aria-hidden="true"
            ></div>
          )}
          {visibleRows.map((row) => (
            <div key={row.resource.id} className="cal-tl__resrow" role="row">
              <div
                className="cal-tl__rhead"
                role="rowheader"
                style={
                  {
                    '--cal-tl-lane-extent': `${rowHeightPx(row)}px`,
                    '--cal-tl-depth': row.depth,
                  } as CSSProperties
                }
              >
                {renderResourceHeader !== undefined ? (
                  renderResourceHeader(row.resource, {
                    depth: row.depth,
                    hasChildren: row.hasChildren,
                    collapsed: isCollapsed(row),
                  })
                ) : (
                  <>
                    {row.hasChildren && (
                      <button
                        type="button"
                        className="cal-tl__twisty"
                        aria-expanded={!isCollapsed(row)}
                        aria-label={
                          (isCollapsed(row) ? 'Expand ' : 'Collapse ') + row.resource.name
                        }
                        onClick={() => toggle(row)}
                      >
                        {isCollapsed(row) ? '▸' : '▾'}
                      </button>
                    )}
                    <span className="cal-tl__rname">{row.resource.name}</span>
                  </>
                )}
              </div>

              {/* Lane click creates an event at the pointer's time position (a pointer-only
                  affordance); keyboard users create via the toolbar/form. Events within the
                  lane are focusable buttons. */}
              <div
                className="cal-tl__row"
                role="gridcell"
                data-resource-id={row.resource.id}
                style={{ '--cal-tl-lane-extent': `${rowHeightPx(row)}px` } as CSSProperties}
                aria-label={row.resource.name}
                onClick={(e) => onRowClick(row, e)}
                onPointerDown={(e) => onLanePointerDown(row, e)}
                onPointerMove={onLanePointerMove}
                onPointerUp={onLanePointerUp}
                onPointerCancel={onEventPointerCancel}
                onDragOver={onLaneDragOver}
                onDrop={(e) => onExternalDrop(row, e)}
              >
                {row.shade.map((band, bi) => (
                  <div
                    key={bi}
                    className={[
                      'cal-tl__shade',
                      band.kind === 'block' ? 'cal-tl__shade--block' : '',
                      band.kind === 'off' ? 'cal-tl__shade--off' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={shadeStyle(band)}
                    aria-hidden="true"
                  ></div>
                ))}

                {(() => {
                  const ghost = createGhostStyle(row);
                  return ghost !== null ? (
                    <div className="cal-tl__create-ghost" style={ghost} aria-hidden="true"></div>
                  ) : null;
                })()}

                {visibleEvents(row).map((ev) => (
                  <button
                    key={ev.event.id}
                    type="button"
                    className={[
                      'cal-tl__event',
                      ev.continuesBefore ? 'cal-tl__event--continues-before' : '',
                      ev.continuesAfter ? 'cal-tl__event--continues-after' : '',
                      isDragging(ev) ? 'cal-tl__event--dragging' : '',
                      ev.event.cssClass ?? '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={eventStyle(ev)}
                    aria-label={eventLabel(ev.event)}
                    title={tooltip(ev.event)}
                    onPointerDown={(e) => onEventPointerDown(ev, row, 'move', e)}
                    onPointerMove={onEventPointerMove}
                    onPointerUp={(e) => onEventPointerUp(ev, e)}
                    onPointerCancel={onEventPointerCancel}
                    onClick={(e) => onEventClick(ev.event, e)}
                    onKeyDown={(e) => onEventKeydown(ev, row, e)}
                  >
                    {renderEvent !== undefined ? (
                      renderEvent(ev.event)
                    ) : (
                      <span className="cal-tl__event-title">{ev.event.title}</span>
                    )}

                    {editable && ev.event.isReadonly !== true && (
                      <>
                        <span
                          className="cal-tl__resize cal-tl__resize--start"
                          aria-hidden="true"
                          onPointerDown={(e) => onEventPointerDown(ev, row, 'resize-start', e)}
                          onPointerMove={onEventPointerMove}
                          onPointerUp={(e) => onEventPointerUp(ev, e)}
                          onPointerCancel={onEventPointerCancel}
                        ></span>
                        <span
                          className="cal-tl__resize cal-tl__resize--end"
                          aria-hidden="true"
                          onPointerDown={(e) => onEventPointerDown(ev, row, 'resize-end', e)}
                          onPointerMove={onEventPointerMove}
                          onPointerUp={(e) => onEventPointerUp(ev, e)}
                          onPointerCancel={onEventPointerCancel}
                        ></span>
                      </>
                    )}
                  </button>
                ))}

                {viewModel.nowOffset !== null && (
                  <div className="cal-tl__now" style={nowStyle()} aria-hidden="true"></div>
                )}
              </div>
            </div>
          ))}
          {rowWindow.padBottom > 0 && (
            <div
              className="cal-tl__spacer"
              style={{ blockSize: `${rowWindow.padBottom}px` }}
              aria-hidden="true"
            ></div>
          )}
        </div>

        {/* Screen-reader announcements for keyboard move/resize (grab, step, lane, drop, cancel). */}
        <div className="cal-tl__sr" role="status" aria-live="polite">
          {announcement}
        </div>
      </div>
    </div>
  );
}
