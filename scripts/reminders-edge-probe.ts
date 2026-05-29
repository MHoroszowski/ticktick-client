/**
 * Live probe: edge cases flagged by the advisor.
 *
 * E1: setReminders([]) vs setReminders(null) — equivalent? Different?
 * E2: Reminder on task with no dueDate / no startDate — accepted? Silent-drop? 4xx?
 */

import { TickTickClient } from '../src/client.js';
import { FileSessionStore } from '../src/session-store.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_PATH = resolve(__dirname, '../.ticktick-session.json');
const TEST = 'doma.spirita@gmail.com';
const PREFIX = '[reminders-edge-probe]';

const client = new TickTickClient({ sessionStore: new FileSessionStore(SESSION_PATH) });

async function main() {
  if (!(await client.isAuthenticated())) { console.error('❌ session'); process.exit(1); }
  if (client.getSession()?.username !== TEST) {
    console.error(`❌ wrong account (${client.getSession()?.username})`); process.exit(1);
  }
  const projects = await client.projects.list();
  const inbox = projects.find((p) => p.kind === 'INBOX') ?? projects[0];
  if (!inbox) throw new Error('no projects');
  const projectId = inbox.id;
  const cleanup: string[] = [];

  // ── E1: setReminders([]) — does empty array equal null? ─────────
  console.log('── E1: setReminders([]) — empty array semantics ──');
  try {
    const t = await client.tasks.create({
      title: `${PREFIX} E1-empty-array`,
      projectId,
      dueDate: '2027-06-01T15:00:00.000+0000',
      isAllDay: false,
      reminders: ['TRIGGER:-PT15M', 'TRIGGER:PT0S'],
    });
    cleanup.push(t.id);
    console.log(`  created with 2 reminders`);
    await client.tasks.setReminders(projectId, t.id, []);
    const fetched = (await client.tasks.list()).find((x) => x.id === t.id);
    console.log(`  after setReminders([]) → reminders count = ${fetched?.reminders?.length ?? '?'}`);
    console.log(`  reminders = ${JSON.stringify(fetched?.reminders)}`);
    console.log(`  reminder scalar = ${JSON.stringify(fetched?.reminder)}`);
  } catch (e) {
    console.log(`  ❌ ${(e as Error).message}`);
  }

  // ── E2: Reminder on task with no dueDate ────────────────────────
  console.log('\n── E2a: reminder on task without dueDate ──');
  try {
    const t = await client.tasks.create({
      title: `${PREFIX} E2a-no-date`,
      projectId,
      reminder: 'TRIGGER:-PT15M',
    });
    cleanup.push(t.id);
    const fetched = (await client.tasks.list()).find((x) => x.id === t.id);
    console.log(`  created — server response code: 200 OK`);
    console.log(`  fetched.reminder = ${JSON.stringify(fetched?.reminder)}`);
    console.log(`  fetched.reminders = ${JSON.stringify(fetched?.reminders)}`);
    console.log(`  fetched.dueDate = ${JSON.stringify(fetched?.dueDate)}`);
    console.log(`  fetched.startDate = ${JSON.stringify(fetched?.startDate)}`);
  } catch (e) {
    console.log(`  ❌ ${(e as Error).message}`);
  }

  // ── E2b: setReminders on existing task that has no dueDate ──────
  console.log('\n── E2b: setReminders on dateless task ──');
  try {
    const t = await client.tasks.create({
      title: `${PREFIX} E2b-dateless`,
      projectId,
    });
    cleanup.push(t.id);
    console.log(`  created bare task ${t.id}; setting reminder now`);
    await client.tasks.setReminders(projectId, t.id, ['TRIGGER:-PT15M']);
    const fetched = (await client.tasks.list()).find((x) => x.id === t.id);
    console.log(`  fetched.reminder = ${JSON.stringify(fetched?.reminder)}`);
    console.log(`  fetched.reminders = ${JSON.stringify(fetched?.reminders)}`);
    console.log(`  fetched.dueDate = ${JSON.stringify(fetched?.dueDate)}`);
  } catch (e) {
    console.log(`  ❌ ${(e as Error).message}`);
  }

  // Cleanup
  for (const id of cleanup) {
    try { await client.tasks.delete(projectId, id); } catch {}
  }
  console.log(`\n🧹 cleaned up ${cleanup.length} probe tasks`);
}

main().catch((e) => { console.error(e); process.exit(1); });
