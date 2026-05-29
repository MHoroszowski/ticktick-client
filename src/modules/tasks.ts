import { generateObjectId } from '../internal/ids.js';
import { buildPartialUpdateBody } from '../internal/partial-update.js';
import { TickTickBatchError } from '../errors.js';
import type { TickTickClient } from '../client.js';
import type {
  TickTickReminder,
  TickTickTask,
  TickTickTaskDraft,
  TickTickTaskUpdate,
  TickTickTaskMove,
  TickTickMoveResult,
  TickTickTrashOptions,
  TickTickCompletedTaskOptions,
} from '../types.js';

type BatchCheckResponse = {
  readonly syncTaskBean?: {
    readonly update?: readonly TickTickTask[];
  };
};

/**
 * V2 batch/task envelope returned by `POST /api/v2/batch/task`.
 * `id2etag` maps task ids to their new server etag on success;
 * `id2error` carries per-task errors (most often etag conflicts).
 */
type BatchTaskResponse = {
  readonly id2etag?: Record<string, string>;
  readonly id2error?: Record<string, string>;
};

/**
 * Normalize a caller-supplied reminders array into the V2 wire shape
 * `{id, trigger}[]`. String entries get a client-generated id matching
 * the official client's 24-char hex format. `TickTickReminder` entries
 * pass through unchanged so callers can preserve server-stable ids on
 * round-trips. Null means "clear all" and is forwarded as null.
 */
function normalizeReminderWrites(
  reminders: readonly (string | TickTickReminder)[] | null | undefined,
): readonly TickTickReminder[] | null | undefined {
  if (reminders === undefined) return undefined;
  if (reminders === null) return null;
  return reminders.map((r) =>
    typeof r === 'string' ? { id: generateObjectId(), trigger: r } : r,
  );
}

/**
 * Has the caller asked us to touch reminders? True iff at least one of
 * `reminder` (sugar) or `reminders` (canonical) appears in the payload —
 * including explicit `null` for clears. Field absence (undefined) does
 * NOT trigger the batch route.
 */
function hasReminderIntent(p: {
  readonly reminder?: unknown;
  readonly reminders?: unknown;
}): boolean {
  return 'reminders' in p || 'reminder' in p;
}

/**
 * Collapse `reminder` sugar into a canonical reminders array. If both
 * are set, `reminders` wins (caller-error-tolerant). Returns the
 * normalized wire-shape array, `null` for clear, or `undefined` for "no
 * change."
 */
function resolveReminders(p: {
  readonly reminder?: string | null;
  readonly reminders?: readonly (string | TickTickReminder)[] | null;
}): readonly TickTickReminder[] | null | undefined {
  if ('reminders' in p) return normalizeReminderWrites(p.reminders);
  if (!('reminder' in p)) return undefined;
  if (p.reminder === null) return null;
  if (p.reminder === undefined) return undefined;
  return [{ id: generateObjectId(), trigger: p.reminder }];
}

export class TasksModule {
  constructor(private readonly client: TickTickClient) {}

  async list(): Promise<readonly TickTickTask[]> {
    const response = await this.client.request<BatchCheckResponse>('GET', '/api/v3/batch/check/0');
    return response.syncTaskBean?.update ?? [];
  }

