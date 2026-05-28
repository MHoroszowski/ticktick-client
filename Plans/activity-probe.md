# Activity Feed & History — Wire Discovery

Captured: 2026-05-28 (probe set up 2026-05-27)
Test account: doma.spirita@gmail.com (Premium, valid through 2027-01-15)
Discovery: Interceptor UI capture of the TickTick web app's task-history view, plus follow-up API probes for the project-scoped endpoint shape.

## Wire shape — confirmed

| Operation | Method | Path | Response |
|-----------|--------|------|----------|
| **List activity for a task** | GET | `/api/v1/task/activity/{taskId}` | `TickTickActivityEvent[]` (bare array, no envelope) |
| **List activity for a project** | GET | `/api/v1/project/{projectId}/activity` | `TickTickActivityEvent[]` (bare array, no envelope) |
| Pagination (both) | — | `?skip=N&lastId=<lastEventId>` | next page of events, empty array when exhausted |

### Notes on the URL shape

- **The path is `/api/v1/`**, not the V2 path the rest of the library uses. Activity is one of the few endpoints TickTick exposes through the older V1 surface.
- **Task vs project URL shape is asymmetric:** task-activity is `/task/activity/{id}`, project-activity is `/project/{id}/activity`. The library smooths this over — both methods take `(id)` and route to the correct path internally.
- Pagination is **`skip` (offset)** plus **`lastId` (cursor)**. The web UI sends both on every paginated call; the server seems to use `lastId` as the stable cursor and `skip` as a hint for the index counter the UI shows. Sending just `skip` without `lastId` was not tested; the library always sends both when paginating.

## Event shape (`TickTickActivityEvent`)

Required fields (observed on every event):

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `id` | string | `"6a17614d8f086bdeacf63fa6"` | Server-assigned event id (24-hex ObjectID). Pass as `lastId` when paginating. |
| `action` | string | `"T_CONTENT"` | Event type discriminator (see action enum below). |
| `when` | string | `"2026-05-27T21:25:33.360+0000"` | ISO timestamp with timezone offset. |
| `deviceChannel` | string | `"web"` | Originating client (also `"ios"`, `"android"`, etc.). |
| `whoProfile` | object | `{isMyself: true}` | Actor info. At minimum `{isMyself: boolean}`; for actions by other users this object likely carries more fields (userId / displayName / avatar) — not observable on personal projects. |

Optional fields (action-dependent):

| Field | Type | When it appears |
|-------|------|-----------------|
| `name` | string | `P_CREATE`, `P_ADD_COLUMN` — the resource name at the time of the event |
| `description` | string | `T_CREATE` — the task description / project context |
| `content` | string | `T_CONTENT` — the new content / notes value |
| `kind` | string | `T_CONTENT` (`"TEXT"`); other kinds likely exist for non-text content |
| `taskIds` | string[] | `T_CREATE`, `T_DONE`, `T_CANCEL` — one or more task ids the event affects |

## Action enum (observed)

| Action | Meaning |
|--------|---------|
| `T_CREATE` | Task created |
| `T_TITLE` | Task title changed |
| `T_CONTENT` | Task notes / content changed |
| `T_DONE` | Task completed |
| `T_CANCEL` | Task abandoned / won't do |
| `P_CREATE` | Project created |
| `P_TITLE` | Project renamed |
| `P_ADD_COLUMN` | Kanban column added |
| `P_COLUMN_TITLE` | Kanban column renamed |
| `P_DEL_COLUMN` | Kanban column deleted |

More actions almost certainly exist (priority changes, due-date changes, assignee changes on shared projects, task moves, attachments, etc.). The library types `action` as `string` rather than a closed union so callers see the actual server values; the documented list above is the empirically-observed set as of 2026-05-28.

Naming pattern: `<RESOURCE>_<VERB>` — `T_*` for task-scoped events, `P_*` for project-scoped events. New entity types added by TickTick will presumably follow the same pattern (`C_*` for columns if they get their own scope, `H_*` for habits, etc.).

