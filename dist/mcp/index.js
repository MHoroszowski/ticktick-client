#!/usr/bin/env node

// src/mcp/index.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/errors.ts
var TickTickError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "TickTickError";
  }
};
var TickTickAuthError = class extends TickTickError {
  constructor(message) {
    super(message);
    this.name = "TickTickAuthError";
  }
};
var TickTickApiError = class extends TickTickError {
  constructor(message, url, method, status, responseBody) {
    super(message);
    this.url = url;
    this.method = method;
    this.status = status;
    this.responseBody = responseBody;
    this.name = "TickTickApiError";
  }
  url;
  method;
  status;
  responseBody;
};
var TickTickBatchError = class extends TickTickError {
  constructor(message, errors) {
    super(message);
    this.errors = errors;
    this.name = "TickTickBatchError";
  }
  errors;
};

// src/internal/cookies.ts
function parseCookies(headers) {
  const setCookieHeaders = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie") ?? ""].filter(Boolean);
  const cookies = {};
  for (const header of setCookieHeaders) {
    const nameValue = header.split(";")[0] ?? "";
    const eqIdx = nameValue.indexOf("=");
    if (eqIdx !== -1) {
      const name = nameValue.substring(0, eqIdx).trim();
      const value = nameValue.substring(eqIdx + 1).trim();
      if (name) cookies[name] = value;
    }
  }
  return cookies;
}
function serializeCookies(cookies) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}
function mergeCookies(base, next) {
  return { ...base, ...next };
}

// src/internal/ids.ts
function generateObjectId() {
  const timestamp = Math.floor(Date.now() / 1e3).toString(16).padStart(8, "0");
  let random = "";
  for (let i = 0; i < 16; i++) random += Math.floor(Math.random() * 16).toString(16);
  return timestamp + random;
}

// src/internal/partial-update.ts
function buildPartialUpdateBody(params) {
  const body = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== void 0) body[key] = value;
  }
  return body;
}

// src/modules/tasks.ts
function normalizeReminderWrites(reminders) {
  if (reminders === void 0) return void 0;
  if (reminders === null) return null;
  return reminders.map(
    (r) => typeof r === "string" ? { id: generateObjectId(), trigger: r } : r
  );
}
function hasReminderIntent(p) {
  return "reminders" in p || "reminder" in p;
}
function resolveReminders(p) {
  if ("reminders" in p) return normalizeReminderWrites(p.reminders);
  if (!("reminder" in p)) return void 0;
  if (p.reminder === null) return null;
  if (p.reminder === void 0) return void 0;
  return [{ id: generateObjectId(), trigger: p.reminder }];
}
var TasksModule = class {
  constructor(client) {
    this.client = client;
  }
  client;
  async list() {
    const response = await this.client.request("GET", "/api/v3/batch/check/0");
    return response.syncTaskBean?.update ?? [];
  }
  async listCompleted(options) {
    const params = new URLSearchParams({ from: "", status: "Completed" });
    if (options?.projectId) params.set("projectId", options.projectId);
    if (options?.limit !== void 0) params.set("limit", String(options.limit));
    return this.client.request(
      "GET",
      `/api/v2/project/all/closed?${params.toString()}`
    );
  }
  /**
   * Create a task.
   *
   * **Reminder handling:** if the draft includes `reminder` (sugar) or
   * `reminders`, the library executes two HTTP calls under the hood —
   * (a) `POST /api/v2/task` to create the bare task, then (b)
   * {@link setReminders} to attach the reminders via the V2 batch sync
   * endpoint. This is the same pattern the official TickTick web
   * client uses; the partial-create endpoint silently drops reminder
   * fields.
   */
  async create(draft) {
    const reminders = resolveReminders(draft);
    const { reminder: _r, reminders: _rs, ...rest } = draft;
    const created = await this.client.request(
      "POST",
      "/api/v2/task",
      buildPartialUpdateBody({ id: generateObjectId(), ...rest })
    );
    if (reminders === void 0) return created;
    const projectId = created.projectId;
    return this.setReminders(projectId, created.id, reminders);
  }
  /**
   * Partial-update a task. By default sends a partial body to
   * `POST /api/v2/task/{id}` — only the fields you pass are touched.
   *
   * **Reminder handling:** if `reminder` (sugar) or `reminders` is in
   * the params, the library re-routes the entire update through the V2
   * batch sync endpoint (`POST /api/v2/batch/task`) with full
   * read-modify-merge-write semantics — this is required because the
   * partial-update endpoint silently drops reminder fields. All other
   * fields you pass land in the same batch write; fields you omit
   * preserve their current value.
   */
  async update(params) {
    if (hasReminderIntent(params)) {
      return this.updateWithReminders(params);
    }
    return this.client.request(
      "POST",
      `/api/v2/task/${params.id}`,
      buildPartialUpdateBody(params)
    );
  }
  /**
   * Replace the full reminders array on an existing task. Pass `null`
   * to clear all reminders.
   *
   * Implementation note: this is a read-modify-write — the library
   * fetches the current task body, swaps in the new reminders + the
   * current etag, and POSTs to `POST /api/v2/batch/task`. Reminder
   * entries with a `TickTickReminder` shape preserve their existing
   * `id` (use this on round-trips); plain trigger strings get a
   * client-generated id.
   */
  async setReminders(projectId, taskId, reminders) {
    return this.updateWithReminders({
      id: taskId,
      projectId,
      reminders
    });
  }
  /**
   * Internal: read-modify-merge-write through the V2 batch sync
   * endpoint. Fetches the current task body (so we have all fields +
   * the current etag), applies the caller's partial overrides plus the
   * resolved reminders, and POSTs to `POST /api/v2/batch/task` in an
   * `update` envelope. Returns the post-write task body (re-fetched so
   * the response reflects the new etag + populated `reminder` scalar).
   */
  async updateWithReminders(params) {
    const all = await this.list();
    const current = all.find((t) => t.id === params.id);
    if (!current) {
      throw new Error(
        `tasks.update: task ${params.id} not found (cannot read-modify-write reminders)`
      );
    }
    const resolved = resolveReminders(params);
    const wireReminders = resolved === null ? [] : resolved !== void 0 ? resolved : current.reminders ?? [];
    const { reminder: _r, reminders: _rs, ...overrides } = params;
    const updateEntry = {
      ...current,
      ...overrides,
      reminders: wireReminders,
      reminder: null
    };
    if (wireReminders.length > 0) {
      const dueDate = updateEntry.dueDate ?? null;
      const startDate = updateEntry.startDate ?? null;
      if (!dueDate && !startDate) {
        throw new Error(
          `tasks.setReminders: task ${params.id} has neither dueDate nor startDate \u2014 TickTick silently drops reminders on dateless tasks. Set dueDate (or startDate) in the same call, or set it first via tasks.update.`
        );
      }
    }
    const resp = await this.client.request("POST", "/api/v2/batch/task", {
      add: [],
      update: [updateEntry],
      delete: [],
      addAttachments: [],
      updateAttachments: [],
      deleteAttachments: []
    });
    if (resp.id2error && Object.keys(resp.id2error).length > 0) {
      throw new TickTickBatchError(
        `batch/task reported per-item failure: ${JSON.stringify(resp.id2error)}`,
        resp.id2error
      );
    }
    const fresh = await this.list();
    const after = fresh.find((t) => t.id === params.id);
    if (!after) {
      throw new Error(
        `tasks.update: task ${params.id} disappeared after batch write`
      );
    }
    return after;
  }
  async complete(projectId, taskId) {
    await this.client.request("POST", `/api/v2/task/${taskId}`, {
      id: taskId,
      projectId,
      status: 2,
      completedTime: (/* @__PURE__ */ new Date()).toISOString().replace("Z", "+0000")
    });
  }
  async delete(projectId, taskId) {
    await this.client.request("POST", `/api/v2/task/${taskId}`, { id: taskId, projectId, status: -1 });
  }
  // ───────── #3 Batch operations ─────────
  async createMany(drafts) {
    await Promise.all(
      drafts.map(
        (draft) => this.client.request(
          "POST",
          "/api/v2/task",
          buildPartialUpdateBody({ id: generateObjectId(), ...draft })
        )
      )
    );
  }
  async updateMany(params) {
    await Promise.all(
      params.map(
        (p) => this.client.request("POST", `/api/v2/task/${p.id}`, buildPartialUpdateBody(p))
      )
    );
  }
  async deleteMany(items) {
    await Promise.all(
      items.map(
        (item) => this.client.request("POST", `/api/v2/task/${item.taskId}`, {
          id: item.taskId,
          projectId: item.projectId,
          status: -1
        })
      )
    );
  }
  // ───────── #4 Move between projects ─────────
  //
  // Verified 2026-04-07 via Playwright traffic capture:
  // - POST /api/v3/batch/taskProject → 404 (endpoint does not exist)
  // - POST /api/v2/task/{id} with new projectId → 200 but projectId NOT changed
  // - Web app uses WebSocket for native moves (not available via REST API)
  //
  // Only viable approach: copy-to-destination + delete-from-source.
  // The returned task has a NEW id. Use result.previousId to track the mapping.
  /**
   * Move a task to a different project.
   *
   * **⚠️ ID changes:** The TickTick REST API does not support in-place project
   * moves. This method copies the task to the destination project and deletes
   * the original. The returned `TickTickMoveResult` contains both the new task
   * and the `previousId` for reference tracking.
   */
  async move(item) {
    const all = await this.list();
    const task = all.find((t) => t.id === item.taskId);
    if (!task) throw new Error(`Task ${item.taskId} not found`);
    const newTask = await this.client.request("POST", "/api/v2/task", {
      ...task,
      id: generateObjectId(),
      projectId: item.toProjectId
    });
    await this.client.request("POST", `/api/v2/task/${item.taskId}`, {
      id: item.taskId,
      projectId: item.fromProjectId,
      status: -1
    });
    return { task: newTask, previousId: item.taskId };
  }
  /**
   * Move multiple tasks to different projects.
   *
   * **⚠️ ID changes:** Same copy+delete limitation as {@link move}.
   * Returns an array of `TickTickMoveResult` with old-to-new ID mappings.
   */
  async moveMany(items) {
    const all = await this.list();
    return Promise.all(
      items.map(async (item) => {
        const task = all.find((t) => t.id === item.taskId);
        if (!task) throw new Error(`Task ${item.taskId} not found`);
        const newTask = await this.client.request("POST", "/api/v2/task", {
          ...task,
          id: generateObjectId(),
          projectId: item.toProjectId
        });
        await this.client.request("POST", `/api/v2/task/${item.taskId}`, {
          id: item.taskId,
          projectId: item.fromProjectId,
          status: -1
        });
        return { task: newTask, previousId: item.taskId };
      })
    );
  }
  // ───────── #5 Subtask support ─────────
  async createSubtask(parentTaskId, parentProjectId, draft) {
    return this.client.request("POST", `/api/v2/task/${parentTaskId}`, {
      id: parentTaskId,
      projectId: parentProjectId,
      items: [{ id: generateObjectId(), title: draft.title, status: 0, sortOrder: draft.sortOrder ?? 0 }]
    });
  }
  // ───────── #7 Pin / Unpin ─────────
  async pin(taskId, projectId, date) {
    await this.client.request("POST", `/api/v2/task/${taskId}`, {
      id: taskId,
      projectId,
      pinnedTime: (date ?? /* @__PURE__ */ new Date()).toISOString()
    });
  }
  async unpin(taskId, projectId) {
    await this.client.request("POST", `/api/v2/task/${taskId}`, {
      id: taskId,
      projectId,
      pinnedTime: null
    });
  }
  // ───────── #8 Trash ─────────
  /**
   * Lists tasks in a project (intended for trash retrieval).
   *
   * **⚠️ Known limitation (confirmed 2026-04-07):** The `status=-1` query
   * parameter is **ignored** by the TickTick REST API. This endpoint returns
   * active tasks regardless of the status filter. Deleted tasks do not appear
   * in any known REST endpoint.
   *
   * - `GET /api/v2/project/{id}/tasks?status=-1` → returns active tasks (status=0)
   * - `GET /api/v2/trash/tasks` → 404 (does not exist)
   *
   * This method is kept for forward compatibility in case TickTick fixes the
   * endpoint, but callers should not rely on it returning deleted tasks.
   *
   * @see https://github.com/jaeyeonling/ticktick-client/issues/33
   */
  async listTrash(options) {
    const params = new URLSearchParams({ status: "-1" });
    if (options.limit !== void 0) params.set("limit", String(options.limit));
    return this.client.request(
      "GET",
      `/api/v2/project/${options.projectId}/tasks?${params.toString()}`
    );
  }
  /**
   * Restores a deleted task by setting its status back to 0 (open).
   *
   * **⚠️ Known limitation:** Since {@link listTrash} cannot reliably retrieve
   * deleted task IDs, this method requires you to know the task ID beforehand
   * (e.g., saved before deletion).
   */
  async restore(taskId, projectId) {
    await this.client.request("POST", `/api/v2/task/${taskId}`, { id: taskId, projectId, status: 0 });
  }
  // ───────── #9 Async iterator for completed tasks ─────────
  async *iterateCompleted(options) {
    const params = new URLSearchParams({ from: "", status: options?.status ?? "Completed" });
    if (options?.projectId) params.set("projectId", options.projectId);
    while (true) {
      const page = await this.client.request(
        "GET",
        `/api/v2/project/all/closed?${params.toString()}`
      );
      if (page.length === 0) break;
      yield page;
      const last = page[page.length - 1];
      const cursor = (last?.completedTime ?? "").replace(/\.\d+\+\d+$/, "").replace(/\.\d+Z$/, "").replace("T", " ");
      params.set("from", cursor);
    }
  }
};

