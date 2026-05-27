import { generateObjectId } from '../internal/ids.js';
import { buildPartialUpdateBody } from '../internal/partial-update.js';
import type { TickTickClient } from '../client.js';
import type {
  TickTickProject,
  TickTickProjectDraft,
  TickTickColumn,
  TickTickColumnDraft,
  TickTickColumnUpdate,
  TickTickProjectMember,
} from '../types.js';

/**
 * V2 sentinel for "clear the folder assignment." Sending JSON `null` does
 * NOT unparent — verified empirically 2026-05-27 (Plans/nested-projects-probe.md
 * step 5). The library translates caller-facing `groupId: null` to this
 * string on the wire so the universal partial-update contract still holds
 * from the caller's perspective.
 */
const GROUP_UNPARENT_SENTINEL = 'NONE';

/**
 * Rewrite caller-side `groupId: null` to the V2 wire sentinel `"NONE"`.
 * Everything else passes through unchanged.
 */
function normalizeGroupId<T extends { groupId?: string | null }>(params: T): T {
  if ('groupId' in params && params.groupId === null) {
    return { ...params, groupId: GROUP_UNPARENT_SENTINEL } as T;
  }
  return params;
}

/**
 * Raw response shape for `GET /api/v2/column`. The endpoint returns a
 * wrapper object, not a bare array — historical bug: the library used to
 * type this as `readonly TickTickColumn[]` and return whatever the server
 * sent, which caused callers to get `{update: [...]}` at runtime instead
 * of an array. Fixed in `listColumns` by unwrapping.
 */
type RawColumnsResponse = {
  readonly update?: readonly TickTickColumn[];
};

export class ProjectsModule {
  constructor(private readonly client: TickTickClient) {}

  async list(): Promise<readonly TickTickProject[]> {
    return this.client.request<readonly TickTickProject[]>('GET', '/api/v2/projects');
  }

  async create(draft: TickTickProjectDraft): Promise<TickTickProject> {
    const id = generateObjectId();
    const wireDraft = normalizeGroupId(draft);
    await this.client.request('POST', '/api/v2/batch/project', {
      add: [{ id, ...wireDraft }],
    });
    return { id, ...draft };
  }

  async update(params: Partial<TickTickProjectDraft> & { id: string }): Promise<void> {
    await this.client.request('POST', '/api/v2/batch/project', {
      update: [buildPartialUpdateBody(normalizeGroupId(params))],
    });
  }

  async delete(projectId: string): Promise<void> {
    await this.client.request('POST', '/api/v2/batch/project', {
      delete: [projectId],
    });
  }

  async deleteMany(projectIds: readonly string[]): Promise<void> {
    await this.client.request('POST', '/api/v2/batch/project', {
      delete: projectIds,
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
  async listColumns(projectId?: string): Promise<readonly TickTickColumn[]> {
    const params = new URLSearchParams({ from: '0' });
    if (projectId) params.set('projectId', projectId);
    const raw = await this.client.request<unknown>(
      'GET',
      `/api/v2/column?${params.toString()}`,
    );
    const columns: readonly TickTickColumn[] = Array.isArray(raw)
      ? (raw as readonly TickTickColumn[])
      : ((raw as RawColumnsResponse).update ?? []);
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
  async createColumn(
    projectId: string,
    draft: TickTickColumnDraft,
  ): Promise<TickTickColumn> {
    const id = generateObjectId();
    const sortOrder = draft.sortOrder ?? 0;
    await this.client.request('POST', '/api/v2/column', {
      add: [{ id, projectId, name: draft.name, sortOrder }],
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
  async updateColumn(params: TickTickColumnUpdate): Promise<void> {
    if (!params.projectId) {
      throw new Error(
        'projects.updateColumn: projectId is required on the update payload. ' +
          'TickTick\'s POST /api/v2/column endpoint silently no-ops (returns 200 ' +
          'with empty id2etag) when projectId is omitted from the update item. ' +
          'Pass the column\'s parent projectId on every update.',
      );
    }
    await this.client.request('POST', '/api/v2/column', {
      update: [buildPartialUpdateBody(params)],
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
  async deleteColumn(projectId: string, columnId: string): Promise<void> {
    await this.client.request('POST', '/api/v2/column', {
      delete: [{ columnId, projectId }],
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
  async listMembers(projectId: string): Promise<readonly TickTickProjectMember[]> {
    return this.client.request<readonly TickTickProjectMember[]>(
      'GET',
      `/api/v2/project/${projectId}/users`,
    );
  }
}
