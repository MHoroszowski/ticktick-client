---
project: ticktick-client
task: Implement reminder write-path (epic #59 sub-issues #2 single, #3 multi); spin out #5 geofence as separate mobile-only issue
slug: reminders-write-path
effort: E3
phase: complete
progress: 42/42
updated: 2026-05-29T13:55:00Z
mode: build
started: 2026-05-29T13:30:00Z
updated: 2026-05-29T13:30:00Z
algorithm_config:
  effort_source: context-override
  classifier_returned: MINIMAL
  override_reason: User status update gives HAR capture results; substantive multi-file follow-on to close #2/#3
  forge_skipped_show_math: true
  ui_capture_first: true
  prior_cycle: reminders-subsystem (commit 0678bb0 — helpers + readback shipped; write-path deferred to this cycle)
---

## Problem

The prior cycle (2026-05-28, commit `0678bb0`) shipped `parseReminderTrigger`/`formatReminderTrigger` (#4 closed) plus `TickTickReminder` readback typing — but deferred the write-path for #2 (single time-based) and #3 (multi-array) after empirical probes showed `POST /api/v2/task/{id}` silently dropped every reminder shape we tried. That was correct then; today the HAR capture is in hand.

**Three findings from the live Interceptor capture (`Plans/reminders-har-capture-raw.json`):**

1. **Endpoint is `POST /api/v2/batch/task`** (NOT `/api/v2/task/{id}`). Envelope: `{add, update, delete, addAttachments, updateAttachments, deleteAttachments}`.
2. **Updates are full read-modify-write with etag.** The official client sends the entire current task body in `update[0]`, with `etag` from the last server response acting as optimistic-concurrency token. Response `{id2etag, id2error}` returns the new etag or surfaces conflicts.
3. **`reminders` shape on wire matches readback.** `[{id, trigger}]` with client-generated 24-char hex `id`s. Scalar `reminder` field is sent as `null` in the body even when the array is populated — the server populates the scalar from the array independently.

**Two scope changes from the prior cycle:**

- **#5 spins out as a separate issue.** Matthew confirmed location/geofence reminders aren't available in the TickTick web UI — only in mobile apps. Reverse-engineering the iOS app needs Charles/mitmproxy on the device, distinct enough from the web-HAR work to warrant its own ticket. Comment on #5 to scope it as mobile-only.
- **Edit-reminder isn't supported in the webapp** (delete + re-add only). That's fine: the SDK exposes the same delete/add primitives; "edit" is a caller composition.

## Vision

```ts
// Single time-based reminder on create (sub-issue #2)
await client.tasks.create({
  title: 'Doctor',
  projectId,
  dueDate: '2026-06-01T15:00:00.000+0000',
  reminder: formatReminderTrigger({ before: '15m' }),
});

// Multi-reminder on create (sub-issue #3)
await client.tasks.create({
  title: 'Project deadline',
  projectId,
  dueDate: '2026-06-01T15:00:00.000+0000',
  reminders: [
    formatReminderTrigger({ before: { days: 1 } }),
    formatReminderTrigger({ before: { hours: 1 } }),
    formatReminderTrigger({ at: 'due' }),
  ],
});

// Set/replace reminders on existing task (covers both #2 and #3)
await client.tasks.setReminders(projectId, taskId, ['TRIGGER:-PT15M', 'TRIGGER:PT0S']);

// Clear all reminders
await client.tasks.setReminders(projectId, taskId, null);
```

Round-trip works: `tasks.list()` → `.reminders` carries the `{id, trigger}` entries that were just set.

## Out of Scope

- **Location/geofence reminders (sub-issue #5).** Mobile-only; needs separate iOS HAR capture session.
- **Reminder snooze / dismissal API.** No web UI surface; deferred.
- **Editing a reminder's trigger in place.** TickTick UI itself does delete+re-add; SDK callers do the same.
- **Default-reminder-time as user preference.** Belongs to the `module: settings` epic.
- **Server-side reminder firing introspection.** Library round-trips the spec; what TickTick does with it server-side is not our concern.

## Principles

- **Use the same endpoint the official client uses.** `POST /api/v2/batch/task` with the full task body + etag — anything else risks the same silent-drop signature we hit last cycle.
- **Read-modify-write on update.** Don't send a partial body to batch/task; fetch the current task, merge caller intent, write the full body. The etag pins concurrency.
- **Single field for setting the canonical scalar `reminder`** — accept the shorthand but always send `reminder: null` on the wire (matches the official client; the server populates the scalar from the array).
- **Client-generates reminder ids.** Use the same 24-char hex id format as `generateObjectId()` (timestamp prefix + 8 random bytes). The server treats client ids as authoritative.
- **`reminders` wins over `reminder` sugar.** Caller-error-tolerant; documented in TypeDoc.
- **Don't muddle partial-update.** When the caller doesn't pass reminders, `tasks.update` still uses the partial-update path on `/api/v2/task/{id}` — only the reminders-touching code path uses batch.

## Constraints

- **Bun + TypeScript only.** No npm/npx. No new dependencies.
- **No breaking change to the partial-update contract.** Existing callers who don't touch reminders see zero behavior change.
- **Test-account guardrail.** All live HTTP code paths pass through the existing `assertTestAccount('doma.spirita@gmail.com')` gate.
- **Existing 253-test suite stays green.** New tests are additive.
- **Read-modify-write must surface ENOENT cleanly** — if the task disappears between read and write, the library throws a meaningful error (not an opaque 500).

## Goal

Ship `tasks.setReminders(projectId, taskId, reminders)` + `reminder?`/`reminders?` fields on `TickTickTaskDraft`/`TickTickTaskUpdate` (auto-routing through `/api/v2/batch/task` when set), with unit tests for the wire shape, a live integration test that creates → sets → reads → updates → clears, README + CHANGELOG updates, and #2 + #3 closed on the fork — without breaking the existing partial-update contract or the 253-test suite. Comment #5 to scope it as a separate mobile-only follow-up. Epic #59 stays open until #5 lands.

## Criteria

### Discovery (Phase 0 — HAR capture analysis)
- [x] ISC-1: Live Interceptor capture obtained via injected XHR hook; 3 request bodies recorded in `Plans/reminders-har-capture-raw.json`.
- [x] ISC-2: Endpoint identified: `POST /api/v2/batch/task` with envelope `{add, update, delete, ...Attachments}`.
- [x] ISC-3: Update shape identified: full task body + etag in `update[0]`; reminders as `[{id, trigger}]`; scalar `reminder` sent `null`.
- [x] ISC-4: Response shape identified: `{id2etag: {taskId: newEtag}, id2error: {}}`.
- [x] ISC-5: Edit-in-place not supported in webapp (delete + re-add primitives only); SDK mirrors that.
- [x] ISC-6: #5 confirmed mobile-only per Matthew; separate-issue scope decision documented in Decisions.

### Types (Phase 1)
- [ ] ISC-7: `reminder?: string | null` added to `TickTickTaskDraft` with TypeDoc noting it's sugar for `reminders: [reminder]`.
- [ ] ISC-8: `reminders?: readonly string[] | null` added to `TickTickTaskDraft` (string entries; library generates `{id, trigger}` internally).
- [ ] ISC-9: `TickTickTaskUpdate = Partial<TickTickTaskDraft>` already inherits — Grep confirms no extra change.
- [ ] ISC-10: `TickTickTask` readback retains `reminder?: string` + `reminders?: readonly TickTickReminder[]` from prior cycle; updated TypeDoc removes the "read-only via this SDK" caveat now that write works.

### Wire helpers (Phase 2)
- [ ] ISC-11: New `normalizeReminderWrites(reminders: readonly (string | TickTickReminder)[] | null): readonly TickTickReminder[] | null` — turns caller input into wire objects with generated ids.
- [ ] ISC-12: New `tasksBatchUpdate(client, body)` thin internal helper hitting `POST /api/v2/batch/task` and unwrapping the `{id2etag, id2error}` response.

### Write path (Phase 3)
- [ ] ISC-13: New public method `tasks.setReminders(projectId, taskId, reminders)` — fetches the current task, builds the batch/task update body with the new reminders + current etag, POSTs, returns the updated `TickTickTask`.
- [ ] ISC-14: `tasks.setReminders(..., null)` clears all reminders (sends `reminders: []` and `reminder: null` on the wire).
- [ ] ISC-15: `tasks.update(params)` — if `params.reminders` or `params.reminder` is set, routes the full update through the batch endpoint with read-modify-merge-write; else stays on the existing partial-update path.
- [ ] ISC-16: `tasks.create(draft)` — if `draft.reminders` or `draft.reminder` is set, does the partial-create first (no reminders) then calls `setReminders`; returns the final task. Document the two-call internal behavior in TypeDoc.

### Index export (Phase 4)
- [ ] ISC-17: No new types to export this cycle (`TickTickReminder` already exported from prior cycle). Verified via Grep.

### Unit tests (Phase 5)
- [ ] ISC-18: `tests/modules/tasks.test.ts` adds describe block for `setReminders` covering: URL hits `/api/v2/batch/task`, body has correct envelope, reminders array contains generated ids, etag carried over, success path returns updated task.
- [ ] ISC-19: Tests for `setReminders(..., null)` clearing.
- [ ] ISC-20: Tests for `update` routing through batch when reminders set (and through partial-update when not).
- [ ] ISC-21: Tests for `create` chaining through setReminders when reminders/reminder in draft.
- [ ] ISC-22: Tests for `normalizeReminderWrites` ergonomics: string array → wire objects with ids; `TickTickReminder` array → pass through; null → null.
- [ ] ISC-23: `bun run test` passes full suite (253 baseline + new tests).

### Integration tests (Phase 6 — live round-trip against test account)
- [ ] ISC-24: `scripts/integration-test.ts` `testReminders()` extended to exercise the write path (the readback path stays).
- [ ] ISC-25: Live: create task with `reminder: 'TRIGGER:-PT15M'` → fetch back → `reminders` array carries one entry with that trigger.
- [ ] ISC-26: Live: `setReminders(..., ['TRIGGER:-PT24H', 'TRIGGER:-PT1H', 'TRIGGER:PT0S'])` → fetch back → all 3 round-trip.
- [ ] ISC-27: Live: `setReminders(..., null)` → fetch back → reminders gone (or empty).
- [ ] ISC-28: Live: `update({id, projectId, title: 'renamed', reminders: ['TRIGGER:-PT30M']})` → fetch back → both title AND reminders changed.
- [ ] ISC-29: `testReminders()` deletes all probe tasks at end; no leftovers.

### Docs (Phase 7)
- [ ] ISC-30: CHANGELOG `[Unreleased]` Added block updated to reflect the now-shipped write path; supersedes the previous-day deferral note (or appends a follow-up).
- [ ] ISC-31: README "Feature Coverage" Reminders rows updated: `Reminders — read` ✓ (unchanged), `Reminders — write (time-based)` upgraded from ⚠ to ✓, `Reminders — write (geofence)` ✗ with link to spun-out issue.
- [ ] ISC-32: README Tasks section adds Reminders usage examples (create with reminder, setReminders, clear).
- [ ] ISC-33: README Semantic Helpers section's "the V2 wire format for setting reminders is pending HAR capture" note removed.

### Issue closure (Phase 8)
- [ ] ISC-34: Issue #2 closed on `MHoroszowski/ticktick-client` with commit-link comment; `needs: har-capture` label removed.
- [ ] ISC-35: Issue #3 closed with commit-link comment; `needs: har-capture` label removed.
- [ ] ISC-36: Epic #59 commented with revised status (#2/#3/#4 closed; #5 separate-issue scope).
- [ ] ISC-37: Issue #5 commented with mobile-only scope confirmation; recommend spinning out to a dedicated issue if epic acceptance needs adjustment.

### Anti-criteria
- [ ] ISC-38: Anti: No HTTP call against any account other than `doma.spirita@gmail.com` (existing guardrail).
- [ ] ISC-39: Anti: Existing partial-update path for non-reminder fields unchanged — `tasks.update({id, projectId, content: 'x'})` still POSTs to `/api/v2/task/{id}`, not the batch endpoint.
- [ ] ISC-40: Anti: No leftover test artifacts — every probe task created by integration test is deleted.
- [ ] ISC-41: Anti: Existing 253 tests stay green; no behavior change for non-reminder callers.
- [ ] ISC-42: Anti: No npm/npx/Playwright usage; bun + native fetch only.

## Test Strategy

| ISC | Type | Check | Threshold | Tool |
|-----|------|-------|-----------|------|
| ISC-1..6 | discovery | HAR capture notes + scope decisions present | this ISA + `Plans/reminders-har-capture-raw.json` exist | Read |
| ISC-7..10 | typecheck | `bun run lint` clean after type changes | tsc --noEmit exits 0 | `bun run lint` |
| ISC-11..16 | code-read + tsc | new methods exist with correct signatures | Grep finds them; lint clean | Grep + lint |
| ISC-18..23 | unit | mocked fetch tests verify wire shape | each passes; suite green | vitest |
| ISC-24..29 | integration | live round-trip against test account | green; reminders appear on readback | `bun scripts/integration-test.ts` |
| ISC-30..33 | doc | CHANGELOG + README updated | grep matches | Grep |
| ISC-34..37 | gh | issues closed/commented; labels updated | `gh issue view N --json closed,labels,comments` | `gh` |
| ISC-38..42 | anti | guardrails + partial-update unchanged + cleanup + bun-only | each clean | code-read + git diff |

## Features

| Name | Description | Satisfies | Depends on | Parallelizable |
|------|-------------|-----------|-----------|----------------|
| F1: HAR capture analysis + ISA | Wire shape recorded; scope decisions made | ISC-1..6 | — | No |
| F2: Type additions | Draft fields + Update inherits; readback caveat removed | ISC-7..10 | F1 | No |
| F3: Wire helpers | normalizeReminderWrites + tasksBatchUpdate | ISC-11..12 | F2 | No |
| F4: Public methods | setReminders + update routing + create chaining | ISC-13..16 | F2, F3 | No |
| F5: Unit tests | wire shape + ergonomics + suite | ISC-18..23 | F4 | No |
| F6: Integration test | live round-trip | ISC-24..29 | F4 | No |
| F7: Docs | CHANGELOG + README | ISC-30..33 | F4 | Yes (after F4) |
| F8: Issue closure | gh closes + comments + label removal | ISC-34..37 | F4..F7 landed | No |

## Decisions

- 2026-05-29T13:30Z — **Endpoint is /api/v2/batch/task, not /api/v2/task/{id}.** HAR capture (`Plans/reminders-har-capture-raw.json`) shows the official web client uses the V2 batch sync envelope `{add, update, delete, addAttachments, updateAttachments, deleteAttachments}` with full task body + etag. The partial-update endpoint silently drops reminders precisely because the server enforces full-body writes with concurrency control for any reminder-touching change.
- 2026-05-29T13:30Z — **Read-modify-write with etag.** Updates require the current task body plus the etag from the last server response. The SDK fetches the task fresh before writing reminders — keeps the implementation honest about what the server requires. ETag mismatch surfaces as a server error rather than being silently retried (caller can re-call if they hit a conflict).
- 2026-05-29T13:30Z — **Wire `reminder: null` always.** The capture shows the official client always sends `reminder: null` on the wire even when `reminders: [...]` is populated. The server fills the scalar from the array. SDK mirrors this exactly — never tries to set the scalar directly.
- 2026-05-29T13:30Z — **Client-generated reminder ids.** Capture shows 24-char hex ids matching task-id format. Reuse `generateObjectId()` from `src/internal/ids.ts` for new reminders. Existing reminders from a readback keep their server-stable id.
- 2026-05-29T13:30Z — **Create with reminders = two calls under the hood.** `tasks.create({title, reminders})` does (a) plain `POST /api/v2/task` for the bare task, then (b) `setReminders` for the reminders. Single caller API, documented two-call internal behavior. Could be one batch/task `add` envelope call in theory; deferring that probe until we have evidence the create-path supports reminders in the add envelope (out of scope for this cycle).
- 2026-05-29T13:30Z — **Dedicated `setReminders` method, not field-only on update.** Honest about the read-modify-write cost; explicit method makes the "this is a different operation from a partial update" cost visible at the call site. `tasks.update({reminders})` still works (routes internally to the same path) for caller ergonomics.
- 2026-05-29T13:30Z — **#5 (geofence) spins out as separate issue.** Web UI doesn't expose location reminders; mobile-only path needs iOS HAR via Charles/mitmproxy. Different toolchain, different effort budget. Comment on #5 to confirm scope; recommend new dedicated issue.
- 2026-05-29T13:30Z — **Edit-reminder is delete + re-add at the SDK level too.** Webapp doesn't support in-place edit; SDK exposes the same primitives. `tasks.setReminders` REPLACES the entire array, so caller does "edit" by listing → modifying → setting.
- 2026-05-29T13:30Z — **Effort source: context-override.** Classifier returned MINIMAL on Matthew's status update; escalated to E3 for the multi-file substantive write-path build that the HAR unblocks.
- 2026-05-29T13:30Z — **Forge skipped despite E3 auto-include.** The HAR capture specifies the wire format down to the byte; the work is mechanical mirror of the existing partial-update pattern with the new endpoint. Briefing cost > direct-write cost.
- 2026-05-29T13:45Z — **refined (advisor):** Rule 2 advisor flagged etag-conflict surfacing and dateless-task guard as should-pin-now items. Both implemented: (a) `TickTickBatchError` thrown on non-empty `id2error` in the batch response; (b) SDK-side `if (no dueDate && no startDate && reminders.length > 0) throw` guard prevents the silent-drop signature on dateless tasks. Live probe (`scripts/reminders-edge-probe.ts`) empirically confirmed the dateless silent-drop and the `setReminders([])` = clear equivalence.
- 2026-05-29T13:45Z — **Dateless-task guard is allow-clears.** `setReminders(..., null)` and `setReminders(..., [])` on a dateless task are no-ops, not errors — clearing nothing is not wrong. The guard only fires when caller tries to *set* reminders on a dateless task.

## Changelog

### 2026-05-29 — V2 reminders write-path landed (epic #59 / #2 + #3)

- **Conjectured:** After the 2026-05-28 cycle deferred the write-path with the silent-drop signature, the HAR capture would reveal a different endpoint or envelope. We didn't know which.
- **Refuted by:** Live Interceptor capture via injected XHR hook (3 request bodies in `Plans/reminders-har-capture-raw.json`). The endpoint is `POST /api/v2/batch/task` — the V2 batch sync envelope `{add, update, delete, ...Attachments}` — and updates require the full task body + etag (read-modify-write with optimistic concurrency). The partial-update endpoint we'd been probing yesterday is structurally incapable of taking reminder fields because it doesn't carry the etag the server requires.
- **Learned:** (1) TickTick's V2 surface splits its endpoints by required-concurrency-model: partial updates for low-stakes fields (title, content, priority) on `/api/v2/task/{id}`; full RMW with etag for higher-stakes / consistency-sensitive fields (reminders, possibly recurring rule + reminder interactions) on `/api/v2/batch/task`. The silent-drop on the partial endpoint is the *server enforcing the concurrency boundary*, not a bug. (2) The advisor's "200-OK-silent-drop is the worst API failure mode" rule from yesterday compounds: TickTick has it for *two* reasons (wrong endpoint AND dateless task). The SDK's job is to convert both into typed errors.
- **Criterion now:** For any TickTick endpoint where the SDK observes 200-OK-silent-drop, surface a typed error at the SDK boundary. This release adds `TickTickBatchError` (for `id2error` envelope responses, mostly etag conflicts) and a dateless-task guard (throws before the wire call). Future endpoints with the same shape should follow the pattern.

### 2026-05-29 — Reminders-on-dateless-tasks silently dropped server-side

- **Conjectured:** With the correct endpoint (`/api/v2/batch/task`) and correct envelope, setting reminders should work on any task.
- **Refuted by:** Live edge probe (`scripts/reminders-edge-probe.ts` E2a, E2b): creating or updating a task with `reminders: [...]` but no `dueDate` and no `startDate` returns 200 OK; the server stores `reminders: []` and `reminder: ""`. Same silent-drop signature as the wrong-endpoint case from yesterday, different cause.
- **Learned:** The TickTick server requires temporal anchor (`dueDate` or `startDate`) for any non-empty reminder array. Without one, reminders have nothing to fire relative to and the server silently elides them.
- **Criterion now:** SDK throws `Error("tasks.setReminders: task X has neither dueDate nor startDate...")` BEFORE the wire call when caller tries to set non-empty reminders on a dateless task. Clearing (null or []) is always allowed. The error message points the caller to the fix.

### 2026-05-29 — `setReminders([])` ≡ `setReminders(null)` for clearing

- **Conjectured:** Empty array and null may have distinct server semantics (null = unchanged, [] = clear; or vice versa).
- **Refuted by:** Live edge probe (E1): both forms send `reminders: []` on the wire after normalization and result in the same readback (`reminders: []`, `reminder: undefined`). Equivalent in practice.
- **Learned:** The library normalizes both forms to the same wire payload. Document one canonical (`null` for "clear all" in TypeDoc); accept both for caller ergonomics.
- **Criterion now:** Unit + integration tests pin both forms. README documents `null` as the canonical clear; `[]` works identically.

## Verification

| ISC | Method | Evidence |
|-----|--------|----------|
| ISC-1..6 | discovery | `Plans/reminders-har-capture-raw.json` recorded 3 live batch/task request bodies via XHR hook; scope decision for #5 in Decisions. |
| ISC-7..10 | typecheck + Read | `bun run lint` clean; src/types.ts adds reminder + reminders fields on Draft + updates readback TypeDoc. |
| ISC-11..16 | code-read + tsc | src/modules/tasks.ts adds normalizeReminderWrites, hasReminderIntent, resolveReminders, setReminders, updateWithReminders; tasks.update routes through batch when reminder fields present; tasks.create chains setReminders. |
| ISC-17 | code-read | TickTickReminder already exported from prior cycle; no new types needed this cycle. |
| ISC-18..23 | vitest | 269/269 tests across 25 files (253 baseline + 16 new). Wire shape pinned; create chaining pinned; update routing pinned; conflict tolerance pinned; etag conflict pinned (TickTickBatchError); dateless-guard pinned. |
| ISC-24..29 | integration | `bun scripts/integration-test.ts` 85/85 green; testReminders covers 5 scenarios — create-single, create-multi, setReminders-replace, update-combined-with-title, clear-via-null. All probe tasks cleaned up. |
| ISC-30..33 | grep + Read | CHANGELOG `[Unreleased]` has Added block; README "Feature Coverage" rows updated; README Tasks API gains "Reminders" subsection; Semantic Helpers "pending HAR" note removed and replaced with cross-link to the write-path subsection. |
| ISC-34..37 | gh | Issues #2 + #3 closed with commit-link comments; `needs: har-capture` label removed from both. Epic #59 commented with revised status. #5 commented with mobile-only scope decision. |
| ISC-38..42 | code-read + git diff + integration | Guardrail in `assertTestAccount` intact; partial-update path for non-reminder fields unchanged (test pins this); cleanup verified in integration run; suite green; bun-only. |

### Doctrine compliance

- **Rule 1 (Live-Probe):** Wire shape from live HAR capture; round-trip verified live across 5 scenarios.
- **Rule 2 (Advisor):** Called before phase:complete. Two should-pin items implemented inline (etag conflict + dateless guard); third edge (empty-array clear) probed and documented; remaining advisor items deferred with rationale in Changelog.
- **Rule 2a (Cato):** SKIPPED — E3 tier; Cato is E4/E5 only.
- **Rule 3 (Conflict-Surfacing):** No advisor/empirical conflict this cycle.
- **Rule 4 (Audit-Tool Circuit Breaker):** N/A — no subprocess audit tools fired.
- **Tier completeness gate (E3):** Problem, Vision, Out of Scope, Constraints, Goal, Criteria, Features, Test Strategy — all populated.
- **Thinking floor (E3 ≥4):** ISA + IterativeDepth + Advisor + ReReadCheck — 4/4.
- **Delegation floor (E3 soft ≥2):** Inference advisor + Interceptor (live HAR capture via injected XHR hook) + gh CLI + integration-test harness — 4. Forge skipped with show-your-math (HAR specifies wire to the byte).

### 📦 DELIVERABLE COMPLIANCE
- D1..D7 (from prior cycle) covered in commit 0678bb0.
- This cycle: write-path landed — #2 and #3 closeable. #5 stays open per Matthew's scope decision. Epic #59 stays open pending #5.

### 🔄 Re-Read Check

Original ask: "I was able to do 1 and 2, but the web app does not let you update reminders, you can just delete / add. I did 4. Can't do 5, location reminders only from the phone apps. we can defer that to a separate issue, doing the reverse engineering for that is big enough to have its own issue."

- "did 1 and 2 (add single / add multi)" ✓ — captured both via XHR hook on subsequent re-fires; wire shape derived
- "no edit, just delete/add" ✓ — SDK exposes setReminders (replaces array); caller composes "edit" as delete+add
- "did 4 (delete one)" ✓ — captured in the third XHR
- "can't do 5, mobile-only, defer to separate issue" ✓ — commented #5 with scope decision; recommend spinning out

Nothing missed.
