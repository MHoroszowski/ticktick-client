# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **MCP parity with the fork's modules.** The merged-in MCP server (see
  0.4.0) was built against upstream's module surface and did not expose
  anything this fork added after the fork point. All 11 missing methods
  are now wired up, taking the tool count from 41 to 52.
  - `list_project_groups`, `create_project_group`, `update_project_group`,
    `delete_project_group`, `delete_project_groups` — new
    `src/mcp/tools/project-groups.ts`.
  - `list_task_activity`, `list_project_activity` — new
    `src/mcp/tools/activity.ts`. Both carry the Premium-only caveat and
    the `{skip, lastId}` pagination contract in their descriptions.
  - `create_column`, `update_column`, `delete_column` — added to the
    projects registry. Descriptions carry the two empirical gotchas: the
    project must be in kanban view, and `update_column` requires
    `projectId` or the server silently no-ops.
  - `set_task_reminders`, plus a `reminders` field on `create_task` and
    `update_task`.
  - `create_project` / `update_project` now accept `groupId`, so an agent
    can actually file a project into a folder it just created.

- **Agent-facing reminder shape** (`src/mcp/reminder-input.ts`). MCP
  callers pass `{"at":"due"}`, `{"before":"15m"}`, `{"after":"1h"}`, or
  `{"trigger":"TRIGGER:-PT15M"}` as an escape hatch; the layer converts
  via `formatReminderTrigger`. Raw RFC 5545 is precise but hostile to
  compose from a prompt, and a malformed duration now returns a
  correctable error naming the offending index rather than silently
  dropping the reminder.

### Fixed

- **`update_project` required `name`.** The 0.3.0 partial-update
  unification made it optional on `projects.update`, but the MCP schema
  still demanded it, forcing callers to re-supply the name to change a
  color. Now optional, matching the client contract.
- **Explicit `null` was unreachable through MCP.** Every schema field was
  `.optional()` and never `.nullable()`, so the "pass null to clear" half
  of the partial-update contract could not be expressed at all — no
  clearing a `dueDate`, `columnId`, `assignee`, tag `parent`, or project
  `groupId`. The fields the client types declare as `T | null` are now
  `.nullable()`. The omit-to-preserve half was already correct via
  `stripUndefined`.
- Dropped a stale `as typeof cleaned & { title: string }` cast in
  `update_task`, left over from the pre-0.3.0 signature when `title` was
  required.

### Tests

- `tests/mcp/tools.test.ts` asserts the exact 52-tool roster, that every
  non-identifier field on an update tool is omittable, and that every
  clearable field accepts `null` — the drift this release fixes is
  exactly what these guard against.
- `tests/mcp/reminder-input.test.ts` covers the trigger conversion and
  its error paths.

## [0.4.0] - 2026-08-11

Merges `upstream/main` (jaeyeonling/ticktick-client) at `b579e3f` into the
fork. Upstream also published a `0.3.0` — an unrelated release carrying only
the MCP server below. Because this fork had already released its own `0.3.0`
(project groups + the partial-update contract), the two lines are reconciled
here at `0.4.0`; upstream's `v0.3.0` tag is deliberately not adopted.

### Added

