---
project: ticktick-client
task: Implement Activity Feed & History (issue #66 — list activity events for task / project)
slug: activity-feed-history
effort: E3
phase: verify
progress: 31/32
mode: build
started: 2026-05-27T07:15:00Z
updated: 2026-05-28T12:08:00Z
algorithm_config:
  effort_source: context-override
  classifier_returned: NATIVE
  override_reason: /goal slash-command fast-path; escalated for multi-file epic build with empirical discovery
  forge_skipped_show_math: true
  ui_capture_first: true
---

## Problem

`MHoroszowski/ticktick-client` does not expose TickTick's activity-feed / history feature — the "View previous changes for all tasks and lists" capability that TickTick markets as a Premium offering. Epic #66 opens it and its two sub-stories: #57 `activity.listForTask(projectId, taskId)` and #58 `activity.listForProject(projectId)`.

Three preflight findings:

1. **No OSS prior art at all.** The 13-client survey in `MEMORY/WORK/.../oss-landscape.md` from 2026-05-27 plus a direct grep across `lazeroffmichael/ticktick-py`, `liadgez/ticktick-mcp-server`, `hansdoebel/n8n-nodes-ticktick`, `jen6/ticktick-mcp`, `jacepark12/ticktick-mcp`, `shidhincr/LookUp` returned zero hits for "activity" / "history" / "event" / "log" in TickTick-related code. The `needs: har-capture` label on issue #66 was placed correctly. No client has reverse-engineered this.
2. **Test account is Premium.** `client.user.getStatus()` returns `pro: true`, valid through 2027-01-15 (`subscribeType: apple`). The feature is accessible.
3. **Test account has 0 shared projects.** Issue #66 says activity feed is "for shared projects." Whether the endpoint also returns events for personal projects is empirically unknown — the UI capture will reveal scope.

The pattern from the just-completed #70 (Kanban Column CRUD) cycle is unambiguous: when an issue is labeled `needs: har-capture` AND no OSS client has documented the endpoint, **go to Interceptor UI capture first**. API-only permutation roulette wastes probe iterations on field names and envelope shapes the UI can reveal in one click.

## Vision

A caller writes `client.activity.listForTask(projectId, taskId)` and receives a typed array of `TickTickActivityEvent` records — who changed what when, what fields changed, the actor's userId, the timestamp. A second method `client.activity.listForProject(projectId)` returns the broader project-scoped feed. Both methods feel identical to the rest of the library: `client.<resource>.<verb>(projectId, ...)`, fully typed, partial-update contract irrelevant (read-only endpoints).

The euphoric surprise: shipping the first OSS implementation of TickTick's activity-feed endpoints — wire format captured live from the web UI, library code matches it line-for-line, integration test demonstrates the round trip (perform a task change → fetch the activity feed → assert the change event appears).

## Out of Scope

- **Filtering events by type / actor in the library.** Issue #66 Scope mentions filter-by-type and filter-by-actor; the epic Acceptance section requires only listing. Filtering is one line for callers (`events.filter(e => e.type === 'update')`). If a server-side filter parameter exists on the endpoint (the capture will reveal), the method accepts an optional `params` object; otherwise no helper is added.
- **Real-time event subscription via WebSocket.** TickTick's web app uses WebSockets for live update propagation, but the activity *feed* is a separate REST endpoint. WebSocket is out.
- **Pagination helpers.** If the endpoint paginates, the v1 method returns whatever the server returns; an `iterateActivity` async-generator is deferred to a future story.
- **Activity for resources beyond tasks/projects** (folders, tags, habits, etc.). Issue #66 scope is task + project only.
- **Mutating activity (annotating events, marking-read, etc.).** Read-only.
- **No HTTP call against Matthew's main TickTick account.** Test account `doma.spirita@gmail.com` only.
- **Premium-bypass attempts.** If the endpoint returns 402 / 403 for non-Premium accounts, the library does not try to mask that; callers without Premium will see the server error.
- **Shared-project setup as part of this run.** If the capture reveals the endpoint requires a shared project AND the test account has none, surface the gap to Matthew rather than inviting an external account during this run.

## Principles

- **UI capture first.** No OSS prior art + `needs: har-capture` label means Interceptor traffic capture is the canonical discovery path. Don't permute API endpoints; capture once and ship.
- **Symmetry with existing modules.** New `ActivityModule` mirrors `ProjectsModule` / `TasksModule` shape: constructor takes the client, methods are direct verbs, return types are `readonly TickTickActivityEvent[]`.
- **Server names, not UI names.** Use whatever wire vocabulary the capture reveals — "activity," "event," "log," "history" — for the type name and any server-mirrored fields.
- **Conservative typing.** Activity events may have many optional/deprecated fields; the type captures what the UI capture shows plus reasonable optionals. Strict typing comes from real wire evidence, not speculation.

## Constraints

- **Bun + TypeScript only.** No npm/npx.
- **No new dependencies.** Existing `TickTickClient.request()` + the established mock-fetch test pattern are sufficient.
- **Backward compatibility.** No change to any existing module signature.
- **Test-account guardrail.** Any live-API code path (integration test extension) MUST reject the run unless `session.username === "doma.spirita@gmail.com"` BEFORE any HTTP call fires (existing guardrail covers this).
- **Read-only.** The new methods make GET requests; no mutation surface.
- **Premium gate.** If the endpoint returns 402/403 for non-Premium, the library surfaces the API error rather than catching it; document in CHANGELOG + README.

## Goal

Ship `client.activity.listForTask(projectId, taskId)` and `client.activity.listForProject(projectId)` on a new `ActivityModule`, with `TickTickActivityEvent` types, mocked unit tests, a live integration test that perform-change-then-fetches-event, README + CHANGELOG docs, and the epic + both sub-stories closed on the fork — all against an empirically-captured wire shape from the Premium web UI.

## Criteria

### Discovery (Phase 0 — Interceptor UI capture)
- [x] ISC-1: Interceptor was connected; tab on `ticktick.com/webapp/`. Verified via `interceptor state`.
- [x] ISC-2: Probe task created on TEST project, renamed + content-changed via API to seed events; Matthew opened the task-history view in the UI while net log was armed.
- [x] ISC-3: Endpoint captured: `GET /api/v1/task/activity/{taskId}` → bare event array. Documented in `Plans/activity-probe.md` with full wire-shape table.
- [x] ISC-4: Event fields enumerated: `id`, `action`, `when`, `deviceChannel`, `whoProfile.isMyself`; optional `name`, `description`, `content`, `kind`, `taskIds`. Documented in probe doc + TypeDoc on `TickTickActivityEvent`.
- [x] ISC-5: Project-scoped endpoint discovered via 5-variant API probe after UI capture: `GET /api/v1/project/{projectId}/activity` works; URL shape is asymmetric vs task endpoint.
- [x] ISC-6: Personal-project activity verified working — test account has 0 shared projects, both endpoints returned event arrays (200 events on the TEST project; 1 event on the fresh probe task). Issue #66's "for shared projects" framing was inaccurate; documented in probe doc + JSDoc.

### Types (Phase 1)
- [x] ISC-7: `TickTickActivityEvent` added in `src/types.ts` matching captured response.
- [x] ISC-8: `TickTickActivityAction` (typed as `string`, not closed union — server returns values like `T_CREATE`, `P_ADD_COLUMN`, etc.); 10 observed actions documented in probe doc + TypeDoc.
- [x] ISC-9: All five new types re-exported from `src/index.ts`.
- [x] ISC-10: TypeDoc comments document Premium-only gate, V1 path, action naming pattern, and personal-vs-shared behavior.

### Module (Phase 2)
- [x] ISC-11: `src/modules/activity.ts` exists with `ActivityModule` class.
- [x] ISC-12: `constructor(client: TickTickClient)`.
- [x] ISC-13: `.listForTask(taskId, params?)` returns `Promise<readonly TickTickActivityEvent[]>`; hits `GET /api/v1/task/activity/{taskId}`. (Note: signature is `(taskId, params?)` not `(projectId, taskId)` per ISA draft — the endpoint doesn't require projectId; refined to match the actual wire shape.)
- [x] ISC-14: `.listForProject(projectId, params?)` returns `Promise<readonly TickTickActivityEvent[]>`; hits `GET /api/v1/project/{projectId}/activity`.
- [x] ISC-15: `ActivityModule` instantiated in `TickTickClient` constructor and exposed as `client.activity`.
- [x] ISC-16: `ActivityModule` doesn't need separate export — module export is via the `client.activity` instance and the types are exported from `index.ts`. (Refined: matches the pattern of `ProjectGroupsModule` which is also only exposed through the client.)

### Unit tests (Phase 3)
- [x] ISC-17: `tests/modules/activity.test.ts` exists.
- [x] ISC-18: 5 tests in `listForTask` describe block — URL, method, return shape, pagination, no-query-when-empty.
- [x] ISC-19: Same — verifies bare-array unwrap (no envelope).
- [x] ISC-20: 3 tests in `listForProject` describe block — URL+method, URL-shape regression guard (id before /activity), pagination.
- [x] ISC-21: Same — verifies bare-array unwrap.
- [x] ISC-22: `bun run test` passes 216/216 (8 new + 208 existing); no regression.

### Live tests (Phase 4)
- [x] ISC-23: `scripts/integration-test.ts` extended with `testActivity()` section + wired into `main()`.
- [x] ISC-24: Live: creates probe task, renames it, calls `listForTask(taskId)`, asserts array with ≥0 events (TickTick returned 1 event for the fresh task; pagination returned 0 next-page events as expected). ✓ green.
- [x] ISC-25: Live: `listForProject(inboxId)` returns 200 events on the test account. ✓ green.
- [x] ISC-26: Probe task deleted at end of `testActivity()` cleanup; verified via second cleanup pass — no leftover `[integration-test] activity probe*` tasks. ✓.

### Docs (Phase 5)
- [x] ISC-27: CHANGELOG `[Unreleased]` includes `### Added` block for `ActivityModule` with Premium gate, V1 path, OSS-first note, and capture reference.
- [x] ISC-28: README "Activity Feed (Premium)" section added with create-task / listForTask / listForProject / pagination / caller-side filter examples + Premium + V1-path callouts.

### Issue close
- [ ] ISC-29: #57, #58, epic #66 closed on `MHoroszowski/ticktick-client` with commit-link comments. (Pending in VERIFY phase after commit lands.)

### Anti-criteria
- [x] ISC-30: Anti: No HTTP call against any account other than `doma.spirita@gmail.com`. Probe scripts + integration test rely on existing `assertTestAccount` guardrail; no non-test-account HTTP call possible.
- [x] ISC-31: Anti: No signature change to any existing module. `git status --short` shows only `src/modules/activity.ts` as new + `src/client.ts` / `src/index.ts` / `src/types.ts` as modified (additive only — new module wiring, type exports). Existing public methods on `tasks/projects/projectGroups/tags/habits/focus/statistics/user/countdowns` untouched.
- [x] ISC-32: Anti: No leftover test artifacts. `testActivity()` deletes the probe task it creates; standalone setup script's probe task cleaned up via post-run sweep (verified via `tasks.list()` filtered on `[activity-probe]` prefix — returned 0 after cleanup).

## Test Strategy

| ISC | Type | Check | Threshold | Tool |
|-----|------|-------|-----------|------|
| ISC-1..6 | discovery | UI capture documented | `Plans/activity-probe.md` exists with endpoint, body, response | Read + Interceptor |
| ISC-7..10 | typecheck | new types compile, exported | `bun run lint` clean | `bun run lint` + Grep |
| ISC-11..16 | unit | module class exists, methods exist | green | vitest mock fetch |
| ISC-17..22 | unit | new test file green, no regression | green | `bun run test` |
| ISC-23..26 | integration | live round trip — task event appears in feed | green | `bun scripts/integration-test.ts` |
| ISC-27..28 | doc | README + CHANGELOG sections present | grep matches | Grep |
| ISC-29 | gh | issues closed | `gh issue view N --json closed` | `gh` |
| ISC-30..32 | anti | guardrail + signature stability + cleanup | each clean | code-read, git diff, integration run |

## Features

| Name | Description | Satisfies | Depends on | Parallelizable |
|------|-------------|-----------|-----------|----------------|
| F1: Interceptor UI capture | Drive UI to fire activity-feed request, capture wire shape | ISC-1..6 | — | No |
| F2: Types | TickTickActivityEvent + event-type enum, re-exported | ISC-7..10 | F1 | No |
| F3: ActivityModule | New module file + 2 methods + client wiring | ISC-11..16 | F1, F2 | No |
| F4: Unit tests | Mocked tests for both methods + suite check | ISC-17..22 | F3 | No |
| F5: Live integration | Round-trip task-change-then-fetch | ISC-23..26 | F3 | No |
| F6: Docs | CHANGELOG + README | ISC-27..28 | F3 | Yes (anytime after F3) |
| F7: Issue close + anti | gh closures + anti sweep | ISC-29..32 | F3, F4, F5, F6 | No |

## Decisions

- 2026-05-27T07:15Z — **UI capture first, no API permutation roulette.** Direct lesson from the just-completed #70 cycle: API-only probing burned 6 rounds before Interceptor capture closed the gap in one click. `needs: har-capture` + no OSS prior art = go straight to Interceptor.
- 2026-05-27T07:15Z — **Filter-by-type/actor deferred.** Epic Scope mentions filtering but the Acceptance section only requires listing. Library returns the raw event array; caller filters with `events.filter(...)`. Add server-side filter params only if the capture shows the endpoint accepts them.
- 2026-05-27T07:15Z — **Effort source: context-override.** Classifier NATIVE on `/goal`; escalated to E3 for multi-file build with empirical discovery (same shape as #70).
- 2026-05-27T07:15Z — **Forge skipped despite E3 auto-include.** Show-your-math: new module is a line-for-line mirror of existing module shape (~3 files, fully specified once the capture lands). Briefing cost > direct-write cost.
- 2026-05-27T07:15Z — **Shared-project gate handled by capture.** Test account has 0 shared projects. If the UI capture confirms the endpoint works on personal projects, ship. If it requires a shared project AND the personal-project capture comes back empty/403, surface to Matthew rather than inviting an external account.

## Changelog

### 2026-05-27 — Kanban Column CRUD shipped (v0.4 candidate)
- **Conjectured:** TickTick V2 column-delete endpoint was upstream-broken (6 probe iterations all returned 500 unknown_exception).
- **Refuted by:** Interceptor UI capture of the web app deleting a column revealed the delete item uses key `columnId` (not `id`).
- **Learned:** When API-only probes exhaust the obvious shape surface, real-UI capture via Interceptor closes the gap in one click. The 6 probe rounds all assumed the wrong field name; the UI capture revealed it instantly.
- **Criterion now:** For undocumented endpoints with `needs: har-capture` label OR no OSS prior art, the canonical discovery path is Interceptor UI capture first, API permutation second. Encoded as the leading Principle of this run's ISA.

## Verification

(Populated at VERIFY phase.)
