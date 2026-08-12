import { z } from 'zod';
import { formatReminderTrigger } from '../semantic.js';

/**
 * Agent-facing reminder shape.
 *
 * The library's canonical reminder form is an RFC 5545 TRIGGER string
 * (`"TRIGGER:-PT15M"`), which is precise but hostile to compose from a
 * natural-language prompt. This schema accepts the friendly forms and
 * converts them with `formatReminderTrigger`, while keeping `trigger` as
 * an escape hatch for callers that already hold a wire-format string
 * (e.g. echoing back what `list_tasks` returned).
 *
 * Exactly one key must be set per entry — enforced at runtime by
 * {@link toTriggerString} rather than in the schema, because a zod union
 * renders as an `anyOf` in the tool's JSON Schema and several MCP clients
 * handle a flat object far more reliably than an `anyOf`.
 */
export const reminderInputSchema = z.object({
  at: z.literal('due').optional()
    .describe('Set to "due" to fire the reminder at the task\'s due time.'),
  before: z.string().optional()
    .describe('Fire this long before the due time. Shorthand: "15m", "2h", "1d 9h". Units: w/d/h/m/s.'),
  after: z.string().optional()
    .describe('Fire this long after the due time. Same shorthand as "before".'),
  trigger: z.string().optional()
    .describe('Raw RFC 5545 TRIGGER string (e.g. "TRIGGER:-PT15M"). Escape hatch — prefer at/before/after.'),
});

export type ReminderInput = z.infer<typeof reminderInputSchema>;

/**
 * Convert one agent-supplied reminder entry to an RFC 5545 TRIGGER string.
 *
 * Throws a caller-facing `Error` on an entry that sets zero or multiple
 * keys, or whose duration does not parse — the MCP layer surfaces the
 * message through `mapError`, so the agent gets a correctable explanation
 * rather than a silently dropped reminder.
 */
export function toTriggerString(input: ReminderInput, index: number): string {
  const set = (['at', 'before', 'after', 'trigger'] as const).filter(
    (key) => input[key] !== undefined,
  );

  if (set.length === 0) {
    throw new Error(
      `reminders[${index}]: set exactly one of "at", "before", "after", or "trigger". Got none.`,
    );
  }
  if (set.length > 1) {
    throw new Error(
      `reminders[${index}]: set exactly one of "at", "before", "after", or "trigger". Got ${set.length} (${set.join(', ')}).`,
    );
  }

  if (input.trigger !== undefined) return input.trigger;

  const trigger = input.at !== undefined
    ? formatReminderTrigger({ at: input.at })
    : input.before !== undefined
      ? formatReminderTrigger({ before: input.before })
      : formatReminderTrigger({ after: input.after as string });

  if (trigger === undefined) {
    const offending = input.at !== undefined
      ? `"at" value ${JSON.stringify(input.at)}`
      : input.before !== undefined
        ? `"before" value ${JSON.stringify(input.before)}`
        : `"after" value ${JSON.stringify(input.after)}`;
    throw new Error(
      `reminders[${index}]: could not parse ${offending}. ` +
        'Use shorthand like "15m", "2h", or "1d 9h" (units w/d/h/m/s); a zero duration is not a valid offset — use {"at":"due"} instead.',
    );
  }
  return trigger;
}

/**
 * Convert an agent-supplied reminders array. `null` passes through as the
 * library's "clear all reminders" sentinel.
 */
export function toTriggerStrings(
  reminders: readonly ReminderInput[] | null,
): readonly string[] | null {
  if (reminders === null) return null;
  return reminders.map(toTriggerString);
}
