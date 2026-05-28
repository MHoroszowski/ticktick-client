import { describe, it, expect } from 'vitest';
import {
  parseTaskPriority,
  formatTaskPriority,
  parseTaskStatus,
  formatTaskStatus,
  parseHabitStatus,
  formatHabitStatus,
  parseCheckinStatus,
  formatCheckinStatus,
  parseReminderTrigger,
  formatReminderTrigger,
} from '../src/semantic.js';
import type { ReminderTriggerInput } from '../src/types.js';

describe('parseTaskPriority', () => {
  it('should parse string aliases', () => {
    expect(parseTaskPriority('none')).toBe(0);
    expect(parseTaskPriority('low')).toBe(1);
    expect(parseTaskPriority('medium')).toBe(3);
    expect(parseTaskPriority('high')).toBe(5);
  });

  it('should pass through valid numbers', () => {
    expect(parseTaskPriority(0)).toBe(0);
    expect(parseTaskPriority(1)).toBe(1);
    expect(parseTaskPriority(3)).toBe(3);
    expect(parseTaskPriority(5)).toBe(5);
  });

  it('should return undefined for unknown input', () => {
    expect(parseTaskPriority('critical')).toBeUndefined();
    expect(parseTaskPriority(2 as never)).toBeUndefined();
  });
});

describe('formatTaskPriority', () => {
  it('should format all valid values', () => {
    expect(formatTaskPriority(0)).toBe('none');
    expect(formatTaskPriority(1)).toBe('low');
    expect(formatTaskPriority(3)).toBe('medium');
    expect(formatTaskPriority(5)).toBe('high');
  });
});

describe('parseTaskStatus', () => {
  it('should parse string aliases', () => {
    expect(parseTaskStatus('open')).toBe(0);
    expect(parseTaskStatus('completed')).toBe(2);
    expect(parseTaskStatus("won't do")).toBe(-1);
    expect(parseTaskStatus('abandoned')).toBe(-1);
  });

  it('should pass through valid numbers', () => {
    expect(parseTaskStatus(0)).toBe(0);
    expect(parseTaskStatus(2)).toBe(2);
    expect(parseTaskStatus(-1)).toBe(-1);
  });

  it('should return undefined for unknown input', () => {
    expect(parseTaskStatus('pending')).toBeUndefined();
    expect(parseTaskStatus(99 as never)).toBeUndefined();
  });
});

describe('formatTaskStatus', () => {
  it('should format all valid values', () => {
    expect(formatTaskStatus(0)).toBe('open');
    expect(formatTaskStatus(2)).toBe('completed');
    expect(formatTaskStatus(-1)).toBe('abandoned');
  });
});

describe('parseHabitStatus', () => {
  it('should parse string aliases', () => {
    expect(parseHabitStatus('normal')).toBe(0);
    expect(parseHabitStatus('archived')).toBe(1);
  });

  it('should pass through valid numbers', () => {
    expect(parseHabitStatus(0)).toBe(0);
    expect(parseHabitStatus(1)).toBe(1);
  });

  it('should return undefined for unknown input', () => {
    expect(parseHabitStatus('deleted')).toBeUndefined();
    expect(parseHabitStatus(2 as never)).toBeUndefined();
  });
});

describe('formatHabitStatus', () => {
  it('should format all valid values', () => {
    expect(formatHabitStatus(0)).toBe('normal');
    expect(formatHabitStatus(1)).toBe('archived');
  });
});

describe('parseCheckinStatus', () => {
  it('should parse string aliases', () => {
    expect(parseCheckinStatus('unlabeled')).toBe(0);
    expect(parseCheckinStatus('undone')).toBe(1);
    expect(parseCheckinStatus('done')).toBe(2);
  });

  it('should pass through valid numbers', () => {
    expect(parseCheckinStatus(0)).toBe(0);
    expect(parseCheckinStatus(1)).toBe(1);
    expect(parseCheckinStatus(2)).toBe(2);
  });

  it('should return undefined for unknown input', () => {
    expect(parseCheckinStatus('skipped')).toBeUndefined();
    expect(parseCheckinStatus(3 as never)).toBeUndefined();
  });
});

describe('formatCheckinStatus', () => {
  it('should format all valid values', () => {
    expect(formatCheckinStatus(0)).toBe('unlabeled');
    expect(formatCheckinStatus(1)).toBe('undone');
    expect(formatCheckinStatus(2)).toBe('done');
  });
});

