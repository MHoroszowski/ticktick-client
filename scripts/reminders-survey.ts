/**
 * Survey the live test-account task list for ANY task that already has
 * reminders/remindTime/notification populated. The shape returned by the
 * server IS the shape we need to send back.
 */

import { TickTickClient } from '../src/client.js';
import { FileSessionStore } from '../src/session-store.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_PATH = resolve(__dirname, '../.ticktick-session.json');
const TEST = 'doma.spirita@gmail.com';

const client = new TickTickClient({ sessionStore: new FileSessionStore(SESSION_PATH) });

async function main() {
  if (!(await client.isAuthenticated())) {
    console.error('❌ session expired'); process.exit(1);
  }
  const s = client.getSession();
  if (s?.username !== TEST) {
    console.error(`❌ not test account (${s?.username})`); process.exit(1);
  }

  const tasks = await client.tasks.list();
  console.log(`Surveyed ${tasks.length} tasks\n`);

  const withReminders: unknown[] = [];
  const withRemindTime: unknown[] = [];
  const withOther: unknown[] = [];

  for (const t of tasks as unknown as Record<string, unknown>[]) {
    const reminders = t.reminders as unknown[] | undefined;
    if (reminders && Array.isArray(reminders) && reminders.length > 0) {
      withReminders.push(t);
    }
    if (t.remindTime || t.reminderTime) {
      withRemindTime.push(t);
    }
    const reminder = t.reminder;
    if (reminder && typeof reminder === 'string' && reminder.length > 0) {
      withOther.push(t);
    }
  }

  console.log(`Tasks with non-empty .reminders array: ${withReminders.length}`);
  console.log(`Tasks with .remindTime/.reminderTime: ${withRemindTime.length}`);
  console.log(`Tasks with non-empty .reminder string: ${withOther.length}\n`);

  if (withReminders.length > 0) {
    console.log('── Sample tasks with reminders ──');
    for (const t of withReminders.slice(0, 3)) {
      console.log(JSON.stringify(t, null, 2));
      console.log('───');
    }
  }
  if (withRemindTime.length > 0) {
    console.log('── Sample tasks with remindTime ──');
    for (const t of withRemindTime.slice(0, 3)) {
      console.log(JSON.stringify(t, null, 2));
      console.log('───');
    }
  }
  if (withOther.length > 0) {
    console.log('── Sample tasks with .reminder string ──');
    for (const t of withOther.slice(0, 3)) {
      console.log(JSON.stringify(t, null, 2));
      console.log('───');
    }
  }

  // Inspect all unique top-level keys observed across tasks (sniff for unknown fields).
  const allKeys = new Set<string>();
  for (const t of tasks as unknown as Record<string, unknown>[]) {
    for (const k of Object.keys(t)) allKeys.add(k);
  }
  console.log('All task keys observed:', [...allKeys].sort().join(', '));
}

main().catch((e) => { console.error(e); process.exit(1); });
