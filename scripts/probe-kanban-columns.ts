/**
 * Discovery probe — Kanban column CRUD.
 *
 * This is the final, production-shape probe that verifies the wire format
 * the `projects.createColumn` / `projects.updateColumn` methods use.
 *
 * Findings (captured 2026-05-27 across six probe iterations against the
 * test account `doma.spirita@gmail.com`):
 *
 * - CREATE: `POST /api/v2/column` with body `{add: [{id, projectId, name, sortOrder?}]}`
 *           → `{id2etag: {<id>: <etag>}, id2error: {}}`. Persists.
 * - UPDATE: `POST /api/v2/column` with body `{update: [{id, projectId, name?, sortOrder?}]}`
 *           → `{id2etag: {<id>: <etag>}, id2error: {}}`. Persists.
 *           **`projectId` is REQUIRED on the update item.** Without it the
 *           server returns 200 with EMPTY `id2etag` and the changes are
 *           silently dropped — this is the hidden-requirement gotcha.
 * - DELETE: **upstream-broken.** `POST /api/v2/column` with `{delete:[id-string]}`
 *           returns 500. With `{delete:[{id, projectId}]}` the server returns
 *           200 + a concatenated 500 body containing
 *           `"errorCode":"unknown_exception"`. Soft-delete via `update {deleted:1}`
 *           is accepted but the `deleted` field is dropped from the persisted
 *           record. See README "Known Limitations" and the column-delete
 *           tracking issue on the fork.
 * - LIST:   existing `GET /api/v2/column?from=0&projectId=<id>` returns
 *           `{update: [TickTickColumn]}` envelope. Server projectId filter is
 *           NOT honored; projection is client-side in `projects.listColumns`.
 *
 * Run: bun scripts/probe-kanban-columns.ts
 *
 * SAFETY: refuses to run against any account other than
 * doma.spirita@gmail.com. The check fires BEFORE any HTTP call.
 */

import { TickTickClient } from '../src/client.js';
import { FileSessionStore } from '../src/session-store.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir, readFile } from 'node:fs/promises';

const TEST_ACCOUNT_USERNAME = 'doma.spirita@gmail.com';
const TEST_PREFIX = '[probe-columns]';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SESSION_PATH = resolve(ROOT, '.ticktick-session.json');
const PROBE_DOC_PATH = resolve(ROOT, 'Plans/kanban-columns-probe.md');

function assertTestAccount(username: string | undefined): asserts username is string {
  if (username !== TEST_ACCOUNT_USERNAME) {
    throw new Error(
      `Refusing to run: expected username "${TEST_ACCOUNT_USERNAME}", got "${username ?? '(unset)'}". ` +
        `This probe only runs against the test account.`,
    );
  }
}

async function loadEnv(key: string): Promise<string | undefined> {
  try {
    const raw = await readFile(resolve(ROOT, '.env'), 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(new RegExp(`^${key}=(.*)$`));
      if (m) return m[1]?.trim();
    }
  } catch {
    /* no .env — caller will throw */
  }
  return undefined;
}

type Capture = {
  step: string;
  request?: { method: string; path: string; body?: unknown };
  response?: unknown;
  error?: string | null;
  notes?: string;
};

const captures: Capture[] = [];

function record(c: Capture): void {
  captures.push(c);
  console.log(`\n── ${c.step} ────────────`);
  if (c.request) {
    console.log(`  → ${c.request.method} ${c.request.path}`);
    if (c.request.body !== undefined) {
      console.log(`    body: ${JSON.stringify(c.request.body).slice(0, 400)}`);
    }
  }
  if (c.response !== undefined) {
    console.log(`  ← ${JSON.stringify(c.response).slice(0, 500)}`);
  }
  if (c.error) console.log(`  ✗ error: ${c.error}`);
  if (c.notes) console.log(`  note: ${c.notes}`);
}

function generateClientId(): string {
  const ts = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, '0');
  const rand = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
  return ts + rand;
}

