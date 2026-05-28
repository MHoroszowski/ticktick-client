---
project: ticktick-client
task: Implement Reminders subsystem (epic #59 — sub-issues #2, #3, #4; #5 deferred to user-driven HAR capture)
slug: reminders-subsystem
effort: E3
phase: complete
progress: 48/57
updated: 2026-05-28T20:25:00Z
mode: build
started: 2026-05-28T19:30:00Z
updated: 2026-05-28T19:35:00Z
algorithm_config:
  effort_source: context-override
  classifier_returned: NATIVE
  override_reason: /goal slash-command fast-path; escalated for multi-file epic (types + helpers + module + tests + docs across 3 sub-issues)
  forge_skipped_show_math: true
  ui_capture_first: false  # prior art (jen6/ticktick-mcp) documents the exact wire shape; no UI capture needed
---

## Problem

`MHoroszowski/ticktick-client` does not expose TickTick's reminders surface — neither single time-based reminders, multi-reminder arrays, nor RFC 5545 helpers for callers who want to express "15 minutes before" without hand-writing `TRIGGER:-PT15M`. Epic #59 opens the subsystem and its four sub-stories: #2 (single time reminder on create/update), #3 (multi-reminder array), #4 (RFC 5545 TRIGGER parse/format helpers), #5 (location-based geofence — labeled `needs: har-capture`).

Three preflight findings:

1. **Prior art is unusually rich for the time-based path.** `jen6/ticktick-mcp` documents the wire shape (`reminders` array of RFC 5545 strings) and is the only OSS client to have a verified write-path. `lazeroffmichael/ticktick-py` documents the field on the task schema. `StefanIndustries/node-ticktick` defines a `TickTickReminder[]` type but never writes. This is enough to skip an Interceptor UI-capture cycle for #2/#3 — the wire shape is known.
2. **No OSS prior art for location-based reminders.** The 13-client survey from the prior #66 cycle plus a direct grep returned zero hits for geofence/location reminders in any TickTick client. Sub-issue #5 carries `needs: har-capture` correctly. **Out of scope this run** — Matthew must drive the UI for the capture.
3. **RFC 5545 §3.8.6.3 is the spec.** TRIGGER format is `TRIGGER:[±]P[nW][nD]T[nH][nM][nS]`. Negative duration = before due (`-PT15M` = 15 min before). Positive duration = after due. `PT0S` = at due.

The pattern from #66 (Activity Feed) and #70 (Kanban Columns) holds: when the wire shape is known from prior art OR captured in advance, the work is mechanical pattern-mirror of existing modules. The novelty here is the semantic-helper layer (parse/format) — small, well-specified by the issue examples.

## Vision

A caller writes:

```ts
await client.tasks.create({
  title: 'Doctor',
  projectId,
  dueDate: '2026-06-01T15:00:00.000+0000',
  reminder: formatReminderTrigger({ before: '15m' }), // 'TRIGGER:-PT15M'
});
```

or, for multiple:

```ts
await client.tasks.create({
  title: 'Multi-reminder task',
  reminders: [
    formatReminderTrigger({ before: { days: 1 } }),
    formatReminderTrigger({ before: { hours: 1 } }),
    formatReminderTrigger({ at: 'due' }),
  ],
});
```

And on readback:

```ts
const tasks = await client.tasks.list();
const reminders = tasks[0].reminders?.map(parseReminderTrigger);
// [{ before: { days: 1 } }, { before: { hours: 1 } }, { at: 'due' }]
```

The euphoric surprise: the library hides the wire asymmetry (single field is pure sugar; canonical wire is `reminders[]` array) AND ships RFC 5545 helpers so callers never hand-craft `'TRIGGER:-PT15M'` unless they want to — the human form `{ before: '15m' }` works.

## Out of Scope

- **Location-based geofence reminders (sub-issue #5).** `needs: har-capture` label; no OSS prior art; requires Matthew driving the TickTick UI with Interceptor armed. Deferred to a follow-up cycle.
- **Reminder snooze API.** TickTick's app supports snooze but no documented REST endpoint. Out — needs separate investigation.
- **Default reminder time as a user setting.** The epic notes this overlaps with the `module: settings` epic. Coordinate, do not pre-empt.
- **Notification delivery introspection.** Whether the reminder actually fires a push is server-side; library only round-trips the trigger string.
- **Free-tier gate detection.** TickTick may limit multi-reminder to Premium. If the server returns 402/403, surface the error; do not bypass.
- **Mutation of any non-test account.** All live tests run only against `doma.spirita@gmail.com`.
- **Existing module signature changes.** Only additive fields on `TickTickTaskDraft` / `TickTickTask`.

## Principles

- **Wire shape is canonical; single `reminder` is sugar.** TickTick's wire format is `reminders: string[]`. Accept both `reminder` and `reminders` on the Draft, normalize at the tasks.create/update boundary, and never expose a single-field readback (the `TickTickTask` type only carries `reminders?: readonly string[]`).
- **`reminders` wins on conflict.** If a caller sets both `reminder` and `reminders`, use `reminders` as authoritative — caller-error-tolerant rather than throw-on-conflict.
- **Mirror existing semantic-helper shape.** `parseReminderTrigger` / `formatReminderTrigger` mirror `parseTaskPriority` / `formatTaskPriority` — same export style, same `undefined`-for-invalid pattern.
- **Trust the prior art for wire shape; verify via integration test.** `jen6/ticktick-mcp` documents the array shape; the live integration test (create → fetch → assert) is the ground truth.
- **Conservative typing on parse output.** Drop zero-valued duration fields (`{ hours: 0 }` is noise; absence is meaning). Round-trip equality is defined as deep-equal on the normalized form.
- **Partial-update contract preserved.** Existing `buildPartialUpdateBody` semantics (omit = preserve, value = set, `null` = clear) extend to reminders without modification.

## Constraints

- **Bun + TypeScript only.** No npm/npx. No new dependencies.
- **No new module file.** Reminders live on the existing `TickTickTaskDraft` / `TickTickTask` surface. New code is additive: types in `src/types.ts`, helpers in `src/semantic.ts`, normalization in `src/modules/tasks.ts`, re-exports in `src/index.ts`.
- **Backward compatibility.** No change to any existing public method signature. New Draft fields are optional. Integration test additions wired into the existing `main()` flow.
- **Test-account guardrail.** All live HTTP code paths pass through the existing `assertTestAccount('doma.spirita@gmail.com')` gate — verified by code-read, not added by this cycle.
- **Existing 216-test suite stays green.** New tests are additive.

## Goal

Ship reminder/reminders fields on `TickTickTaskDraft` (with sugar-to-canonical normalization in tasks.create/update), expose `reminders?` on `TickTickTask` readback, add `parseReminderTrigger`/`formatReminderTrigger` semantic helpers covering at-due / before / after with both object-and-string-shorthand inputs, write unit tests for helpers + wire normalization, write a live integration test that round-trips single + multi reminders + clear, document in CHANGELOG + README, close sub-issues #2/#3/#4 on the fork, and comment epic #59 with status (epic stays OPEN because #5 is still outstanding) — all without breaking the existing 216-test suite or invalidating the partial-update contract.

## Criteria

### Discovery (Phase 0 — schema/prior-art read)
- [x] ISC-1: `jen6/ticktick-mcp` README documents `reminders[]` of RFC 5545 TRIGGER strings as the canonical wire shape (recorded in this ISA; no fresh fetch needed since the issue body cites it).
- [x] ISC-2: RFC 5545 §3.8.6.3 TRIGGER grammar internalized: `TRIGGER:[-]?P([nW]|[nD])?(T[nH]?[nM]?[nS]?)?`; negative = before, `PT0S` = at due.
- [x] ISC-3: Existing `parseTaskPriority`/`formatTaskPriority` pattern in `src/semantic.ts` read; new helpers mirror that style.
- [x] ISC-4: `TickTickTaskDraft` / `TickTickTaskUpdate` (Partial<Draft>) location in `src/types.ts` confirmed; new fields added to Draft auto-propagate to Update.
- [x] ISC-5: `buildPartialUpdateBody` contract re-read (`src/internal/partial-update.ts`): `undefined` strips, `null` flows through; new fields obey this without modification.
- [x] ISC-6: Strategy decision — accept both `reminder` (sugar) and `reminders` (canonical); normalize at wire boundary in `tasks.create`/`update`; `reminders` wins on conflict.

### Types (Phase 1) — REVISED after empirical refutation; see Changelog 2026-05-28b
- [DROPPED] ISC-7: ~~`reminder?: string | null` on Draft~~ — see Changelog. Draft surface for write is deferred; sub-issue #2 reopened with `needs: har-capture`.
- [DROPPED] ISC-8: ~~`reminders?: readonly string[] | null` on Draft~~ — same. Sub-issue #3 reopened with `needs: har-capture`.
- [x] ISC-9 (revised): `reminder?: string` AND `reminders?: readonly TickTickReminder[]` added to `TickTickTask` (readback type) matching the actual V2 server shape: scalar `reminder` + array of `{id, trigger}` objects. Both fields documented as **read-only via this SDK** with a status pointer to #2/#3.
- [x] ISC-9.1 (added): New `TickTickReminder` type `{ readonly id: string; readonly trigger: string }` matching V2 wire readback, exported from `src/index.ts`.
- [DROPPED] ISC-10: ~~Update inherits Draft fields~~ — no longer applicable since Draft fields were dropped.
- [x] ISC-11: New `ReminderTrigger` type: discriminated union of `{ at: 'due' }` | `{ before: ReminderDuration }` | `{ after: ReminderDuration }` where `ReminderDuration = { weeks?, days?, hours?, minutes?, seconds? }`.
- [x] ISC-12: New `ReminderTriggerInput` type: `{ at: 'due' }` | `{ before: ReminderDuration | string }` | `{ after: ReminderDuration | string }` (string shorthand like `'15m'` or `'1d 9h'` for ergonomics).

### Semantic helpers (Phase 2)
- [x] ISC-13: `formatReminderTrigger` exported from `src/semantic.ts`.
- [x] ISC-14: `formatReminderTrigger({ at: 'due' })` returns literal `'TRIGGER:PT0S'` (code path: `'at' in input && input.at === 'due'`).
- [x] ISC-15: `formatReminderTrigger({ before: { minutes: 15 } })` returns `'TRIGGER:-PT15M'`.
- [x] ISC-16: `formatReminderTrigger({ before: { days: 1, hours: 9 } })` returns `'TRIGGER:-P1DT9H'`.
- [x] ISC-17: `formatReminderTrigger({ before: { weeks: 2 } })` returns `'TRIGGER:-P2W'`.
- [x] ISC-18: `formatReminderTrigger({ after: { minutes: 30 } })` returns `'TRIGGER:PT30M'`.
- [x] ISC-19: `formatReminderTrigger({ before: '15m' })` (string shorthand) returns `'TRIGGER:-PT15M'`.
- [x] ISC-20: `formatReminderTrigger({ before: '1d 9h' })` returns `'TRIGGER:-P1DT9H'`.
- [x] ISC-21: `parseReminderTrigger` exported from `src/semantic.ts`.
- [x] ISC-22: `parseReminderTrigger('TRIGGER:PT0S')` returns `{ at: 'due' }`.
- [x] ISC-23: `parseReminderTrigger('TRIGGER:-PT15M')` returns `{ before: { minutes: 15 } }`.
- [x] ISC-24: `parseReminderTrigger('TRIGGER:-P0DT9H0M0S')` returns `{ before: { hours: 9 } }` (zero fields dropped).
- [x] ISC-25: `parseReminderTrigger('TRIGGER:-P1DT9H')` returns `{ before: { days: 1, hours: 9 } }`.
- [x] ISC-26: `parseReminderTrigger('TRIGGER:-P2W')` returns `{ before: { weeks: 2 } }`.
- [x] ISC-27: `parseReminderTrigger('TRIGGER:PT30M')` returns `{ after: { minutes: 30 } }`.
- [x] ISC-28: `parseReminderTrigger('garbage')` returns `undefined` (consistent with `parseTaskPriority` failure mode).
- [x] ISC-29: Round-trip property: `parseReminderTrigger(formatReminderTrigger(x))` deep-equals normalized `x` for ≥6 representative inputs.

### Tasks module wire normalization (Phase 3) — DROPPED after empirical refutation
- [DROPPED] ISC-30: ~~tasks.create folds reminder→reminders[]~~ — empirically falsified. Wire-write reverted. See `Plans/reminders-probe.md`.
- [DROPPED] ISC-31: ~~tasks.update folds reminder→reminders[]~~ — same.
- [DROPPED] ISC-32: ~~conflict resolution rules~~ — no longer applicable.
- [DROPPED] ISC-33: ~~reminder:null clears~~ — no longer applicable.
- [DROPPED] ISC-34: ~~reminders:[] preserves~~ — no longer applicable.

### Index export (Phase 4)
- [x] ISC-35: `parseReminderTrigger` + `formatReminderTrigger` re-exported from `src/index.ts`.
- [x] ISC-36 (revised): `ReminderTrigger` + `ReminderTriggerInput` + `ReminderDuration` + `TickTickReminder` types re-exported from `src/index.ts`.

### Unit tests (Phase 5)
- [x] ISC-37: `tests/semantic.test.ts` adds 34 tests covering `parseReminderTrigger` (12) + `formatReminderTrigger` (16) + round-trip property test (8 reps via `it.each`). Round-trip cases: at-due, before-15m, before-9h, before-1d9h, before-1h30m, before-2w, after-30m, after-3d.
- [x] ISC-38 (revised): `tests/modules/tasks.test.ts` adds 1 readback typing test pinning the V2 `{ reminder: string, reminders: [{id, trigger}] }` shape on `tasks.list()` results. Original 9 wire-normalization tests were dropped along with the wire-normalization code per the empirical refutation.
- [x] ISC-39: `bun run test` passes full suite — 253/253 across 25 files (216 baseline + 37 new: 34 semantic + 1 readback + 2 misc).

### Integration tests (Phase 6) — pivoted to read-only after empirical refutation
- [x] ISC-40: `scripts/integration-test.ts` adds `testReminders()` section wired into `main()`.
- [x] ISC-41 (revised): Live: survey of 321 tasks → 133 carry populated reminders (set via official client). Readback type assertion confirms `{ id, trigger }` shape on each entry. Sample: `id=699bce82e812d5a47082eb3e, trigger=TRIGGER:PT0S`.
- [x] ISC-42 (revised): Live: `parseReminderTrigger(samp.trigger) → formatReminderTrigger(parsed) → parseReminderTrigger(...)` is structurally idempotent on the live trigger string (validates advisor reinforcement #3: helpers losslessly round-trip server-stored triggers).
- [DROPPED] ISC-43: ~~reminders: null clears~~ — no longer applicable; write-path reverted.
- [x] ISC-44 (revised): `testReminders()` is read-only; no probe tasks created → no cleanup needed.

### Docs (Phase 7)
- [x] ISC-45 (revised): CHANGELOG `[Unreleased]` Added block documents the helpers, the readback typing, the V2 write-path refutation, the empirical reproduction reference, and the `needs: har-capture` re-labeling on #2/#3.
- [x] ISC-46 (revised): README "Feature Coverage" — three new rows: `Reminders — read` ✓, `Reminders — write (time-based)` ⚠ (helpers ship, write pending HAR), `Reminders — write (geofence)` ✗ (pending HAR).
- [x] ISC-47 (revised): README Semantic Helpers section adds reminder-iteration example showing `task.reminders.map(r => parseReminderTrigger(r.trigger))` on readback.
- [x] ISC-48: README Semantic Helpers section adds `parseReminderTrigger`/`formatReminderTrigger` examples covering at-due / before / after / shorthand / parse cases.

### Issue closure (Phase 8) — revised after empirical refutation
- [REVISED] ISC-49 (#2): NOT closed. Re-labeled `needs: har-capture` + commented with full reproduction artifact pointing to `Plans/reminders-probe.md`.
- [REVISED] ISC-50 (#3): NOT closed. Re-labeled `needs: har-capture` + commented with reproduction artifact.
- [x] ISC-51: Issue #4 closed with commit-link comment; helpers shipped + cross-linked to #2/#3 per advisor reinforcement.
- [x] ISC-52: Epic #59 commented with revised status: #4 done; #2/#3 now `needs: har-capture` (matching #5); epic stays OPEN.

### Anti-criteria
- [x] ISC-53: Anti: No HTTP call against any account other than `doma.spirita@gmail.com` — existing `assertTestAccount` guardrail covers (verified by code-read of `scripts/integration-test.ts:54-62`); all probe scripts include the same gate.
- [x] ISC-54: Anti: No signature change to any existing public method. Only additive readback fields on `TickTickTask` + new helper exports. Confirmed via `git diff --stat`.
- [x] ISC-55: Anti: No leftover test artifacts — probe scripts (`reminders-probe.ts`, `reminders-probe-2.ts`) clean up their baseline task before exit; integration `testReminders()` is read-only and creates nothing.
- [x] ISC-56: Anti: Existing `TickTickTaskDraft`/`TickTickTaskUpdate` consumers continue to work — Draft surface fully reverted; no new optional fields landed on the write side.
- [x] ISC-57: Anti: No npm/npx/Playwright usage — bun + native fetch only.

## Test Strategy

| ISC | Type | Check | Threshold | Tool |
|-----|------|-------|-----------|------|
| ISC-1..6 | discovery | prior-art notes + schema notes in ISA | this file present, sections complete | Read + ISA edit |
| ISC-7..12 | typecheck | new types compile, exported | `bun run lint` clean | `bun run lint` + Grep |
| ISC-13..28 | unit | helpers return expected strings/objects | each expectation passes | vitest |
| ISC-29 | unit | round-trip property holds | deep-equal across ≥6 reps | vitest |
| ISC-30..34 | unit | wire payload contains correct `reminders` field | mocked fetch body assertions | vitest mock fetch |
| ISC-35..36 | unit | new helpers/types importable from package root | named import succeeds | typecheck + Grep |
| ISC-37..39 | unit | new tests green, no regression | 216 + N green | `bun run test` |
| ISC-40..44 | integration | live round-trip — reminders appear on readback | green | `bun scripts/integration-test.ts` |
| ISC-45..48 | doc | CHANGELOG + README sections present | grep matches | Grep |
| ISC-49..52 | gh | issues closed/commented | `gh issue view N --json closed,comments` | `gh` |
| ISC-53..57 | anti | guardrail + signature stability + cleanup + bun-only | each clean | code-read + git diff + integration run |

## Features

| Name | Description | Satisfies | Depends on | Parallelizable |
|------|-------------|-----------|-----------|----------------|
| F1: Discovery + ISA | Prior-art notes, schema, strategy decision | ISC-1..6 | — | No |
| F2: Types | Draft + Task field additions, new ReminderTrigger types, re-exports | ISC-7..12, 35..36 | F1 | No |
| F3: Semantic helpers | parseReminderTrigger + formatReminderTrigger | ISC-13..29 | F2 | Yes (after F2) |
| F4: Wire normalization | tasks.create/update fold single `reminder` to array | ISC-30..34 | F2 | Yes (after F2) |
| F5: Unit tests | semantic.test additions + tasks.test additions + suite check | ISC-37..39 | F3, F4 | No |
| F6: Integration test | testReminders() live round-trip | ISC-40..44 | F4 | No |
| F7: Docs | CHANGELOG + README updates | ISC-45..48 | F2, F3, F4 | Yes (anytime after F4) |
| F8: Issue closure | gh comments + closures + epic status | ISC-49..52 | F2..F7 commit landed | No |

## Decisions

- 2026-05-28T19:30Z — **Skip Interceptor UI capture for time-based reminders.** Prior art (`jen6/ticktick-mcp`) documents the exact wire shape (`reminders` array of RFC 5545 TRIGGER strings). Confirming via live integration test (create → fetch → assert) is sufficient. Geofence (#5) is a different story — no OSS prior art; defer per user instruction.
- 2026-05-28T19:30Z — **Effort source: context-override.** Classifier returned NATIVE on `/goal`; escalated to E3 for multi-file work spanning 3 sub-stories + types + helpers + tests + docs. Same shape as the #66 ActivityModule cycle.
- 2026-05-28T19:30Z — **Forge skipped despite E3 auto-include.** Show-your-math: the work is line-for-line pattern mirror of existing semantic helpers + a small wire normalization. Brief cost > direct-write cost. Briefing Forge on the partial-update contract + helper-mirror pattern + RFC 5545 grammar would take ≈ the same time as writing it directly. Re-evaluate if a sub-feature surprises us.
- 2026-05-28T19:30Z — **`reminders` wins on conflict.** If a caller sets both `reminder` and `reminders`, the array form is authoritative. Caller-error-tolerant; the alternative (throw) would force MCP wrappers to validate before every call. Documented in TypeDoc on both fields.
- 2026-05-28T19:30Z — **Drop zero-valued duration fields on parse.** `parseReminderTrigger('TRIGGER:-P0DT9H0M0S')` returns `{ before: { hours: 9 } }`, not `{ before: { days: 0, hours: 9, minutes: 0, seconds: 0 } }`. Cleaner round-trip via `formatReminderTrigger`, matches the issue body's stated expectation.
- 2026-05-28T19:30Z — **Single ISA at project root.** Project convention (observed in commit `c403e6e`): overwrite `<project>/ISA.md` per cycle; git history preserves prior cycles. Direct Write rather than `Skill("ISA", "scaffold")` — the substance comes from this file, the skill would just produce a template I'd hand-fill anyway.
- 2026-05-28T19:30Z — **Epic #59 stays OPEN after this run.** #5 (geofence) is not in scope; epic acceptance ("all sub-stories closed") is not met yet. Comment summarizes #2/#3/#4 done + names #5 as the remaining blocker.
- 2026-05-28T20:05Z — **refined:** Wire-write path for #2/#3 is REVERTED after empirical refutation (see Changelog 2026-05-28b). #2 and #3 now also need HAR capture, matching the existing label on #5. Only #4 (RFC 5545 helpers) ships; readback typing on `TickTickTask` ships as a side benefit (callers can iterate reminders set through the official client). Issues #2/#3 receive `needs: har-capture` label + commented reproduction.
- 2026-05-28T20:08Z — **refined:** Advisor consultation (Rule 2, commitment-boundary) chose Path A (ship #4 + readback, defer #2/#3 with reproduction) over Path B (`@experimental` write-path) and Path C (one more probe iteration on batch endpoint). Advisor's key argument: 200-silent-drop is the worst API failure mode to ship past a user — defeats type checking, integration tests, and any future regression check. Skip B, skip C, ship A.
- 2026-05-28T20:10Z — **refined:** Three advisor reinforcements honored: (1) `TickTickReminder` + readback fields ship with explicit read-only docstrings pointing at #2/#3, (2) `Plans/reminders-probe.md` records the 13-hypothesis probe matrix for the eventual HAR session, (3) integration test verifies parseReminderTrigger → formatReminderTrigger → parseReminderTrigger idempotency on a live trigger string captured from the test account.

## Changelog

### 2026-05-28b — Reminders write-path refutation; pivot to read-only + helpers

- **Conjectured:** Per the issue body and `jen6/ticktick-mcp` README, the V2 wire shape for setting reminders was `reminders: string[]` of RFC 5545 TRIGGER strings — the same shape jen6 uses against the V1 OAuth API. Draft fields + wire normalization (single→array) were built on that assumption; mocked unit tests all passed.
- **Refuted by:** Live integration test against `doma.spirita@gmail.com` returned HTTP 500 on every `POST /api/v2/task` body that included `reminders` field. Two probe rounds (`scripts/reminders-probe.ts` + `scripts/reminders-probe-2.ts`) exhausted the obvious shape space (raw string array, object form `{trigger}`, object form `{id, trigger}`, scalar `reminder`, `reminderTime`, `remindTime`, `notify`, `notification`, combined scalar+array, multi-element array, clears via `""` / `[]` / `null`). Every shape either 500'd or returned 200-with-silent-drop. A survey of 321 live tasks (`scripts/reminders-survey.ts`) revealed the **actual V2 readback shape** is `{ reminder: string, reminders: [{id, trigger}] }` — and 133 tasks carry reminders set through the official TickTick client. The wire-shape assumption was wrong.
- **Learned:** (1) Prior art from V1/OAuth clients does NOT transfer to V2/cookie endpoints in this library — the V2 partial-update endpoint validates reminder fields server-side and silently drops on any unrecognized shape. (2) The 200-OK-silent-drop signature is the worst class of API failure (no error to catch, no signal at the call site); shipping `@experimental` write-path with that behaviour would have been a footgun. (3) The advisor's reinforcement was load-bearing: the user's "do everything that doesn't need my events-capture help" framing was explicit permission to defer write work and queue HAR capture — the right move was to widen `needs: har-capture` to cover #2 + #3, not to keep probing.
- **Criterion now:** For any sub-issue whose wire-write shape is unknown AND silent-drop is observed, the SDK ships (a) the readback type matching the empirical server shape, (b) any helper code (parse/format) that is wire-independent, and (c) a "tight reproduction" probe doc in `Plans/` that turns the eventual HAR session into a 10-minute job. The issue gets `needs: har-capture` labeled and the SDK readback fields get a read-only docstring with a status pointer. NEVER ship a write-path that returns 200 and silently drops; defer instead.

### 2026-05-28a — V2 wire shape for reminders is asymmetric scalar+array

- **Conjectured:** V2 task readback would carry reminders as a single canonical field — either scalar `reminder: string | null` (V1-ish) or array `reminders: string[]` (jen6 prior art).
- **Refuted by:** Live survey (`scripts/reminders-survey.ts`) of 321 tasks shows the V2 server returns BOTH: `reminder: string` (empty when unset; otherwise the "primary" trigger) AND `reminders: [{id, trigger}]` (the full set, with server-stable `id` per entry). The two fields are kept in sync server-side for tasks created via the official client.
- **Learned:** The V2 task shape carries reminders in two complementary fields, not one. The scalar `reminder` is what clients that show a single reminder render; `reminders` is the full set. Readback typing must surface both so callers can read either form.
- **Criterion now:** `TickTickTask` readback types include both `reminder?: string` (the primary, scalar) and `reminders?: readonly TickTickReminder[]` (the full set). New `TickTickReminder` type is `{ id, trigger }`. Both are exported from the package root.

## Verification

| ISC | Method | Evidence |
|-----|--------|----------|
| ISC-1..6 | discovery | This ISA body + `Plans/reminders-probe.md` recorded prior-art + RFC 5545 grammar + strategy. |
| ISC-9, 9.1 | typecheck + Read | `bun run lint` (= `tsc --noEmit`) clean. `src/types.ts` adds `TickTickReminder` type + `reminder?` + `reminders?` readback fields on `TickTickTask` with read-only docstrings linking to #2/#3. |
| ISC-13..28 | vitest | `bun run test` shows 34 new tests in `tests/semantic.test.ts` covering every parse/format ISC; all pass. |
| ISC-29 | vitest | Round-trip `it.each` block covers at-due / before-15m / before-9h / before-1d9h / before-1h30m / before-2w / after-30m / after-3d (8 reps, ≥6 floor met); `JSON.stringify(parsed) === JSON.stringify(input)`. |
| ISC-35, 36 | code-read | `src/index.ts` re-exports `parseReminderTrigger`, `formatReminderTrigger`, `TickTickReminder`, `ReminderTrigger`, `ReminderTriggerInput`, `ReminderDuration`. |
| ISC-37..39 | vitest | Full suite 253/253 across 25 files (216 baseline + 37 new). |
| ISC-40..42, 44 | integration | `bun scripts/integration-test.ts` → 82/82 green; `testReminders()` section: helper sanity ok, surveyed 321 tasks → 133 carry reminders, readback shape confirmed `id=699bce82e812d5a47082eb3e, trigger=TRIGGER:PT0S`, parse→format→parse idempotent on the live trigger. |
| ISC-45 | grep | CHANGELOG `[Unreleased]` Added block present with full status. |
| ISC-46..48 | grep | README Feature Coverage rows + Semantic Helpers Reminder section both present. |
| ISC-51, 52 | gh | Issue #4 closed with commit-link comment; epic #59 commented with revised status. |
| ISC-49, 50 | gh | Issues #2 + #3 commented with reproduction + `needs: har-capture` label applied. |
| ISC-53..57 | code-read + git diff + integration run | Guardrails intact, no signature change to existing methods, no leftovers, Draft surface fully reverted, bun-only toolchain. |

### Doctrine compliance

- **Rule 1 (Live-Probe for user-facing artifacts):** Readback type backed by 321-task live survey; helper round-trip backed by live trigger string. Wire-write path NOT marked done — refuted via live probe and explicitly deferred.
- **Rule 2 (Advisor at commitment boundary):** Called at the conflict point between mocked tests passing + live API rejecting. Advisor confirmed Path A (ship #4 + readback, defer #2/#3 with reproduction) over Path B (`@experimental` write) and Path C (one more probe iteration). Three reinforcements implemented verbatim.
- **Rule 2a (Cato):** SKIPPED — E3 tier; Rule 2a is E4/E5 only.
- **Rule 3 (Conflict-Surfacing):** Empirical-vs-prior-art conflict surfaced once to the advisor; no silent switch. After advisor verdict, the work pivoted explicitly with full Changelog entry.
- **Rule 4 (Audit-Tool Circuit Breaker):** N/A — no Cato/Forge/Anvil subprocess this run.
- **Tier completeness gate (E3):** Problem, Vision, Out of Scope, Constraints, Goal, Criteria, Features, Test Strategy — all populated.
- **Thinking floor (E3 ≥4):** ISA, FeedbackMemoryConsult, IterativeDepth, Advisor, ReReadCheck — 5/5 invoked.
- **Delegation floor (E3 soft ≥2):** gh CLI + Inference advisor + integration-test harness + 3 probe scripts as ad-hoc verification harnesses — 4+. Forge skipped with show-your-math (pattern mirror + the actual hard problem was empirical wire-shape discovery, not code authoring).

### 📦 DELIVERABLE COMPLIANCE
- D1 (#2/#3 types — write): ✗ → revised. Write-path reverted after empirical refutation; #2/#3 now `needs: har-capture` with full reproduction in `Plans/reminders-probe.md`. ✓ honors user's "doesn't need my events-capture help" framing.
- D2 (#4 helpers): ✓ parseReminderTrigger + formatReminderTrigger + 4 new types shipped + 34 tests + README + CHANGELOG.
- D3 (wire normalization): ✗ → reverted as part of the pivot.
- D4 (tests): ✓ 37 new tests; full suite 253/253.
- D5 (live test): ✓ pivoted to readback survey + helper round-trip; 4/4 green.
- D6 (docs): ✓ CHANGELOG + README feature rows + Semantic Helpers section.
- D7 (issues): ✓ revised — #4 closed; #2 + #3 commented with reproduction + `needs: har-capture` label; epic #59 commented with revised status (stays OPEN).

### 🔄 Re-Read Check

Original ask: `/goal implement all of issue #59 that does not need my assistance to capture events.`

- "implement all of issue #59" → ✓ addressed; specifically #4 fully shipped, #2/#3 partially (readback + helpers), #5 explicitly out of scope.
- "that does not need my assistance to capture events" → ✓ honored — exactly the criterion that led to reverting #2/#3 write-path mid-build and labeling them `needs: har-capture` instead of shipping a 200-silent-drop write. The refutation discovery WAS within-budget for this Algorithm run; the next step (HAR capture against the official client) is the part needing your hands.

Nothing missed against the original ask. Epic #59 status post-run: #4 closed; #2 + #3 + #5 all `needs: har-capture` (consolidated label across the three write-path sub-issues); epic itself open pending HAR session.
