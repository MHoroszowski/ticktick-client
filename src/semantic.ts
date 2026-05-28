import type {
  ReminderDuration,
  ReminderTrigger,
  ReminderTriggerInput,
  TickTickTaskPriority,
  TickTickTaskStatus,
} from './types.js';

// ───────── Task Priority ─────────

const TASK_PRIORITY_MAP: Record<string, TickTickTaskPriority> = {
  none: 0,
  low: 1,
  medium: 3,
  high: 5,
};

const TASK_PRIORITY_LABELS: Record<TickTickTaskPriority, string> = {
  0: 'none',
  1: 'low',
  3: 'medium',
  5: 'high',
};

const VALID_TASK_PRIORITIES = new Set<number>([0, 1, 3, 5]);

export function parseTaskPriority(
  input: string | TickTickTaskPriority,
): TickTickTaskPriority | undefined {
  if (typeof input === 'string') return TASK_PRIORITY_MAP[input];
  return VALID_TASK_PRIORITIES.has(input) ? input : undefined;
}

export function formatTaskPriority(priority: TickTickTaskPriority): string {
  return TASK_PRIORITY_LABELS[priority];
}

// ───────── Task Status ─────────

const TASK_STATUS_MAP: Record<string, TickTickTaskStatus> = {
  open: 0,
  completed: 2,
  abandoned: -1,
  "won't do": -1,
};

const TASK_STATUS_LABELS: Record<TickTickTaskStatus, string> = {
  0: 'open',
  2: 'completed',
  [-1]: 'abandoned',
};

const VALID_TASK_STATUSES = new Set<number>([0, 2, -1]);

export function parseTaskStatus(
  input: string | TickTickTaskStatus,
): TickTickTaskStatus | undefined {
  if (typeof input === 'string') return TASK_STATUS_MAP[input];
  return VALID_TASK_STATUSES.has(input) ? input : undefined;
}

export function formatTaskStatus(status: TickTickTaskStatus): string {
  return TASK_STATUS_LABELS[status];
}

// ───────── Habit Status ─────────

const HABIT_STATUS_MAP: Record<string, 0 | 1> = {
  normal: 0,
  archived: 1,
};

const HABIT_STATUS_LABELS: Record<0 | 1, string> = {
  0: 'normal',
  1: 'archived',
};

const VALID_HABIT_STATUSES = new Set<number>([0, 1]);

export function parseHabitStatus(input: string | 0 | 1): 0 | 1 | undefined {
  if (typeof input === 'string') return HABIT_STATUS_MAP[input];
  return VALID_HABIT_STATUSES.has(input) ? input : undefined;
}

export function formatHabitStatus(status: 0 | 1): string {
  return HABIT_STATUS_LABELS[status];
}

// ───────── Habit Checkin Status ─────────

const CHECKIN_STATUS_MAP: Record<string, 0 | 1 | 2> = {
  unlabeled: 0,
  undone: 1,
  done: 2,
};

const CHECKIN_STATUS_LABELS: Record<0 | 1 | 2, string> = {
  0: 'unlabeled',
  1: 'undone',
  2: 'done',
};

const VALID_CHECKIN_STATUSES = new Set<number>([0, 1, 2]);

export function parseCheckinStatus(input: string | 0 | 1 | 2): 0 | 1 | 2 | undefined {
  if (typeof input === 'string') return CHECKIN_STATUS_MAP[input];
  return VALID_CHECKIN_STATUSES.has(input) ? input : undefined;
}

export function formatCheckinStatus(status: 0 | 1 | 2): string {
  return CHECKIN_STATUS_LABELS[status];
}

// ───────── Reminder TRIGGER (RFC 5545 §3.8.6.3) ─────────

const SHORTHAND_UNIT: Record<string, keyof ReminderDuration> = {
  w: 'weeks',
  d: 'days',
  h: 'hours',
  m: 'minutes',
  s: 'seconds',
};

function parseShorthand(input: string): ReminderDuration | undefined {
  const compact = input.replace(/\s+/g, '').toLowerCase();
  if (!/^(\d+[wdhms])+$/.test(compact)) return undefined;
  const out: Record<string, number> = {};
  for (const match of compact.matchAll(/(\d+)([wdhms])/g)) {
    const n = Number(match[1]);
    const key = SHORTHAND_UNIT[match[2]!]!;
    out[key] = (out[key] ?? 0) + n;
  }
  return Object.keys(out).length ? (out as ReminderDuration) : undefined;
}

