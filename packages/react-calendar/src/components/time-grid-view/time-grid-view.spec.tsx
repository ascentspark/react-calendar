import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render as rtlRender } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { CalendarEvent, EventChange, ZonedDateTime } from '../../index';
import { CalendarProvider } from '../../provider/calendar-provider';
import { DateFnsDateAdapter } from '../../date-fns/date-fns-adapter';
import { CalTimeGridView } from './time-grid-view';

const zone = 'America/New_York';
const at = (iso: string): ZonedDateTime => ({ epochMs: Date.parse(iso), zone });

const adapter = new DateFnsDateAdapter();

function render(ui: ReactElement): HTMLElement {
  const { container } = rtlRender(
    <CalendarProvider dateAdapter={adapter}>{ui}</CalendarProvider>,
  );
  return container;
}

afterEach(cleanup);

/** Construct a PointerEvent (jsdom-safe), falling back to a MouseEvent with a pointerId. */
function makePointer(type: string, pointerId: number, clientY: number): Event {
  try {
    return new PointerEvent(type, { pointerId, clientY, bubbles: true });
  } catch {
    const e = new MouseEvent(type, { clientY, bubbles: true });
    Object.defineProperty(e, 'pointerId', { value: pointerId });
    return e;
  }
}

function makePointerXY(type: string, pointerId: number, clientX: number, clientY: number): Event {
  try {
    return new PointerEvent(type, { pointerId, clientX, clientY, bubbles: true });
  } catch {
    const e = new MouseEvent(type, { clientX, clientY, bubbles: true });
    Object.defineProperty(e, 'pointerId', { value: pointerId });
    return e;
  }
}