- **MCP server (merged from upstream #37).** New `src/mcp/` entry point
  exposing the client over the Model Context Protocol, shipped as a
  `ticktick-mcp` binary (`dist/mcp/index.js`).
  - Tool wrappers for tasks, projects, tags, habits, focus, countdowns,
    statistics, and user.
  - Adds runtime dependencies `@modelcontextprotocol/sdk` and `zod` — the
    library itself remains dependency-free for non-MCP consumers; both are
    only reachable through the `ticktick-mcp` entry point.
  - `tsup` now emits two bundles: the library (ESM + CJS + types) and the
    MCP binary (ESM, with shebang).
  - **Fork note:** the upstream tool wrappers predate this fork's modules —
    they do not yet surface `projectGroups`, `activity`, kanban column CRUD,
    or reminders. Wiring those in is follow-up work.

- **Reminder write-path (epic #59 — sub-issues #2 + #3 closed).** HAR
  capture against the official TickTick web client revealed the V2 wire
  shape — reminders ride through `POST /api/v2/batch/task` (the V2 batch
  sync envelope) with full read-modify-merge-write semantics, not the
  partial-update endpoint. See `Plans/reminders-har-capture-raw.json`
  for the wire reference.
  - New `tasks.setReminders(projectId, taskId, reminders | null)`
    replaces the full reminders array on a task; pass `null` to clear.
    Accepts string triggers (library generates the server-stable `id`)
    or full `{id, trigger}` objects (preserves ids on round-trips).
  - `tasks.create({..., reminder | reminders})` now ships reminders on
    create. Single sugar field `reminder?: string | null` collapses to
    a one-element array internally; `reminders?: readonly (string |
    TickTickReminder)[] | null` accepts the canonical form. Implementation
    is two HTTP calls under the hood (plain create → setReminders) to
    match the official client.
  - `tasks.update({..., reminder | reminders})` re-routes the entire
    partial update through the batch endpoint when reminder fields are
    in the payload, so title + reminders can land in one caller-facing
    call. Non-reminder updates stay on the existing partial-update path.
  - **`reminders` wins on conflict.** If both `reminder` and `reminders`
    are set, the array form is used and the scalar is silently dropped.
  - Wire detail: scalar `reminder` is always sent as `null` on the wire
    (matches the official client; the server populates the scalar from
    the array). Etag carried from a fresh `tasks.list()` read for
    optimistic concurrency.

  Sub-issue [#5](https://github.com/MHoroszowski/ticktick-client/issues/5)
  (location/geofence reminders) is mobile-only — TickTick's web UI
  doesn't expose them — and is spun out as a separate iOS HAR-capture
  cycle. Epic [#59](https://github.com/MHoroszowski/ticktick-client/issues/59)
  stays open until that lands.

- **Reminder semantic helpers + readback typing (epic #59 — sub-issue #4).**
  RFC 5545 §3.8.6.3 `TRIGGER` parse + format helpers shipped (#4 closed)
  in the prior cycle; readback typing on `TickTickTask` carries
  `reminder?: string` + `reminders?: readonly TickTickReminder[]`.
  This release's write-path makes the helpers useful end-to-end —
  compose triggers with `formatReminderTrigger({ before: '15m' })` and
  attach via `tasks.setReminders`.
  - `parseReminderTrigger(trigger: string)` → `{ at: 'due' } | { before: ReminderDuration } | { after: ReminderDuration } | undefined`. Drops zero-valued fields on parse (e.g. `"TRIGGER:-P0DT9H0M0S"` → `{ before: { hours: 9 } }`).
  - `formatReminderTrigger(input)` → RFC 5545 string. Accepts both
    structured `{ minutes: 15 }` and shorthand `'15m'` / `'1d 9h'`
    durations on `before`/`after`. Returns `undefined` for empty / all-zero
    / malformed input.
  - New types: `TickTickReminder` (`{ id, trigger }` readback shape),
    `ReminderTrigger`, `ReminderTriggerInput`, `ReminderDuration`.
  - `TickTickTask` readback now carries `reminder?: string` and
    `reminders?: readonly TickTickReminder[]` — reminders set through
    the official TickTick clients surface correctly via `tasks.list()`
    and friends; lossless decode via `parseReminderTrigger`.
  - **Out of scope this release:** sub-issue
    [#5](https://github.com/MHoroszowski/ticktick-client/issues/5)
    (location/geofence reminders) — explicitly deferred; needs separate
    HAR capture.
  - **Helper status note:** `formatReminderTrigger` produces RFC 5545
    trigger strings that callers cannot yet attach to tasks via this
    SDK (write-path pending). Helpers are immediately useful for (a)
    decoding existing reminders, (b) any V1/OAuth integration that
    speaks the same TRIGGER format, and (c) zero-friction adoption once
    the write path lands.

- **`ActivityModule` — activity feed / history.** New top-level module
  `client.activity` exposing the two endpoints the TickTick Premium web
  UI uses for its "View previous changes" feature. Closes fork epic #66
  and both sub-stories #57 and #58.
  - `client.activity.listForTask(taskId, {skip?, lastId?})` — fetches
    activity events for a single task. Hits `GET /api/v1/task/activity/{taskId}`.
  - `client.activity.listForProject(projectId, {skip?, lastId?})` — fetches
    activity events for a project. Hits `GET /api/v1/project/{projectId}/activity`
    (note the asymmetric URL shape vs the task endpoint — id position differs).
  - Pagination via `{skip, lastId}` — pass the last event's `id` as
    `lastId` and the running count as `skip` to fetch the next page.
    Server returns an empty array when the feed is exhausted.
  - New types: `TickTickActivityEvent`, `TickTickActivityAction`,
    `TickTickActivityActor`, `TickTickActivityDeviceChannel`,
    `TickTickActivityPaginationParams`.
  - **Premium-only.** Non-Premium accounts will receive a 4xx response.
  - **V1 path.** Activity is one of the few endpoints the library exposes
    via `/api/v1/...` rather than V2 — that is what the web UI hits.
  - **First OSS implementation.** No public TickTick client (`ticktick-py`,
    `n8n-nodes-ticktick`, the various MCP servers) had documented these
    endpoints. Wire shape captured empirically via Interceptor on
    2026-05-28; full discovery trail in `Plans/activity-probe.md`.

### Added

- **Kanban column CRUD on `ProjectsModule` — full create / update / delete.**
  Closes fork epic #70 and all three sub-stories #13, #14, #15.
  - `client.projects.createColumn(projectId, {name, sortOrder?})` — creates
    a kanban column and returns a `TickTickColumn` with a client-generated
    24-hex ObjectID. Project must be in `viewMode: "kanban"` for the
    column to surface in the UI.
  - `client.projects.updateColumn({id, projectId, name?, sortOrder?})` —
    rename and/or reorder. Partial-update contract honored: omit a field
    to preserve it. **`projectId` is required on every update payload** —
    TickTick's server silently drops the change otherwise (returns 200
    with empty `id2etag`). The TypeScript type enforces this; the
    implementation also throws an actionable runtime error.
  - `client.projects.deleteColumn(projectId, columnId)` — removes a kanban
    column. Tasks that referenced the deleted columnId keep the dangling
    reference (non-cascading; same behavior as folder-delete); the TickTick
    UI treats those tasks as "uncategorized" in the kanban view. Reassign
    tasks via `tasks.update({id, projectId, columnId: <other>})` first if
    clean state matters.
  - **Wire-shape gotcha — delete uses `columnId`, not `id`.** The delete
    item key on the wire is `{columnId, projectId}` rather than the
    `{id, projectId}` shape that create and update use. Sending
    `{delete:[id-string]}` or `{delete:[{id, projectId}]}` returns server
    500 `unknown_exception` — discovered after six rounds of API-only
    probing before an Interceptor capture of the TickTick web UI's actual
    delete request revealed the field-name difference. Full discovery
    trail in `Plans/kanban-columns-probe.md`.
  - New types: `TickTickColumnDraft`, `TickTickColumnUpdate`.

## [0.3.0] - 2026-05-27

### Added

- **`ProjectGroupsModule` — folders / nested projects.** New top-level
  module `client.projectGroups` with `create`, `update`, `delete`,
  `deleteMany`, and `list` methods. Folders are TickTick's one-level
  container for projects; the server calls them "projectGroups" and the
  UI calls them "folders" — this library uses the server name everywhere.
  - `client.projectGroups.create({name})` — create a folder; returns
    `{id, name, sortOrder}`.
  - `client.projectGroups.list()` — derives `projectGroups[]` from
    `GET /api/v2/batch/check/0` (no dedicated list endpoint exists).
  - `client.projectGroups.update({id, ...partial})` — partial update,
    same contract as every other `update` method in the library.
  - `client.projectGroups.delete(id)` / `.deleteMany(ids)`.
  - New types: `TickTickProjectGroup`, `TickTickProjectGroupDraft`,
    `TickTickProjectGroupUpdate`.
- **`groupId` on `TickTickProject` and `TickTickProjectDraft`.** Pass
  `groupId: "<folder-id>"` to `projects.create` or `projects.update`
  to nest a project inside a folder. Pass `groupId: null` to unparent.
  - **Wire detail:** the V2 batch/project endpoint does NOT accept JSON
    `null` to clear `groupId` — it accepts the literal string `"NONE"`.
    The library translates caller-side `null` to `"NONE"` on the wire
    so the universal partial-update contract is preserved at the public
    API boundary. Verified empirically on 2026-05-27 against the test
    account; see `Plans/nested-projects-probe.md` for the wire capture.
  - **Folder delete leaves orphans.** Deleting a folder while child
    projects exist leaves those projects with a `groupId` referencing
    the now-deleted folder. The library does not clean this up; callers
    that care should unparent children first.

### Changed

- **Unified partial-update contract across every `update` method.** A
  new shared helper `internal/partial-update.ts` `buildPartialUpdateBody`
  is now applied uniformly by `tasks.update`, `tasks.updateMany`,
  `tasks.create`, `tasks.createMany`, `projects.update`, `tags.update`,
  `habits.update`, and `countdowns.update`. The contract is identical
  everywhere:
  - **Omit a key** (or pass `undefined`) → field is excluded from the
    API request body → TickTick preserves the current value.
  - **Pass a value** (incl. `0`, `""`, `false`) → field is sent with
    that value → TickTick updates to that value.
  - **Pass explicit `null`** → field is sent as `null` → TickTick
    clears the field (where the type and server permit it; see below).

  Previously each `update` method passed caller params straight to
  `JSON.stringify`, so any caller that built payloads from generic
  kwargs (notably MCP-style dispatchers with default `None` values)
  silently shipped clearing nulls for fields the user never mentioned.
  The shared helper strips `undefined` only, leaving explicit-null
  intent intact.
- `TickTickTaskUpdate` now wraps `TickTickTaskDraft` in `Partial<>`, so
  only `id` and `projectId` are required.
- `projects.update` parameter type is now `Partial<TickTickProjectDraft>
  & { id: string }` (was `TickTickProjectDraft & { id: string }`), so
  callers can update color/kind/viewMode without re-supplying `name`.
- `tags.update` parameter type is now `Partial<TickTickTagDraft> & {
  name: string }` (was `TickTickTagDraft`), so callers can update
  label/color/parent without re-supplying every field.
- `focus.start` now uses `!== undefined` instead of `&&` truthy checks
  for `focusOnId` and `note`, matching the guard pattern already used
  for `focusOnTitle` and `manual`. Empty-string `focusOnId` or `note`
  are now correctly forwarded rather than silently dropped.

### Caller guidance

Callers that build payloads from generic kwargs (MCP servers, dynamic
dispatchers) MUST distinguish "user didn't mention this field" from
"user wants this field cleared" before calling any `update` method.
Use a sentinel default (e.g. Python `class _Unset: ...; UNSET =
_Unset()`) and only forward kwargs whose value is not the sentinel.
Bare `None` defaults will reach this library as `null` and WILL clear
the field — that is intentional given the contract above.

The TypeScript types only mark fields as `string | null` where the
upstream `TickTick<T>` shape declares them nullable (e.g. task
`dueDate`/`startDate`, tag `parent`). Other fields like project
`color` or habit `iconRes` are typed as non-null even though the
runtime helper would forward an explicit `null` for them — clearing
those fields requires a runtime cast and is not part of the typed
contract.

## [0.2.2] - 2026-04-13

### Added

- `projects.listMembers(projectId)` — list shared-project members via `/api/v2/project/{id}/users` (#35)
- `assignee` and `creator` fields on `TickTickTask` for shared-project attribution (#35)
- `assignee` and `columnId` fields on `TickTickTaskDraft` for task creation (#35)
- `TickTickProjectMember` type exported from package (#35)

### Fixed

- `projects.listColumns()` now correctly unwraps the `{update: [...]}` envelope the API returns (#35)
- `projects.listColumns(projectId)` applies client-side filtering since the server ignores the projectId parameter (#35)

## [0.2.0] - 2026-04-07

### Added

- `CountdownsModule` — list, create, update, delete countdowns (#25)
- `StatisticsModule` — getRanking, listCompleted with date range (#23, #24)
- `UserModule` — getProfile, getStatus (#18)
- `FocusModule` — start, pause, resume, finish, stop, getTimeline, getOverview, getTiming, getState, syncState (#20, #21, #22)
- `HabitsModule` — create, update, delete, upsertCheckin, getCheckins, getWeekStats (#15, #16, #17)
- `TagsModule` — create, createMany, update, delete, deleteMany, rename, merge (#12, #13, #14)
- `ProjectsModule` — create, update, delete, deleteMany, listColumns (#10, #11)
- `TasksModule` — batch create/update/delete, move with `TickTickMoveResult`, subtask, pin/unpin, RRULE repeat, trash, iterateCompleted (#3–#9)
- Semantic helpers: parseTaskPriority, formatTaskPriority, parseTaskStatus, formatTaskStatus, parseHabitStatus, formatHabitStatus, parseCheckinStatus, formatCheckinStatus
- `MemorySessionStore` and `FileSessionStore` for session persistence
- Auto re-authentication on 401/403 responses
- Playwright-based API traffic capture script for endpoint verification
- Comprehensive README with feature coverage table and known limitations

### Fixed

- Focus analytics endpoints (heatmap, hourDistribution, distribution) documented as confirmed server-side 500 (#31)
- Task move returns `TickTickMoveResult` with `previousId` for ID tracking (#32)
- listTrash documented as non-functional — server ignores status filter (#33)
- Focus pause/resume/finish verified against real API with full lifecycle test (#34)

## [0.1.0] - 2026-04-07

### Added

- Initial project setup with core `TickTickClient`
- `TasksModule` — list, get, create, update, delete
- `ProjectsModule` — list, get
- `TagsModule` — list
- `HabitsModule` — list, getCheckins
- `FocusModule` — getTimeline
- `StatisticsModule` — getSummary
- Cookie-based session management
- ESM + CJS dual build via tsup
- Vitest test suite
