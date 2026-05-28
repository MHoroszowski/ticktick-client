# ticktick-client

[![npm version](https://img.shields.io/npm/v/ticktick-client)](https://www.npmjs.com/package/ticktick-client)
[![CI](https://github.com/jaeyeonling/ticktick-client/actions/workflows/ci.yml/badge.svg)](https://github.com/jaeyeonling/ticktick-client/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Unofficial TickTick API client for Node.js / TypeScript.

> **Disclaimer** &mdash; This library reverse-engineers TickTick's private web API. It is **not** affiliated with or endorsed by TickTick. The API surface may change without notice. Use at your own risk.

---

## Feature Coverage

The table below maps every major TickTick capability to its support status in this library. Each method has been **verified against the real API** via Playwright-based traffic capture (last verified: 2026-04-07).

| Category | Feature | Status | Method |
|----------|---------|:------:|--------|
| **Tasks** | List all tasks | :white_check_mark: | `tasks.list()` |
| | Create task | :white_check_mark: | `tasks.create(draft)` |
| | Update task | :white_check_mark: | `tasks.update(params)` |
| | Complete task | :white_check_mark: | `tasks.complete(projectId, taskId)` |
| | Delete task | :white_check_mark: | `tasks.delete(projectId, taskId)` |
| | Batch create | :white_check_mark: | `tasks.createMany(drafts)` |
| | Batch update | :white_check_mark: | `tasks.updateMany(params)` |
| | Batch delete | :white_check_mark: | `tasks.deleteMany(items)` |
| | Move to project | :warning: | `tasks.move(item)` &mdash; copy+delete, ID changes |
| | Move many | :warning: | `tasks.moveMany(items)` &mdash; same limitation |
| | Create subtask | :white_check_mark: | `tasks.createSubtask(parentId, projectId, draft)` |
| | Pin / Unpin | :white_check_mark: | `tasks.pin()` / `tasks.unpin()` |
| | List completed | :white_check_mark: | `tasks.listCompleted(options)` |
| | Iterate completed | :white_check_mark: | `tasks.iterateCompleted(options)` |
| | List trash | :no_entry_sign: | `tasks.listTrash()` &mdash; API ignores status filter |
| | Restore from trash | :warning: | `tasks.restore()` &mdash; works if you know the task ID |
| | Recurring tasks | :white_check_mark: | via `repeatFlag` / `repeatEndDate` in create/update |
| | Reminders &mdash; read | :white_check_mark: | `task.reminder` / `task.reminders` on readback; `parseReminderTrigger()` helper |
| | Reminders &mdash; write (time-based) | :warning: | helpers ship (`formatReminderTrigger`), write-path pending HAR &mdash; see [#2](https://github.com/MHoroszowski/ticktick-client/issues/2) / [#3](https://github.com/MHoroszowski/ticktick-client/issues/3) |
| | Reminders &mdash; write (geofence) | :x: | Pending HAR capture &mdash; see [#5](https://github.com/MHoroszowski/ticktick-client/issues/5) |
| | Attachments | :x: | Not implemented |
| | Comments | :x: | Not implemented |
| | Sort order | :white_check_mark: | via `sortOrder` in create/update |
| **Projects** | List projects | :white_check_mark: | `projects.list()` |
| | Create project | :white_check_mark: | `projects.create(draft)` |
| | Update project | :white_check_mark: | `projects.update(params)` |
| | Delete project | :white_check_mark: | `projects.delete(id)` |
| | Batch delete | :white_check_mark: | `projects.deleteMany(ids)` |
| | List columns (Kanban) | :white_check_mark: | `projects.listColumns(projectId)` |
| | Sharing / Collaboration | :x: | Not implemented |
| **Tags** | List tags | :white_check_mark: | `tags.list()` |
| | Create tag | :white_check_mark: | `tags.create(draft)` |
| | Batch create | :white_check_mark: | `tags.createMany(drafts)` |
| | Update tag | :white_check_mark: | `tags.update(draft)` |
| | Delete tag | :white_check_mark: | `tags.delete(name)` |
| | Batch delete | :white_check_mark: | `tags.deleteMany(names)` |
| | Rename tag | :white_check_mark: | `tags.rename(name, label)` |
| | Merge tags | :white_check_mark: | `tags.merge(source, target)` |
| **Habits** | List habits | :white_check_mark: | `habits.list()` |
| | Create habit | :white_check_mark: | `habits.create(draft)` |
| | Update habit | :white_check_mark: | `habits.update(params)` |
| | Delete habit | :white_check_mark: | `habits.delete(id)` |
| | Batch delete | :white_check_mark: | `habits.deleteMany(ids)` |
| | Check in | :white_check_mark: | `habits.upsertCheckin(input)` |
| | Get check-ins | :white_check_mark: | `habits.getCheckins(ids, start, end)` |
| | Weekly stats | :white_check_mark: | `habits.getWeekStats()` |
| **Focus** | Start session | :white_check_mark: | `focus.start(options)` |
| | Pause session | :white_check_mark: | `focus.pause()` |
| | Resume session | :white_check_mark: | `focus.resume()` |
| | Finish session | :white_check_mark: | `focus.finish()` |
| | Stop (drop) session | :white_check_mark: | `focus.stop()` |
| | Get local state | :white_check_mark: | `focus.getState()` |
| | Sync remote state | :white_check_mark: | `focus.syncState()` |
| | Reset local state | :white_check_mark: | `focus.resetState()` |
| | Timeline | :white_check_mark: | `focus.getTimeline(start, end)` |
| | Overview | :white_check_mark: | `focus.getOverview()` |
| | Timing data | :white_check_mark: | `focus.getTiming(start, end)` |
| | Heatmap | :no_entry_sign: | `focus.getHeatmap()` &mdash; server returns 500 |
| | Hour distribution | :no_entry_sign: | `focus.getHourDistribution()` &mdash; server returns 500 |
| | Distribution | :no_entry_sign: | `focus.getDistribution()` &mdash; server returns 500 |
| **Statistics** | User ranking | :white_check_mark: | `statistics.getRanking()` |
| | Completed tasks list | :white_check_mark: | `statistics.listCompleted(from, to, limit)` |
| **Countdowns** | List countdowns | :white_check_mark: | `countdowns.list()` |
| | Create countdown | :white_check_mark: | `countdowns.create(draft)` |
| | Update countdown | :white_check_mark: | `countdowns.update(params)` |
| | Delete countdown | :white_check_mark: | `countdowns.delete(id)` |
| **User** | Get profile | :white_check_mark: | `user.getProfile()` |
| | Get status (Pro, etc.) | :white_check_mark: | `user.getStatus()` |
| **Auth** | Login | :white_check_mark: | `client.login()` |
| | Logout | :white_check_mark: | `client.logout()` |
| | Check auth | :white_check_mark: | `client.isAuthenticated()` |
| | Auto re-auth | :white_check_mark: | Automatic on 401/403 |
| | Session persistence | :white_check_mark: | File / Memory / Custom stores |

**Legend:** :white_check_mark: Fully working &nbsp; :warning: Works with known limitations &nbsp; :no_entry_sign: API broken server-side &nbsp; :x: Not implemented

---

## Installation

```bash
npm install ticktick-client
```

Requires **Node.js 22+**. Zero runtime dependencies.

---

## Quick Start

```typescript
import { TickTickClient, FileSessionStore } from 'ticktick-client';

const client = new TickTickClient({
  credentials: {
    username: 'your@email.com',
    password: 'your-password',
  },
  // Persist session to avoid logging in every time
  sessionStore: new FileSessionStore('./.ticktick-session.json'),
});

// First request triggers auto-login
const tasks = await client.tasks.list();
console.log(`You have ${tasks.length} tasks`);
```

---

## Authentication

### Credentials (auto-login)

```typescript
const client = new TickTickClient({
  credentials: { username: 'you@example.com', password: 'password' },
});
// Automatically logs in on first API call and re-authenticates on session expiry.
```

### Session Stores

| Store | Use case |
|-------|----------|
| `FileSessionStore(path)` | CLI tools, scripts &mdash; persists to disk |
| `MemorySessionStore()` | Short-lived processes, tests |
| Custom `TickTickSessionStore` | Implement `load()`, `save()`, `delete()` for any backend |

```typescript
// File-based (recommended for scripts)
import { FileSessionStore } from 'ticktick-client';
const client = new TickTickClient({
  credentials: { username: '...', password: '...' },
  sessionStore: new FileSessionStore('./.ticktick-session.json'),
});

// Pre-loaded session (no credentials needed)
const client = new TickTickClient({
  session: existingSessionObject,
});
```

---

## API Reference

### Tasks

```typescript
// List all active tasks
const tasks = await client.tasks.list();

// Create
const task = await client.tasks.create({
  title: 'Buy groceries',
  projectId: 'inbox123',
  priority: 3,          // 0=none, 1=low, 3=medium, 5=high
  dueDate: '2026-12-31T00:00:00.000Z',
  tags: ['shopping'],
});

// Update
await client.tasks.update({
  id: task.id,
  projectId: task.projectId,
  title: 'Buy organic groceries',
  priority: 5,
});

// Complete / Delete
await client.tasks.complete(task.projectId, task.id);
await client.tasks.delete(task.projectId, task.id);

// Batch operations
await client.tasks.createMany([
  { title: 'Task A', projectId },
  { title: 'Task B', projectId },
]);
await client.tasks.updateMany([
  { id: 'id1', projectId, priority: 5 },
  { id: 'id2', projectId, priority: 3 },
]);
await client.tasks.deleteMany([
  { taskId: 'id1', projectId },
  { taskId: 'id2', projectId },
]);
```

#### Moving Tasks Between Projects

> **Important:** The TickTick REST API does not support native task moves. This library uses a copy+delete strategy &mdash; **the task ID will change**. Use the returned `previousId` to update any references.

```typescript
const result = await client.tasks.move({
  taskId: 'old-id',
  fromProjectId: 'project-a',
  toProjectId: 'project-b',
});
console.log(result.previousId); // 'old-id'
console.log(result.task.id);    // new server-assigned ID
console.log(result.task.projectId); // 'project-b'

// Batch move with ID mapping
const results = await client.tasks.moveMany([
  { taskId: 't1', fromProjectId: 'a', toProjectId: 'b' },
  { taskId: 't2', fromProjectId: 'a', toProjectId: 'b' },
]);
for (const r of results) {
  console.log(`${r.previousId} -> ${r.task.id}`);
}
```

#### Subtasks, Pinning, Recurring

```typescript
// Subtask
await client.tasks.createSubtask(parentTask.id, projectId, {
  title: 'Sub-item',
});

// Pin / Unpin
await client.tasks.pin(task.id, projectId);
await client.tasks.unpin(task.id, projectId);

// Recurring task
await client.tasks.create({
  title: 'Weekly review',
  projectId,
  repeatFlag: 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=FR',
});
```

#### Completed Tasks (Paginated)

```typescript
// Single page
const completed = await client.tasks.listCompleted({ projectId, limit: 50 });

// Auto-paginated async iterator
for await (const page of client.tasks.iterateCompleted()) {
  for (const task of page) {
    console.log(task.title, task.completedTime);
  }
}
```

### Projects

```typescript
const projects = await client.projects.list();

const project = await client.projects.create({
  name: 'Work',
  color: '#ff6348',
  kind: 'TASK',           // 'TASK' | 'NOTE'
  viewMode: 'kanban',     // 'list' | 'kanban' | 'timeline'
});

await client.projects.update({ id: project.id, name: 'Work 2026' });
await client.projects.delete(project.id);
await client.projects.deleteMany([id1, id2]);

// Kanban columns
const columns = await client.projects.listColumns(project.id);
```

### Kanban Columns

For a project in `viewMode: 'kanban'`, you can create and rename/reorder
columns (a.k.a. sections / kanban swimlanes).

```typescript
// Project must be in kanban view for columns to surface in the UI
const project = await client.projects.create({
  name: 'Sprint board',
  viewMode: 'kanban',
});

// Create a column
const col = await client.projects.createColumn(project.id, {
  name: 'To Do',
  sortOrder: 0,
});

// Place a task in it
await client.tasks.create({
  title: 'Write the docs',
  projectId: project.id,
  columnId: col.id,
});

// Rename and/or reorder
await client.projects.updateColumn({
  id: col.id,
  projectId: project.id,           // REQUIRED — server silently no-ops without it
  name: 'In Progress',
  sortOrder: 1,
});

// Partial update: name only (sortOrder preserved)
await client.projects.updateColumn({
  id: col.id,
  projectId: project.id,
  name: 'Doing',
});

// List columns on the project
const cols = await client.projects.listColumns(project.id);

// Delete a column (tasks in it keep a dangling columnId; UI shows them as uncategorized)
await client.projects.deleteColumn(project.id, col.id);
```

> **`projectId` is required on every `updateColumn` payload.** TickTick's
> `POST /api/v2/column` endpoint silently drops the update (returns 200
> with empty `id2etag`) if the update item omits `projectId`. The
> TypeScript type enforces this AND the implementation throws an actionable
> runtime error if you bypass the type (e.g. via `as any`). The requirement
> was discovered empirically — see `Plans/kanban-columns-probe.md`.

> **Wire-shape gotcha on delete:** `POST /api/v2/column` body for delete
> uses the key **`columnId`** (not `id`) on the delete item:
> `{delete: [{columnId, projectId}]}`. Sending `{delete: [id-string]}` or
> `{delete: [{id, projectId}]}` returns server 500 `unknown_exception` —
> the bug is the field name, not the endpoint. This was discovered after
> six API-only probe rounds via an Interceptor capture of the TickTick
> web UI's actual delete request.

### Folders (Project Groups)

TickTick supports **one level** of folder nesting — projects can live
inside a folder; folders cannot live inside other folders. The server
calls them `projectGroup`; the UI calls them "folder."

```typescript
// Create a folder
const folder = await client.projectGroups.create({ name: 'Work' });

// List folders
const folders = await client.projectGroups.list();

// Create a project nested inside the folder
const project = await client.projects.create({
  name: 'Q3 planning',
  groupId: folder.id,
});

// Move an existing project into a folder
await client.projects.update({ id: project.id, groupId: folder.id });

// Unparent a project (move back to top level)
await client.projects.update({ id: project.id, groupId: null });

// Rename / reorder a folder
await client.projectGroups.update({ id: folder.id, name: 'Work 2026' });
await client.projectGroups.update({ id: folder.id, sortOrder: -1 });

// Delete a folder
await client.projectGroups.delete(folder.id);
await client.projectGroups.deleteMany([id1, id2]);
```

> **Wire detail:** the V2 batch/project endpoint does NOT accept JSON
> `null` to clear `groupId` — it accepts the literal string `"NONE"`.
> This library translates caller-side `null` to `"NONE"` on the wire so
> the universal partial-update contract is preserved at the public API
> boundary. You always write `groupId: null` to unparent.

> **Folder delete is non-cascading.** Deleting a folder while child
> projects still reference it leaves those projects with a `groupId`
> pointing at the now-deleted folder. If you care about clean state,
> unparent the children first.

### Activity Feed (Premium)

Fetch the activity feed / history of changes for a task or project.
This is TickTick's Premium "View previous changes" feature — the
library is the first OSS client to wrap these endpoints (wire shape
captured empirically; full trail in `Plans/activity-probe.md`).

```typescript
// Events for a single task (newest first)
const taskEvents = await client.activity.listForTask(taskId);
//
// Each event has at minimum {id, action, when, deviceChannel, whoProfile};
// optionally {name, description, content, kind, taskIds} depending on action.
// action is a discriminator like 'T_CREATE' / 'T_TITLE' / 'T_CONTENT' /
// 'T_DONE' / 'T_CANCEL' / 'P_CREATE' / 'P_TITLE' / 'P_ADD_COLUMN' / etc.

// Events for an entire project
const projectEvents = await client.activity.listForProject(projectId);

// Pagination — pass the last event's id as `lastId` and the running
// count as `skip`. Server returns an empty array when exhausted.
const first = await client.activity.listForTask(taskId);
const next  = await client.activity.listForTask(taskId, {
  skip: first.length,
  lastId: first[first.length - 1]?.id,
});

// Caller-side filter (no server-side filter exists)
const titleChanges = taskEvents.filter((e) => e.action === 'T_TITLE');
```

> **Premium-only.** Non-Premium accounts will receive a 4xx response from
> the underlying endpoint. The library does not catch or mask that — your
> caller should handle the API error.

> **V1 path.** These endpoints live on `/api/v1/...` rather than V2 —
> activity is one of the few surfaces the library exposes via the older
> path because that is what the TickTick web UI itself hits.

### Tags

```typescript
const tags = await client.tags.list();

await client.tags.create({ name: 'urgent', label: 'urgent', color: '#ff0000' });
await client.tags.createMany([
  { name: 'work', label: 'work' },
  { name: 'personal', label: 'personal' },
]);
await client.tags.update({ name: 'work', color: '#0000ff' });
await client.tags.rename('work', 'office');
await client.tags.merge('office', 'personal'); // merge office into personal
await client.tags.delete('personal');
await client.tags.deleteMany(['tag1', 'tag2']);
```

### Habits

```typescript
const habits = await client.habits.list();

await client.habits.create({
  name: 'Exercise',
  repeatRule: 'FREQ=DAILY',
  goal: 1,
  step: 1,
  unit: 'times',
  type: 'boolean',
  recordEnable: false,
  color: '#FF6B6B',
});

await client.habits.update({ id: habit.id, name: 'Morning Exercise' });

// Check in
await client.habits.upsertCheckin({
  habitId: habit.id,
  date: new Date(),
  goal: 1,
  value: 1,
  status: 'done', // 'done' | 'undone' | 'unlabeled'
});

// Query check-ins for a date range
const checkins = await client.habits.getCheckins(
  [habit.id],
  '2026-04-01',
  '2026-04-07',
);

// Weekly completion stats
const weekStats = await client.habits.getWeekStats();

await client.habits.delete(habit.id);
await client.habits.deleteMany([id1, id2]);
```

### Focus (Pomodoro)

```typescript
// Start a focus session
await client.focus.start({
  duration: 25,           // minutes
  focusOnTitle: 'Deep work',
  focusOnId: taskId,      // optional: link to a task
});

// Session lifecycle
await client.focus.pause();
await client.focus.resume();
await client.focus.finish(); // complete the pomodoro
await client.focus.stop();   // abandon (drop) the session

// Local state management (no network calls)
const state = client.focus.getState();
// { status: 'running' | 'paused' | 'idle' | null, focusId, duration, pomoCount, ... }
client.focus.resetState();

// Sync state from server
const remote = await client.focus.syncState();

// Analytics
const overview = await client.focus.getOverview();
// { todayPomoCount, todayPomoDuration, totalPomoCount, totalPomoDuration }

const timeline = await client.focus.getTimeline('2026-04-01', '2026-04-07');
// [{ id, startTime, endTime, status, pauseDuration, type }]

const timing = await client.focus.getTiming('2026-04-01', '2026-04-07');
```

### Statistics

```typescript
const ranking = await client.statistics.getRanking();
// { ranking, taskCount, projectCount, dayCount, completedCount, score, level }

const completed = await client.statistics.listCompleted(
  '2026-04-01 00:00:00',
  '2026-04-07 23:59:59',
  100, // limit
);
```

### Countdowns

```typescript
const countdowns = await client.countdowns.list();

await client.countdowns.create({
  name: 'Product Launch',
  date: new Date('2026-12-31'),
  type: 'countdown',  // 'countdown' | 'anniversary' | 'birthday' | 'holiday'
  color: '#ff6348',
});

await client.countdowns.update({ id: countdown.id, name: 'Big Launch Day' });
await client.countdowns.delete(countdown.id);
```

### User

```typescript
const profile = await client.user.getProfile();
// { username, email, displayName, picture, locale, ... }

const status = await client.user.getStatus();
// { userId, username, pro, teamPro, proEndDate, inboxId, ... }
```

---

## Semantic Helpers

Utility functions for converting between human-readable labels and TickTick's numeric codes:

```typescript
import {
  parseTaskPriority, formatTaskPriority,
  parseTaskStatus, formatTaskStatus,
  parseHabitStatus, formatHabitStatus,
  parseCheckinStatus, formatCheckinStatus,
} from 'ticktick-client';

parseTaskPriority('medium');   // 3
formatTaskPriority(5);         // 'high'

parseTaskStatus('completed');  // 2
formatTaskStatus(0);           // 'open'

parseHabitStatus('archived');  // 1
formatHabitStatus(0);          // 'normal'

parseCheckinStatus('done');    // 2
formatCheckinStatus(1);        // 'undone'
```

### Reminder TRIGGER (RFC 5545 §3.8.6.3)

```typescript
import { parseReminderTrigger, formatReminderTrigger } from 'ticktick-client';

formatReminderTrigger({ at: 'due' });           // 'TRIGGER:PT0S'
formatReminderTrigger({ before: { minutes: 15 } });  // 'TRIGGER:-PT15M'
formatReminderTrigger({ before: '15m' });       // 'TRIGGER:-PT15M' (shorthand)
formatReminderTrigger({ before: '1d 9h' });     // 'TRIGGER:-P1DT9H'
formatReminderTrigger({ before: { weeks: 2 } });     // 'TRIGGER:-P2W'
formatReminderTrigger({ after: { minutes: 30 } });   // 'TRIGGER:PT30M'

parseReminderTrigger('TRIGGER:PT0S');           // { at: 'due' }
parseReminderTrigger('TRIGGER:-P0DT9H0M0S');    // { before: { hours: 9 } } — zero fields dropped
parseReminderTrigger('TRIGGER:-P1DT9H');        // { before: { days: 1, hours: 9 } }
parseReminderTrigger('TRIGGER:PT30M');          // { after: { minutes: 30 } }
parseReminderTrigger('garbage');                // undefined
```

Reminders set through the official TickTick client (web, mobile, desktop) round-trip cleanly through `parseReminderTrigger` &mdash; iterate them on `task.reminders` (each entry is `{ id, trigger }`):

```typescript
const tasks = await client.tasks.list();
for (const t of tasks) {
  for (const rem of t.reminders ?? []) {
    console.log(rem.trigger, '→', parseReminderTrigger(rem.trigger));
  }
}
```

**Note:** The V2 wire format for *setting* reminders is pending HAR capture &mdash; see [#2](https://github.com/MHoroszowski/ticktick-client/issues/2) and [#3](https://github.com/MHoroszowski/ticktick-client/issues/3). The helpers above produce RFC 5545 strings that callers can use directly once that lands.

---

## Known Limitations

These are confirmed TickTick server-side issues, verified via Playwright network capture on 2026-04-07.

### Task Move Changes ID ([#32](https://github.com/jaeyeonling/ticktick-client/issues/32))

The REST API has no endpoint for moving tasks between projects. `move()` and `moveMany()` use a copy+delete strategy. **The task receives a new ID.** Use `result.previousId` to track the mapping.

Tested approaches that failed:
- `POST /api/v3/batch/taskProject` &rarr; 404
- `POST /api/v2/task/{id}` with new `projectId` &rarr; 200 but no actual change

### Trash Listing Broken ([#33](https://github.com/jaeyeonling/ticktick-client/issues/33))

`listTrash()` calls `GET /api/v2/project/{id}/tasks?status=-1`, but the status filter is **ignored** server-side. Deleted tasks are not retrievable via any known REST endpoint. `restore()` works if you already know the task ID.

### Focus Analytics Endpoints Return 500 ([#31](https://github.com/jaeyeonling/ticktick-client/issues/31))

`getHeatmap()`, `getHourDistribution()`, and `getDistribution()` always return HTTP 500 regardless of parameters or account data. All other focus endpoints (timeline, overview, timing, session control) work correctly.

---

## Architecture

```
ticktick-client/
  src/
    client.ts          # TickTickClient — auth, HTTP, session management
    modules/
      tasks.ts         # TasksModule — CRUD, batch, move, subtasks, pin, trash
      projects.ts      # ProjectsModule — CRUD, columns
      tags.ts          # TagsModule — CRUD, rename, merge
      habits.ts        # HabitsModule — CRUD, check-ins, weekly stats
      focus.ts         # FocusModule — session control, analytics, state
      statistics.ts    # StatisticsModule — ranking, completed list
      countdowns.ts    # CountdownsModule — CRUD
      user.ts          # UserModule — profile, status
    types.ts           # All TypeScript type definitions
    errors.ts          # TickTickError, TickTickAuthError, TickTickApiError
    semantic.ts        # Human-readable label converters
    session-store.ts   # FileSessionStore, MemorySessionStore
    internal/
      ids.ts           # ObjectId generator
      cookies.ts       # Cookie parsing/serialization
```

---

## Development

```bash
npm install           # install dependencies
npm test              # run unit tests (vitest)
npm run lint          # type check (tsc --noEmit)
npm run build         # build ESM + CJS + DTS (tsup)

# Integration test against real API (requires .ticktick-session.json)
npx tsx scripts/integration-test.ts

# Capture real API traffic via Playwright
npx tsx scripts/capture-all-issues.ts
```

---

## License

[MIT](LICENSE)