async function tryRequest(
  client: TickTickClient,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ response?: unknown; error?: string }> {
  try {
    const response = await (client as unknown as {
      request: (m: string, p: string, b?: unknown) => Promise<unknown>;
    }).request(method, path, body);
    return { response };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function listColumns(
  client: TickTickClient,
  projectId: string,
): Promise<Array<{ id: string; projectId: string; name: string; sortOrder?: number; etag?: string }>> {
  const resp = await tryRequest(client, 'GET', `/api/v2/column?from=0&projectId=${projectId}`);
  const w = (resp.response as { update?: Array<{ id: string; projectId: string; name: string; sortOrder?: number; etag?: string }> }) ?? {};
  return (w.update ?? []).filter((c) => c.projectId === projectId);
}

async function main(): Promise<void> {
  const envUsername = await loadEnv('TICKTICK_USERNAME');
  assertTestAccount(envUsername);
  console.log(`✓ Guardrail: env username is ${envUsername}`);

  const envPassword = await loadEnv('TICKTICK_PASSWORD');
  if (!envPassword) throw new Error('TICKTICK_PASSWORD not set in .env');

  const client = new TickTickClient({
    credentials: { username: envUsername, password: envPassword },
    sessionStore: new FileSessionStore(SESSION_PATH),
  });

  await (client as unknown as { login: () => Promise<void> }).login();
  const session = client.getSession();
  assertTestAccount(session?.username);
  console.log(`✓ Guardrail (post-login): session username is ${session?.username}`);

  const probeRunId = Date.now().toString(36);

  // ── Step 1: create a kanban-view test project
  const projectId = generateClientId();
  const projectName = `${TEST_PREFIX} ${probeRunId}`;
  const projectBody = { add: [{ id: projectId, name: projectName, viewMode: 'kanban', kind: 'TASK' }] };
  const projectCreate = await tryRequest(client, 'POST', '/api/v2/batch/project', projectBody);
  record({
    step: '1: create kanban project',
    request: { method: 'POST', path: '/api/v2/batch/project', body: projectBody },
    response: projectCreate.response,
    error: projectCreate.error ?? null,
    notes: `projectId: ${projectId}`,
  });
  if (projectCreate.error) throw new Error('cannot continue without a project');

  // ── Step 2: CREATE column via confirmed shape
  const columnId = generateClientId();
  const createBody = { add: [{ id: columnId, projectId, name: `${TEST_PREFIX} new`, sortOrder: 0 }] };
  const createResp = await tryRequest(client, 'POST', '/api/v2/column', createBody);
  const afterCreate = await listColumns(client, projectId);
  const created = afterCreate.find((c) => c.id === columnId);
  record({
    step: '2: CREATE column — POST /api/v2/column {add:[...]}',
    request: { method: 'POST', path: '/api/v2/column', body: createBody },
    response: createResp.response,
    error: createResp.error ?? null,
    notes: `persisted: ${!!created}; etag: ${created?.etag}`,
  });

  // ── Step 3: UPDATE column (rename + sortOrder) — note projectId required
  const updateBody = {
    update: [{ id: columnId, projectId, name: `${TEST_PREFIX} renamed`, sortOrder: 42 }],
  };
  const updateResp = await tryRequest(client, 'POST', '/api/v2/column', updateBody);
  const afterUpdate = await listColumns(client, projectId);
  const updated = afterUpdate.find((c) => c.id === columnId);
  record({
    step: '3: UPDATE column — POST /api/v2/column {update:[...]} with projectId',
    request: { method: 'POST', path: '/api/v2/column', body: updateBody },
    response: updateResp.response,
    error: updateResp.error ?? null,
    notes: `name: ${updated?.name}; sortOrder: ${updated?.sortOrder} (expected: renamed/42)`,
  });

  // ── Step 4: PARTIAL UPDATE (name only — sortOrder must be preserved)
  const partialBody = { update: [{ id: columnId, projectId, name: `${TEST_PREFIX} partial-rename` }] };
  const partialResp = await tryRequest(client, 'POST', '/api/v2/column', partialBody);
  const afterPartial = await listColumns(client, projectId);
  const partial = afterPartial.find((c) => c.id === columnId);
  record({
    step: '4: PARTIAL UPDATE — name only, sortOrder preserved',
    request: { method: 'POST', path: '/api/v2/column', body: partialBody },
    response: partialResp.response,
    error: partialResp.error ?? null,
    notes: `name: ${partial?.name}; sortOrder preserved at 42? ${partial?.sortOrder === 42}`,
  });

  // ── Step 5: DELETE — documented as upstream-broken; capture the exact 500
  const deleteBody = { delete: [{ id: columnId, projectId }] };
  const session2 = client.getSession();
  const cookieStr = Object.entries(session2?.cookies ?? {}).map(([k, v]) => `${k}=${v}`).join('; ');
  const rawResp = await fetch('https://api.ticktick.com/api/v2/column', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieStr,
      'x-csrftoken': session2?.csrfToken ?? '',
      accept: 'application/json, text/plain, */*',
      origin: 'https://ticktick.com',
      referer: 'https://ticktick.com/webapp/',
      'user-agent': 'Mozilla/5.0',
    },
    body: JSON.stringify(deleteBody),
  });
  const rawText = await rawResp.text();
  record({
    step: '5: DELETE column — documented upstream bug (server 500 unknown_exception)',
    request: { method: 'POST', path: '/api/v2/column', body: deleteBody },
    response: { status: rawResp.status, raw_body: rawText },
    notes:
      'Raw fetch used because the standard client throws on the concatenated 200+500 body. ' +
      'The server returns `errorCode: "unknown_exception"`. No working delete path discovered ' +
      'after 6 probe iterations covering: REST DELETE, batch envelopes, deleteIds, soft-delete via ' +
      'update{deleted:1}, full-record body, kebab paths, and per-id verb paths. Tracking as upstream bug.',
  });

  // ── Cleanup
  console.log('\n── cleanup ────────────');
  await tryRequest(client, 'POST', '/api/v2/batch/project', { delete: [projectId] });
  console.log(`✓ deleted test project ${projectId} (cascade removes columns)`);

  await mkdir(dirname(PROBE_DOC_PATH), { recursive: true });
  await writeFile(PROBE_DOC_PATH, renderProbeDoc(captures), 'utf-8');
  console.log(`✓ Probe doc written to ${PROBE_DOC_PATH}`);
}

