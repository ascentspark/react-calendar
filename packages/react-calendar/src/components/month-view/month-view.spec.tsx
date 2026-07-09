import { describe, it, expect } from 'vitest';
import { cleanup, fireEvent, render as rtlRender } from '@testing-library/react';
import { afterEach } from 'vitest';
import type { ReactElement } from 'react';
import type { CalendarEvent, ZonedDateTime } from '../../index';
import { CalendarProvider } from '../../provider/calendar-provider';
import { DateFnsDateAdapter } from '../../date-fns/date-fns-adapter';
import { RruleRecurrenceAdapter } from '../../recurrence/rrule-adapter';
import { CalMonthView } from './month-view';

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

describe('CalMonthView', () => {
  it('opens a "+N more" popover listing every event on the day', () => {
    // Five same-day events with maxLanes=3 → 2 hidden → "+2 more".
    const day = (n: number, title: string): CalendarEvent => ({
      id: `e${n}`,
      title,
      start: at(`2026-06-15T1${n}:00:00Z`),
      end: at(`2026-06-15T1${n}:30:00Z`),
    });
    const el = render(
      <CalMonthView
        events={[day(1, 'One'), day(2, 'Two'), day(3, 'Three'), day(4, 'Four'), day(5, 'Five')]}
        viewDate={at('2026-06-15T12:00:00Z')}
        weekStartsOn={0}
        maxLanes={3}
      />,
    );
    const more = el.querySelector<HTMLButtonElement>('.cal-day__more');
    expect(more).not.toBeNull();
    expect(more?.textContent).toContain('2'); // +2 more
    expect(el.querySelector('.cal-more')).toBeNull();

    fireEvent.click(more as HTMLButtonElement);

    const popover = el.querySelector('.cal-more');
    expect(popover).not.toBeNull();
    expect(popover?.getAttribute('role')).toBe('dialog');
    // All five events listed, start-sorted.
    const titles = [...el.querySelectorAll('.cal-more__title')].map((t) => t.textContent?.trim());
    expect(titles).toEqual(['One', 'Two', 'Three', 'Four', 'Five']);
  });

  it('renders 7 weekday headers and a full grid of gridcells', () => {
    const el = render(
      <CalMonthView events={[]} viewDate={at('2026-06-15T12:00:00Z')} weekStartsOn={0} />,
    );
    expect(el.querySelectorAll('[role="columnheader"]').length).toBe(7);
    const cells = el.querySelectorAll('[role="gridcell"]');
    expect(cells.length).toBe(35); // 5 weeks × 7
    expect(el.querySelector('[role="grid"]')).toBeTruthy();
  });

  it('labels each day cell with its full date and marks today', () => {
    const el = render(
      <CalMonthView
        events={[]}
        viewDate={at('2026-06-15T12:00:00Z')}
        today={at('2026-06-15T12:00:00Z')}
        weekStartsOn={0}
      />,
    );
    const today = el.querySelector('.cal-day--today');
    expect(today).toBeTruthy();
    expect(today?.getAttribute('aria-label')).toContain('June');
  });

  it('renders an event chip with its title', () => {
    const event: CalendarEvent = {
      id: 'e1',
      start: at('2026-06-15T13:00:00Z'),
      end: at('2026-06-15T14:00:00Z'),
      title: 'Standup',
    };
    const el = render(
      <CalMonthView events={[event]} viewDate={at('2026-06-15T12:00:00Z')} weekStartsOn={0} />,
    );
    const chip = el.querySelector('.cal-chip');
    expect(chip?.textContent).toContain('Standup');
    expect(chip?.getAttribute('aria-label')).toBe('Standup');
  });

  it('emits eventClicked when a chip is clicked', () => {
    const event: CalendarEvent = { id: 'e1', start: at('2026-06-15T13:00:00Z'), title: 'X' };
    let clicked: string | null = null;
    const el = render(
      <CalMonthView
        events={[event]}
        viewDate={at('2026-06-15T12:00:00Z')}
        weekStartsOn={0}
        eventClicked={(e) => (clicked = e.event.id)}
      />,
    );
    fireEvent.click(el.querySelector('.cal-chip') as HTMLButtonElement);
    expect(clicked).toBe('e1');
  });

  it('selects a day and emits daySelected on cell click', () => {
    let selected = 0;
    const el = render(
      <CalMonthView
        events={[]}
        viewDate={at('2026-06-15T12:00:00Z')}
        weekStartsOn={0}
        daySelected={() => (selected += 1)}
      />,
    );
    const cell = el.querySelector('[role="gridcell"]') as HTMLElement;
    fireEvent.click(cell);
    expect(selected).toBe(1);
    expect(el.querySelector('.cal-day--selected')).not.toBeNull();
  });

  it('emits viewPeriodChanged with the grid window', () => {
    let period: { start: ZonedDateTime } | null = null;
    render(
      <CalMonthView
        events={[]}
        viewDate={at('2026-06-15T12:00:00Z')}
        weekStartsOn={0}
        viewPeriodChanged={(p) => (period = p)}
      />,
    );
    expect(period).not.toBeNull();
  });

  it('shows a "+N more" control when maxLanes is exceeded', () => {
    const sameDay = (n: number): CalendarEvent => ({
      id: `e${n}`,
      start: at('2026-06-15T13:00:00Z'),
      end: at('2026-06-15T14:00:00Z'),
      title: `E${n}`,
    });
    const el = render(
      <CalMonthView
        events={[sameDay(1), sameDay(2), sameDay(3), sameDay(4)]}
        viewDate={at('2026-06-15T12:00:00Z')}
        weekStartsOn={0}
        maxLanes={2}
      />,
    );
    const more = el.querySelector('.cal-day__more');
    expect(more?.textContent).toContain('+2');
  });
});

