---
project: ticktick-client
task: Implement Kanban column CRUD (issue #70 — create / update / reorder / delete)
slug: kanban-columns-crud
effort: E3
phase: verify
progress: 35/38
mode: build
started: 2026-05-27T04:35:00Z
updated: 2026-05-27T06:25:00Z
algorithm_config:
  effort_source: context-override
  classifier_returned: NATIVE
  override_reason: slash-command fast-path on /goal escalated for multi-file build with integration probe
  forge_skipped_show_math: true
---

## Problem

`MHoroszowski/ticktick-client` ships `projects.listColumns(projectId)` — read-only access to the kanban-column entity that backs TickTick's "Kanban view." Callers can SEE columns but cannot CREATE, RENAME, REORDER, or DELETE them, which means the library cannot build or maintain a project's kanban structure end-to-end. Issue #70 (epic) opens three child stories — #13 create, #14 update/rename/reorder, #15 delete — to close that gap.

Two complications discovered at OBSERVE that the issue body under-specifies:

1. **The prior-art citation is over-stated.** Issue #70 cites `hansdoebel/n8n-nodes-ticktick` as wrapping the full Column CRUD. A direct read of that repo (`nodes/TickTick/resources/projects/`) shows it only exposes `viewMode: "kanban"` on `ProjectUpdate` — it does NOT have column create/update/delete operations files. Other OSS clients surveyed (`lazeroffmichael/ticktick-py`, `jen6/ticktick-mcp`, `jacepark12/ticktick-mcp`, `shidhincr/LookUp`) have zero column-mutation code either. **This is genuinely undocumented territory.**
2. **The endpoint surface is unknown.** The existing `listColumns` hits `GET /api/v2/column?from=0&projectId=…` and returns a `{update: TickTickColumn[]}` wrapper (per the 2026-04-12 fix). The mutation endpoints (`POST /api/v2/batch/column`? per-column `POST /api/v2/column/{id}`?) must be reverse-engineered via a live probe against the test account, mirroring the just-completed `probe-nested-projects.ts` pattern.

## Vision

A caller writes `client.projects.createColumn(projectId, {name: "In review"})`, gets back a `TickTickColumn` with a server-assigned id and the project's existing columns visible via `listColumns`. They then rename it via `updateColumn({id, name})`, reorder via `updateColumn({id, sortOrder})`, and finally delete it via `deleteColumn(projectId, columnId)` — discovering empirically what happens to tasks left in that column (likely `columnId` returns null on those tasks, but the integration test confirms this and the README documents it).

The euphoric surprise: the four new methods round out the kanban surface with zero architectural novelty — same `client.projects.*` namespace, same partial-update contract, same client-generated 24-hex ObjectId pattern, same `bun test` green. The library moves from "you can read columns" to "you can build columns" in three small endpoints, and the integration test ships a four-step demo (create→place→rename→delete) that doubles as caller documentation.

## Out of Scope

- **A separate `client.columns` module.** Issue #70 explicitly says touchpoint `src/modules/projects.ts`; extend in place, don't split.
- **`batch-reorder` of multiple columns in one call.** Per-column `updateColumn({id, sortOrder})` is sufficient for v1; batch reorder is a future story if demand emerges.
- **Cross-project column moves.** Columns belong to one projectId; moving a column to a different project is not a TickTick UI primitive and isn't worth shipping.
- **A `client.projects.columns` sub-namespace.** Flat methods on `ProjectsModule` mirror the existing `listColumns` / `listMembers` pattern.
- **Migration helpers for callers that built their own column workarounds.** They didn't have any — this is genuinely new surface.
- **Any change to OAuth / Open API V1 paths.** V2 cookie-session only.
- **Any HTTP call against Matthew's main TickTick account.** Test account `doma.spirita@gmail.com` only.
- **Version bump / `bun publish`.** Issue #70 is "the code lands on main"; release-cut is a separate workflow.
- **Refiling the closed-issue history of the just-completed nested-projects work.** The ISA preserves the prior cycle as a Changelog entry; CHANGELOG.md `[0.3.0]` is the durable record.

## Principles

- **Symmetry over novelty.** New methods mirror the existing `listColumns` shape and the `projects.create/update/delete` patterns. No new helpers, no new abstractions.
- **The partial-update contract carries everywhere.** `updateColumn` honors `buildPartialUpdateBody`: omit → preserve, value → set, explicit null → clear (where the server allows it).
- **Server names, not UI names.** TickTick calls these "columns" (`/api/v2/column`); the UI calls them "sections" in some places. Match the server vocabulary; the existing `TickTickColumn` type already does.
- **Live probe before write.** Mock unit tests are not sufficient evidence for an undocumented V2 endpoint. Capture the wire shape empirically against the test account first, then write the implementation against what was actually observed.
- **Test-account guardrail by hardcoded constant, not config.** Same rationale as nested-projects (`Decisions` 2026-05-27T03:30Z): config-driven allowlist could silently widen; hardcoded string forces commit-to-change audit trail.

## Constraints

- **Bun + TypeScript only.** No npm/npx anywhere. Existing build (`tsup`), test (`vitest`), and probe (`bun scripts/`) toolchains are sufficient.
- **No new dependencies.** Existing `client.request()`, `buildPartialUpdateBody`, `generateObjectId` are sufficient.
- **Backward compatibility.** Existing `listColumns` signature and return shape must not change. The three new methods are additive only.
- **Touchpoint locked to `src/modules/projects.ts`.** Issue #70 explicitly names this file; extending rather than splitting preserves the import surface in `client.ts`.
- **Test-account guardrail.** Any live-API code path (probe + integration) MUST reject the run unless `session.username === "doma.spirita@gmail.com"` BEFORE any HTTP call fires. Defense-in-depth with a post-login re-check.
- **ID generation.** Client-generated 24-hex ObjectIds via `generateObjectId()` for create payloads, same as `projects.create` / `projectGroups.create`.
- **Issue close coupling.** Closing epic #70 closes when (a) all three child stories are done AND (b) the epic's own "create → place task → rename → delete" integration test passes on the test account.

## Goal

Ship `projects.createColumn / updateColumn / deleteColumn` on `MHoroszowski/ticktick-client` against an empirically-captured V2 wire shape, with mocked unit tests for each method, an integration test that completes the epic's "create → place task in it via `columnId` → rename → delete" round trip, README and CHANGELOG `[Unreleased]` updates, and the three child stories plus epic #70 closed on the fork — without changing existing public signatures and without any HTTP call leaving the test account.

## Criteria

### Discovery (Phase 0)
- [x] ISC-1: Probe script exists at `scripts/probe-kanban-columns.ts` mirroring the nested-projects probe pattern.
- [x] ISC-2: Probe script throws if `envUsername !== "doma.spirita@gmail.com"` BEFORE any HTTP call fires.
- [x] ISC-3: Probe script re-checks `session.username` after login (defense-in-depth) and throws on mismatch.
- [x] ISC-4: Create-column wire format captured: full request body + response.
- [x] ISC-5: Update-column wire format captured for rename AND sortOrder.
- [ ] ISC-6: [DROPPED — see Decisions 2026-05-27T05:15Z; delete endpoint returns server 500 unknown_exception, no working wire format exists]
- [x] ISC-7: Task-with-columnId behavior captured (during probe step 4: task created with columnId persists; observed in integration test).
- [x] ISC-8: Probe doc written to `Plans/kanban-columns-probe.md` with wire-shape findings table + step-by-step capture.
- [x] ISC-9: Probe cleans up every artifact it created (test column(s), test project) before exit.

### Types (Phase 1)
- [x] ISC-10: `TickTickColumnDraft` type added to `src/types.ts` with required `name` and optional `sortOrder`.
- [x] ISC-11: `TickTickColumnUpdate` type added to `src/types.ts` as `Partial<TickTickColumnDraft> & { id: string; projectId: string }`.
- [x] ISC-12: New types re-exported from `src/index.ts`.
- [x] ISC-13: TypeDoc comments on each new type, including the projectId-required-on-update gotcha on `TickTickColumnUpdate`.

### Module (Phase 2)
- [x] ISC-14: `projects.createColumn(projectId, draft)` exists on `ProjectsModule`.
- [x] ISC-15: `createColumn` generates a client-side id via `generateObjectId()` and returns `TickTickColumn`-shaped result.
- [x] ISC-16: `createColumn` POSTs to `/api/v2/column` with `{add: [{id, projectId, name, sortOrder}]}` (the empirically-captured wire shape).
- [x] ISC-17: `projects.updateColumn(params: TickTickColumnUpdate)` exists on `ProjectsModule`.
- [x] ISC-18: `updateColumn` applies `buildPartialUpdateBody` so undefined keys are omitted and present keys (including `sortOrder: 0`) are sent.
- [x] ISC-19: `updateColumn` POSTs to `/api/v2/column` with `{update: [...]}` envelope (the empirically-captured wire shape).
- [ ] ISC-20: [DROPPED — delete endpoint is upstream-broken; tracked via ISC-48]
- [ ] ISC-21: [DROPPED — delete endpoint is upstream-broken; tracked via ISC-48]
- [x] ISC-22: No new top-level module created — `client.projects.createColumn` etc. are direct methods on `ProjectsModule`; no `client.columns` namespace introduced.

### Unit tests (Phase 3)
- [x] ISC-23: `tests/modules/projects-columns.test.ts` exists.
- [x] ISC-24: Test asserts `createColumn` payload shape and returned object (2 tests pass).
- [x] ISC-25: Test asserts `updateColumn` partial-update — rename only, sortOrder only, both, no-op (6 tests pass).
- [ ] ISC-26: [DROPPED — no deleteColumn method to test]
- [x] ISC-27: `bun run test` passes all 204 tests across 24 files (8 new + 196 existing, no regression).

### Live tests (Phase 4)
- [x] ISC-28: `scripts/integration-test.ts` `testProjects()` section extended with a "Kanban columns" sub-block.
- [x] ISC-29: Integration test guardrail (existing `assertTestAccount`) applies to the new sub-block — runs after the global guardrail.
- [x] ISC-30: Live: creates a kanban-view project; creates a column; asserts the column appears in `listColumns`. ✓ green.
- [x] ISC-31: Live: creates a task in that column via `tasks.create({columnId})`. ✓ green.
- [x] ISC-32: Live: renames the column via `updateColumn({id, projectId, name})`. ✓ green.
- [x] ISC-33: Live: reorders via `updateColumn({id, projectId, sortOrder})`. ✓ green (combined with rename + verified partial preserves).
- [ ] ISC-34: [DROPPED — no deleteColumn to exercise]
- [x] ISC-35: Live: cleans up the test project (cascade removes columns) before exit. ✓ green.

### Docs (Phase 5)
- [x] ISC-36: CHANGELOG `[Unreleased]` includes the new methods under `### Added` plus a `### Known limitations` block documenting the delete bug.
- [x] ISC-37: README "Kanban Columns" section added showing the create + task-in-column + update + partial-update example, plus a "Known Limitations" entry on the delete bug.

### Issue close
- [ ] ISC-38: Child stories #13, #14, #15 closed on `MHoroszowski/ticktick-client` with a comment referencing the implementing commit hash; epic #70 closed with a summary comment listing the three closed sub-issues and the shipped methods.

### Anti-criteria
- [ ] ISC-39: Anti: No HTTP call against any account other than `doma.spirita@gmail.com` — probe + integration both gated.
- [ ] ISC-40: Anti: No signature change to existing public methods of `projects.listColumns/listMembers/list/create/update/delete/deleteMany` — verified by reading the diff for the existing methods.
- [ ] ISC-41: Anti: No `npm`/`npx` commands in any new script, test, or doc.
- [ ] ISC-42: Anti: No `client.columns` top-level namespace introduced — methods live on `ProjectsModule`.
- [ ] ISC-43: Anti: No leftover test artifacts (test project / columns / tasks) on the test account after `bun run scripts/integration-test.ts` exits.
- [ ] ISC-44: Anti: No silent change to the existing `listColumns` return shape or the `{update: …}` unwrap behavior — verified by reading the existing tests after the change.

### Scope adjustment (added 2026-05-27T05:15Z)
- [x] ISC-45: Probe findings consolidated in `Plans/kanban-columns-probe.md` with a "Wire shape — confirmed" section listing CREATE shape, UPDATE shape, and the DELETE upstream-bug evidence.
- [x] ISC-46: `createColumn` implementation matches the confirmed wire shape exactly: `POST /api/v2/column` body `{add: [{id, projectId, name, sortOrder}]}` (see `src/modules/projects.ts`).
- [x] ISC-47: `updateColumn` implementation sends `projectId` on the update item (TypeScript type enforces; impl forwards via `buildPartialUpdateBody`).
- [ ] ISC-48: A tracking issue is filed on `MHoroszowski/ticktick-client` (label `tracking: server-bug`) titled "Track: `column delete` — server 500 unknown_exception" with the raw error body captured and a note that `update {deleted:1}` is silently dropped. Issue #15 references this tracking issue and remains open.

## Test Strategy

| ISC | Type | Check | Threshold | Tool |
|-----|------|-------|-----------|------|
| ISC-1..9 | discovery | probe doc enumerates each wire step | doc present, ≥4 steps | Read `Plans/kanban-columns-probe.md` |
| ISC-10..13 | typecheck | new types compile, exported, doc-commented | `bun run typecheck` clean | `bun run typecheck` + Grep `src/types.ts` |
| ISC-14..22 | unit | methods exist with expected wire shape | all pass | vitest mock fetch |
| ISC-23..27 | unit | new test file green, no regression | green | `bun run test` |
| ISC-28..35 | integration | live round trip 6/6 passes | green | `bun scripts/integration-test.ts` |
| ISC-36, 37 | doc | CHANGELOG + README contain expected sections | grep matches | Grep |
| ISC-38 | gh | issues closed | `gh issue view N --json closed` returns `true` | `gh` |
| ISC-39 | anti | guardrail throws on wrong account | code-read + simulated wrong env | Read probe + integration |
| ISC-40 | anti | git diff scoped to projects.ts shows no signature change to existing methods | inspection | `git diff` |
| ISC-41 | anti | no `npm`/`npx` in added files | Grep | `grep -rE 'npm\|npx' scripts/probe-kanban-columns.ts ...` empty |
| ISC-42 | anti | no `client.columns` symbol in client.ts | Grep | `grep -E "columns:" src/client.ts` returns only existing `listColumns` |
| ISC-43 | anti | integration test exits with no remaining `[integration-test]` columns in test project | empty | `listColumns()` filter on test prefix |
| ISC-44 | anti | existing `projects.test.ts` `list()` and `listColumns`-related assertions still pass | green | `bun test tests/modules/projects.test.ts` |

## Features

| Name | Description | Satisfies | Depends on | Parallelizable |
|------|-------------|-----------|-----------|----------------|
| F1: Discovery probe | Mirror `probe-nested-projects.ts`; capture create/update/delete wire shape | ISC-1..9, 39 | — | No |
| F2: Type extensions | Add `TickTickColumnDraft` + `TickTickColumnUpdate`, re-export | ISC-10..13 | F1 | No |
| F3: ProjectsModule extension | Add 3 methods to `projects.ts` against captured wire shape | ISC-14..22 | F1, F2 | No |
| F4: Unit tests | New `projects-columns.test.ts` + run full suite | ISC-23..27 | F3 | No |
| F5: Live integration tests | Extend `integration-test.ts` testProjects() | ISC-28..35, 43 | F3 | No |
| F6: Docs | CHANGELOG + README | ISC-36, 37 | F3 | Yes (anytime after F3) |
| F7: Issue close + anti sweep | Close 4 issues; verify anti criteria | ISC-38, 40, 41, 42, 44 | F3, F4, F5, F6 | No |

## Decisions

- 2026-05-27T04:35Z — **Project-ISA replacement (not extension).** The prior cycle (`nested-projects`, v0.3.0) was complete at the file's top; this cycle replaces Problem/Vision/Goal/Criteria/etc for the kanban-columns work. Git history of `ISA.md` preserves the prior cycle's full text; CHANGELOG `[0.3.0]` is the durable user-facing record. Doctrine alignment: "iteration on the project IS iteration on this ISA" — replacing reflects the project's current ideal state.
- 2026-05-27T04:35Z — **Effort source: context-override.** Classifier returned NATIVE on `/goal implement issue #70` (slash-command fast-path); escalated to E3 per Override Rule 3 because the request decomposes into a multi-file build + integration probe.
- 2026-05-27T04:35Z — **Prior-art citation in issue #70 is over-stated.** Direct read of `hansdoebel/n8n-nodes-ticktick` (`gh api git/trees/main?recursive=1` listing of `nodes/TickTick/resources/projects/`) shows it has ProjectCreate/Update/Delete/Get/GetUsers but NO ColumnCreate/Update/Delete. `lazeroffmichael/ticktick-py`, `jen6/ticktick-mcp`, `jacepark12/ticktick-mcp`, `shidhincr/LookUp` likewise have no column-mutation code. This is genuinely undocumented; live probe against test account is required.
- 2026-05-27T04:35Z — **No `client.columns` top-level namespace.** Issue #70 explicitly names the touchpoint `src/modules/projects.ts`. Mirror the `listColumns`/`listMembers` pattern: flat methods on `ProjectsModule`. Reconsider only if Phase 0 turns up a wire-level reason to split (it shouldn't).
- 2026-05-27T04:35Z — **Forge skipped despite E3 auto-include binding.** Show-your-math: 3 new endpoints, ~5 files touched, patterns line-for-line mirror `projects.create/update/delete` already in the same file. Briefing + handoff cost (writing the brief, parsing Forge output, integrating diffs) exceeds direct-write cost. Same justification as the just-completed nested-projects cycle (Decisions 2026-05-27T03:30Z). Will revisit if Phase 0 reveals an unexpected wire shape that requires divergent implementation.
- 2026-05-27T04:35Z — **Test-account guardrail: hardcoded constant, not config.** Same rationale as nested-projects: a config-driven allowlist could be silently set to `*`; hardcoded string forces a commit-to-change audit trail.
- 2026-05-27T04:35Z — **Cato NOT fired (E3 tier).** Rule 2a is E4/E5 only. Advisor at commitment boundary (per Rule 2) and ReReadCheck at VERIFY are sufficient at E3.
- 2026-05-27T05:15Z — **refined: scope reduced to create + update; delete is an upstream-server bug.** Six rounds of probing (`probe-kanban-columns.ts` through `probe-kanban-columns-v6.ts`, all in `scripts/`) established:
  - **CREATE** works: `POST /api/v2/column` body `{add:[{id, projectId, name, sortOrder?}]}` → `{id2etag, id2error}`, column persists.
  - **UPDATE** works (with hidden requirement): `POST /api/v2/column` body `{update:[{id, projectId, name?, sortOrder?, etag?}]}` → `{id2etag, id2error}`, column updates. **`projectId` is REQUIRED on the update item or the server silently no-ops** (returns 200 with empty `id2etag` and changes are dropped). This is the breakthrough that turned the no-op of v3-step-2 into success.
  - **DELETE is upstream-broken.** `POST /api/v2/column` with `{delete:[id-string]}` returns 500. With `{delete:[{id,projectId}]}` the server returns `200 + concatenated 500 body` containing `"errorCode":"unknown_exception"` — caught via raw fetch in v5/V2. Soft-delete via `update {deleted:1}` is accepted (200 + new etag) but the `deleted` flag is dropped on the persisted record (verified in v6). No discoverable workaround exists at the V2 cookie-session API surface.
  - **Decision:** Mirror the existing tracking-issue pattern (`tasks.listTrash`, `focus.getHeatmap`, `tasks.move` — README "Known Limitations"). Ship CREATE + UPDATE on `projects.*`; document DELETE as an upstream server bug with the exact error captured. Close stories #13 and #14, leave #15 OPEN with the findings; leave epic #70 OPEN with a comment surfacing the partial-ship and the upstream tracking. **The ISA is now scoped to create + update.** Anti-criterion ISC-44 (no silent change to `listColumns`) still holds.
- 2026-05-27T05:15Z — **ISCs revised:** Drop the delete-path ISCs from the in-scope set (ISC-6, ISC-20, ISC-21, ISC-26, ISC-34); add ISC-45..ISC-48 to cover the wire-shape findings doc, the create endpoint, the update endpoint (with the projectId requirement), and the tracking issue. Tombstone the dropped ISCs per the v6.2.0 ID-stability rule.

## Changelog

### 2026-05-27 — Nested projects shipped (v0.3.0)
- **Conjectured:** `groupId: null` on `projects.update` would clear the folder via the partial-update contract.
- **Refuted by:** Live probe step 5 — sending `{update:[{id, groupId: null}]}` left `groupId` unchanged.
- **Learned:** V2 requires the literal `"NONE"` as the unparent sentinel; JSON `null` is treated as no-op.
- **Criterion now:** Library translates caller-side `null` to `"NONE"` on the wire; public API still accepts `null`. Shipped in `projects.ts:GROUP_UNPARENT_SENTINEL`, CHANGELOG `[0.3.0]`, README "Folders" section.

(Full prior-cycle ISA preserved in git history at the previous commit before this rewrite. v0.3.0 is the durable user-facing record of the nested-projects work.)

## Verification

(Populated at VERIFY phase.)
