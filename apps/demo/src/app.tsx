import { useMemo, useState } from 'react';
import {
  CalendarProvider,
  CalAgendaView,
  CalMonthView,
  CalTimeGridView,
  CalTimelineView,
  CalYearView,
  type CalendarEvent,
  type CalendarResource,
} from '@ascentsparksoftware/react-calendar';
import { DateFnsDateAdapter } from '@ascentsparksoftware/react-calendar/date-fns';
import { RruleRecurrenceAdapter } from '@ascentsparksoftware/react-calendar/recurrence';
import '@ascentsparksoftware/react-calendar/styles.css';

const adapter = new DateFnsDateAdapter();
const recurrence = new RruleRecurrenceAdapter();

type ViewName = 'month' | 'week' | 'day' | 'timeline' | 'agenda' | 'year';
const VIEWS: readonly ViewName[] = ['month', 'week', 'day', 'timeline', 'agenda', 'year'];

const STATUS_COLORS = {
  confirmed: '#22c55e',
  pending: '#eab308',
  cancelled: '#ef4444',
};

/** Sample data anchored around a fixed week so every view has something to show. */
const ANCHOR = new Date('2026-07-06T12:00:00Z');

const at = (day: number, hour: number, minute = 0): Date =>
  new Date(Date.UTC(2026, 6, day, hour, minute));

const EVENTS: readonly CalendarEvent[] = [
  {
    id: 'kickoff',
    title: 'Project kickoff',
    start: at(6, 13),
    end: at(6, 14, 30),
    status: 'confirmed',
    resourceIds: ['crew-a'],
  },
  {
    id: 'site-survey',
    title: 'Site survey — Riverside',
    start: at(7, 9),
    end: at(7, 12),
    status: 'pending',
    resourceIds: ['crew-b'],
  },
  {
    id: 'install',
    title: 'Install (multi-day)',
    start: at(8, 8),
    end: at(10, 17),
    status: 'confirmed',
    resourceIds: ['crew-a'],
  },
  {
    id: 'maintenance',
    title: 'Cancelled maintenance',
    start: at(9, 15),
    end: at(9, 16),
    status: 'cancelled',
    resourceIds: ['crew-c'],
  },
  {
    id: 'standup',
    title: 'Weekly standup',
    start: at(6, 9, 30),
    end: at(6, 10),
    recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=10',
    resourceIds: ['crew-a'],
  },
  {
    id: 'offsite',
    title: 'Team offsite',
    start: at(17, 0),
    allDay: true,
    status: 'pending',
  },
];

const RESOURCES: readonly CalendarResource[] = [
  { id: 'crew-a', name: 'Crew A' },
  { id: 'crew-b', name: 'Crew B' },
  { id: 'crew-c', name: 'Crew C' },
];

export function App() {
  const [view, setView] = useState<ViewName>('month');
  const [dark, setDark] = useState(false);
  const viewDate = useMemo(() => ANCHOR, []);

  const theme = {
    baseColor: dark ? '#14161b' : '#ffffff',
    accentColor: '#6366f1',
    themeMode: dark ? ('dark' as const) : ('light' as const),
    statusColors: STATUS_COLORS,
  };

  return (
    <CalendarProvider dateAdapter={adapter} recurrenceAdapter={recurrence} defaults={{ weekStartsOn: 1 }}>
      <div className="demo">
        <div className="demo__bar">
          <h1>@ascentsparksoftware/react-calendar</h1>
          {VIEWS.map((v) => (
            <button key={v} data-active={view === v} onClick={() => setView(v)}>
              {v}
            </button>
          ))}
          <button onClick={() => setDark((d) => !d)}>{dark ? 'light' : 'dark'} mode</button>
        </div>
        <div className="demo__view">
          {view === 'month' && (
            <CalMonthView events={EVENTS} viewDate={viewDate} today={new Date()} {...theme} />
          )}
          {(view === 'week' || view === 'day') && (
            <CalTimeGridView
              events={EVENTS}
              viewDate={viewDate}
              days={view === 'day' ? 1 : 7}
              anchorToWeek={view === 'day' ? false : null}
              now={new Date()}
              editable
              {...theme}
            />
          )}
          {view === 'timeline' && (
            <CalTimelineView
              events={EVENTS}
              resources={RESOURCES}
              viewDate={viewDate}
              editable
              {...theme}
            />
          )}
          {view === 'agenda' && <CalAgendaView events={EVENTS} viewDate={viewDate} {...theme} />}
          {view === 'year' && <CalYearView events={EVENTS} viewDate={viewDate} {...theme} />}
        </div>
      </div>
    </CalendarProvider>
  );
}
