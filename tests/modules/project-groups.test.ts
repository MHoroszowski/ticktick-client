import { describe, it, expect } from 'vitest';
import { createClient } from '../helpers.js';
import type { TickTickProjectGroup } from '../../src/types.js';

const mockGroup: TickTickProjectGroup = {
  id: 'group-abc',
  name: 'Work',
  sortOrder: 0,
  etag: 'etag-1',
  deleted: 0,
  userId: 130490066,
  showAll: true,
  sortType: 'project',
};

describe('ProjectGroupsModule.create()', () => {
  it('POSTs to /api/v2/batch/projectGroup with an add payload', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: { id2etag: {}, id2error: {} } },
    ]);
    const result = await client.projectGroups.create({ name: 'Personal' });

    const [url, init] = mockFetch.calls[0]!;
    expect(url).toContain('/api/v2/batch/projectGroup');
    expect(init?.method).toBe('POST');

    const body = JSON.parse(init!.body as string) as {
      add: Array<{ id: string; name: string; sortOrder: number; listType: string }>;
    };
    expect(body.add).toHaveLength(1);
    expect(body.add[0]!.name).toBe('Personal');
    expect(body.add[0]!.sortOrder).toBe(0);
    expect(body.add[0]!.listType).toBe('group');
    expect(body.add[0]!.id).toMatch(/^[0-9a-f]{24}$/);
    expect(result.id).toBe(body.add[0]!.id);
    expect(result.name).toBe('Personal');
  });

  it('honors caller-supplied sortOrder and listType', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: { id2etag: {}, id2error: {} } },
    ]);
    await client.projectGroups.create({ name: 'Custom', sortOrder: -42, listType: 'group' });

    const body = JSON.parse(mockFetch.calls[0]![1]!.body as string) as {
      add: Array<{ sortOrder: number; listType: string }>;
    };
    expect(body.add[0]!.sortOrder).toBe(-42);
    expect(body.add[0]!.listType).toBe('group');
  });
});

describe('ProjectGroupsModule.update() — partial-update contract', () => {
  it('strips undefined keys and sends only what the caller provided', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: { id2etag: {}, id2error: {} } },
    ]);
    await client.projectGroups.update({ id: 'group-abc', name: 'Renamed' });

    const body = JSON.parse(mockFetch.calls[0]![1]!.body as string) as {
      update: Array<Record<string, unknown>>;
    };
    expect(body.update).toHaveLength(1);
    expect(body.update[0]!).toEqual({ id: 'group-abc', name: 'Renamed' });
    expect(body.update[0]!).not.toHaveProperty('sortOrder');
    expect(body.update[0]!).not.toHaveProperty('listType');
  });

  it('allows partial update with id only (preserves all server fields)', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: { id2etag: {}, id2error: {} } },
    ]);
    await client.projectGroups.update({ id: 'group-abc' });

    const body = JSON.parse(mockFetch.calls[0]![1]!.body as string) as {
      update: Array<Record<string, unknown>>;
    };
    expect(body.update[0]!).toEqual({ id: 'group-abc' });
  });
});

describe('ProjectGroupsModule.delete()', () => {
  it('POSTs delete array with a single id', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: { id2etag: {}, id2error: {} } },
    ]);
    await client.projectGroups.delete('group-abc');

    const body = JSON.parse(mockFetch.calls[0]![1]!.body as string) as { delete: string[] };
    expect(body).toEqual({ delete: ['group-abc'] });
  });
});

describe('ProjectGroupsModule.deleteMany()', () => {
  it('POSTs delete array with all supplied ids', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: { id2etag: {}, id2error: {} } },
    ]);
    await client.projectGroups.deleteMany(['a', 'b', 'c']);

    const body = JSON.parse(mockFetch.calls[0]![1]!.body as string) as { delete: string[] };
    expect(body.delete).toEqual(['a', 'b', 'c']);
  });
});

describe('ProjectGroupsModule.list()', () => {
  it('extracts projectGroups[] from /api/v2/batch/check/0', async () => {
    const { client, mockFetch } = createClient([
      {
        status: 200,
        body: {
          checkPoint: 1,
          projectGroups: [mockGroup, { ...mockGroup, id: 'group-2', name: 'Personal' }],
          projectProfiles: [],
        },
      },
    ]);
    const groups = await client.projectGroups.list();
    expect(groups).toHaveLength(2);
    expect(groups[0]!.id).toBe('group-abc');
    expect(groups[0]!.name).toBe('Work');
    expect(groups[1]!.name).toBe('Personal');
    expect(mockFetch.calls[0]![0]).toContain('/api/v2/batch/check/0');
    expect(mockFetch.calls[0]![1]?.method).toBe('GET');
  });

  it('returns empty array when projectGroups field is missing', async () => {
    const { client } = createClient([{ status: 200, body: { checkPoint: 1 } }]);
    expect(await client.projectGroups.list()).toEqual([]);
  });
});