// src/modules/projects.ts
var GROUP_UNPARENT_SENTINEL = "NONE";
function normalizeGroupId(params) {
  if ("groupId" in params && params.groupId === null) {
    return { ...params, groupId: GROUP_UNPARENT_SENTINEL };
  }
  return params;
}
var ProjectsModule = class {
  constructor(client) {
    this.client = client;
  }
  client;
  async list() {
    return this.client.request("GET", "/api/v2/projects");
  }
  async create(draft) {
    const id = generateObjectId();
    const wireDraft = normalizeGroupId(draft);
    await this.client.request("POST", "/api/v2/batch/project", {
      add: [{ id, ...wireDraft }]
    });
    return { id, ...draft };
  }
  async update(params) {
    await this.client.request("POST", "/api/v2/batch/project", {
      update: [buildPartialUpdateBody(normalizeGroupId(params))]
    });
  }
  async delete(projectId) {
    await this.client.request("POST", "/api/v2/batch/project", {
      delete: [projectId]
    });
  }
  async deleteMany(projectIds) {
    await this.client.request("POST", "/api/v2/batch/project", {
      delete: projectIds
    });
  }
  /**
   * List kanban columns.
   *
   * **Response shape fix (2026-04-12):** The TickTick API returns a wrapper
   * object `{update: TickTickColumn[]}`, not a bare array. Previously this
   * method's return type advertised `readonly TickTickColumn[]` but the
   * actual value at runtime was the wrapper — callers calling `.map()` on
   * the result got `TypeError: undefined is not a function`. This version
   * unwraps and returns the actual column array.
   *
   * **Projection filter (2026-04-12):** The server-side `projectId` query
   * parameter is **not honored** — passing it does NOT filter to a single
   * project's columns. The endpoint always returns all columns across all
   * projects. When `projectId` is provided, this method now filters client-
   * side for the expected subset.
   */
  async listColumns(projectId) {
    const params = new URLSearchParams({ from: "0" });
    if (projectId) params.set("projectId", projectId);
    const raw = await this.client.request(
      "GET",
      `/api/v2/column?${params.toString()}`
    );
    const columns = Array.isArray(raw) ? raw : raw.update ?? [];
    if (projectId) {
      return columns.filter((c) => c.projectId === projectId);
    }
    return columns;
  }
  /**
   * Create a kanban column on a project.
   *
   * Hits `POST /api/v2/column` with body `{add: [{id, projectId, name, sortOrder?}]}`.
   * The id is client-generated as a 24-hex ObjectID, mirroring the
   * project / projectGroup / task create patterns.
   *
   * **Project must be in kanban view.** Creating a column on a list-view
   * project succeeds at the API but the column is not surfaced in the UI —
   * pass `viewMode: "kanban"` on {@link ProjectsModule.create} (or update
   * the project to `viewMode: "kanban"`) before adding columns.
   *
   * Wire shape verified 2026-05-27 against the test account; see
   * `Plans/kanban-columns-probe.md`.
   */
  async createColumn(projectId, draft) {
    const id = generateObjectId();
    const sortOrder = draft.sortOrder ?? 0;
    await this.client.request("POST", "/api/v2/column", {
      add: [{ id, projectId, name: draft.name, sortOrder }]
    });
    return { id, projectId, name: draft.name, sortOrder };
  }
  /**
   * Update a kanban column — rename, reorder, or both.
   *
   * Hits `POST /api/v2/column` with body `{update: [{id, projectId, name?, sortOrder?}]}`.
   * Applies the partial-update contract: omit a field to preserve it,
   * pass a value to set it.
   *
   * **`projectId` is required** on the update payload — TickTick's server
   * silently drops the change if `projectId` is missing from the update
   * item (returns 200 with empty `id2etag`). The TypeScript type enforces
   * `projectId` so callers cannot omit it; the implementation forwards it
   * verbatim. Verified empirically 2026-05-27.
   */
  async updateColumn(params) {
    if (!params.projectId) {
      throw new Error(
        "projects.updateColumn: projectId is required on the update payload. TickTick's POST /api/v2/column endpoint silently no-ops (returns 200 with empty id2etag) when projectId is omitted from the update item. Pass the column's parent projectId on every update."
      );
    }
    await this.client.request("POST", "/api/v2/column", {
      update: [buildPartialUpdateBody(params)]
    });
  }
  /**
   * Delete a kanban column.
   *
   * Hits `POST /api/v2/column` with body `{delete: [{columnId, projectId}]}`.
   *
   * **Gotcha — field name.** The delete item uses the key **`columnId`**,
   * NOT `id`. This is unique to the column-delete payload; create and
   * update both use `id`. Six rounds of API probing with `{delete:[id-string]}`
   * and `{delete:[{id, projectId}]}` all returned server 500
   * `unknown_exception` — the bug was the field name, not the endpoint.
   * Discovered via Interceptor capture of the TickTick web UI's actual
   * delete request on 2026-05-27. Full discovery trail in
   * `Plans/kanban-columns-probe.md`.
   *
   * **Post-delete task behavior:** tasks that referenced the deleted
   * `columnId` keep the dangling reference on their `columnId` field
   * (same non-cascading behavior as folder-delete; verified during
   * Interceptor capture). The TickTick web UI silently treats those
   * tasks as "uncategorized" in the kanban view. If clean state matters,
   * reassign tasks via `tasks.update({id, projectId, columnId: <other>})`
   * before deleting the column.
   */
  async deleteColumn(projectId, columnId) {
    await this.client.request("POST", "/api/v2/column", {
      delete: [{ columnId, projectId }]
    });
  }
  /**
   * List members of a shared project.
   *
   * Hits `GET /api/v2/project/{projectId}/users`. Returns an empty array
   * for unshared (personal) projects — the endpoint only populates once
   * the project has been explicitly shared with another TickTick account.
   *
   * Use the returned `userId` values with `TickTickTaskDraft.assignee`
   * to assign tasks to specific members.
   *
   * Discovered via live traffic probe in April 2026.
   */
  async listMembers(projectId) {
    return this.client.request(
      "GET",
      `/api/v2/project/${projectId}/users`
    );
  }
};