## Scope and account requirements

- **Premium-only.** The activity-feed feature is gated behind TickTick Premium. The test account is Premium (`pro: true` until 2027-01-15) so the endpoint returns 200 with data. Non-Premium accounts are expected to receive 402 / 403; not directly tested.
- **Personal projects work.** Issue #66 originally hypothesized the feature was "for shared projects only." The capture proves this wrong — the test account has zero shared projects and both task-activity and project-activity endpoints return events normally. Shared-project behavior likely adds richer `whoProfile` data for actions by other users.
- **No mutation surface.** Both endpoints are GET-only. Activity events are server-generated; callers cannot annotate, mark-read, or delete them.

## Sample captures

### Task activity (task `6a17614cbade157fd1809775`, after API rename + content add)

```json
[
  {
    "id": "6a17614d8f086bdeacf63fa6",
    "action": "T_CONTENT",
    "when": "2026-05-27T21:25:33.360+0000",
    "deviceChannel": "web",
    "content": "Notes added via API at 2026-05-27T21:25:33.257Z",
    "kind": "TEXT",
    "whoProfile": { "isMyself": true }
  },
  {
    "id": "6a17614d...",
    "action": "T_TITLE",
    "when": "2026-05-27T21:25:33.260+0000",
    "deviceChannel": "web",
    "whoProfile": { "isMyself": true }
  },
  ...
]
```

### Project activity (TEST project — first events of full history)

```json
[
  {
    "id": "69e289938f08f83a155d3f43",
    "action": "P_CREATE",
    "when": "2026-04-17T19:27:14.933+0000",
    "deviceChannel": "web",
    "name": "TEST - PAI Skill",
    "whoProfile": { "isMyself": true }
  },
  {
    "id": "69e2899d8f08e6e7458e180e",
    "action": "T_CREATE",
    "when": "2026-04-17T19:27:25.605+0000",
    "description": "v1.4 smoke probe",
    "deviceChannel": "web",
    "taskIds": ["69e2899d32e0f4772eb63e71"],
    "whoProfile": { "isMyself": true }
  },
  ...
]
```

## Discovery trail

| Step | What we did | Outcome |
|------|-------------|---------|
| 1 | Surveyed 13 OSS TickTick clients (lazeroffmichael/ticktick-py, liadgez/ticktick-mcp-server, hansdoebel/n8n-nodes-ticktick, jen6/ticktick-mcp, jacepark12/ticktick-mcp, shidhincr/LookUp, etc.) for activity/history/event endpoints | **Zero hits.** No public OSS prior art exists. |
| 2 | Confirmed test account is Premium via `client.user.getStatus()` | `pro: true` through 2027-01-15 |
| 3 | Set up a probe task on the TEST project; applied rename + priority bump + content add via API to seed events | task `6a17614cbade157fd1809775` created and modified |
| 4 | Cleared Interceptor passive net log + enabled CDP capture | armed |
| 5 | Asked Matthew to open the task's activity / history view in the TickTick web UI | events panel rendered |
| 6 | Inspected the captured network log | **`GET /api/v1/task/activity/{taskId}`** returned 200 + bare event array; pagination via `?skip=N&lastId=<id>` |
| 7 | Probed five guessed URL shapes for the project-scoped endpoint | **`GET /api/v1/project/{projectId}/activity`** worked on the second try; other four 404'd |
| 8 | Probed project-scoped pagination | same `?skip=N&lastId=<id>` pattern works; returns next page |

Lesson reinforced from the #70 cycle: when `needs: har-capture` is on the label list and OSS prior art doesn't exist, Interceptor UI capture closes the wire-shape gap in minutes. The first task-scoped endpoint dropped into the net log within seconds of the UI click; the second project-scoped endpoint was discovered in one extra API probe against five guessed URL shapes.
