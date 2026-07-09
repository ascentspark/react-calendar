import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render as rtlRender } from '@testing-library/react';
import { CalendarProvider } from '../../provider/calendar-provider';
import { RruleRecurrenceAdapter } from '../../recurrence/rrule-adapter';
import { CalRecurrenceEditor } from './recurrence-editor';

const recurrence = new RruleRecurrenceAdapter();

function render(initialRule = '', onRule?: (rule: string) => void): HTMLElement {
  const { container } = rtlRender(
    <CalendarProvider recurrenceAdapter={recurrence}>
      <CalRecurrenceEditor rule={initialRule} ruleChange={onRule} />
    </CalendarProvider>,
  );
  return container;
}

afterEach(cleanup);

describe('CalRecurrenceEditor', () => {
  it('reflects an existing weekly rule (weekday chips, frequency)', () => {
    const el = render('FREQ=WEEKLY;BYDAY=MO,WE');
    expect(el.querySelector<HTMLSelectElement>('#cal-rec-freq')?.value).toBe('weekly');
    const on = [...el.querySelectorAll('.cal-rec__day--on')];
    expect(on.length).toBe(2); // Mon + Wed
  });

  it('toggling a weekday updates the rule string', () => {
    let rule = 'FREQ=WEEKLY';
    const el = render(rule, (r) => (rule = r));
    // Friday is index 5 in the weekday button list
    const fri = el.querySelectorAll<HTMLButtonElement>('.cal-rec__day')[5];
    expect(fri).toBeDefined();
    fireEvent.click(fri as HTMLButtonElement);
    expect(rule).toContain('FREQ=WEEKLY');
    expect(rule).toContain('BYDAY=FR');
  });

  it('changing the count end-type writes COUNT', () => {
    let rule = 'FREQ=DAILY';
    const el = render(rule, (r) => (rule = r));
    const countRadio = el.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1];
    expect(countRadio).toBeDefined();
    fireEvent.click(countRadio as HTMLInputElement);
    expect(rule).toContain('COUNT=');
  });

  it('shows a live RRULE preview', () => {
    const el = render('FREQ=MONTHLY;BYMONTHDAY=15');
    expect(el.querySelector('.cal-rec__preview')?.textContent).toContain('FREQ=MONTHLY');
  });
});