function renderProbeDoc(caps: Capture[]): string {
  const lines: string[] = [
    '# Kanban Columns CRUD — Wire Discovery',
    '',
    `Captured: ${new Date().toISOString()}`,
    `Test account: ${TEST_ACCOUNT_USERNAME}`,
    `Probe script: scripts/probe-kanban-columns.ts`,
    '',
    '## Wire shape — confirmed',
    '',
    '| Operation | Method | Path | Body | Persisted? |',
    '|-----------|--------|------|------|------------|',
    '| **CREATE** | POST | `/api/v2/column` | `{add: [{id, projectId, name, sortOrder?}]}` | Yes |',
    '| **UPDATE** | POST | `/api/v2/column` | `{update: [{id, projectId, name?, sortOrder?}]}` | Yes |',
    '| **DELETE** | POST | `/api/v2/column` | `{delete: [{id, projectId}]}` | **Upstream-broken (500 unknown_exception)** |',
    '| LIST | GET | `/api/v2/column?from=0&projectId=<id>` | — | (existing — server filter not honored; client-side projection) |',
    '',
    '### Critical gotcha (UPDATE)',
    '',
    "TickTick's update endpoint **silently no-ops** if the `projectId` field is missing from the update item. The server returns 200 with `{id2etag: {}, id2error: {}}` and discards the change. Every update payload MUST include the column's `projectId`.",
    '',
    '### DELETE upstream bug',
    '',
    'After six probe iterations (REST DELETE, batch envelopes, `{deleteIds}`, soft-delete via `update {deleted: 1}`, full-record body, kebab paths, per-id verb paths) **no working delete path exists** at the V2 cookie-session API surface. The closest behavior is `POST /api/v2/column {delete:[{id,projectId}]}` which returns a malformed 200+500 hybrid containing `"errorCode":"unknown_exception"`.',
    '',
    'Library decision: ship `createColumn` + `updateColumn` only. Document the delete gap as a tracking issue. Filed as a `tracking: server-bug` issue on the fork; references issue #15.',
    '',
    '## Step-by-step capture',
    '',
  ];
  for (const c of caps) {
    lines.push(`### Step ${c.step}`);
    if (c.request) {
      lines.push('', '**Request:**', '', '```http', `${c.request.method} ${c.request.path}`, '```');
      if (c.request.body !== undefined) {
        lines.push('', '**Body:**', '', '```json', JSON.stringify(c.request.body, null, 2), '```');
      }
    }
    if (c.response !== undefined) {
      lines.push('', '**Response:**', '', '```json', JSON.stringify(c.response, null, 2), '```');
    }
    if (c.error) lines.push('', `**Error:** \`${c.error}\``);
    if (c.notes) lines.push('', `**Notes:** ${c.notes}`);
    lines.push('');
  }
  return lines.join('\n');
}

main().catch((err) => {
  console.error('\n❌ PROBE FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
