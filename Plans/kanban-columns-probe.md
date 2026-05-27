# Kanban Columns CRUD — Wire Discovery

Captured: 2026-05-27
Test account: doma.spirita@gmail.com
Discovery: 6 API-only probe iterations + 1 Interceptor UI capture (the answer)

## Wire shape — confirmed

| Operation | Method | Path | Body | Persisted? |
|-----------|--------|------|------|------------|
| **CREATE** | POST | `/api/v2/column` | `{add: [{id, projectId, name, sortOrder?}]}` | Yes |
| **UPDATE** | POST | `/api/v2/column` | `{update: [{id, projectId, name?, sortOrder?}]}` | Yes |
| **DELETE** | POST | `/api/v2/column` | `{delete: [{columnId, projectId}]}` | Yes |
| LIST | GET | `/api/v2/column?from=0&projectId=<id>` | — | (existing — server filter not honored; client-side projection in `projects.listColumns`) |

The web UI sends the full `{add:[], update:[], delete:[]}` envelope on every mutation; the library uses the partial envelope (just the array for the operation being performed) and the server accepts both.

## Critical gotchas

### UPDATE requires `projectId` on the update item

TickTick's update endpoint **silently no-ops** if the `projectId` field is missing from the update item. The server returns 200 with `{id2etag: {}, id2error: {}}` and discards the change. Every update payload MUST include the column's `projectId`. The TypeScript `TickTickColumnUpdate` type enforces this; the runtime in `projects.updateColumn` also throws an actionable error if the field is missing (belt-and-suspenders against `as any` bypass).

### DELETE uses `columnId` (not `id`) on the delete item

This is the load-bearing gotcha that took six probe iterations + an Interceptor UI capture to find. The delete item key is **`columnId`**, not `id` — uniquely so. Create and update both use `id`. Sending `{delete:[id-string]}` or `{delete:[{id, projectId}]}` returns server 500 `unknown_exception` (the body is even a malformed `200+500` hybrid — `{id2etag:{},id2error:{}}` concatenated with an error wrapper — strongly suggesting the server starts processing, fails to look up the column by the wrong key, then hits an uncaught exception in the error path).

Why `columnId`? Likely consistency with the foreign-key field on `TickTickTask.columnId` — the delete payload uses the FK name rather than the entity's own `id`.

## Discovery trail

| Iteration | What we tried | Outcome |
|-----------|---------------|---------|
| 1 | `POST /api/v2/batch/column` (mirroring projects / projectGroups pattern) | **404** |
| 2 | `POST /api/v2/column` with single object (no envelope) | 200 with empty `id2etag` — silent no-op |
| 3 | `POST /api/v2/column` with `{add:[…]}` envelope | **CREATE works** ✓ |
| 4 | `POST /api/v2/column` with `{update:[{id, name, sortOrder}]}` | 200 with empty `id2etag` — silent no-op |
| 5 | `POST /api/v2/column` with `{update:[{id, projectId, name, sortOrder}]}` | **UPDATE works** ✓ |
| 6 | DELETE variants — REST DELETE, batch envelopes, `{deleteIds}`, soft-delete via `update {deleted:1}`, full-record bodies, kebab paths, per-id verb paths | **all 404/405/500/silent-no-op** |
| 7 | `POST /api/v2/batch/check/0` with `{deleteColumns:[…]}` and two other envelope variants | **405** (endpoint is GET-only) |
| 8 | **Interceptor capture** of TickTick web UI deleting a column | **`POST /api/v2/column` body `{add:[], update:[], delete:[{columnId, projectId}]}`** — different field name (`columnId` not `id`) — confirmed against test account |

The lesson: when probing undocumented endpoints, the breakthrough sometimes isn't in the body shape — it's in a single field-name difference that no amount of permutation can guess. A real-UI capture via Interceptor closed the gap in one click after API-only probes had exhausted the obvious surface.

## Post-delete task behavior

Tasks that reference a deleted `columnId` keep the dangling reference on their `columnId` field (verified during the UI capture; non-cascading, same behavior as `projectGroups.delete` and child projects). The TickTick web UI treats those tasks as "uncategorized" in the kanban view. Callers that care about clean state should reassign tasks via `tasks.update({id, projectId, columnId: <other>})` before deleting the column.
