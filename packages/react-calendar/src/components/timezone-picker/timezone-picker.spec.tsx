import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render as rtlRender } from '@testing-library/react';
import { CalTimezonePicker, type CalTimezonePickerProps } from './timezone-picker';

function render(props: CalTimezonePickerProps = {}): HTMLElement {
  const { container } = rtlRender(<CalTimezonePicker {...props} />);
  return container;
}

afterEach(cleanup);

describe('CalTimezonePicker', () => {
  it('renders the default zone list with offset labels', () => {
    const el = render();
    const opts = el.querySelectorAll('option');
    expect(opts.length).toBeGreaterThan(5);
    expect([...opts].some((o) => o.textContent?.includes('New York'))).toBe(true);
    expect([...opts].some((o) => /GMT/.test(o.textContent ?? ''))).toBe(true);
  });

  it('restricts to a supplied zone subset', () => {
    const el = render({ zones: ['UTC', 'Asia/Tokyo'] });
    expect(el.querySelectorAll('option').length).toBe(2);
  });

  it('two-way updates value on selection', () => {
    let value = 'UTC';
    const el = render({
      zones: ['UTC', 'Asia/Tokyo'],
      value,
      valueChange: (v) => (value = v),
    });
    const select = el.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Asia/Tokyo' } });
    expect(value).toBe('Asia/Tokyo');
    expect(select.value).toBe('Asia/Tokyo');
  });
});
