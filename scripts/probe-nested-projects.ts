/**
 * Discovery probe — nested projects (projectGroups / folders).
 *
 * Hits the real V2 API against the test account ONLY and captures wire
 * shapes for endpoints that ticktick-py (the canonical reverse-engineering
 * reference) documents. Output goes to Plans/nested-projects-probe.md.
 *
 * Run: bun scripts/probe-nested-projects.ts
 *
 * SAFETY: This script will refuse to run against any account other than
 * doma.spirita@gmail.com. The check fires BEFORE any HTTP call.
 */

import { TickTickClient } from '../src/client.js';
import { FileSessionStore } from '../src/session-store.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir, readFile } from 'node:fs/promises';

const TEST_ACCOUNT_USERNAME = 'doma.spirita@gmail.com';
const TEST_PREFIX = '[probe-nested]';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SESSION_PATH = resolve(ROOT, '.ticktick-session.json');
const PROBE_DOC_PATH = resolve(ROOT, 'Plans/nested-projects-probe.md');

// ───────── Guardrail ─────────

function assertTestAccount(username: string | undefined): asserts username is string {
  if (username !== TEST_ACCOUNT_USERNAME) {
    throw new Error(
      `Refusing to run: expected username "${TEST_ACCOUNT_USERNAME}", got "${username ?? '(unset)'}". ` +
        `This probe only runs against the test account.`,
    );
  }
}

// ───────── .env loader (minimal, no deps) ─────────

