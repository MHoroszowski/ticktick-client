/**
 * Round 2: now we know the readback shape is { reminder: "TRIGGER:...", reminders: [{id, trigger}] }.
 * Probe which write payload actually causes the server to populate that shape.
 */

import { TickTickClient } from '../src/client.js';
import { FileSessionStore } from '../src/session-store.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_PATH = resolve(__dirname, '../.ticktick-session.json');
const TEST = 'doma.spirita@gmail.com';
const TEST_PREFIX = '[reminders-probe-2]';

const client = new TickTickClient({ sessionStore: new FileSessionStore(SESSION_PATH) });

function makeId(): string {
  const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const rnd = [...crypto.getRandomValues(new Uint8Array(8))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return ts + rnd;
}

async function probe(name: string, body: Record<string, unknown>, taskId: string, projectId: string) {
  console.log(`── ${name} ─────────`);
  console.log('  body:', JSON.stringify(body));
  try {
    await client.request<unknown>('POST', `/api/v2/task/${taskId}`, {
      id: taskId, projectId, ...body,
    });
    console.log('  ✅ 200 OK');
    const all = await client.tasks.list();
    const fetched = all.find((t) => t.id === taskId) as unknown as Record<string, unknown> | undefined;
    if (fetched) {
      console.log('    .reminder  =', JSON.stringify(fetched.reminder));
      console.log('    .reminders =', JSON.stringify(fetched.reminders));
    }
  } catch (e) {
    console.log(`  ❌ ${(e as Error).message}`);
  }
  console.log();
}

async function main() {
  if (!(await client.isAuthenticated())) { console.error('❌ session'); process.exit(1); }
  if (client.getSession()?.username !== TEST) { console.error('❌ wrong account'); process.exit(1); }

  const projects = await client.projects.list();
  const inbox = projects.find((p) => p.kind === 'INBOX') ?? projects[0];
  if (!inbox) throw new Error('no projects');
  const projectId = inbox.id;

  // Fresh baseline task
  const taskId = makeId();
  await client.request('POST', '/api/v2/task', {
    id: taskId,
    projectId,
    title: `${TEST_PREFIX} baseline`,
    dueDate: '2026-12-01T15:00:00.000+0000',
    isAllDay: false,
    timeZone: 'America/New_York',
  });
  console.log(`✅ baseline created ${taskId}\n`);

  // ── Hypothesis matrix ─────────────────────────────────────
  // H8: scalar reminder + reminders[{id, trigger}] in lockstep
  await probe('H8: reminder + reminders[{id, trigger}] (single, consistent)', {
    reminder: 'TRIGGER:-PT15M',
    reminders: [{ id: makeId(), trigger: 'TRIGGER:-PT15M' }],
  }, taskId, projectId);

  // H9: ONLY reminders array (no scalar reminder)
  await probe('H9: only reminders[{id, trigger}] (no scalar reminder)', {
    reminders: [{ id: makeId(), trigger: 'TRIGGER:-PT24H' }],
  }, taskId, projectId);

  // H10: ONLY scalar reminder (string), see if server auto-populates the array
  await probe('H10: only scalar reminder = "TRIGGER:-PT1H"', {
    reminder: 'TRIGGER:-PT1H',
  }, taskId, projectId);

  // H11: multi-reminder — scalar = first, reminders array has 3
  await probe('H11: multi (scalar + 3-element array, consistent)', {
    reminder: 'TRIGGER:-PT24H',
    reminders: [
      { id: makeId(), trigger: 'TRIGGER:-PT24H' },
      { id: makeId(), trigger: 'TRIGGER:-PT1H' },
      { id: makeId(), trigger: 'TRIGGER:PT0S' },
    ],
  }, taskId, projectId);

  // H12: clear — empty string scalar, empty array
  await probe('H12: clear via reminder="" + reminders=[]', {
    reminder: '',
    reminders: [],
  }, taskId, projectId);

  // H13: clear via nulls
  await probe('H13: clear via reminder=null + reminders=null', {
    reminder: null,
    reminders: null,
  }, taskId, projectId);

  // Cleanup
  try {
    await client.tasks.delete(projectId, taskId);
    console.log(`🧹 cleanup ${taskId}`);
  } catch {}
}

main().catch((e) => { console.error(e); process.exit(1); });
