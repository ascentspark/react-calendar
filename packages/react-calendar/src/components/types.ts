import type { ReactNode } from 'react';
import type { CalendarEvent } from '../core/model/calendar-event';
import type { CalendarResource } from '../core/model/calendar-resource';
import type { PositionedChip } from '../core/view-model/positioned-chip';
import type { MonthDay } from '../core/view-model/month-view-model';

/**
 * Render-prop slots — the React equivalent of the Angular package's
 * `*calEventTemplate` / `*calCellTemplate` / `*calOverflowTemplate` /
 * `*calResourceHeaderTemplate` / `*calEventDetailTemplate` structural
 * directives. Pass a function; return any React node.
 */

/** Replaces the default event chip/card. `chip` is provided in month/all-day contexts. */
export type RenderEvent<TMeta = unknown> = (
  event: CalendarEvent<TMeta>,
  chip?: PositionedChip<TMeta>,
) => ReactNode;

/** Replaces a month/year day cell's default content. */
export type RenderCell<TMeta = unknown> = (day: MonthDay<TMeta>) => ReactNode;

/** Replaces the "+N more" overflow control. */
export type RenderOverflow<TMeta = unknown> = (count: number, day: MonthDay<TMeta>) => ReactNode;

/** Replaces a timeline resource-header cell. `ctx` carries the row's tree state. */
export type RenderResourceHeader = (
  resource: CalendarResource,
  ctx: {
    /** Nesting depth in the resource tree (0 = root). */
    readonly depth: number;
    /** Whether the resource has children (for an expand/collapse affordance). */
    readonly hasChildren: boolean;
    /** Whether the row is currently collapsed. */
    readonly collapsed: boolean;
  },
) => ReactNode;

/** Replaces the event dialog's detail body. `close` dismisses the dialog. */
export type RenderEventDetail<TMeta = unknown> = (
  event: CalendarEvent<TMeta>,
  close: () => void,
) => ReactNode;
