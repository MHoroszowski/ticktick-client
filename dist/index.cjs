"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  FileSessionStore: () => FileSessionStore,
  MemorySessionStore: () => MemorySessionStore,
  TickTickApiError: () => TickTickApiError,
  TickTickAuthError: () => TickTickAuthError,
  TickTickBatchError: () => TickTickBatchError,
  TickTickClient: () => TickTickClient,
  TickTickError: () => TickTickError,
  formatCheckinStatus: () => formatCheckinStatus,
  formatHabitStatus: () => formatHabitStatus,
  formatReminderTrigger: () => formatReminderTrigger,
  formatTaskPriority: () => formatTaskPriority,
  formatTaskStatus: () => formatTaskStatus,
  parseCheckinStatus: () => parseCheckinStatus,
  parseHabitStatus: () => parseHabitStatus,
  parseReminderTrigger: () => parseReminderTrigger,
  parseTaskPriority: () => parseTaskPriority,
  parseTaskStatus: () => parseTaskStatus
});
module.exports = __toCommonJS(index_exports);

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
var MemorySessionStore = class {
  #session = null;
  async load() {
    return this.#session;
  }
  async save(session) {
    this.#session = session;
  }
  async delete() {
    this.#session = null;
  }
};
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

// src/semantic.ts
var TASK_PRIORITY_MAP = {
  none: 0,
  low: 1,
  medium: 3,
  high: 5
};
var TASK_PRIORITY_LABELS = {
  0: "none",
  1: "low",
  3: "medium",
  5: "high"
};
var VALID_TASK_PRIORITIES = /* @__PURE__ */ new Set([0, 1, 3, 5]);
function parseTaskPriority(input) {
  if (typeof input === "string") return TASK_PRIORITY_MAP[input];
  return VALID_TASK_PRIORITIES.has(input) ? input : void 0;
}
function formatTaskPriority(priority) {
  return TASK_PRIORITY_LABELS[priority];
}
var TASK_STATUS_MAP = {
  open: 0,
  completed: 2,
  abandoned: -1,
  "won't do": -1
};
var TASK_STATUS_LABELS = {
  0: "open",
  2: "completed",
  [-1]: "abandoned"
};
var VALID_TASK_STATUSES = /* @__PURE__ */ new Set([0, 2, -1]);
function parseTaskStatus(input) {
  if (typeof input === "string") return TASK_STATUS_MAP[input];
  return VALID_TASK_STATUSES.has(input) ? input : void 0;
}
function formatTaskStatus(status) {
  return TASK_STATUS_LABELS[status];
}
var HABIT_STATUS_MAP = {
  normal: 0,
  archived: 1
};
var HABIT_STATUS_LABELS = {
  0: "normal",
  1: "archived"
};
var VALID_HABIT_STATUSES = /* @__PURE__ */ new Set([0, 1]);
function parseHabitStatus(input) {
  if (typeof input === "string") return HABIT_STATUS_MAP[input];
  return VALID_HABIT_STATUSES.has(input) ? input : void 0;
}
function formatHabitStatus(status) {
  return HABIT_STATUS_LABELS[status];
}
var CHECKIN_STATUS_MAP = {
  unlabeled: 0,
  undone: 1,
  done: 2
};
var CHECKIN_STATUS_LABELS = {
  0: "unlabeled",
  1: "undone",
  2: "done"
};
var VALID_CHECKIN_STATUSES = /* @__PURE__ */ new Set([0, 1, 2]);
function parseCheckinStatus(input) {
  if (typeof input === "string") return CHECKIN_STATUS_MAP[input];
  return VALID_CHECKIN_STATUSES.has(input) ? input : void 0;
}
function formatCheckinStatus(status) {
  return CHECKIN_STATUS_LABELS[status];
}
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
var TRIGGER_RE = /^TRIGGER:(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
function parseReminderTrigger(input) {
  const m = TRIGGER_RE.exec(input);
  if (!m) return void 0;
  const [, sign, ws, ds, hs, mins, ss] = m;
  if (ws === void 0 && ds === void 0 && hs === void 0 && mins === void 0 && ss === void 0) {
    return void 0;
  }
  const w = Number(ws ?? 0);
  const d = Number(ds ?? 0);
  const h = Number(hs ?? 0);
  const min = Number(mins ?? 0);
  const s = Number(ss ?? 0);
  if (w === 0 && d === 0 && h === 0 && min === 0 && s === 0) {
    return { at: "due" };
  }
  const dur = {};
  if (w > 0) dur.weeks = w;
  if (d > 0) dur.days = d;
  if (h > 0) dur.hours = h;
  if (min > 0) dur.minutes = min;
  if (s > 0) dur.seconds = s;
  return sign === "-" ? { before: dur } : { after: dur };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FileSessionStore,
  MemorySessionStore,
  TickTickApiError,
  TickTickAuthError,
  TickTickBatchError,
  TickTickClient,
  TickTickError,
  formatCheckinStatus,
  formatHabitStatus,
  formatReminderTrigger,
  formatTaskPriority,
  formatTaskStatus,
  parseCheckinStatus,
  parseHabitStatus,
  parseReminderTrigger,
  parseTaskPriority,
  parseTaskStatus
});
//# sourceMappingURL=index.cjs.map