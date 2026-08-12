import { describe, it, expect } from 'vitest';
import {
  reminderInputSchema,
  toTriggerString,
  toTriggerStrings,
} from '../../src/mcp/reminder-input.js';

describe('toTriggerString', () => {
  it('converts {at: "due"} to the zero trigger', () => {
    expect(toTriggerString({ at: 'due' }, 0)).toBe('TRIGGER:PT0S');
  });

  it('converts shorthand "before" to a negative trigger', () => {
    expect(toTriggerString({ before: '15m' }, 0)).toBe('TRIGGER:-PT15M');
  });

  it('converts shorthand "after" to a positive trigger', () => {
    expect(toTriggerString({ after: '30m' }, 0)).toBe('TRIGGER:PT30M');
  });

  it('accepts multi-unit shorthand', () => {
    expect(toTriggerString({ before: '1d 9h' }, 0)).toBe('TRIGGER:-P1DT9H');
  });

  it('passes a raw TRIGGER string through untouched', () => {
    expect(toTriggerString({ trigger: 'TRIGGER:-PT45M' }, 0)).toBe('TRIGGER:-PT45M');
  });

  it('rejects an entry with no key set, naming the index', () => {
    expect(() => toTriggerString({}, 2)).toThrow(/reminders\[2\].*Got none/s);
  });

  it('rejects an entry with more than one key set', () => {
    expect(() => toTriggerString({ at: 'due', before: '15m' }, 1)).toThrow(
      /reminders\[1\].*Got 2/s,
    );
  });

  it('rejects an unparseable duration with a correctable message', () => {
    expect(() => toTriggerString({ before: 'soonish' }, 0)).toThrow(/could not parse "before"/);
  });

  it('rejects a zero duration and points at {at:"due"}', () => {
    expect(() => toTriggerString({ before: '0m' }, 0)).toThrow(/"at":"due"/);
  });
});

describe('toTriggerStrings', () => {
  it('passes null through as the clear-all sentinel', () => {
    expect(toTriggerStrings(null)).toBeNull();
  });

  it('maps an empty array to an empty array', () => {
    expect(toTriggerStrings([])).toEqual([]);
  });

  it('converts every entry in order', () => {
    expect(toTriggerStrings([{ at: 'due' }, { before: '15m' }])).toEqual([
      'TRIGGER:PT0S',
      'TRIGGER:-PT15M',
    ]);
  });

  it('reports the failing index when one entry is bad', () => {
    expect(() => toTriggerStrings([{ at: 'due' }, {}])).toThrow(/reminders\[1\]/);
  });
});

describe('reminderInputSchema', () => {
  it('accepts each supported shape', () => {
    for (const input of [{ at: 'due' }, { before: '15m' }, { after: '1h' }, { trigger: 'TRIGGER:PT0S' }]) {
      expect(reminderInputSchema.safeParse(input).success).toBe(true);
    }
  });

  it('rejects a non-"due" value for at', () => {
    expect(reminderInputSchema.safeParse({ at: 'start' }).success).toBe(false);
  });

  it('parses an empty object — the exactly-one rule is enforced at conversion, not by the schema', () => {
    expect(reminderInputSchema.safeParse({}).success).toBe(true);
    expect(() => toTriggerString({}, 0)).toThrow();
  });
});
