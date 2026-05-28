import type { TickTickClient } from '../client.js';
import type {
  TickTickActivityEvent,
  TickTickActivityPaginationParams,
} from '../types.js';

/**
 * Activity-feed / history surface.
 *
 * **Premium-only.** TickTick gates the activity-feed feature behind a
 * Premium subscription; non-Premium accounts are expected to receive a
 * 4xx response from these endpoints. Verified working against a Premium
 * test account on 2026-05-28; wire-shape capture in
 * `Plans/activity-probe.md`.
 *
 * Both list methods accept an optional `{skip, lastId}` pagination
 * object — pass the `id` of the last event from the previous page as
 * `lastId` and the running count as `skip` to fetch the next page.
 * The server returns an empty array when the feed is exhausted.
 *
 * Both endpoints live on the **V1 API surface** (`/api/v1/...`), not
 * V2 — this is one of the few endpoints the library exposes through
 * the older path. The V1 path is what the TickTick web UI hits.
 */
export class ActivityModule {
  constructor(private readonly client: TickTickClient) {}

  /**
   * List activity events for a single task.
   *
   * Hits `GET /api/v1/task/activity/{taskId}` with optional pagination.
   * Returns events in newest-first order (matches the TickTick UI's
   * task-history panel).
   */
  async listForTask(
    taskId: string,
    params: TickTickActivityPaginationParams = {},
  ): Promise<readonly TickTickActivityEvent[]> {
    const query = buildPaginationQuery(params);
    // DO NOT NORMALIZE the URL — empirically verified. The task endpoint puts
    // the id at the end (`/task/activity/{id}`); the project endpoint puts it
    // BEFORE `/activity` (`/project/{id}/activity`). The asymmetry is server-
    // side; refactoring to a single shape will produce 404s. See
    // `Plans/activity-probe.md`.
    const path = `/api/v1/task/activity/${taskId}${query}`;
    return this.client.request<readonly TickTickActivityEvent[]>('GET', path);
  }

  /**
   * List activity events for a project.
   *
   * Hits `GET /api/v1/project/{projectId}/activity` — note the URL
   * shape is asymmetric with `listForTask` (the task endpoint puts
   * the id at the end; the project endpoint puts it before `/activity`).
   * The library hides the asymmetry; callers pass the id positionally.
   */
  async listForProject(
    projectId: string,
    params: TickTickActivityPaginationParams = {},
  ): Promise<readonly TickTickActivityEvent[]> {
    const query = buildPaginationQuery(params);
    // DO NOT NORMALIZE the URL — empirically verified. The project endpoint
    // puts the id BEFORE `/activity`; rearranging to `/project/activity/{id}`
    // (mirroring the task endpoint shape) returns 404. The asymmetry is
    // server-side; the unit test in `tests/modules/activity.test.ts` carries
    // a regression guard. See `Plans/activity-probe.md`.
    const path = `/api/v1/project/${projectId}/activity${query}`;
    return this.client.request<readonly TickTickActivityEvent[]>('GET', path);
  }
}

function buildPaginationQuery(params: TickTickActivityPaginationParams): string {
  const search = new URLSearchParams();
  if (params.skip !== undefined) search.set('skip', String(params.skip));
  if (params.lastId !== undefined) search.set('lastId', params.lastId);
  const qs = search.toString();
  return qs.length > 0 ? `?${qs}` : '';
}
