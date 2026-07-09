import { describe, it, expect } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { DateFnsDateAdapter } from '../../date-fns/date-fns-adapter';
import { RruleRecurrenceAdapter } from '../../recurrence/rrule-adapter';
import { CalendarProvider } from '../../provider/calendar-provider';
import type { CalendarEvent } from '../../core/model/calendar-event';
import type { ZonedDateTime } from '../../core/date-adapter/zoned-date-time';
import { CalYearView, type CalYearViewProps } from './year-view';

const zone = 'America/New_York';
const at = (iso: string): ZonedDateTime => ({ epochMs: Date.parse(iso), zone });

const dateAdapter = new DateFnsDateAdapter();

function renderView(props: CalYearViewProps): { el: HTMLElement } {
  const { container } = render(
    <CalendarProvider dateAdapter={dateAdapter}>
      <CalYearView {...props} />
    </CalendarProvider>,
  );
  return { el: container };
}

describe('CalYearView', () => {
  it('renders 12 mini-month grids', () => {
    const { el } = renderView({
      events: [],
      viewDate: at('2026-06-15T12:00:00Z'),
      weekStartsOn: 0,
    });
    expect(el.querySelectorAll('[role="grid"]').length).toBe(12);
  });

  it('marks today and shows event density', () => {
    const events: CalendarEvent[] = [
      { id: 'a', start: at('2026-06-15T13:00:00Z') },
      { id: 'b', start: at('2026-06-15T18:00:00Z') },
    ];
    const { el } = renderView({
      events,
      viewDate: at('2026-06-15T12:00:00Z'),
      today: at('2026-06-15T12:00:00Z'),
      weekStartsOn: 0,
    });
    expect(el.querySelector('.cal-mini__day--today')).toBeTruthy();
    const dense = el.querySelector('[data-density="2"]');
    expect(dense?.getAttribute('aria-label')).toContain('2 events');
  });

  it('emits daySelected on a day click and monthSelected on the month title', () => {
    let day = 0;
    let month = 0;
    const { el } = renderView({
      events: [],
      viewDate: at('2026-06-15T12:00:00Z'),
      weekStartsOn: 0,
      daySelected: () => (day += 1),
      monthSelected: () => (month += 1),
    });
    const dayButton = el.querySelector<HTMLButtonElement>('button.cal-mini__day');
    const titleButton = el.querySelector<HTMLButtonElement>('.cal-mini__title');
    expect(dayButton).toBeTruthy();
    expect(titleButton).toBeTruthy();
    if (dayButton !== null) {
      fireEvent.click(dayButton);
    }
    if (titleButton !== null) {
      fireEvent.click(titleButton);
    }
    expect(day).toBe(1);
    expect(month).toBe(1);
  });

  it('exposes exactly one tabbable day (roving tabindex)', () => {
    const { el } = renderView({
      events: [],
      viewDate: at('2026-06-15T12:00:00Z'),
      today: at('2026-06-15T12:00:00Z'),
      weekStartsOn: 0,
    });
    expect(el.querySelectorAll('.cal-mini__day[tabindex="0"]').length).toBe(1);
  });

  it('moves roving focus across days with arrow keys', () => {
    const { el } = renderView({
      events: [],
      viewDate: at('2026-06-15T12:00:00Z'),
      today: at('2026-06-15T12:00:00Z'),
      weekStartsOn: 0,
    });
    const before = el
      .querySelector('.cal-mini__day[tabindex="0"]')
      ?.getAttribute('data-epoch');
    expect(before).toBeTruthy();
    const grid = el.querySelector('.cal-year');
    expect(grid).toBeTruthy();
    if (grid !== null) {
      fireEvent.keyDown(grid, { key: 'ArrowRight' });
    }
    const after = el
      .querySelector('.cal-mini__day[tabindex="0"]')
      ?.getAttribute('data-epoch');
    expect(after).not.toBe(before);
  });
});

describe('CalYearView — recurrence', () => {
  it('expands a recurring event across the year (multiple days marked)', () => {
    const { container: el } = render(
      <CalendarProvider dateAdapter={dateAdapter} recurrenceAdapter={new RruleRecurrenceAdapter()}>
        <CalYearView
          events={[
            {
              id: 'weekly',
              title: 'Weekly sync',
              start: at('2026-06-15T13:00:00Z'),
              recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=6',
            },
          ]}
          viewDate={at('2026-06-15T12:00:00Z')}
          timezone={zone}
        />
      </CalendarProvider>,
    );
    // 6 weekly occurrences → 6 distinct days carry an event density marker (> 0).
    const withEvents = [...el.querySelectorAll('.cal-mini__day[data-density]')].filter(
      (d) => (d.getAttribute('data-density') ?? '0') !== '0',
    );
    expect(withEvents.length).toBe(6);
  });
});