  async listCompleted(options?: {
    projectId?: string;
    limit?: number;
  }): Promise<readonly TickTickTask[]> {
    const params = new URLSearchParams({ from: '', status: 'Completed' });
    if (options?.projectId) params.set('projectId', options.projectId);
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    return this.client.request<readonly TickTickTask[]>(
      'GET',
      `/api/v2/project/all/closed?${params.toString()}`,
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
  async create(draft: TickTickTaskDraft): Promise<TickTickTask> {
    const reminders = resolveReminders(draft);
    const { reminder: _r, reminders: _rs, ...rest } = draft;
    const created = await this.client.request<TickTickTask>(
      'POST',
      '/api/v2/task',
      buildPartialUpdateBody({ id: generateObjectId(), ...rest }),
    );
    if (reminders === undefined) return created;
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
  async update(params: TickTickTaskUpdate): Promise<TickTickTask> {
    if (hasReminderIntent(params)) {
      return this.updateWithReminders(params);
    }
    return this.client.request<TickTickTask>(
      'POST',
      `/api/v2/task/${params.id}`,
      buildPartialUpdateBody(params),
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
  async setReminders(
    projectId: string,
    taskId: string,
    reminders: readonly (string | TickTickReminder)[] | null,
  ): Promise<TickTickTask> {
    return this.updateWithReminders({
      id: taskId,
      projectId,
      reminders,
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
  private async updateWithReminders(
    params: TickTickTaskUpdate & {
      readonly reminders?: readonly (string | TickTickReminder)[] | null;
    },
  ): Promise<TickTickTask> {
    const all = await this.list();
    const current = all.find((t) => t.id === params.id);
    if (!current) {
      throw new Error(
        `tasks.update: task ${params.id} not found (cannot read-modify-write reminders)`,
      );
    }

    const resolved = resolveReminders(params);
    const wireReminders: readonly TickTickReminder[] =
      resolved === null
        ? []
        : resolved !== undefined
          ? resolved
          : current.reminders ?? [];

    const { reminder: _r, reminders: _rs, ...overrides } = params;
    const updateEntry: Record<string, unknown> = {
      ...current,
      ...overrides,
      reminders: wireReminders,
      reminder: null,
    };

    // Server silently drops reminders when the task has neither dueDate
    // nor startDate. Guard at the SDK boundary so callers get a typed
    // error instead of a 200-OK-empty-readback surprise. Clears
    // (wireReminders.length === 0) are always allowed — clearing a
    // dateless task is a no-op but not wrong.
    if (wireReminders.length > 0) {
      const dueDate = (updateEntry.dueDate as string | null | undefined) ?? null;
      const startDate = (updateEntry.startDate as string | null | undefined) ?? null;
      if (!dueDate && !startDate) {
        throw new Error(
          `tasks.setReminders: task ${params.id} has neither dueDate nor startDate — ` +
            `TickTick silently drops reminders on dateless tasks. Set dueDate ` +
            `(or startDate) in the same call, or set it first via tasks.update.`,
        );
      }
    }

    const resp = await this.client.request<BatchTaskResponse>('POST', '/api/v2/batch/task', {
      add: [],
      update: [updateEntry],
      delete: [],
      addAttachments: [],
      updateAttachments: [],
      deleteAttachments: [],
    });

    // Surface per-item failures from the batch envelope. Most common
    // cause is etag conflict (the task was modified between our read
    // and our write); callers should catch TickTickBatchError and
    // retry — the next attempt will re-read the fresh etag.
    if (resp.id2error && Object.keys(resp.id2error).length > 0) {
      throw new TickTickBatchError(
        `batch/task reported per-item failure: ${JSON.stringify(resp.id2error)}`,
        resp.id2error,
      );
    }

    // Re-fetch so the returned task has the server-populated `reminder`
    // scalar + the new etag (the batch endpoint returns id→etag map,
    // not the full task body).
    const fresh = await this.list();
    const after = fresh.find((t) => t.id === params.id);
    if (!after) {
      throw new Error(
        `tasks.update: task ${params.id} disappeared after batch write`,
      );
    }
    return after;
  }

  async complete(projectId: string, taskId: string): Promise<void> {
    await this.client.request('POST', `/api/v2/task/${taskId}`, {
      id: taskId,
      projectId,
      status: 2,
      completedTime: new Date().toISOString().replace('Z', '+0000'),
    });
  }

  async delete(projectId: string, taskId: string): Promise<void> {
    await this.client.request('POST', `/api/v2/task/${taskId}`, { id: taskId, projectId, status: -1 });
  }

  // ───────── #3 Batch operations ─────────

  async createMany(drafts: readonly TickTickTaskDraft[]): Promise<void> {
    await Promise.all(
      drafts.map((draft) =>
        this.client.request(
          'POST',
          '/api/v2/task',
          buildPartialUpdateBody({ id: generateObjectId(), ...draft }),
        ),
      ),
    );
  }

  async updateMany(params: readonly TickTickTaskUpdate[]): Promise<void> {
    await Promise.all(
      params.map((p) =>
        this.client.request('POST', `/api/v2/task/${p.id}`, buildPartialUpdateBody(p)),
      ),
    );
  }

  async deleteMany(items: readonly { taskId: string; projectId: string }[]): Promise<void> {
    await Promise.all(
      items.map((item) =>
        this.client.request('POST', `/api/v2/task/${item.taskId}`, {
          id: item.taskId,
          projectId: item.projectId,
          status: -1,
        }),
      ),
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
  async move(item: TickTickTaskMove): Promise<TickTickMoveResult> {
    const all = await this.list();
    const task = all.find((t) => t.id === item.taskId);
    if (!task) throw new Error(`Task ${item.taskId} not found`);

    const newTask = await this.client.request<TickTickTask>('POST', '/api/v2/task', {
      ...task,
      id: generateObjectId(),
      projectId: item.toProjectId,
    });
    await this.client.request('POST', `/api/v2/task/${item.taskId}`, {
      id: item.taskId,
      projectId: item.fromProjectId,
      status: -1,
    });
    return { task: newTask, previousId: item.taskId };
  }

  /**
   * Move multiple tasks to different projects.
   *
   * **⚠️ ID changes:** Same copy+delete limitation as {@link move}.
   * Returns an array of `TickTickMoveResult` with old-to-new ID mappings.
   */
  async moveMany(items: readonly TickTickTaskMove[]): Promise<readonly TickTickMoveResult[]> {
    const all = await this.list();
    return Promise.all(
      items.map(async (item): Promise<TickTickMoveResult> => {
        const task = all.find((t) => t.id === item.taskId);
        if (!task) throw new Error(`Task ${item.taskId} not found`);
        const newTask = await this.client.request<TickTickTask>('POST', '/api/v2/task', {
          ...task,
          id: generateObjectId(),
          projectId: item.toProjectId,
        });
        await this.client.request('POST', `/api/v2/task/${item.taskId}`, {
          id: item.taskId,
          projectId: item.fromProjectId,
          status: -1,
        });
        return { task: newTask, previousId: item.taskId };
      }),
    );
  }

  // ───────── #5 Subtask support ─────────

  async createSubtask(
    parentTaskId: string,
    parentProjectId: string,
    draft: { title: string; sortOrder?: number },
  ): Promise<TickTickTask> {
    return this.client.request<TickTickTask>('POST', `/api/v2/task/${parentTaskId}`, {
      id: parentTaskId,
      projectId: parentProjectId,
      items: [{ id: generateObjectId(), title: draft.title, status: 0, sortOrder: draft.sortOrder ?? 0 }],
    });
  }

  // ───────── #7 Pin / Unpin ─────────

  async pin(taskId: string, projectId: string, date?: Date): Promise<void> {
    await this.client.request('POST', `/api/v2/task/${taskId}`, {
      id: taskId,
      projectId,
      pinnedTime: (date ?? new Date()).toISOString(),
    });
  }

  async unpin(taskId: string, projectId: string): Promise<void> {
    await this.client.request('POST', `/api/v2/task/${taskId}`, {
      id: taskId,
      projectId,
      pinnedTime: null,
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
  async listTrash(options: TickTickTrashOptions & { projectId: string }): Promise<readonly TickTickTask[]> {
    const params = new URLSearchParams({ status: '-1' });
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    return this.client.request<readonly TickTickTask[]>(
      'GET',
      `/api/v2/project/${options.projectId}/tasks?${params.toString()}`,
    );
  }

  /**
   * Restores a deleted task by setting its status back to 0 (open).
   *
   * **⚠️ Known limitation:** Since {@link listTrash} cannot reliably retrieve
   * deleted task IDs, this method requires you to know the task ID beforehand
   * (e.g., saved before deletion).
   */
  async restore(taskId: string, projectId: string): Promise<void> {
    await this.client.request('POST', `/api/v2/task/${taskId}`, { id: taskId, projectId, status: 0 });
  }

  // ───────── #9 Async iterator for completed tasks ─────────

  async *iterateCompleted(
    options?: TickTickCompletedTaskOptions,
  ): AsyncGenerator<readonly TickTickTask[]> {
    const params = new URLSearchParams({ from: '', status: options?.status ?? 'Completed' });
    if (options?.projectId) params.set('projectId', options.projectId);

    while (true) {
      const page = await this.client.request<readonly TickTickTask[]>(
        'GET',
        `/api/v2/project/all/closed?${params.toString()}`,
      );
      if (page.length === 0) break;
      yield page;
      const last = page[page.length - 1];
      // Normalize cursor: "2026-04-02T22:42:07.000+0000" → "2026-04-02 22:42:07"
      const cursor = (last?.completedTime ?? '')
        .replace(/\.\d+\+\d+$/, '')   // strip .000+0000
        .replace(/\.\d+Z$/, '')        // strip .000Z
        .replace('T', ' ');
      params.set('from', cursor);
    }
  }
}
