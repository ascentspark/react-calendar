import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render as rtlRender } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { CalendarEvent, ZonedDateTime } from '../../index';
import { CalendarProvider } from '../../provider/calendar-provider';
import { DateFnsDateAdapter } from '../../date-fns/date-fns-adapter';
import { CalEventDialog } from './event-dialog';

const zone = 'America/New_York';
const at = (iso: string): ZonedDateTime => ({ epochMs: Date.parse(iso), zone });

const adapter = new DateFnsDateAdapter();

const sample: CalendarEvent = {
  id: 'e1',
  title: 'Boiler repair',
  start: at('2026-06-15T14:30:00Z'),
  end: at('2026-06-15T16:30:00Z'),
  status: 'scheduled',
  resourceIds: ['bob'],
};

function wrap(ui: ReactElement): ReactElement {
  return <CalendarProvider dateAdapter={adapter}>{ui}</CalendarProvider>;
}

afterEach(cleanup);

describe('CalEventDialog', () => {
  it('stays closed when event is null and opens with a default body', () => {
    const { container, rerender } = rtlRender(
      wrap(<CalEventDialog event={null} timezone={zone} />),
    );
    expect(container.querySelector('.cal-evd')).toBeNull();

    rerender(wrap(<CalEventDialog event={sample} timezone={zone} />));
    const dialog = container.querySelector('.cal-evd');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(container.querySelector('.cal-evd__title')?.textContent).toContain('Boiler repair');
    // 14:30 UTC → 10:30 EDT, 16:30 UTC → 12:30 EDT
    expect(container.textContent).toContain('10:30 AM');
    expect(container.textContent).toContain('12:30 PM');
    expect(container.textContent?.toLowerCase()).toContain('scheduled');
  });

  it('resolves resourceIds to names when resources are supplied', () => {
    const { container } = rtlRender(
      wrap(
        <CalEventDialog
          event={sample}
          timezone={zone}
          resources={[{ id: 'bob', name: 'Bob Reyes' }]}
        />,
      ),
    );
    expect(container.textContent).toContain('Bob Reyes');
  });

  it('emits closed on the × button and on Escape', () => {
    let closes = 0;
    const { container } = rtlRender(
      wrap(
        <CalEventDialog
          event={sample}
          timezone={zone}
          closed={() => {
            closes += 1;
          }}
        />,
      ),
    );

    fireEvent.click(container.querySelector('.cal-evd__close') as HTMLButtonElement);
    expect(closes).toBe(1);

    // Escape targets the focused dialog panel (keydown handler on the panel).
    const panel = container.querySelector('.cal-evd') as HTMLElement;
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(closes).toBe(2);
  });

  it('renders a custom renderEventDetail body instead of the default', () => {
    let closes = 0;
    const { container } = rtlRender(
      wrap(
        <CalEventDialog
          event={sample}
          timezone={zone}
          closed={() => {
            closes += 1;
          }}
          renderEventDetail={(event, close) => (
            <>
              <p className="custom">Custom: {event.title}</p>
              <button className="custom-close" onClick={close}>
                Done
              </button>
            </>
          )}
        />,
      ),
    );
    expect(container.querySelector('.custom')?.textContent).toContain('Custom: Boiler repair');
    // default body is not rendered when a custom body is provided
    expect(container.querySelector('.cal-evd__body')).toBeNull();

    fireEvent.click(container.querySelector('.custom-close') as HTMLButtonElement);
    expect(closes).toBe(1);
  });
});