// src/modules/project-groups.ts
var DEFAULT_LIST_TYPE = "group";
var ProjectGroupsModule = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * List all folders for the current account. Derives `projectGroups[]`
   * from `GET /api/v2/batch/check/0`. Includes soft-deleted folders if the
   * server returns them; callers can filter on `deleted === 0` if needed.
   */
  async list() {
    const raw = await this.client.request("GET", "/api/v2/batch/check/0");
    return raw.projectGroups ?? [];
  }
  async create(draft) {
    const id = generateObjectId();
    const payload = {
      id,
      name: draft.name,
      sortOrder: draft.sortOrder ?? 0,
      listType: draft.listType ?? DEFAULT_LIST_TYPE
    };
    await this.client.request("POST", "/api/v2/batch/projectGroup", {
      add: [payload]
    });
    return { id, name: payload.name, sortOrder: payload.sortOrder };
  }
  async update(params) {
    await this.client.request("POST", "/api/v2/batch/projectGroup", {
      update: [buildPartialUpdateBody(params)]
    });
  }
  async delete(id) {
    await this.client.request("POST", "/api/v2/batch/projectGroup", {
      delete: [id]
    });
  }
  async deleteMany(ids) {
    await this.client.request("POST", "/api/v2/batch/projectGroup", {
      delete: ids
    });
  }
};

// src/modules/tags.ts
var TagsModule = class {
  constructor(client) {
    this.client = client;
  }
  client;
  async list() {
    const response = await this.client.request("GET", "/api/v2/batch/check/0");
    return response.tags ?? [];
  }
  async create(draft) {
    await this.client.request("POST", "/api/v2/batch/tag", { add: [draft] });
  }
  async createMany(drafts) {
    await this.client.request("POST", "/api/v2/batch/tag", { add: drafts });
  }
  async update(draft) {
    await this.client.request("POST", "/api/v2/batch/tag", {
      update: [buildPartialUpdateBody(draft)]
    });
  }
  async delete(name) {
    await this.client.request("POST", "/api/v2/batch/tag", { delete: [name] });
  }
  async deleteMany(names) {
    await this.client.request("POST", "/api/v2/batch/tag", { delete: names });
  }
  async rename(name, label) {
    await this.client.request("POST", "/api/v2/batch/tag", { update: [{ name, label }] });
  }
  async merge(sourceTagName, targetTagName) {
    await this.client.request("POST", "/api/v2/batch/tag", {
      merge: [{ sourceTagName, targetTagName }]
    });
  }
};

// src/modules/habits.ts
var STATUS_MAP = { done: 2, undone: 1, unlabeled: 0 };
function toCheckinStamp(date) {
  if (typeof date === "number") return date;
  const d = typeof date === "string" ? new Date(date) : date;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return Number(`${y}${m}${day}`);
}
var HabitsModule = class {
  constructor(client) {
    this.client = client;
  }
  client;
  async list() {
    return this.client.request("GET", "/api/v2/habits");
  }
  async getCheckins(habitIds, startDate, endDate) {
    const response = await this.client.request(
      "POST",
      "/api/v2/habitCheckins/query",
      { habitIds, startDate, endDate }
    );
    return response.habitCheckins ?? [];
  }
  // ───────── #15 CRUD ─────────
  async create(draft) {
    await this.client.request("POST", "/api/v2/habits/batch", {
      add: [{ id: generateObjectId(), ...draft }],
      update: [],
      delete: []
    });
  }
  async update(params) {
    await this.client.request("POST", "/api/v2/habits/batch", {
      add: [],
      update: [buildPartialUpdateBody(params)],
      delete: []
    });
  }
  async delete(habitId) {
    await this.client.request("POST", "/api/v2/habits/batch", {
      add: [],
      update: [],
      delete: [habitId]
    });
  }
  async deleteMany(habitIds) {
    await this.client.request("POST", "/api/v2/habits/batch", {
      add: [],
      update: [],
      delete: habitIds
    });
  }
  // ───────── #16 Upsert checkin ─────────
  async upsertCheckin(input) {
    const stamp = toCheckinStamp(input.date);
    const statusValue = input.status ? STATUS_MAP[input.status] : 2;
    const startStr = String(stamp);
    const existing = await this.getCheckins(
      [input.habitId],
      `${startStr.slice(0, 4)}-${startStr.slice(4, 6)}-${startStr.slice(6, 8)}`,
      `${startStr.slice(0, 4)}-${startStr.slice(4, 6)}-${startStr.slice(6, 8)}`
    );
    const found = existing.find((c) => c.checkinStamp === stamp && c.habitId === input.habitId);
    const checkin = {
      habitId: input.habitId,
      checkinStamp: stamp,
      checkinTime: (/* @__PURE__ */ new Date()).toISOString(),
      goal: input.goal,
      value: input.value ?? input.goal,
      status: statusValue
    };
    if (found) {
      await this.client.request("POST", "/api/v2/habitCheckins/batch", {
        update: [{ ...checkin, id: found.id }]
      });
    } else {
      await this.client.request("POST", "/api/v2/habitCheckins/batch", {
        add: [{ ...checkin, id: generateObjectId() }]
      });
    }
  }
  // ───────── #17 Weekly stats ─────────
  async getWeekStats() {
    return this.client.request("GET", "/api/v2/habitCheckins/statistics");
  }
};

// src/modules/focus.ts
var DEFAULT_STATE = {
  lastPoint: 0,
  focusId: null,
  status: null,
  duration: 25,
  pomoCount: 0,
  focusOnId: null,
  focusOnTitle: null
};
function toStartMs(date) {
  return new Date(date).getTime();
}
function toEndMs(date) {
  return new Date(date).getTime() + 24 * 60 * 60 * 1e3 - 1;
}
var FocusModule = class {
  constructor(client) {
    this.client = client;
  }
  client;
  #state = { ...DEFAULT_STATE };
  // ───────── Existing ─────────
  // Params: date strings (YYYY-MM-DD). API expects ms timestamps.
  async getTimeline(startDate, endDate) {
    return this.client.request(
      "GET",
      `/api/v2/pomodoros?from=${toStartMs(startDate)}&to=${toEndMs(endDate)}`
    );
  }
  async getOverview() {
    return this.client.request("GET", "/api/v2/pomodoros/statistics/generalForDesktop");
  }
  // ───────── #20 Session control ─────────
  async start(options) {
    const id = generateObjectId();
    const duration = options?.duration ?? 25;
    await this.client.request("POST", "/api/v2/pomodoro", [
      {
        id,
        op: "start",
        duration,
        lastPoint: this.#state.lastPoint,
        ...options?.focusOnId !== void 0 && { focusOnId: options.focusOnId },
        ...options?.focusOnTitle !== void 0 && { focusOnTitle: options.focusOnTitle },
        ...options?.note !== void 0 && { note: options.note },
        ...options?.manual !== void 0 && { manual: options.manual }
      }
    ]);
    this.#state = { ...this.#state, focusId: id, status: "running", duration };
  }
  async pause() {
    await this.#postOp("pause");
    this.#state = { ...this.#state, status: "paused" };
  }
  async resume() {
    await this.#postOp("continue");
    this.#state = { ...this.#state, status: "running" };
  }
  async finish() {
    await this.#postOp("finish");
    this.#state = { ...this.#state, status: "idle", pomoCount: this.#state.pomoCount + 1 };
  }
  async stop() {
    await this.#postOp("drop");
    this.#state = { ...this.#state, status: "idle" };
  }
  async #postOp(op) {
    await this.client.request("POST", "/api/v2/pomodoro", [
      { id: generateObjectId(), op, lastPoint: this.#state.lastPoint }
    ]);
  }
  // ───────── #21 Analytics ─────────
  // Params: date strings (YYYY-MM-DD). API expects ms timestamps.
  async getTiming(startDate, endDate) {
    return this.client.request(
      "GET",
      `/api/v2/pomodoros/timing?from=${toStartMs(startDate)}&to=${toEndMs(endDate)}`
    );
  }
  /**
   * Returns focus heatmap data for the given date range.
   *
   * **⚠️ Server bug (confirmed 2026-04-07):** This endpoint returns HTTP 500
   * regardless of parameter format (ms timestamps, seconds, ISO dates, YYYYMMDD,
   * no params) or account data. Tested with an account that has 5 completed
   * pomodoros. The endpoint exists (not 404) but is broken server-side.
   * Alternative v3 endpoints do not exist (404).
   *
   * @see https://github.com/jaeyeonling/ticktick-client/issues/31
   * @throws {TickTickApiError} Always throws with status 500 due to server bug
   */
  async getHeatmap(startDate, endDate) {
    return this.client.request(
      "GET",
      `/api/v2/pomodoros/statistics/heatmap?from=${toStartMs(startDate)}&to=${toEndMs(endDate)}`
    );
  }
  /**
   * Returns focus hour-distribution data for the given date range.
   *
   * **⚠️ Server bug (confirmed 2026-04-07):** This endpoint returns HTTP 500
   * regardless of parameter format or account data. See {@link getHeatmap} for
   * full investigation details.
   *
   * @see https://github.com/jaeyeonling/ticktick-client/issues/31
   * @throws {TickTickApiError} Always throws with status 500 due to server bug
   */
  async getHourDistribution(startDate, endDate) {
    return this.client.request(
      "GET",
      `/api/v2/pomodoros/statistics/hourDistribution?from=${toStartMs(startDate)}&to=${toEndMs(endDate)}`
    );
  }
  /**
   * Returns focus distribution data for the given date range.
   *
   * **⚠️ Server bug (confirmed 2026-04-07):** This endpoint returns HTTP 500
   * regardless of parameter format or account data. See {@link getHeatmap} for
   * full investigation details.
   *
   * @see https://github.com/jaeyeonling/ticktick-client/issues/31
   * @throws {TickTickApiError} Always throws with status 500 due to server bug
   */
  async getDistribution(startDate, endDate) {
    return this.client.request(
      "GET",
      `/api/v2/pomodoros/statistics/distribution?from=${toStartMs(startDate)}&to=${toEndMs(endDate)}`
    );
  }
  // ───────── #22 Local state ─────────
  getState() {
    return this.#state;
  }
  resetState() {
    this.#state = { ...DEFAULT_STATE };
  }
  async syncState() {
    const remote = await this.client.request("GET", "/api/v2/timer");
    this.#state = { ...DEFAULT_STATE, ...remote };
    return this.#state;
  }
};