/** jsdom reports a 0px column size → give the column a real rect for the drag math. */
function mockColRect(col: HTMLElement): void {
  col.getBoundingClientRect = () =>
    ({
      height: 1440,
      top: 0,
      left: 0,
      right: 100,
      bottom: 1440,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('CalTimeGridView', () => {
  it('renders 7 day-column headers for a week', () => {
    const el = render(
      <CalTimeGridView
        events={[]}
        viewDate={at('2026-06-15T12:00:00Z')}
        days={7}
        anchorToWeek={true}
      />,
    );
    expect(el.querySelectorAll('[role="columnheader"]').length).toBe(7);
    expect(el.querySelectorAll('.cal-tg__col').length).toBe(7);
  });

  it('renders a timed event positioned in the grid', () => {
    const ev: CalendarEvent = {
      id: 'a',
      title: 'Standup',
      start: at('2026-06-15T13:00:00Z'),
      end: at('2026-06-15T14:00:00Z'),
      status: 'scheduled',
    };
    const el = render(
      <CalTimeGridView
        events={[ev]}
        viewDate={at('2026-06-15T12:00:00Z')}
        days={1}
        anchorToWeek={false}
        statusColors={{ scheduled: '#3b82f6' }}
      />,
    );
    const eventEl = el.querySelector<HTMLElement>('.cal-tg__event');
    expect(eventEl?.textContent).toContain('Standup');
    expect(eventEl?.style.getPropertyValue('--ev-start')).toContain('%');
  });

  it('routes an all-day event to the band', () => {
    const el = render(
      <CalTimeGridView
        events={[
          {
            id: 'a',
            allDay: true,
            title: 'PTO',
            start: at('2026-06-15T04:00:00Z'),
            end: at('2026-06-16T04:00:00Z'),
          },
        ]}
        viewDate={at('2026-06-15T12:00:00Z')}
        days={7}
        anchorToWeek={true}
      />,
    );
    expect(el.querySelector('.cal-tg__chip')?.textContent).toContain('PTO');
    expect(el.querySelector('.cal-tg__event')).toBeNull();
  });

  it('shows the now-indicator when "now" is in the window', () => {
    const el = render(
      <CalTimeGridView
        events={[]}
        viewDate={at('2026-06-15T12:00:00Z')}
        days={1}
        anchorToWeek={false}
        now={at('2026-06-15T16:00:00Z')}
      />,
    );
    expect(el.querySelector('.cal-tg__now')).toBeTruthy();
  });

  it('emits eventClicked on a tap (pointer down+up with no movement)', () => {
    const ev: CalendarEvent = {
      id: 'a',
      title: 'X',
      start: at('2026-06-15T13:00:00Z'),
      end: at('2026-06-15T14:00:00Z'),
    };
    const clicked: string[] = [];
    const el = render(
      <CalTimeGridView
        events={[ev]}
        viewDate={at('2026-06-15T12:00:00Z')}
        days={1}
        anchorToWeek={false}
        eventClicked={(e) => clicked.push(e.event.id)}
      />,
    );
    const eventEl = el.querySelector<HTMLButtonElement>('.cal-tg__event');
    expect(eventEl).not.toBeNull();
    fireEvent(eventEl as HTMLButtonElement, makePointer('pointerdown', 1, 100));
    fireEvent(eventEl as HTMLButtonElement, makePointer('pointerup', 1, 100));
    expect(clicked).toEqual(['a']);
  });

  it('emits eventChanged with kind "move" when an event is dragged', () => {
    const ev: CalendarEvent = {
      id: 'a',
      title: 'X',
      start: at('2026-06-15T13:00:00Z'),
      end: at('2026-06-15T14:00:00Z'),
    };
    const changes: EventChange[] = [];
    const el = render(
      <CalTimeGridView
        events={[ev]}
        viewDate={at('2026-06-15T12:00:00Z')}
        days={1}
        anchorToWeek={false}
        dayStartMinutes={0}
        dayEndMinutes={1440}
        eventChanged={(c) => changes.push(c)}
      />,
    );
    const eventEl = el.querySelector<HTMLButtonElement>('.cal-tg__event') as HTMLButtonElement;
    mockColRect(eventEl.closest<HTMLElement>('.cal-tg__col') as HTMLElement);
    fireEvent(eventEl, makePointer('pointerdown', 1, 100));
    fireEvent(eventEl, makePointer('pointermove', 1, 160)); // +60px → +60min at 1px/min
    fireEvent(eventEl, makePointer('pointerup', 1, 160));
    expect(changes.length).toBe(1);
    expect(changes[0]?.kind).toBe('move');
  });
});

describe('CalTimeGridView — drag-create', () => {
  it('emits eventChanged kind "create" after dragging empty grid space', () => {
    const changes: EventChange[] = [];
    const el = render(
      <CalTimeGridView
        events={[]}
        viewDate={at('2026-06-15T12:00:00Z')}
        days={1}
        anchorToWeek={false}
        dayStartMinutes={0}
        dayEndMinutes={1440}
        eventChanged={(c) => changes.push(c)}
      />,
    );
    const col = el.querySelector<HTMLElement>('.cal-tg__col') as HTMLElement;
    mockColRect(col);
    fireEvent(col, makePointerXY('pointerdown', 1, 0, 540)); // 09:00
    fireEvent(col, makePointerXY('pointermove', 1, 0, 660)); // 11:00
    fireEvent(col, makePointerXY('pointerup', 1, 0, 660));
    expect(changes.length).toBe(1);
    expect(changes[0]?.kind).toBe('create');
    expect(changes[0]?.start).toBeDefined();
    expect(changes[0]?.end).toBeDefined();
  });
});

describe('CalTimeGridView — resize & veto', () => {
  it('emits kind "resize" when dragging the bottom handle', () => {
    const ev: CalendarEvent = {
      id: 'a',
      title: 'X',
      start: at('2026-06-15T13:00:00Z'),
      end: at('2026-06-15T14:00:00Z'),
    };
    const changes: EventChange[] = [];
    const el = render(
      <CalTimeGridView
        events={[ev]}
        viewDate={at('2026-06-15T12:00:00Z')}
        days={1}
        anchorToWeek={false}
        dayStartMinutes={0}
        dayEndMinutes={1440}
        eventChanged={(c) => changes.push(c)}
      />,
    );
    const handle = el.querySelector<HTMLElement>('.cal-tg__resize--end') as HTMLElement;
    mockColRect(handle.closest<HTMLElement>('.cal-tg__col') as HTMLElement);
    fireEvent(handle, makePointer('pointerdown', 1, 100));
    fireEvent(handle, makePointer('pointermove', 1, 160));
    fireEvent(handle, makePointer('pointerup', 1, 160));
    expect(changes.length).toBe(1);
    expect(changes[0]?.kind).toBe('resize');
  });

  it('does not emit when validateChange vetoes the move', () => {
    const ev: CalendarEvent = {
      id: 'a',
      title: 'X',
      start: at('2026-06-15T13:00:00Z'),
      end: at('2026-06-15T14:00:00Z'),
    };
    let emitted = false;
    const el = render(
      <CalTimeGridView
        events={[ev]}
        viewDate={at('2026-06-15T12:00:00Z')}
        days={1}
        anchorToWeek={false}
        dayStartMinutes={0}
        dayEndMinutes={1440}
        validateChange={() => false}
        eventChanged={() => (emitted = true)}
      />,
    );
    const eventEl = el.querySelector<HTMLButtonElement>('.cal-tg__event') as HTMLButtonElement;
    mockColRect(eventEl.closest<HTMLElement>('.cal-tg__col') as HTMLElement);
    fireEvent(eventEl, makePointer('pointerdown', 1, 100));
    fireEvent(eventEl, makePointer('pointermove', 1, 160));
    fireEvent(eventEl, makePointer('pointerup', 1, 160));
    expect(emitted).toBe(false);
  });

  it('emits slotSelected on a plain tap of an empty column', () => {
    let slot = 0;
    const el = render(
      <CalTimeGridView
        events={[]}
        viewDate={at('2026-06-15T12:00:00Z')}
        days={1}
        anchorToWeek={false}
        dayStartMinutes={0}
        dayEndMinutes={1440}
        slotSelected={() => (slot += 1)}
      />,
    );
    const col = el.querySelector<HTMLElement>('.cal-tg__col') as HTMLElement;
    mockColRect(col);
    fireEvent(col, makePointerXY('pointerdown', 1, 0, 540));
    fireEvent(col, makePointerXY('pointerup', 1, 0, 540));
    expect(slot).toBe(1);
  });
});

describe('CalTimeGridView — inline edit', () => {
  it('double-click reveals an input that commits a new title via eventChanged', () => {
    const ev: CalendarEvent = {
      id: 'a',
      title: 'Old',
      start: at('2026-06-15T13:00:00Z'),
      end: at('2026-06-15T14:00:00Z'),
    };
    const changes: EventChange[] = [];
    const el = render(
      <CalTimeGridView
        events={[ev]}
        viewDate={at('2026-06-15T12:00:00Z')}
        days={1}
        anchorToWeek={false}
        eventChanged={(c) => changes.push(c)}
      />,
    );
    const eventEl = el.querySelector<HTMLButtonElement>('.cal-tg__event') as HTMLButtonElement;
    fireEvent.doubleClick(eventEl);
    const input = el.querySelector<HTMLInputElement>('.cal-tg__inline');
    expect(input).toBeTruthy();
    (input as HTMLInputElement).value = 'New title';
    fireEvent.keyDown(input as HTMLInputElement, { key: 'Enter' });
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0]?.kind).toBe('inline-edit');
    expect(changes[0]?.title).toBe('New title');
  });

  it('F2 opens the inline editor from the keyboard', () => {
    const ev: CalendarEvent = {
      id: 'a',
      title: 'Old',
      start: at('2026-06-15T13:00:00Z'),
      end: at('2026-06-15T14:00:00Z'),
    };
    const el = render(
      <CalTimeGridView
        events={[ev]}
        viewDate={at('2026-06-15T12:00:00Z')}
        days={1}
        anchorToWeek={false}
      />,
    );
    const eventEl = el.querySelector<HTMLButtonElement>('.cal-tg__event') as HTMLButtonElement;
    expect(el.querySelector('.cal-tg__inline')).toBeNull();
    fireEvent.keyDown(eventEl, { key: 'F2' });
    expect(el.querySelector('.cal-tg__inline')).toBeTruthy();
  });

  it('Escape cancels the inline edit without emitting', () => {
    const ev: CalendarEvent = {
      id: 'a',
      title: 'Old',
      start: at('2026-06-15T13:00:00Z'),
      end: at('2026-06-15T14:00:00Z'),
    };
    let emitted = false;
    const el = render(
      <CalTimeGridView
        events={[ev]}
        viewDate={at('2026-06-15T12:00:00Z')}
        days={1}
        anchorToWeek={false}
        eventChanged={() => (emitted = true)}
      />,
    );
    fireEvent.doubleClick(el.querySelector<HTMLButtonElement>('.cal-tg__event') as HTMLButtonElement);
    const input = el.querySelector<HTMLInputElement>('.cal-tg__inline') as HTMLInputElement;
    input.value = 'changed';
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(emitted).toBe(false);
    expect(el.querySelector('.cal-tg__inline')).toBeNull();
  });
});

describe('CalTimeGridView — keyboard move', () => {
  it('Enter grabs, ArrowDown moves, Enter commits a move', () => {
    const ev: CalendarEvent = {
      id: 'a',
      title: 'X',
      start: at('2026-06-15T13:00:00Z'),
      end: at('2026-06-15T14:00:00Z'),
    };
    const changes: EventChange[] = [];
    const el = render(
      <CalTimeGridView
        events={[ev]}
        viewDate={at('2026-06-15T12:00:00Z')}
        days={1}
        anchorToWeek={false}
        snapMinutes={30}
        eventChanged={(c) => changes.push(c)}
      />,
    );
    const eventEl = el.querySelector<HTMLButtonElement>('.cal-tg__event') as HTMLButtonElement;
    fireEvent.keyDown(eventEl, { key: 'Enter' });
    fireEvent.keyDown(eventEl, { key: 'ArrowDown' });
    fireEvent.keyDown(eventEl, { key: 'Enter' });
    expect(changes.length).toBe(1);
    expect(changes[0]?.kind).toBe('move');
  });

  it('Escape cancels a keyboard grab without emitting', () => {
    const ev: CalendarEvent = {
      id: 'a',
      title: 'X',
      start: at('2026-06-15T13:00:00Z'),
      end: at('2026-06-15T14:00:00Z'),
    };
    let emitted = false;
    const el = render(
      <CalTimeGridView
        events={[ev]}
        viewDate={at('2026-06-15T12:00:00Z')}
        days={1}
        anchorToWeek={false}
        eventChanged={() => (emitted = true)}
      />,
    );
    const eventEl = el.querySelector<HTMLButtonElement>('.cal-tg__event') as HTMLButtonElement;
    fireEvent.keyDown(eventEl, { key: 'Enter' });
    fireEvent.keyDown(eventEl, { key: 'ArrowDown' });
    fireEvent.keyDown(eventEl, { key: 'Escape' });
    expect(emitted).toBe(false);
  });

  it('announces keyboard grab / move / cancel to the live region', () => {
    const ev: CalendarEvent = {
      id: 'a',
      title: 'Standup',
      start: at('2026-06-15T13:00:00Z'),
      end: at('2026-06-15T14:00:00Z'),
    };
    const el = render(
      <CalTimeGridView
        events={[ev]}
        viewDate={at('2026-06-15T12:00:00Z')}
        days={1}
        anchorToWeek={false}
      />,
    );
    const eventEl = el.querySelector<HTMLButtonElement>('.cal-tg__event') as HTMLButtonElement;
    const live = (): string => el.querySelector('.cal-tg__sr')?.textContent?.toLowerCase() ?? '';

    fireEvent.keyDown(eventEl, { key: 'Enter' });
    expect(live()).toContain('grabbed');

    fireEvent.keyDown(eventEl, { key: 'ArrowDown' });
    expect(live()).toContain('moved to');

    fireEvent.keyDown(eventEl, { key: 'Escape' });
    expect(live()).toContain('cancelled');
  });
});