describe('formatReminderTrigger', () => {
  it('encodes at-due as TRIGGER:PT0S', () => {
    expect(formatReminderTrigger({ at: 'due' })).toBe('TRIGGER:PT0S');
  });

  it('encodes before with minutes', () => {
    expect(formatReminderTrigger({ before: { minutes: 15 } })).toBe('TRIGGER:-PT15M');
  });

  it('encodes before with hours', () => {
    expect(formatReminderTrigger({ before: { hours: 9 } })).toBe('TRIGGER:-PT9H');
  });

  it('encodes before with seconds', () => {
    expect(formatReminderTrigger({ before: { seconds: 45 } })).toBe('TRIGGER:-PT45S');
  });

  it('encodes before with combined days + hours', () => {
    expect(formatReminderTrigger({ before: { days: 1, hours: 9 } })).toBe('TRIGGER:-P1DT9H');
  });

  it('encodes before with combined hours + minutes', () => {
    expect(formatReminderTrigger({ before: { hours: 1, minutes: 30 } })).toBe(
      'TRIGGER:-PT1H30M',
    );
  });

  it('encodes weeks-only as P{n}W', () => {
    expect(formatReminderTrigger({ before: { weeks: 2 } })).toBe('TRIGGER:-P2W');
  });

  it('rolls weeks into days when mixed with other components', () => {
    // RFC 5545 strict subset forbids mixing W with other units; library normalizes.
    expect(formatReminderTrigger({ before: { weeks: 1, days: 2 } })).toBe('TRIGGER:-P9D');
  });

  it('encodes after as positive trigger', () => {
    expect(formatReminderTrigger({ after: { minutes: 30 } })).toBe('TRIGGER:PT30M');
  });

  it('encodes string shorthand "15m"', () => {
    expect(formatReminderTrigger({ before: '15m' })).toBe('TRIGGER:-PT15M');
  });

  it('encodes string shorthand "1d 9h"', () => {
    expect(formatReminderTrigger({ before: '1d 9h' })).toBe('TRIGGER:-P1DT9H');
  });

  it('accepts compact shorthand without spaces ("1d9h")', () => {
    expect(formatReminderTrigger({ before: '1d9h' })).toBe('TRIGGER:-P1DT9H');
  });

  it('accepts uppercase shorthand units', () => {
    expect(formatReminderTrigger({ after: '2H' })).toBe('TRIGGER:PT2H');
  });

  it('returns undefined for empty-duration before', () => {
    expect(formatReminderTrigger({ before: {} })).toBeUndefined();
  });

  it('returns undefined for all-zero duration', () => {
    expect(formatReminderTrigger({ before: { hours: 0, minutes: 0 } })).toBeUndefined();
  });

  it('returns undefined for malformed shorthand', () => {
    expect(formatReminderTrigger({ before: 'garbage' })).toBeUndefined();
    expect(formatReminderTrigger({ before: '15' })).toBeUndefined();
    expect(formatReminderTrigger({ before: '' })).toBeUndefined();
  });

  it('returns undefined for unknown at value', () => {
    expect(formatReminderTrigger({ at: 'never' as never })).toBeUndefined();
  });
});

describe('parseReminderTrigger', () => {
  it('decodes TRIGGER:PT0S as at-due', () => {
    expect(parseReminderTrigger('TRIGGER:PT0S')).toEqual({ at: 'due' });
  });

  it('decodes any all-zero duration as at-due', () => {
    expect(parseReminderTrigger('TRIGGER:P0D')).toEqual({ at: 'due' });
    expect(parseReminderTrigger('TRIGGER:-P0DT0H0M0S')).toEqual({ at: 'due' });
  });

  it('decodes TRIGGER:-PT15M as before 15 minutes', () => {
    expect(parseReminderTrigger('TRIGGER:-PT15M')).toEqual({ before: { minutes: 15 } });
  });

  it('decodes TRIGGER:-PT9H as before 9 hours', () => {
    expect(parseReminderTrigger('TRIGGER:-PT9H')).toEqual({ before: { hours: 9 } });
  });

  it('drops zero fields on parse (TRIGGER:-P0DT9H0M0S → { hours: 9 })', () => {
    expect(parseReminderTrigger('TRIGGER:-P0DT9H0M0S')).toEqual({ before: { hours: 9 } });
  });

  it('decodes combined days + hours', () => {
    expect(parseReminderTrigger('TRIGGER:-P1DT9H')).toEqual({
      before: { days: 1, hours: 9 },
    });
  });

  it('decodes combined hours + minutes', () => {
    expect(parseReminderTrigger('TRIGGER:-PT1H30M')).toEqual({
      before: { hours: 1, minutes: 30 },
    });
  });

  it('decodes weeks-only', () => {
    expect(parseReminderTrigger('TRIGGER:-P2W')).toEqual({ before: { weeks: 2 } });
  });

  it('decodes positive trigger as after', () => {
    expect(parseReminderTrigger('TRIGGER:PT30M')).toEqual({ after: { minutes: 30 } });
  });

  it('returns undefined for garbage input', () => {
    expect(parseReminderTrigger('garbage')).toBeUndefined();
    expect(parseReminderTrigger('')).toBeUndefined();
    expect(parseReminderTrigger('TRIGGER:')).toBeUndefined();
  });

  it('returns undefined for TRIGGER:P with no components', () => {
    expect(parseReminderTrigger('TRIGGER:P')).toBeUndefined();
    expect(parseReminderTrigger('TRIGGER:PT')).toBeUndefined();
    expect(parseReminderTrigger('TRIGGER:-P')).toBeUndefined();
  });
});

describe('parseReminderTrigger / formatReminderTrigger round-trip', () => {
  const cases: readonly ReminderTriggerInput[] = [
    { at: 'due' },
    { before: { minutes: 15 } },
    { before: { hours: 9 } },
    { before: { days: 1, hours: 9 } },
    { before: { hours: 1, minutes: 30 } },
    { before: { weeks: 2 } },
    { after: { minutes: 30 } },
    { after: { days: 3 } },
  ];

  it.each(cases)('round-trips %j cleanly', (input) => {
    const trigger = formatReminderTrigger(input);
    expect(trigger).toBeDefined();
    const parsed = parseReminderTrigger(trigger!);
    // For object-form inputs the parsed shape equals the input (zero
    // fields aren't in the input either). For shorthand inputs this
    // would test the normalized form — none in this set.
    expect(parsed).toEqual(input);
  });
});
