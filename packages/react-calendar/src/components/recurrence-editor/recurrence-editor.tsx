import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import type {
  RecurrenceAdapter,
  RecurrenceEnd,
  RecurrenceFreq,
  RecurrenceParts,
} from '../../core/recurrence/recurrence-adapter';
import { useCalendar } from '../../provider/calendar-context';

const FREQS: readonly RecurrenceFreq[] = ['daily', 'weekly', 'monthly', 'yearly'];
const WEEKDAYS: readonly { value: number; label: string }[] = [
  { value: 0, label: 'S' },
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
];

const DEFAULT_PARTS: RecurrenceParts = { freq: 'weekly', interval: 1, end: { type: 'never' } };

/** Props for {@link CalRecurrenceEditor}. Names/semantics mirror the Angular inputs/outputs. */
export interface CalRecurrenceEditorProps {
  /** Two-way bound RRULE string (e.g. `FREQ=WEEKLY;BYDAY=MO`). Empty = no recurrence. */
  readonly rule?: string;
  /** Fires with the serialized RRULE on every edit (the `[(rule)]` write half). */
  readonly ruleChange?: (rule: string) => void;
  readonly locale?: string;

  readonly className?: string;
}

/**
 * The active {@link RecurrenceAdapter}. Throws when none was supplied — the
 * editor cannot parse/serialize without an engine, and failing fast beats
 * rendering a dead form.
 */
function useRecurrenceAdapterOrThrow(): RecurrenceAdapter {
  const { recurrenceAdapter } = useCalendar();
  if (recurrenceAdapter === null) {
    throw new Error(
      '@ascentsparksoftware/react-calendar: no RecurrenceAdapter. ' +
        'Wrap <CalRecurrenceEditor> in <CalendarProvider recurrenceAdapter={new RruleRecurrenceAdapter()}> ' +
        "(adapter from '@ascentsparksoftware/react-calendar/recurrence').",
    );
  }
  return recurrenceAdapter;
}

/**
 * Standalone recurrence editor. Two-way binds an RRULE string via `rule` +
 * `ruleChange` and edits it through the provider's {@link RecurrenceAdapter}'s
 * `parse`/`serialize`. Theme-agnostic `--cal-*`, fully keyboard-operable.
 * Usable independently of the calendar grid.
 */
export function CalRecurrenceEditor(props: CalRecurrenceEditorProps): ReactNode {
  const recurrence = useRecurrenceAdapterOrThrow();
  const { rule: ruleProp = '', ruleChange, className } = props;

  // Two-way `rule`: internal state, resynced whenever the prop changes.
  const [rule, setRule] = useState(ruleProp);
  const [prevRuleProp, setPrevRuleProp] = useState(ruleProp);
  if (ruleProp !== prevRuleProp) {
    setPrevRuleProp(ruleProp);
    setRule(ruleProp);
  }

  /** Current parts parsed from the rule (defaults when the rule is empty/invalid). */
  const parts = useMemo<RecurrenceParts>(() => {
    const trimmed = rule.trim();
    if (trimmed === '') {
      return DEFAULT_PARTS;
    }
    try {
      return recurrence.parse(trimmed);
    } catch {
      return DEFAULT_PARTS;
    }
  }, [recurrence, rule]);

  const commit = (next: RecurrenceParts): void => {
    const serialized = recurrence.serialize(next);
    setRule(serialized);
    ruleChange?.(serialized);
  };

  const setFreq = (event: ChangeEvent<HTMLSelectElement>): void => {
    const freq = event.target.value as RecurrenceFreq;
    commit({ ...parts, freq });
  };

  const setIntervalValue = (event: ChangeEvent<HTMLInputElement>): void => {
    const n = Math.max(1, Number.parseInt(event.target.value, 10) || 1);
    commit({ ...parts, interval: n });
  };

  const toggleWeekday = (day: number): void => {
    const current = new Set(parts.byWeekday ?? []);
    if (current.has(day)) {
      current.delete(day);
    } else {
      current.add(day);
    }
    commit({ ...parts, byWeekday: [...current].sort((a, b) => a - b) });
  };

  const isWeekdaySelected = (day: number): boolean => (parts.byWeekday ?? []).includes(day);

  const setEndType = (type: RecurrenceEnd['type']): void => {
    let end: RecurrenceEnd;
    if (type === 'count') {
      end = { type: 'count', count: 10 };
    } else if (type === 'until') {
      const now = Date.now();
      end = { type: 'until', until: { epochMs: now + 30 * 86_400_000, zone: 'UTC' } };
    } else {
      end = { type: 'never' };
    }
    commit({ ...parts, end });
  };

  const setCount = (event: ChangeEvent<HTMLInputElement>): void => {
    const n = Math.max(1, Number.parseInt(event.target.value, 10) || 1);
    commit({ ...parts, end: { type: 'count', count: n } });
  };

  const endType: RecurrenceEnd['type'] = parts.end.type;
  const countValue: number = parts.end.type === 'count' ? parts.end.count : 10;
  const intervalValue: number = parts.interval;
  const currentFreq: RecurrenceFreq = parts.freq;

  return (
    <div className={`cal-recurrence-editor${className ? ` ${className}` : ''}`}>
      <div className="cal-rec">
        <div className="cal-rec__row">
          <label className="cal-rec__label" htmlFor="cal-rec-freq">
            Repeat
          </label>
          <select
            id="cal-rec-freq"
            className="cal-rec__select"
            value={currentFreq}
            onChange={setFreq}
          >
            {FREQS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        <div className="cal-rec__row">
          <label className="cal-rec__label" htmlFor="cal-rec-interval">
            Every
          </label>
          <input
            id="cal-rec-interval"
            className="cal-rec__num"
            type="number"
            min={1}
            value={intervalValue}
            onChange={setIntervalValue}
          />
          <span className="cal-rec__unit">{currentFreq} interval</span>
        </div>

        {currentFreq === 'weekly' && (
          <div className="cal-rec__row">
            <span className="cal-rec__label">On</span>
            <div className="cal-rec__days" role="group" aria-label="Days of week">
              {WEEKDAYS.map((wd) => (
                <button
                  key={wd.value}
                  type="button"
                  className={['cal-rec__day', isWeekdaySelected(wd.value) ? 'cal-rec__day--on' : '']
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={isWeekdaySelected(wd.value)}
                  aria-label={`Weekday ${wd.value}`}
                  onClick={() => toggleWeekday(wd.value)}
                >
                  {wd.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="cal-rec__row">
          <span className="cal-rec__label">Ends</span>
          <div className="cal-rec__ends" role="radiogroup" aria-label="Ends">
            <label className="cal-rec__radio">
              <input
                type="radio"
                name="cal-rec-end"
                checked={endType === 'never'}
                onChange={() => setEndType('never')}
              />
              Never
            </label>
            <label className="cal-rec__radio">
              <input
                type="radio"
                name="cal-rec-end"
                checked={endType === 'count'}
                onChange={() => setEndType('count')}
              />
              After
              <input
                className="cal-rec__num"
                type="number"
                min={1}
                value={countValue}
                disabled={endType !== 'count'}
                onChange={setCount}
              />
              times
            </label>
          </div>
        </div>

        <p className="cal-rec__preview" aria-live="polite">
          <code>{rule || '(no recurrence)'}</code>
        </p>
      </div>
    </div>
  );
}