function encodeDuration(d: ReminderDuration): string | undefined {
  const w = d.weeks ?? 0;
  let days = d.days ?? 0;
  const h = d.hours ?? 0;
  const m = d.minutes ?? 0;
  const s = d.seconds ?? 0;

  // RFC 5545 weeks-only special form (strict iCal won't mix W with other units).
  if (w > 0 && days === 0 && h === 0 && m === 0 && s === 0) {
    return `P${w}W`;
  }
  // Mixed: roll weeks into days so the encoded form stays inside the
  // strict-RFC subset TickTick accepts.
  days += w * 7;

  if (days === 0 && h === 0 && m === 0 && s === 0) return undefined;

  let body = 'P';
  if (days > 0) body += `${days}D`;
  if (h > 0 || m > 0 || s > 0) {
    body += 'T';
    if (h > 0) body += `${h}H`;
    if (m > 0) body += `${m}M`;
    if (s > 0) body += `${s}S`;
  }
  return body;
}

/**
 * Build an RFC 5545 TRIGGER string from a structured input.
 *
 * Three input shapes:
 *
 * - `{ at: 'due' }` → `"TRIGGER:PT0S"` (fires at the task's due time)
 * - `{ before: ReminderDuration | shorthand }` → negative trigger
 *   (e.g. `{ before: { minutes: 15 } }` or `{ before: '15m' }` → `"TRIGGER:-PT15M"`)
 * - `{ after: ReminderDuration | shorthand }` → positive trigger
 *   (e.g. `{ after: { minutes: 30 } }` → `"TRIGGER:PT30M"`)
 *
 * Shorthand grammar: space-separated `<n><unit>` tokens where unit is one
 * of `w`/`d`/`h`/`m`/`s`. Whitespace is optional (`'1d 9h'` and `'1d9h'`
 * both parse to `{ days: 1, hours: 9 }`).
 *
 * Returns `undefined` for an empty / invalid / zero duration on
 * `before`/`after` (a zero duration is not a meaningful before/after
 * offset — use `{ at: 'due' }` instead).
 *
 * Encoding note: weeks are emitted as `P{n}W` only when no other field is
 * set; mixed-form inputs (e.g. `{ weeks: 2, days: 1 }`) are normalized to
 * `P{days}D` because TickTick's server follows the strict RFC 5545
 * subset, which forbids mixing `W` with other components.
 */
export function formatReminderTrigger(input: ReminderTriggerInput): string | undefined {
  if ('at' in input) return input.at === 'due' ? 'TRIGGER:PT0S' : undefined;

  const isBefore = 'before' in input;
  const raw = isBefore ? input.before : 'after' in input ? input.after : undefined;
  if (raw === undefined) return undefined;

  const dur = typeof raw === 'string' ? parseShorthand(raw) : raw;
  if (!dur) return undefined;

  const body = encodeDuration(dur);
  if (!body) return undefined;

  return `TRIGGER:${isBefore ? '-' : ''}${body}`;
}

const TRIGGER_RE =
  /^TRIGGER:(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/**
 * Decode an RFC 5545 TRIGGER string into a structured {@link ReminderTrigger}.
 *
 * Returns `undefined` for malformed inputs (anything that doesn't match
 * the TRIGGER grammar, or `TRIGGER:P` / `TRIGGER:PT` with no duration
 * components).
 *
 * Zero-valued fields are dropped on parse — `"TRIGGER:-P0DT9H0M0S"`
 * decodes to `{ before: { hours: 9 } }`, not the noisier full-field form.
 * A trigger whose duration is entirely zero (e.g. `"TRIGGER:PT0S"` or
 * `"TRIGGER:P0D"`) decodes to `{ at: 'due' }` regardless of sign.
 */
export function parseReminderTrigger(input: string): ReminderTrigger | undefined {
  const m = TRIGGER_RE.exec(input);
  if (!m) return undefined;

  const [, sign, ws, ds, hs, mins, ss] = m;
  if (ws === undefined && ds === undefined && hs === undefined && mins === undefined && ss === undefined) {
    return undefined; // TRIGGER:P or TRIGGER:PT — no components, malformed
  }

  const w = Number(ws ?? 0);
  const d = Number(ds ?? 0);
  const h = Number(hs ?? 0);
  const min = Number(mins ?? 0);
  const s = Number(ss ?? 0);

  if (w === 0 && d === 0 && h === 0 && min === 0 && s === 0) {
    return { at: 'due' };
  }

  const dur: Record<string, number> = {};
  if (w > 0) dur.weeks = w;
  if (d > 0) dur.days = d;
  if (h > 0) dur.hours = h;
  if (min > 0) dur.minutes = min;
  if (s > 0) dur.seconds = s;

  return sign === '-'
    ? { before: dur as ReminderDuration }
    : { after: dur as ReminderDuration };
}