// src/modules/statistics.ts
var StatisticsModule = class {
  constructor(client) {
    this.client = client;
  }
  client;
  async getRanking() {
    return this.client.request("GET", "/api/v2/user/ranking");
  }
  async listCompleted(from, to, limit = 100) {
    const fromEnc = encodeURIComponent(from);
    const toEnc = encodeURIComponent(to);
    return this.client.request(
      "GET",
      `/api/v2/project/all/completed/?from=${fromEnc}&to=${toEnc}&limit=${limit}`
    );
  }
};

// src/modules/user.ts
var UserModule = class {
  constructor(client) {
    this.client = client;
  }
  client;
  async getProfile() {
    return this.client.request("GET", "/api/v2/user/profile");
  }
  async getStatus() {
    return this.client.request("GET", "/api/v2/user/status");
  }
};

// src/modules/countdowns.ts
function toDateInt(date) {
  if (typeof date === "number") return date;
  const d = date instanceof Date ? date : new Date(date);
  return parseInt(d.toISOString().slice(0, 10).replace(/-/g, ""), 10);
}
var CountdownsModule = class {
  constructor(client) {
    this.client = client;
  }
  client;
  async list() {
    const res = await this.client.request(
      "GET",
      "/api/v2/countdown/list"
    );
    return res.countdowns ?? [];
  }
  async create(draft) {
    await this.client.request("POST", "/api/v2/countdown/batch", {
      add: [{ id: generateObjectId(), ...draft, date: toDateInt(draft.date) }],
      update: [],
      delete: []
    });
  }
  async update(params) {
    const { date, ...rest } = params;
    const datePart = date !== void 0 ? { date: toDateInt(date) } : {};
    await this.client.request("POST", "/api/v2/countdown/batch", {
      add: [],
      update: [buildPartialUpdateBody({ ...rest, ...datePart })],
      delete: []
    });
  }
  async delete(id) {
    await this.client.request("POST", "/api/v2/countdown/batch", {
      add: [],
      update: [],
      delete: [id]
    });
  }
};

// src/modules/activity.ts
var ActivityModule = class {
  constructor(client) {
    this.client = client;
  }
  client;
  /**
   * List activity events for a single task.
   *
   * Hits `GET /api/v1/task/activity/{taskId}` with optional pagination.
   * Returns events in newest-first order (matches the TickTick UI's
   * task-history panel).
   */
  async listForTask(taskId, params = {}) {
    const query = buildPaginationQuery(params);
    const path = `/api/v1/task/activity/${taskId}${query}`;
    return this.client.request("GET", path);
  }
  /**
   * List activity events for a project.
   *
   * Hits `GET /api/v1/project/{projectId}/activity` — note the URL
   * shape is asymmetric with `listForTask` (the task endpoint puts
   * the id at the end; the project endpoint puts it before `/activity`).
   * The library hides the asymmetry; callers pass the id positionally.
   */
  async listForProject(projectId, params = {}) {
    const query = buildPaginationQuery(params);
    const path = `/api/v1/project/${projectId}/activity${query}`;
    return this.client.request("GET", path);
  }
};
function buildPaginationQuery(params) {
  const search = new URLSearchParams();
  if (params.skip !== void 0) search.set("skip", String(params.skip));
  if (params.lastId !== void 0) search.set("lastId", params.lastId);
  const qs = search.toString();
  return qs.length > 0 ? `?${qs}` : "";
}

// src/client.ts
var DEFAULT_BASE_URL = "https://api.ticktick.com";
var DEFAULT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
var BASE_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  "content-type": "application/json",
  origin: "https://ticktick.com",
  referer: "https://ticktick.com/webapp/",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "x-requested-with": "XMLHttpRequest",
  hl: "en_US"
};
var TickTickClient = class {
  tasks;
  projects;
  projectGroups;
  tags;
  habits;
  focus;
  statistics;
  user;
  countdowns;
  activity;
  #fetchFn;
  #baseUrl;
  #timeZone;
  #xDevice;
  #credentials;
  #sessionStore;
  #session;
  #sessionLoaded;
  constructor(options = {}) {
    this.#fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.#timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
    this.#xDevice = buildXDevice(generateObjectId());
    this.#credentials = options.credentials;
    this.#sessionStore = options.sessionStore;
    this.#session = options.session ?? null;
    this.#sessionLoaded = options.session != null;
    this.tasks = new TasksModule(this);
    this.projects = new ProjectsModule(this);
    this.projectGroups = new ProjectGroupsModule(this);
    this.tags = new TagsModule(this);
    this.habits = new HabitsModule(this);
    this.focus = new FocusModule(this);
    this.statistics = new StatisticsModule(this);
    this.user = new UserModule(this);
    this.countdowns = new CountdownsModule(this);
    this.activity = new ActivityModule(this);
  }
  // ───────── Auth ─────────
  async login() {
    if (!this.#credentials) {
      throw new TickTickAuthError("No credentials provided.");
    }
    const url = `${this.#baseUrl}/api/v2/user/signon?wc=true&remember=true`;
    const response = await this.#fetchFn(url, {
      method: "POST",
      headers: { ...BASE_HEADERS, "x-device": this.#xDevice, "x-tz": this.#timeZone },
      body: JSON.stringify(this.#credentials)
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new TickTickAuthError(`Login failed (${response.status}): ${body}`);
    }
    const cookies = parseCookies(response.headers);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await this.#setSession({
      username: this.#credentials.username,
      token: cookies["t"] ?? "",
      ...cookies["_csrf_token"] !== void 0 && { csrfToken: cookies["_csrf_token"] },
      cookies,
      createdAt: now,
      updatedAt: now
    });
  }
  async logout() {
    this.#session = null;
    this.#sessionLoaded = false;
    await this.#sessionStore?.delete();
  }
  async isAuthenticated() {
    await this.#loadSession();
    if (!this.#session) return false;
    try {
      await this.#rawRequest("GET", "/api/v2/user/profile");
      return true;
    } catch {
      return false;
    }
  }
  getSession() {
    return this.#session;
  }
  // ───────── Internal HTTP ─────────
  async request(method, path, body) {
    await this.#ensureSession();
    try {
      return await this.#rawRequest(method, path, body);
    } catch (err) {
      if (err instanceof TickTickApiError && this.#isAuthFailure(err)) {
        if (!this.#credentials) {
          throw new TickTickAuthError("Session expired. Please login again.");
        }
        try {
          await this.login();
        } catch {
          throw new TickTickAuthError("Re-authentication failed.");
        }
        return this.#rawRequest(method, path, body);
      }
      throw err;
    }
  }
  async #rawRequest(method, path, body) {
    const url = `${this.#baseUrl}${path}`;
    const response = await this.#fetchFn(url, {
      method,
      headers: {
        ...BASE_HEADERS,
        "x-device": this.#xDevice,
        "x-tz": this.#timeZone,
        ...this.#buildAuthHeaders()
      },
      ...body !== void 0 && { body: JSON.stringify(body) }
    });
    const newCookies = parseCookies(response.headers);
    if (this.#session && Object.keys(newCookies).length > 0) {
      const updatedCsrfToken = newCookies["_csrf_token"] ?? this.#session.csrfToken;
      await this.#setSession({
        ...this.#session,
        token: newCookies["t"] ?? this.#session.token,
        ...updatedCsrfToken !== void 0 && { csrfToken: updatedCsrfToken },
        cookies: mergeCookies(this.#session.cookies, newCookies),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    if (!response.ok) {
      const responseBody = await this.#parseBody(response);
      throw new TickTickApiError(
        `TickTick API error: ${method} ${url} \u2192 ${response.status}`,
        url,
        method,
        response.status,
        responseBody
      );
    }
    const text = await response.text();
    if (!text.trim()) return void 0;
    return JSON.parse(text);
  }
  async #ensureSession() {
    await this.#loadSession();
    if (!this.#session) {
      if (!this.#credentials) {
        throw new TickTickAuthError(
          "No active session. Call login() or provide credentials."
        );
      }
      await this.login();
    }
  }
  async #loadSession() {
    if (this.#sessionLoaded) return;
    this.#session = await this.#sessionStore?.load() ?? null;
    this.#sessionLoaded = true;
  }
  async #setSession(session) {
    this.#session = session;
    this.#sessionLoaded = true;
    await this.#sessionStore?.save(session);
  }
  #buildAuthHeaders() {
    if (!this.#session) return {};
    return {
      "x-csrftoken": this.#session.csrfToken ?? "",
      cookie: serializeCookies(this.#session.cookies)
    };
  }
  #isAuthFailure(err) {
    if (err.status === 401 || err.status === 403) return true;
    if (err.responseBody && typeof err.responseBody === "object") {
      const body = err.responseBody;
      const code = typeof body["errorCode"] === "string" ? body["errorCode"].toLowerCase() : "";
      const msg = typeof body["errorMessage"] === "string" ? body["errorMessage"].toLowerCase() : "";
      return code.includes("token") || code.includes("auth") || code.includes("login") || msg.includes("login") || msg.includes("auth");
    }
    return false;
  }
  async #parseBody(response) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) return response.json();
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
};
function buildXDevice(id) {
  return JSON.stringify({
    platform: "web",
    os: "Windows 10",
    device: "Chrome 136.0.0.0",
    name: "",
    version: 8046,
    id,
    channel: "website",
    campaign: "",
    websocket: ""
  });
}

