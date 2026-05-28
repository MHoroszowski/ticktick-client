/**
 * Empirical probe: determine the V2 wire shape for setting reminders on a task.
 *
 * Hypothesis space:
 *   H1: reminders: ["TRIGGER:-PT15M"]                          (jen6 V1/OAuth shape)
 *   H2: reminders: [{ trigger: "TRIGGER:-PT15M" }]             (object form)
 *   H3: reminders: [{ id, trigger: "TRIGGER:-PT15M" }]         (with id)
 *   H4: reminders: ["-PT15M"]                                  (no TRIGGER: prefix)
 *   H5: remindTime / reminderTime  scalar                      (different field name)
 *   H6: notify: [...] / notification: [...]                    (different name)
 *   H7: include needed metadata (isAllDay: false, timeZone)    (companion fields)
 *
 * Strategy: create a minimal task without reminders first (baseline must succeed),
 * then attempt each hypothesis on an UPDATE to that task — captures isolation
 * between "I broke the body shape" vs "the reminders field shape is wrong."
 *
 * Runs against the test account only (existing assertTestAccount guard).
 */

import { TickTickClient } from '../src/client.js';
import { FileSessionStore } from '../src/session-store.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_PATH = resolve(__dirname, '../.ticktick-session.json');

const TEST_ACCOUNT_USERNAME = 'doma.spirita@gmail.com';
const TEST_PREFIX = '[reminders-probe]';

const client = new TickTickClient({ sessionStore: new FileSessionStore(SESSION_PATH) });

async function main() {
  const authed = await client.isAuthenticated();
  if (!authed) {
    console.error('❌ Session expired');
    process.exit(1);
  }
  const session = client.getSession();
  if (session?.username !== TEST_ACCOUNT_USERNAME) {
    console.error(`❌ Refusing to run on non-test account (got ${session?.username})`);
    process.exit(1);
  }
  console.log(`✅ Authenticated as ${TEST_ACCOUNT_USERNAME}\n`);

  const projects = await client.projects.list();
  const inbox = projects.find((p) => p.kind === 'INBOX') ?? projects[0];
  if (!inbox) throw new Error('no projects');
  const projectId = inbox.id;
  console.log(`Inbox project: ${projectId}\n`);

  // Baseline — create a task with a dueDate but no reminders to confirm shape works.
  const baselinePayload = {
    title: `${TEST_PREFIX} baseline`,
    projectId,
    dueDate: '2026-12-01T15:00:00.000+0000',
    isAllDay: false,
    timeZone: 'America/New_York',
  };
  console.log('── Baseline (no reminders) ─────────');
  console.log('Request body:', JSON.stringify(baselinePayload));
  let baselineId: string | null = null;
  try {
    const t = await client.request<{ id: string }>('POST', '/api/v2/task', {
      id: generateObjectId(),
      ...baselinePayload,
    });
    baselineId = t.id;
    console.log(`✅ Baseline created: ${baselineId}\n`);
  } catch (e) {
    console.error(`❌ Baseline create failed:`, (e as Error).message);
    process.exit(1);
  }

  // Probe matrix on UPDATE to that task
  const probes: Array<{ name: string; body: Record<string, unknown> }> = [
    {
      name: 'H1: reminders: ["TRIGGER:-PT15M"] (string array, V1 shape)',
      body: { reminders: ['TRIGGER:-PT15M'] },
    },
    {
      name: 'H2: reminders: [{ trigger: "TRIGGER:-PT15M" }]',
      body: { reminders: [{ trigger: 'TRIGGER:-PT15M' }] },
    },
    {
      name: 'H3: reminders: [{ id, trigger }]',
      body: { reminders: [{ id: generateObjectId(), trigger: 'TRIGGER:-PT15M' }] },
    },
    {
      name: 'H4: reminders: ["-PT15M"] (no TRIGGER: prefix)',
      body: { reminders: ['-PT15M'] },
    },
    {
      name: 'H5a: reminderTime: "2026-12-01T14:45:00.000+0000"',
      body: { reminderTime: '2026-12-01T14:45:00.000+0000' },
    },
    {
      name: 'H5b: remindTime (alt spelling)',
      body: { remindTime: '2026-12-01T14:45:00.000+0000' },
    },
    {
      name: 'H6a: notify: ["TRIGGER:-PT15M"]',
      body: { notify: ['TRIGGER:-PT15M'] },
    },
    {
      name: 'H6b: notification: ["TRIGGER:-PT15M"]',
      body: { notification: ['TRIGGER:-PT15M'] },
    },
  ];

  for (const probe of probes) {
    console.log(`── ${probe.name} ─────────`);
    console.log('  body:', JSON.stringify(probe.body));
    try {
      const resp = await client.request<unknown>('POST', `/api/v2/task/${baselineId}`, {
        id: baselineId,
        projectId,
        ...probe.body,
      });
      console.log('  ✅ 200 OK');
      console.log('  response keys:', Object.keys(resp as object).join(','));
      // Also re-fetch to see if the field stuck
      const all = await client.tasks.list();
      const fetched = all.find((t) => t.id === baselineId);
      if (fetched) {
        const raw = fetched as unknown as Record<string, unknown>;
        const relevantKeys = Object.keys(raw).filter((k) =>
          /reminder|notify|notification|remind/i.test(k),
        );
        for (const k of relevantKeys) {
          console.log(`    .${k} =`, JSON.stringify(raw[k]));
        }
        if (relevantKeys.length === 0) {
          console.log('    (no reminder-related field on readback)');
        }
      }
    } catch (e) {
      console.log(`  ❌ ${(e as Error).message}`);
    }
    console.log();
  }

  // Cleanup
  if (baselineId) {
    try {
      await client.tasks.delete(projectId, baselineId);
      console.log(`🧹 Cleanup: deleted ${baselineId}`);
    } catch {}
  }
}

function generateObjectId(): string {
  const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const rnd = [...crypto.getRandomValues(new Uint8Array(8))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return ts + rnd;
}

main().catch((err) => {
  console.error('Unexpected:', err);
  process.exit(1);
});
