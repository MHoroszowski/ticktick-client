import { generateObjectId } from '../internal/ids.js';
import { buildPartialUpdateBody } from '../internal/partial-update.js';
import type { TickTickClient } from '../client.js';
import type {
  TickTickProjectGroup,
  TickTickProjectGroupDraft,
  TickTickProjectGroupUpdate,
} from '../types.js';

/**
 * Default `listType` for a new folder. Probe (2026-05-27) shows this is the
 * value the web client uses; no other values observed.
 */
const DEFAULT_LIST_TYPE = 'group';

/**
 * Manage projectGroups — TickTick's term for folders that hold a flat list
 * of projects. **One level only:** folders cannot contain other folders.
 *
 * Move projects into a folder by setting {@link TickTickProjectDraft.groupId}
 * on `projects.create` or `projects.update`. Unparent a project by passing
 * `groupId: null` (the library translates to the server's `"NONE"` sentinel).
 *
 * Wire endpoints (V2, cookie-session):
 * - `POST /api/v2/batch/projectGroup` — batch CRUD with `{add, update, delete}`.
 * - `GET /api/v2/batch/check/0` — `projectGroups[]` lives on this tree pull.
 *   No dedicated list endpoint exists in V2.
 */
export class ProjectGroupsModule {
  constructor(private readonly client: TickTickClient) {}

  /**
   * List all folders for the current account. Derives `projectGroups[]`
   * from `GET /api/v2/batch/check/0`. Includes soft-deleted folders if the
   * server returns them; callers can filter on `deleted === 0` if needed.
   */
  async list(): Promise<readonly TickTickProjectGroup[]> {
    const raw = await this.client.request<{
      readonly projectGroups?: readonly TickTickProjectGroup[];
    }>('GET', '/api/v2/batch/check/0');
    return raw.projectGroups ?? [];
  }

  async create(draft: TickTickProjectGroupDraft): Promise<TickTickProjectGroup> {
    const id = generateObjectId();
    const payload = {
      id,
      name: draft.name,
      sortOrder: draft.sortOrder ?? 0,
      listType: draft.listType ?? DEFAULT_LIST_TYPE,
    };
    await this.client.request('POST', '/api/v2/batch/projectGroup', {
      add: [payload],
    });
    return { id, name: payload.name, sortOrder: payload.sortOrder };
  }

  async update(params: TickTickProjectGroupUpdate): Promise<void> {
    await this.client.request('POST', '/api/v2/batch/projectGroup', {
      update: [buildPartialUpdateBody(params)],
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.request('POST', '/api/v2/batch/projectGroup', {
      delete: [id],
    });
  }

  async deleteMany(ids: readonly string[]): Promise<void> {
    await this.client.request('POST', '/api/v2/batch/projectGroup', {
      delete: ids,
    });
  }
}
