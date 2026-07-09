import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { CalendarProvider } from '../../provider/calendar-provider';
import { DateFnsDateAdapter } from '../../date-fns/date-fns-adapter';
import { RruleRecurrenceAdapter } from '../../recurrence/rrule-adapter';
import type { CalendarEvent } from '../../core/model/calendar-event';
import type { ZonedDateTime } from '../../core/date-adapter/zoned-date-time';
import { CalAgendaView, type CalAgendaViewProps } from './agenda-view';

const zone = 'America/New_York';
const at = (iso: string): ZonedDateTime => ({ epochMs: Date.parse(iso), zone });

const adapter = new DateFnsDateAdapter();

function renderView(props: CalAgendaViewProps): HTMLElement {
  const { container } = render(
    <CalendarProvider dateAdapter={adapter}>
      <CalAgendaView {...props} />
    </CalendarProvider>,
  );
  return container;
}

describe('CalAgendaView', () => {
  it('renders a day heading and an event row with time + title', () => {
    const events: CalendarEvent[] = [
      {
        id: 'a',
        title: 'Standup',
        start: at('2026-06-15T13:00:00Z'),
        end: at('2026-06-15T13:30:00Z'),
      },
    ];
    const el = renderView({
      events,
      viewDate: at('2026-06-15T12:00:00Z'),
      days: 1,
      today: at('2026-06-15T12:00:00Z'),
      timezone: 'America/New_York',
    });
    expect(el.querySelector('.cal-agenda__date')?.textContent).toContain('June');
    const row = el.querySelector('.cal-agenda__row');
    expect(row?.textContent).toContain('Standup');
    expect(row?.textContent).toContain('9:00'); // 13:00Z = 9:00 AM EDT
  });

  it('shows "All day" for all-day events', () => {
    const el = renderView({
      events: [
        {
          id: 'a',
          title: 'PTO',
          allDay: true,
          start: at('2026-06-15T04:00:00Z'),
          end: at('2026-06-16T04:00:00Z'),
        },
      ],
      viewDate: at('2026-06-15T12:00:00Z'),
      days: 1,
    });
    expect(el.querySelector('.cal-agenda__time')?.textContent).toContain('All day');
  });

  it('emits eventClicked when a row is clicked', () => {
    let clicked: string | null = null;
    const el = renderView({
      events: [{ id: 'a', title: 'X', start: at('2026-06-15T13:00:00Z') }],
      viewDate: at('2026-06-15T12:00:00Z'),
      days: 1,
      eventClicked: (e) => (clicked = e.event.id),
    });
    const row = el.querySelector<HTMLButtonElement>('.cal-agenda__row');
    expect(row).not.toBeNull();
    if (row !== null) {
      fireEvent.click(row);
    }
    expect(clicked).toBe('a');
  });

  it('hides empty days when hideEmptyDays is set', () => {
    const el = renderView({
      events: [{ id: 'a', title: 'X', start: at('2026-06-16T13:00:00Z') }],
      viewDate: at('2026-06-15T12:00:00Z'),
      days: 5,
      hideEmptyDays: true,
    });
    expect(el.querySelectorAll('.cal-agenda__day').length).toBe(1);
  });
});

describe('CalAgendaView — recurrence', () => {
  it('expands a recurring event into the agenda window', () => {
    const { container } = render(
      <CalendarProvider dateAdapter={adapter} recurrenceAdapter={new RruleRecurrenceAdapter()}>
        <CalAgendaView
          events={[
            {
              id: 'weekly',
              title: 'Weekly sync',
              start: at('2026-06-15T13:00:00Z'),
              end: at('2026-06-15T13:30:00Z'),
              recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4',
            },
          ]}
          viewDate={at('2026-06-15T12:00:00Z')}
          days={30}
          timezone={zone}
        />
      </CalendarProvider>,
    );
    const rows = [...container.querySelectorAll('.cal-agenda__row')].filter((r) =>
      r.textContent?.includes('Weekly sync'),
    );
    // 4 Monday occurrences (Jun 15, 22, 29, Jul 6) fall inside the 30-day window
    expect(rows.length).toBe(4);
  });
});