describe('CalMonthView — keyboard navigation', () => {
  it('moves roving focus with arrow keys and selects with Enter', () => {
    let selected = 0;
    const el = render(
      <CalMonthView
        events={[]}
        viewDate={at('2026-06-15T12:00:00Z')}
        today={at('2026-06-15T12:00:00Z')}
        weekStartsOn={0}
        daySelected={() => (selected += 1)}
      />,
    );
    const grid = el.querySelector('[role="grid"]') as HTMLElement;
    const focusedBefore = el.querySelector('[role="gridcell"][tabindex="0"]') as HTMLElement;
    // ArrowRight → next day
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    const afterRight = el.querySelector('[role="gridcell"][tabindex="0"]') as HTMLElement;
    expect(afterRight.dataset['epoch']).not.toBe(focusedBefore.dataset['epoch']);
    // ArrowDown → +7 days (one week)
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    const afterDown = el.querySelector('[role="gridcell"][tabindex="0"]') as HTMLElement;
    expect(afterDown.dataset['epoch']).not.toBe(afterRight.dataset['epoch']);
    // Enter selects the focused day
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(selected).toBe(1);
  });

  it('exactly one gridcell is tabbable (roving tabindex)', () => {
    const el = render(
      <CalMonthView
        events={[]}
        viewDate={at('2026-06-15T12:00:00Z')}
        today={at('2026-06-15T12:00:00Z')}
        weekStartsOn={0}
      />,
    );
    const tabbable = el.querySelectorAll('[role="gridcell"][tabindex="0"]');
    expect(tabbable.length).toBe(1);
  });
});

describe('CalMonthView — recurrence', () => {
  it('expands a recurring event into multiple chips across the month', () => {
    const { container } = rtlRender(
      <CalendarProvider dateAdapter={adapter} recurrenceAdapter={new RruleRecurrenceAdapter()}>
        <CalMonthView
          events={[
            {
              id: 'weekly',
              title: 'Weekly sync',
              start: at('2026-06-15T13:00:00Z'),
              end: at('2026-06-15T13:30:00Z'),
              recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=3',
            },
          ]}
          viewDate={at('2026-06-15T12:00:00Z')}
          weekStartsOn={0}
          timezone="America/New_York"
        />
      </CalendarProvider>,
    );
    // 3 Monday occurrences (Jun 15, 22, 29) → 3 chips
    const chips = [...container.querySelectorAll('.cal-chip__title')].filter((c) =>
      c.textContent?.includes('Weekly sync'),
    );
    expect(chips.length).toBe(3);
  });
});