async function loadEnvUsername(): Promise<string | undefined> {
  try {
    const raw = await readFile(resolve(ROOT, '.env'), 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^TICKTICK_USERNAME=(.*)$/);
      if (m) return m[1]?.trim();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function loadEnvPassword(): Promise<string | undefined> {
  try {
    const raw = await readFile(resolve(ROOT, '.env'), 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^TICKTICK_PASSWORD=(.*)$/);
      if (m) return m[1]?.trim();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// ───────── Capture buffer ─────────

type Capture = {
  step: string;
  request?: { method: string; path: string; body?: unknown };
  response: unknown;
  notes?: string;
};

const captures: Capture[] = [];

function record(c: Capture): void {
  captures.push(c);
  console.log(`\n── ${c.step} ────────────`);
  if (c.request) {
    console.log(`  → ${c.request.method} ${c.request.path}`);
    if (c.request.body !== undefined) {
      console.log(`    body: ${JSON.stringify(c.request.body).slice(0, 300)}`);
    }
  }
  console.log(`  ← ${JSON.stringify(c.response).slice(0, 500)}`);
  if (c.notes) console.log(`  note: ${c.notes}`);
}

// ───────── Main ─────────

async function main() {
  const envUsername = await loadEnvUsername();
  assertTestAccount(envUsername);
  console.log(`✓ Guardrail: env username is ${envUsername}`);

  const envPassword = await loadEnvPassword();
  if (!envPassword) {
    throw new Error('TICKTICK_PASSWORD not set in .env');
  }

  const client = new TickTickClient({
    credentials: { username: envUsername, password: envPassword },
    sessionStore: new FileSessionStore(SESSION_PATH),
  });

  // Second defense-in-depth check: after login, re-verify the session username.
  await (
    client as unknown as { login: () => Promise<void> }
  ).login();
  const session = client.getSession();
  assertTestAccount(session?.username);
  console.log(`✓ Guardrail (post-login): session username is ${session?.username}`);

  // ── Step 1: batch/check/0 — baseline tree pull
  const baseline = (await client.request<Record<string, unknown>>(
    'GET',
    '/api/v2/batch/check/0',
  )) as Record<string, unknown>;
  const baselineKeys = Object.keys(baseline);
  const baselineProjectGroups = (baseline['projectGroups'] as unknown[]) ?? [];
  record({
    step: '1: baseline batch/check/0',
    request: { method: 'GET', path: '/api/v2/batch/check/0' },
    response: {
      top_level_keys: baselineKeys,
      projectGroups_count: baselineProjectGroups.length,
      first_projectGroup_sample: baselineProjectGroups[0] ?? null,
    },
    notes: 'Sample shape of an existing projectGroup if any exist.',
  });

  // ── Step 2: create a new test folder
  const probeRunId = Date.now().toString(36);
  const folderId = generateClientId();
  const folderName = `${TEST_PREFIX} probe folder ${probeRunId}`;
  const createFolderBody = {
    add: [{ id: folderId, name: folderName, sortOrder: 0, listType: 'group' }],
  };
  const createFolderResp = await client.request<unknown>(
    'POST',
    '/api/v2/batch/projectGroup',
    createFolderBody,
  );
  record({
    step: '2: create folder',
    request: { method: 'POST', path: '/api/v2/batch/projectGroup', body: createFolderBody },
    response: createFolderResp,
    notes: `Generated folder id: ${folderId}`,
  });

  // ── Step 3: batch/check/0 again — confirm folder appears
  const afterCreate = (await client.request<Record<string, unknown>>(
    'GET',
    '/api/v2/batch/check/0',
  )) as Record<string, unknown>;
  const afterCreateGroups = (afterCreate['projectGroups'] as Array<Record<string, unknown>>) ?? [];
  const createdFolder = afterCreateGroups.find((g) => g['id'] === folderId);
  record({
    step: '3: confirm folder via batch/check/0',
    request: { method: 'GET', path: '/api/v2/batch/check/0' },
    response: {
      projectGroups_count: afterCreateGroups.length,
      created_folder: createdFolder ?? null,
    },
    notes: 'These are the fields available on a freshly-created projectGroup.',
  });

  // ── Step 4: create a project inside the folder
  const projectId = generateClientId();
  const projectName = `${TEST_PREFIX} probe project ${probeRunId}`;
  const createProjectBody = {
    add: [{ id: projectId, name: projectName, groupId: folderId, kind: 'TASK' }],
  };
  await client.request<unknown>('POST', '/api/v2/batch/project', createProjectBody);
  const projectsList = await client.request<Array<Record<string, unknown>>>(
    'GET',
    '/api/v2/projects',
  );
  const createdProject = projectsList.find((p) => p['id'] === projectId);
  record({
    step: '4: create project with groupId',
    request: { method: 'POST', path: '/api/v2/batch/project', body: createProjectBody },
    response: { created_project: createdProject ?? null },
    notes: 'Confirms wire field is `groupId` and that GET /api/v2/projects returns it.',
  });

  // ── Step 5: unparent via groupId: null
  const unparentBody = { update: [{ id: projectId, groupId: null }] };
  await client.request<unknown>('POST', '/api/v2/batch/project', unparentBody);
  const afterUnparent = await client.request<Array<Record<string, unknown>>>(
    'GET',
    '/api/v2/projects',
  );
  const unparented = afterUnparent.find((p) => p['id'] === projectId);
  record({
    step: '5: unparent via groupId: null',
    request: { method: 'POST', path: '/api/v2/batch/project', body: unparentBody },
    response: { project_after_unparent: unparented ?? null },
    notes: `Does the project lose its groupId? Current groupId: ${JSON.stringify(unparented?.['groupId'])}`,
  });

  // ── Step 6: re-parent via groupId: "<id>" again, then test "NONE" semantics
  const reparentBody = { update: [{ id: projectId, groupId: folderId }] };
  await client.request<unknown>('POST', '/api/v2/batch/project', reparentBody);
  const noneBody = { update: [{ id: projectId, groupId: 'NONE' }] };
  await client.request<unknown>('POST', '/api/v2/batch/project', noneBody);
  const afterNone = await client.request<Array<Record<string, unknown>>>('GET', '/api/v2/projects');
  const afterNoneProject = afterNone.find((p) => p['id'] === projectId);
  record({
    step: '6: groupId "NONE" semantics',
    request: { method: 'POST', path: '/api/v2/batch/project', body: noneBody },
    response: { project_after_NONE: afterNoneProject ?? null },
    notes: `Does the literal string "NONE" also unparent? groupId after NONE: ${JSON.stringify(afterNoneProject?.['groupId'])}`,
  });

  // ── Step 7: re-parent again, then try deleting folder while project is inside
  const reparentAgain = { update: [{ id: projectId, groupId: folderId }] };
  await client.request<unknown>('POST', '/api/v2/batch/project', reparentAgain);
  const deleteFolderBody = { delete: [folderId] };
  let deleteFolderResp: unknown;
  let deleteFolderError: string | null = null;
  try {
    deleteFolderResp = await client.request<unknown>(
      'POST',
      '/api/v2/batch/projectGroup',
      deleteFolderBody,
    );
  } catch (err) {
    deleteFolderError = err instanceof Error ? err.message : String(err);
  }
  const afterFolderDelete = await client.request<Array<Record<string, unknown>>>(
    'GET',
    '/api/v2/projects',
  );
  const projectAfterFolderDelete = afterFolderDelete.find((p) => p['id'] === projectId);
  record({
    step: '7: delete folder while project is inside',
    request: { method: 'POST', path: '/api/v2/batch/projectGroup', body: deleteFolderBody },
    response: {
      response_body: deleteFolderResp,
      error: deleteFolderError,
      project_after_folder_delete: projectAfterFolderDelete ?? null,
    },
    notes:
      'Cascade behavior: child project survives with groupId still pointing at deleted folder? becomes top-level? was deleted?',
  });

  // ── Cleanup: delete the test project (folder either already gone or we delete it)
  try {
    await client.request<unknown>('POST', '/api/v2/batch/project', { delete: [projectId] });
    console.log(`\n✓ Cleanup: deleted test project ${projectId}`);
  } catch (e) {
    console.log(`\n⚠️ Cleanup project delete failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    await client.request<unknown>('POST', '/api/v2/batch/projectGroup', { delete: [folderId] });
    console.log(`✓ Cleanup: ensured folder ${folderId} is deleted (idempotent)`);
  } catch (e) {
    // already deleted in step 7 is the success case
    console.log(`(folder already gone — expected if step 7 succeeded)`);
  }

  // ── Write probe doc
  await mkdir(dirname(PROBE_DOC_PATH), { recursive: true });
  await writeFile(PROBE_DOC_PATH, renderProbeDoc(captures), 'utf-8');
  console.log(`\n✓ Probe doc written to ${PROBE_DOC_PATH}`);
}

function generateClientId(): string {
  // mirror src/internal/ids.ts pattern — 24-hex ObjectId
  const ts = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, '0');
  const rand = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
  return ts + rand;
}

function renderProbeDoc(caps: Capture[]): string {
  const lines: string[] = [
    '# Nested Projects (projectGroups / folders) — Discovery Probe',
    '',
    `Captured: ${new Date().toISOString()}`,
    `Test account: ${TEST_ACCOUNT_USERNAME}`,
    `Probe script: scripts/probe-nested-projects.ts`,
    '',
    '## Findings — wire shape',
    '',
    'These are the empirical results from probing the TickTick V2 API against the test account. Implementation MUST match what this doc captures, not the ticktick-py reference (which is canonical for endpoint discovery but may have drifted from current server behavior).',
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
    lines.push('', '**Response:**', '', '```json', JSON.stringify(c.response, null, 2), '```');
    if (c.notes) lines.push('', `**Notes:** ${c.notes}`);
    lines.push('');
  }
  return lines.join('\n');
}

main().catch((err) => {
  console.error('\n❌ PROBE FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