// src/session-store.ts
var FileSessionStore = class {
  constructor(path) {
    this.path = path;
  }
  path;
  async load() {
    try {
      const { readFile } = await import("fs/promises");
      const raw = await readFile(this.path, "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  async save(session) {
    const { writeFile } = await import("fs/promises");
    await writeFile(this.path, JSON.stringify(session, null, 2), "utf-8");
  }
  async delete() {
    try {
      const { unlink } = await import("fs/promises");
      await unlink(this.path);
    } catch {
    }
  }
};

// src/mcp/config.ts
import { homedir } from "os";
import { join } from "path";
var config = {
  username: process.env["TICKTICK_USERNAME"],
  password: process.env["TICKTICK_PASSWORD"],
  sessionPath: process.env["TICKTICK_SESSION_PATH"] ?? join(homedir(), ".ticktick-mcp-session.json"),
  baseUrl: process.env["TICKTICK_BASE_URL"],
  timeZone: process.env["TICKTICK_TIME_ZONE"]
};

// src/mcp/client-factory.ts
function createClient() {
  const { username, password } = config;
  if (!username || !password) {
    throw new Error(
      "TICKTICK_USERNAME and TICKTICK_PASSWORD environment variables are required."
    );
  }
  return new TickTickClient({
    credentials: { username, password },
    sessionStore: new FileSessionStore(config.sessionPath),
    ...config.baseUrl && { baseUrl: config.baseUrl },
    ...config.timeZone && { timeZone: config.timeZone }
  });
}

// src/mcp/server.ts
import { createRequire } from "module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// src/mcp/tools/tasks.ts
import { z as z2 } from "zod";

// src/mcp/error-handler.ts
function mapError(error) {
  if (error instanceof TickTickAuthError) {
    return {
      isError: true,
      content: [{ type: "text", text: `Authentication error: ${error.message}. Check TICKTICK_USERNAME and TICKTICK_PASSWORD environment variables.` }]
    };
  }
  if (error instanceof TickTickApiError) {
    const detail = error.status >= 500 ? `TickTick server error (${error.status}): ${error.message}` : `API error (${error.status}): ${error.message}`;
    return {
      isError: true,
      content: [{ type: "text", text: detail }]
    };
  }
  if (error instanceof TickTickError) {
    return {
      isError: true,
      content: [{ type: "text", text: `TickTick error: ${error.message}` }]
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text", text: `Unexpected error: ${message}` }]
  };
}
function jsonResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function stripUndefined(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== void 0) {
      result[key] = value;
    }
  }
  return result;
}

// src/mcp/reminder-input.ts
import { z } from "zod";

// src/semantic.ts
var SHORTHAND_UNIT = {
  w: "weeks",
  d: "days",
  h: "hours",
  m: "minutes",
  s: "seconds"
};
function parseShorthand(input) {
  const compact = input.replace(/\s+/g, "").toLowerCase();
  if (!/^(\d+[wdhms])+$/.test(compact)) return void 0;
  const out = {};
  for (const match of compact.matchAll(/(\d+)([wdhms])/g)) {
    const n = Number(match[1]);
    const key = SHORTHAND_UNIT[match[2]];
    out[key] = (out[key] ?? 0) + n;
  }
  return Object.keys(out).length ? out : void 0;
}
function encodeDuration(d) {
  const w = d.weeks ?? 0;
  let days = d.days ?? 0;
  const h = d.hours ?? 0;
  const m = d.minutes ?? 0;
  const s = d.seconds ?? 0;
  if (w > 0 && days === 0 && h === 0 && m === 0 && s === 0) {
    return `P${w}W`;
  }
  days += w * 7;
  if (days === 0 && h === 0 && m === 0 && s === 0) return void 0;
  let body = "P";
  if (days > 0) body += `${days}D`;
  if (h > 0 || m > 0 || s > 0) {
    body += "T";
    if (h > 0) body += `${h}H`;
    if (m > 0) body += `${m}M`;
    if (s > 0) body += `${s}S`;
  }
  return body;
}
function formatReminderTrigger(input) {
  if ("at" in input) return input.at === "due" ? "TRIGGER:PT0S" : void 0;
  const isBefore = "before" in input;
  const raw = isBefore ? input.before : "after" in input ? input.after : void 0;
  if (raw === void 0) return void 0;
  const dur = typeof raw === "string" ? parseShorthand(raw) : raw;
  if (!dur) return void 0;
  const body = encodeDuration(dur);
  if (!body) return void 0;
  return `TRIGGER:${isBefore ? "-" : ""}${body}`;
}

// src/mcp/reminder-input.ts
var reminderInputSchema = z.object({
  at: z.literal("due").optional().describe(`Set to "due" to fire the reminder at the task's due time.`),
  before: z.string().optional().describe('Fire this long before the due time. Shorthand: "15m", "2h", "1d 9h". Units: w/d/h/m/s.'),
  after: z.string().optional().describe('Fire this long after the due time. Same shorthand as "before".'),
  trigger: z.string().optional().describe('Raw RFC 5545 TRIGGER string (e.g. "TRIGGER:-PT15M"). Escape hatch \u2014 prefer at/before/after.')
});
function toTriggerString(input, index) {
  const set = ["at", "before", "after", "trigger"].filter(
    (key) => input[key] !== void 0
  );
  if (set.length === 0) {
    throw new Error(
      `reminders[${index}]: set exactly one of "at", "before", "after", or "trigger". Got none.`
    );
  }
  if (set.length > 1) {
    throw new Error(
      `reminders[${index}]: set exactly one of "at", "before", "after", or "trigger". Got ${set.length} (${set.join(", ")}).`
    );
  }
  if (input.trigger !== void 0) return input.trigger;
  const trigger = input.at !== void 0 ? formatReminderTrigger({ at: input.at }) : input.before !== void 0 ? formatReminderTrigger({ before: input.before }) : formatReminderTrigger({ after: input.after });
  if (trigger === void 0) {
    const offending = input.at !== void 0 ? `"at" value ${JSON.stringify(input.at)}` : input.before !== void 0 ? `"before" value ${JSON.stringify(input.before)}` : `"after" value ${JSON.stringify(input.after)}`;
    throw new Error(
      `reminders[${index}]: could not parse ${offending}. Use shorthand like "15m", "2h", or "1d 9h" (units w/d/h/m/s); a zero duration is not a valid offset \u2014 use {"at":"due"} instead.`
    );
  }
  return trigger;
}
function toTriggerStrings(reminders) {
  if (reminders === null) return null;
  return reminders.map(toTriggerString);
}

// src/mcp/tools/tasks.ts
function registerTaskTools(server, client) {
  server.tool(
    "list_tasks",
    "List all active tasks across all projects. Returns tasks with id, projectId, title, status, priority, dates, tags, and subtasks.",
    {},
    async () => {
      try {
        return jsonResult(await client.tasks.list());
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "list_completed_tasks",
    "List completed tasks. Optionally filter by project.",
    {
      projectId: z2.string().optional().describe("Project ID to filter by. Omit for all projects."),
      limit: z2.number().optional().describe("Maximum number of tasks to return.")
    },
    async (args) => {
      try {
        return jsonResult(await client.tasks.listCompleted(stripUndefined(args)));
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "create_task",
    "Create a new task. Use list_projects first to get a valid projectId. Omit projectId to create in Inbox.",
    {
      title: z2.string().describe("Task title."),
      projectId: z2.string().optional().describe("Project ID. Omit to create in Inbox."),
      priority: z2.union([z2.literal(0), z2.literal(1), z2.literal(3), z2.literal(5)]).optional().describe("Priority: 0=none, 1=low, 3=medium, 5=high."),
      startDate: z2.string().optional().describe("Start date in ISO 8601 format."),
      dueDate: z2.string().optional().describe("Due date in ISO 8601 format."),
      isAllDay: z2.boolean().optional().describe("Whether this is an all-day task."),
      content: z2.string().optional().describe("Task description (supports Markdown)."),
      tags: z2.array(z2.string()).optional().describe("Tag names to attach."),
      repeatFlag: z2.string().optional().describe("Recurrence rule string."),
      columnId: z2.string().optional().describe("Kanban column ID. Get valid values via list_columns."),
      assignee: z2.number().optional().describe("Assignee user ID for shared projects. Get valid values via list_project_members."),
      reminders: z2.array(reminderInputSchema).optional().describe('Reminders to attach, e.g. [{"before":"15m"}] or [{"at":"due"}]. Requires a dueDate to be meaningful. Multiple reminders need TickTick Premium.')
    },
    async ({ reminders, ...rest }) => {
      try {
        const draft = stripUndefined(rest);
        return jsonResult(
          await client.tasks.create(
            reminders === void 0 ? draft : { ...draft, reminders: toTriggerStrings(reminders) }
          )
        );
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "update_task",
    "Update an existing task. Both id and projectId are required. Only include fields you want to change.",
    {
      id: z2.string().describe("Task ID to update."),
      projectId: z2.string().describe("Project ID the task belongs to."),
      title: z2.string().optional().describe("Updated task title. Omit to keep the current title."),
      priority: z2.union([z2.literal(0), z2.literal(1), z2.literal(3), z2.literal(5)]).optional().describe("Priority: 0=none, 1=low, 3=medium, 5=high."),
      startDate: z2.string().nullable().optional().describe("Start date in ISO 8601 format. Pass null to clear it."),
      dueDate: z2.string().nullable().optional().describe("Due date in ISO 8601 format. Pass null to clear it."),
      isAllDay: z2.boolean().optional().describe("Whether this is an all-day task."),
      content: z2.string().optional().describe("Task description (supports Markdown)."),
      tags: z2.array(z2.string()).optional().describe("Tag names to attach. Replaces the current set."),
      repeatFlag: z2.string().nullable().optional().describe("Recurrence rule string. Pass null to stop the task repeating."),
      repeatEndDate: z2.string().nullable().optional().describe("Date the recurrence stops, ISO 8601. Pass null to clear it."),
      columnId: z2.string().nullable().optional().describe("Kanban column ID \u2014 see list_columns. Pass null to remove it from its column."),
      assignee: z2.number().nullable().optional().describe("Assignee user ID for shared projects. Pass null to unassign."),
      reminders: z2.array(reminderInputSchema).nullable().optional().describe('Replaces every reminder on the task, e.g. [{"before":"15m"}]. Pass null to clear them all. Omit to leave them untouched.')
    },
    async ({ reminders, ...rest }) => {
      try {
        const update = stripUndefined(rest);
        return jsonResult(
          await client.tasks.update(
            reminders === void 0 ? update : { ...update, reminders: toTriggerStrings(reminders) }
          )
        );
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "set_task_reminders",
    "Replace every reminder on an existing task in one call. Pass null to clear them all. Use this when reminders are the only thing changing; update_task also accepts a reminders field when changing them alongside other fields.",
    {
      taskId: z2.string().describe("Task ID to set reminders on."),
      projectId: z2.string().describe("Project ID the task belongs to."),
      reminders: z2.array(reminderInputSchema).nullable().describe('The complete reminder set, e.g. [{"at":"due"},{"before":"15m"}]. Pass null or [] to clear. Multiple reminders need TickTick Premium.')
    },
    async ({ taskId, projectId, reminders }) => {
      try {
        return jsonResult(
          await client.tasks.setReminders(projectId, taskId, toTriggerStrings(reminders))
        );
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "complete_task",
    "Mark a task as complete.",
    {
      taskId: z2.string().describe("Task ID to complete."),
      projectId: z2.string().describe("Project ID the task belongs to.")
    },
    async ({ taskId, projectId }) => {
      try {
        await client.tasks.complete(projectId, taskId);
        return jsonResult({ success: true, taskId, projectId });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "delete_task",
    "Delete a task.",
    {
      taskId: z2.string().describe("Task ID to delete."),
      projectId: z2.string().describe("Project ID the task belongs to.")
    },
    async ({ taskId, projectId }) => {
      try {
        await client.tasks.delete(projectId, taskId);
        return jsonResult({ success: true, taskId, projectId });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "move_task",
    "Move a task to a different project. WARNING: The task will get a new ID (copy+delete). The response includes both the new task and the previousId.",
    {
      taskId: z2.string().describe("Task ID to move."),
      fromProjectId: z2.string().describe("Source project ID."),
      toProjectId: z2.string().describe("Destination project ID.")
    },
    async (args) => {
      try {
        return jsonResult(await client.tasks.move(args));
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "create_subtask",
    "Add a subtask (checklist item) to an existing task.",
    {
      parentTaskId: z2.string().describe("Parent task ID."),
      parentProjectId: z2.string().describe("Parent task's project ID."),
      title: z2.string().describe("Subtask title."),
      sortOrder: z2.number().optional().describe("Sort order within the subtask list.")
    },
    async ({ parentTaskId, parentProjectId, title, sortOrder }) => {
      try {
        return jsonResult(await client.tasks.createSubtask(parentTaskId, parentProjectId, stripUndefined({ title, sortOrder })));
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "pin_task",
    "Pin a task to the top of its project.",
    {
      taskId: z2.string().describe("Task ID to pin."),
      projectId: z2.string().describe("Project ID the task belongs to.")
    },
    async ({ taskId, projectId }) => {
      try {
        await client.tasks.pin(taskId, projectId);
        return jsonResult({ success: true, taskId, projectId });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "unpin_task",
    "Unpin a task.",
    {
      taskId: z2.string().describe("Task ID to unpin."),
      projectId: z2.string().describe("Project ID the task belongs to.")
    },
    async ({ taskId, projectId }) => {
      try {
        await client.tasks.unpin(taskId, projectId);
        return jsonResult({ success: true, taskId, projectId });
      } catch (error) {
        return mapError(error);
      }
    }
  );
}

// src/mcp/tools/projects.ts
import { z as z3 } from "zod";
function registerProjectTools(server, client) {
  server.tool(
    "list_projects",
    "List all projects. Returns project id, name, color, kind, viewMode, and closed status.",
    {},
    async () => {
      try {
        return jsonResult(await client.projects.list());
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "create_project",
    "Create a new project (list).",
    {
      name: z3.string().describe("Project name."),
      color: z3.string().optional().describe('Project color (hex, e.g. "#F18181").'),
      kind: z3.enum(["TASK", "NOTE"]).optional().describe("Project kind: TASK or NOTE."),
      viewMode: z3.enum(["list", "kanban", "timeline"]).optional().describe('View mode for the project. Use "kanban" if you intend to add columns.'),
      groupId: z3.string().optional().describe("Folder to file this project under \u2014 see list_project_groups. Omit to leave it unfiled.")
    },
    async (args) => {
      try {
        return jsonResult(await client.projects.create(stripUndefined(args)));
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "update_project",
    "Update an existing project. Only include the fields you want to change \u2014 omitted fields keep their current value.",
    {
      id: z3.string().describe("Project ID to update."),
      name: z3.string().optional().describe("Updated project name. Omit to keep the current name."),
      color: z3.string().optional().describe("Project color (hex)."),
      kind: z3.enum(["TASK", "NOTE"]).optional().describe("Project kind."),
      viewMode: z3.enum(["list", "kanban", "timeline"]).optional().describe("View mode."),
      groupId: z3.string().nullable().optional().describe("Folder to file this project under \u2014 see list_project_groups. Pass null to unfile it. Omit to leave it where it is.")
    },
    async (args) => {
      try {
        await client.projects.update(stripUndefined(args));
        return jsonResult({ success: true, projectId: args.id });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "delete_project",
    "Delete a project and all its tasks.",
    {
      projectId: z3.string().describe("Project ID to delete.")
    },
    async ({ projectId }) => {
      try {
        await client.projects.delete(projectId);
        return jsonResult({ success: true, projectId });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "list_columns",
    "List kanban columns for a project. Use the returned column IDs when creating or updating tasks with a columnId.",
    {
      projectId: z3.string().optional().describe("Project ID. Omit to list columns across all projects.")
    },
    async ({ projectId }) => {
      try {
        return jsonResult(await client.projects.listColumns(projectId));
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "list_project_members",
    "List members of a shared project. Returns userId, displayName, permission, and isOwner. Only works for shared projects \u2014 personal projects return an empty array.",
    {
      projectId: z3.string().describe("Project ID to list members for.")
    },
    async ({ projectId }) => {
      try {
        return jsonResult(await client.projects.listMembers(projectId));
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "create_column",
    'Create a kanban column on a project. The project must be in kanban view \u2014 create it with viewMode "kanban", or switch it with update_project first. A column added to a list-view project is accepted by the API but never shown in the UI.',
    {
      projectId: z3.string().describe("Project the column belongs to."),
      name: z3.string().describe("Column name."),
      sortOrder: z3.number().optional().describe("Sort position among columns. Defaults to 0.")
    },
    async ({ projectId, ...draft }) => {
      try {
        return jsonResult(await client.projects.createColumn(projectId, stripUndefined(draft)));
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "update_column",
    "Rename or reorder a kanban column. Only include the fields you want to change. projectId is required even though the column id is unique \u2014 the server silently ignores the update without it.",
    {
      id: z3.string().describe("Column ID to update."),
      projectId: z3.string().describe("Project the column belongs to. Required."),
      name: z3.string().optional().describe("Updated column name. Omit to keep the current name."),
      sortOrder: z3.number().optional().describe("Updated sort position.")
    },
    async (args) => {
      try {
        await client.projects.updateColumn(stripUndefined(args));
        return jsonResult({ success: true, columnId: args.id, projectId: args.projectId });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "delete_column",
    "Delete a kanban column. Tasks in the column are NOT deleted \u2014 they keep a reference to the removed column and the UI shows them as uncategorized. Move them first with update_task if you want clean state.",
    {
      projectId: z3.string().describe("Project the column belongs to."),
      columnId: z3.string().describe("Column ID to delete.")
    },
    async ({ projectId, columnId }) => {
      try {
        await client.projects.deleteColumn(projectId, columnId);
        return jsonResult({ success: true, columnId, projectId });
      } catch (error) {
        return mapError(error);
      }
    }
  );
}

// src/mcp/tools/project-groups.ts
import { z as z4 } from "zod";
function registerProjectGroupTools(server, client) {
  server.tool(
    "list_project_groups",
    'List all project groups \u2014 the folders that hold projects (the TickTick UI calls them "folders"). Returns id, name, and sortOrder. May include soft-deleted folders, which carry deleted=1.',
    {},
    async () => {
      try {
        return jsonResult(await client.projectGroups.list());
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "create_project_group",
    "Create a project group (folder). Folders are one level deep \u2014 a folder cannot contain another folder. To put a project inside it, call update_project with the returned id as groupId.",
    {
      name: z4.string().describe("Folder name."),
      sortOrder: z4.number().optional().describe("Sort position among folders. Defaults to 0.")
    },
    async (args) => {
      try {
        return jsonResult(await client.projectGroups.create(stripUndefined(args)));
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "update_project_group",
    "Rename or reorder a project group. Only include the fields you want to change \u2014 omitted fields keep their current value.",
    {
      id: z4.string().describe("Folder ID to update."),
      name: z4.string().optional().describe("Updated folder name. Omit to keep the current name."),
      sortOrder: z4.number().optional().describe("Updated sort position.")
    },
    async (args) => {
      try {
        await client.projectGroups.update(stripUndefined(args));
        return jsonResult({ success: true, projectGroupId: args.id });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "delete_project_group",
    "Delete a project group (folder). Projects inside the folder are NOT deleted \u2014 they keep a reference to the removed folder and the UI treats them as unfiled. Reassign them first with update_project if you want clean state.",
    {
      projectGroupId: z4.string().describe("Folder ID to delete.")
    },
    async ({ projectGroupId }) => {
      try {
        await client.projectGroups.delete(projectGroupId);
        return jsonResult({ success: true, projectGroupId });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "delete_project_groups",
    "Delete several project groups (folders) in one call. Same non-cascading behavior as delete_project_group.",
    {
      projectGroupIds: z4.array(z4.string()).describe("Folder IDs to delete.")
    },
    async ({ projectGroupIds }) => {
      try {
        await client.projectGroups.deleteMany(projectGroupIds);
        return jsonResult({ success: true, projectGroupIds });
      } catch (error) {
        return mapError(error);
      }
    }
  );
}

// src/mcp/tools/activity.ts
import { z as z5 } from "zod";
var PREMIUM_NOTE = "Premium-only \u2014 non-Premium accounts get a 4xx error. Paginate by passing the last event's id as lastId and the running count as skip; an empty array means the feed is exhausted.";
function registerActivityTools(server, client) {
  server.tool(
    "list_task_activity",
    `Read the change history for a single task \u2014 who changed what and when. ${PREMIUM_NOTE}`,
    {
      taskId: z5.string().describe("Task ID to read history for."),
      skip: z5.number().optional().describe("Number of events already seen. Omit for the first page."),
      lastId: z5.string().optional().describe("id of the last event from the previous page.")
    },
    async ({ taskId, ...pagination }) => {
      try {
        return jsonResult(
          await client.activity.listForTask(taskId, stripUndefined(pagination))
        );
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "list_project_activity",
    `Read the change history for a project \u2014 every task event within it, newest first. ${PREMIUM_NOTE}`,
    {
      projectId: z5.string().describe("Project ID to read history for."),
      skip: z5.number().optional().describe("Number of events already seen. Omit for the first page."),
      lastId: z5.string().optional().describe("id of the last event from the previous page.")
    },
    async ({ projectId, ...pagination }) => {
      try {
        return jsonResult(
          await client.activity.listForProject(projectId, stripUndefined(pagination))
        );
      } catch (error) {
        return mapError(error);
      }
    }
  );
}

// src/mcp/tools/tags.ts
import { z as z6 } from "zod";
function registerTagTools(server, client) {
  server.tool(
    "list_tags",
    "List all tags. Returns tag name, label, color, and parent.",
    {},
    async () => {
      try {
        return jsonResult(await client.tags.list());
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "create_tag",
    "Create a new tag.",
    {
      name: z6.string().describe("Tag name (used as identifier)."),
      label: z6.string().optional().describe("Display label for the tag."),
      color: z6.string().optional().describe("Tag color."),
      parent: z6.string().optional().describe("Parent tag name for nested tags.")
    },
    async (args) => {
      try {
        await client.tags.create(stripUndefined(args));
        return jsonResult({ success: true, name: args.name });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "update_tag",
    "Update an existing tag.",
    {
      name: z6.string().describe("Tag name to update (used as identifier)."),
      label: z6.string().optional().describe("New display label."),
      color: z6.string().optional().describe("New tag color."),
      parent: z6.string().nullable().optional().describe("New parent tag name. Pass null to unnest the tag. Omit to leave it where it is.")
    },
    async (args) => {
      try {
        await client.tags.update(stripUndefined(args));
        return jsonResult({ success: true, name: args.name });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "delete_tag",
    "Delete a tag.",
    {
      name: z6.string().describe("Tag name to delete.")
    },
    async ({ name }) => {
      try {
        await client.tags.delete(name);
        return jsonResult({ success: true, name });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "merge_tags",
    "Merge one tag into another. All tasks with the source tag will be reassigned to the target tag.",
    {
      sourceTagName: z6.string().describe("Tag name to merge from (will be removed)."),
      targetTagName: z6.string().describe("Tag name to merge into (will remain).")
    },
    async ({ sourceTagName, targetTagName }) => {
      try {
        await client.tags.merge(sourceTagName, targetTagName);
        return jsonResult({ success: true, merged: sourceTagName, into: targetTagName });
      } catch (error) {
        return mapError(error);
      }
    }
  );
}

// src/mcp/tools/habits.ts
import { z as z7 } from "zod";
function registerHabitTools(server, client) {
  server.tool(
    "list_habits",
    "List all habits. Returns habit id, name, goal, step, unit, streaks, and total check-ins.",
    {},
    async () => {
      try {
        return jsonResult(await client.habits.list());
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "create_habit",
    "Create a new habit.",
    {
      name: z7.string().describe("Habit name."),
      repeatRule: z7.string().describe('Recurrence rule (e.g. "RRULE:FREQ=DAILY").'),
      goal: z7.number().describe("Target goal value per period."),
      step: z7.number().describe("Increment step per check-in."),
      unit: z7.string().describe('Unit of measurement (e.g. "times", "minutes", "ml").'),
      type: z7.string().describe('Habit type (e.g. "boolean", "quantity").'),
      recordEnable: z7.boolean().describe("Whether to enable value recording on check-in."),
      color: z7.string().optional().describe("Habit color."),
      iconRes: z7.string().optional().describe("Icon resource identifier."),
      sectionId: z7.string().optional().describe("Section/group ID.")
    },
    async (args) => {
      try {
        await client.habits.create(stripUndefined(args));
        return jsonResult({ success: true, name: args.name });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "update_habit",
    "Update an existing habit.",
    {
      id: z7.string().describe("Habit ID to update."),
      name: z7.string().optional().describe("Updated habit name."),
      repeatRule: z7.string().optional().describe("Updated recurrence rule."),
      goal: z7.number().optional().describe("Updated target goal value."),
      step: z7.number().optional().describe("Updated increment step."),
      unit: z7.string().optional().describe("Updated unit of measurement."),
      type: z7.string().optional().describe("Updated habit type."),
      recordEnable: z7.boolean().optional().describe("Whether to enable value recording."),
      color: z7.string().optional().describe("Updated habit color."),
      iconRes: z7.string().optional().describe("Updated icon resource."),
      sectionId: z7.string().optional().describe("Updated section/group ID.")
    },
    async (args) => {
      try {
        await client.habits.update(stripUndefined(args));
        return jsonResult({ success: true, habitId: args.id });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "delete_habit",
    "Delete a habit.",
    {
      habitId: z7.string().describe("Habit ID to delete.")
    },
    async ({ habitId }) => {
      try {
        await client.habits.delete(habitId);
        return jsonResult({ success: true, habitId });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "checkin_habit",
    "Record a check-in for a habit on a specific date.",
    {
      habitId: z7.string().describe("Habit ID."),
      date: z7.string().describe('Date for the check-in in "YYYY-MM-DD" format.'),
      goal: z7.number().describe("Goal value for this check-in."),
      value: z7.number().optional().describe("Recorded value (defaults to goal if omitted)."),
      status: z7.enum(["done", "undone", "unlabeled"]).optional().describe('Check-in status. Defaults to "done".')
    },
    async ({ habitId, date, goal, value, status }) => {
      try {
        await client.habits.upsertCheckin(stripUndefined({ habitId, date, goal, value, status }));
        return jsonResult({ success: true, habitId, date });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "get_habit_week_stats",
    "Get weekly habit completion statistics. Returns per-day counts of total and completed habits.",
    {},
    async () => {
      try {
        return jsonResult(await client.habits.getWeekStats());
      } catch (error) {
        return mapError(error);
      }
    }
  );
}

// src/mcp/tools/focus.ts
import { z as z8 } from "zod";
function registerFocusTools(server, client) {
  server.tool(
    "start_focus",
    "Start a Pomodoro focus session.",
    {
      duration: z8.number().optional().describe("Focus duration in minutes (default: 25)."),
      focusOnId: z8.string().optional().describe("Task ID to focus on."),
      focusOnTitle: z8.string().optional().describe("Title to display during the focus session."),
      note: z8.string().optional().describe("Note for the focus session.")
    },
    async (args) => {
      try {
        await client.focus.start(stripUndefined(args));
        return jsonResult({ success: true, status: "running" });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "pause_focus",
    "Pause the currently running focus session.",
    {},
    async () => {
      try {
        await client.focus.pause();
        return jsonResult({ success: true, status: "paused" });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "resume_focus",
    "Resume a paused focus session.",
    {},
    async () => {
      try {
        await client.focus.resume();
        return jsonResult({ success: true, status: "running" });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "finish_focus",
    "Finish the current focus session and save it as a completed Pomodoro.",
    {},
    async () => {
      try {
        await client.focus.finish();
        return jsonResult({ success: true, status: "finished" });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "stop_focus",
    "Stop (discard) the current focus session without saving it.",
    {},
    async () => {
      try {
        await client.focus.stop();
        return jsonResult({ success: true, status: "stopped" });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "get_focus_overview",
    "Get Pomodoro focus statistics overview including total focus time, session counts, and streaks.",
    {},
    async () => {
      try {
        return jsonResult(await client.focus.getOverview());
      } catch (error) {
        return mapError(error);
      }
    }
  );
}

// src/mcp/tools/statistics.ts
import { z as z9 } from "zod";
function registerStatisticsTools(server, client) {
  server.tool(
    "get_ranking",
    "Get user productivity ranking and statistics including task count, project count, score, and level.",
    {},
    async () => {
      try {
        return jsonResult(await client.statistics.getRanking());
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "list_completed_in_range",
    "List tasks completed within a date range.",
    {
      from: z9.string().datetime({ offset: true }).describe('Start date in ISO 8601 format (e.g. "2026-04-01T00:00:00+00:00").'),
      to: z9.string().datetime({ offset: true }).describe('End date in ISO 8601 format (e.g. "2026-04-22T23:59:59+00:00").'),
      limit: z9.number().int().positive().optional().describe("Maximum number of tasks to return.")
    },
    async ({ from, to, limit }) => {
      try {
        return jsonResult(await client.statistics.listCompleted(from, to, limit));
      } catch (error) {
        return mapError(error);
      }
    }
  );
}

// src/mcp/tools/user.ts
function registerUserTools(server, client) {
  server.tool(
    "get_user_profile",
    "Get the current user's profile information including username, email, display name, and avatar.",
    {},
    async () => {
      try {
        return jsonResult(await client.user.getProfile());
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "get_user_status",
    "Get the current user's account status including Pro subscription, inbox ID, and subscription type.",
    {},
    async () => {
      try {
        return jsonResult(await client.user.getStatus());
      } catch (error) {
        return mapError(error);
      }
    }
  );
}

// src/mcp/tools/countdowns.ts
import { z as z10 } from "zod";
function registerCountdownTools(server, client) {
  server.tool(
    "list_countdowns",
    "List all countdowns. Returns countdown id, name, date, type, and color.",
    {},
    async () => {
      try {
        return jsonResult(await client.countdowns.list());
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "create_countdown",
    "Create a new countdown timer.",
    {
      name: z10.string().describe("Countdown name."),
      date: z10.string().describe('Target date in "YYYY-MM-DD" format.'),
      type: z10.enum(["countdown", "anniversary", "birthday", "holiday"]).optional().describe('Countdown type. Defaults to "countdown".'),
      color: z10.string().optional().describe("Display color."),
      ignoreYear: z10.boolean().optional().describe("Whether to ignore the year (for recurring annual events)."),
      remark: z10.string().optional().describe("Additional notes.")
    },
    async (args) => {
      try {
        await client.countdowns.create(stripUndefined(args));
        return jsonResult({ success: true, name: args.name });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "update_countdown",
    "Update an existing countdown.",
    {
      id: z10.string().describe("Countdown ID to update."),
      name: z10.string().optional().describe("Updated countdown name."),
      date: z10.string().optional().describe('Updated target date in "YYYY-MM-DD" format.'),
      type: z10.enum(["countdown", "anniversary", "birthday", "holiday"]).optional().describe("Updated countdown type."),
      color: z10.string().optional().describe("Updated display color."),
      ignoreYear: z10.boolean().optional().describe("Whether to ignore the year."),
      remark: z10.string().optional().describe("Updated notes.")
    },
    async (args) => {
      try {
        await client.countdowns.update(stripUndefined(args));
        return jsonResult({ success: true, id: args.id });
      } catch (error) {
        return mapError(error);
      }
    }
  );
  server.tool(
    "delete_countdown",
    "Delete a countdown.",
    {
      id: z10.string().describe("Countdown ID to delete.")
    },
    async ({ id }) => {
      try {
        await client.countdowns.delete(id);
        return jsonResult({ success: true, id });
      } catch (error) {
        return mapError(error);
      }
    }
  );
}

// src/mcp/tools/index.ts
function registerAllTools(server, client) {
  registerTaskTools(server, client);
  registerProjectTools(server, client);
  registerProjectGroupTools(server, client);
  registerActivityTools(server, client);
  registerTagTools(server, client);
  registerHabitTools(server, client);
  registerFocusTools(server, client);
  registerStatisticsTools(server, client);
  registerUserTools(server, client);
  registerCountdownTools(server, client);
}

// src/mcp/server.ts
var require2 = createRequire(import.meta.url);
var { version } = require2("../../package.json");
var INSTRUCTIONS = `# TickTick MCP Server

## Overview
Manage your TickTick tasks, projects, habits, focus sessions, tags, countdowns, and statistics through natural language.

## Quick Start
- Use list_projects to see all projects and get their IDs
- Use list_tasks to see all active tasks
- Use create_task to add a new task (omit projectId for Inbox)

## Best Practices
- Always call list_projects first when you need a projectId
- complete_task and delete_task both require taskId AND projectId
- move_task copies the task to a new project and deletes the original \u2014 the task ID will change
- For kanban projects, use list_columns to get valid columnId values
- For shared projects, use list_project_members to get valid assignee user IDs
- finish_focus saves the session as completed; stop_focus discards it
- Habit check-in dates should be in "YYYY-MM-DD" format
- Task dates should be in ISO 8601 format (e.g. "2026-04-23T09:00:00+09:00")

## Limitations
- Focus analytics (heatmap, hour distribution) are unavailable due to a TickTick server bug
- Task moves are implemented as copy+delete \u2014 the task receives a new ID
- Trash listing is unreliable \u2014 the TickTick API ignores the status filter
`;
function createServer(client) {
  const server = new McpServer(
    { name: "ticktick-mcp-server", version },
    { instructions: INSTRUCTIONS }
  );
  registerAllTools(server, client);
  return server;
}

// src/mcp/index.ts
async function main() {
  const client = createClient();
  const server = createServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
main().catch((error) => {
  process.stderr.write(`Fatal: ${error instanceof Error ? error.message : String(error)}
`);
  process.exit(1);
});
//# sourceMappingURL=index.js.map