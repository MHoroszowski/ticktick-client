import { describe, it, expect } from 'vitest';
import { buildPartialUpdateBody } from '../../src/internal/partial-update.js';

describe('buildPartialUpdateBody', () => {
  it('omits keys whose value is undefined', () => {
    const body = buildPartialUpdateBody({ id: 'a', x: 1, y: undefined });
    expect(body).toEqual({ id: 'a', x: 1 });
    expect(body).not.toHaveProperty('y');
  });

  it('preserves keys whose value is explicit null (TickTick clear semantics)', () => {
    const body = buildPartialUpdateBody({ id: 'a', dueDate: null, repeatFlag: null });
    expect(body).toEqual({ id: 'a', dueDate: null, repeatFlag: null });
  });

  it('preserves falsy non-nullish values (0, "", false)', () => {
    const body = buildPartialUpdateBody({ id: 'a', priority: 0, content: '', flag: false });
    expect(body).toEqual({ id: 'a', priority: 0, content: '', flag: false });
  });

  it('returns a fresh object (does not mutate input)', () => {
    const input = { id: 'a', x: undefined };
    const body = buildPartialUpdateBody(input);
    expect(body).not.toBe(input);
    expect(input).toHaveProperty('x'); // input unchanged
  });

  it('returns an empty object for an empty input', () => {
    expect(buildPartialUpdateBody({})).toEqual({});
  });
});
