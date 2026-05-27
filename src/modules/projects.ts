import { generateObjectId } from '../internal/ids.js';
import { buildPartialUpdateBody } from '../internal/partial-update.js';
import type { TickTickClient } from '../client.js';
import type {
  TickTickProject,
  TickTickProjectDraft,
  TickTickColumn,
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
