import { describe, it, expect } from 'vitest';
import { createClient } from '../helpers.js';

describe('ProjectsModule.createColumn()', () => {
  it('POSTs to /api/v2/column with an {add:[...]} envelope and returns the new column', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: { id2etag: {}, id2error: {} } },
    ]);

    const result = await client.projects.createColumn('proj-1', { name: 'To Do' });

    const [url, init] = mockFetch.calls[0]!;
    expect(url).toContain('/api/v2/column');
    expect(init?.method).toBe('POST');

    const body = JSON.parse(init!.body as string) as {
      add: Array<{ id: string; projectId: string; name: string; sortOrder: number }>;
    };
    expect(body.add).toHaveLength(1);
    expect(body.add[0]!.projectId).toBe('proj-1');
    expect(body.add[0]!.name).toBe('To Do');
    expect(body.add[0]!.sortOrder).toBe(0);
    expect(body.add[0]!.id).toMatch(/^[0-9a-f]{24}$/);
    expect(result.id).toBe(body.add[0]!.id);
    expect(result.projectId).toBe('proj-1');
    expect(result.name).toBe('To Do');
    expect(result.sortOrder).toBe(0);
  });

  it('honors a caller-supplied sortOrder', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: { id2etag: {}, id2error: {} } },
    ]);
    await client.projects.createColumn('proj-1', { name: 'Doing', sortOrder: -42 });

    const body = JSON.parse(mockFetch.calls[0]![1]!.body as string) as {
      add: Array<{ sortOrder: number }>;
    };
    expect(body.add[0]!.sortOrder).toBe(-42);
  });
});

describe('ProjectsModule.updateColumn() — partial-update contract with required projectId', () => {
  it('POSTs to /api/v2/column with an {update:[...]} envelope', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: { id2etag: {}, id2error: {} } },
    ]);
    await client.projects.updateColumn({ id: 'col-1', projectId: 'proj-1', name: 'Renamed' });

    const [url, init] = mockFetch.calls[0]!;
    expect(url).toContain('/api/v2/column');
    expect(init?.method).toBe('POST');

    const body = JSON.parse(init!.body as string) as {
      update: Array<Record<string, unknown>>;
    };
    expect(body.update).toHaveLength(1);
    expect(body.update[0]).toEqual({ id: 'col-1', projectId: 'proj-1', name: 'Renamed' });
  });

  it('always sends projectId — the server silently drops the change if it is missing', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: { id2etag: {}, id2error: {} } },
    ]);
    await client.projects.updateColumn({ id: 'col-1', projectId: 'proj-1', name: 'Renamed' });

    const body = JSON.parse(mockFetch.calls[0]![1]!.body as string) as {
      update: Array<Record<string, unknown>>;
    };
    expect(body.update[0]).toHaveProperty('projectId', 'proj-1');
  });

  it('partial update (name only) omits sortOrder from the wire', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: { id2etag: {}, id2error: {} } },
    ]);
    await client.projects.updateColumn({ id: 'col-1', projectId: 'proj-1', name: 'Renamed' });

    const body = JSON.parse(mockFetch.calls[0]![1]!.body as string) as {
      update: Array<Record<string, unknown>>;
    };
    expect(body.update[0]).not.toHaveProperty('sortOrder');
  });

  it('partial update (sortOrder only) omits name and sends sortOrder=0 verbatim', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: { id2etag: {}, id2error: {} } },
    ]);
    await client.projects.updateColumn({ id: 'col-1', projectId: 'proj-1', sortOrder: 0 });

    const body = JSON.parse(mockFetch.calls[0]![1]!.body as string) as {
      update: Array<Record<string, unknown>>;
    };
    expect(body.update[0]).toEqual({ id: 'col-1', projectId: 'proj-1', sortOrder: 0 });
    expect(body.update[0]).not.toHaveProperty('name');
  });

  it('combined update sends both name and sortOrder', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: { id2etag: {}, id2error: {} } },
    ]);
    await client.projects.updateColumn({
      id: 'col-1',
      projectId: 'proj-1',
      name: 'Done',
      sortOrder: 99,
    });

    const body = JSON.parse(mockFetch.calls[0]![1]!.body as string) as {
      update: Array<Record<string, unknown>>;
    };
    expect(body.update[0]).toEqual({
      id: 'col-1',
      projectId: 'proj-1',
      name: 'Done',
      sortOrder: 99,
    });
  });

  it('no-op update (id + projectId only) sends the minimum payload', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: { id2etag: {}, id2error: {} } },
    ]);
    await client.projects.updateColumn({ id: 'col-1', projectId: 'proj-1' });

    const body = JSON.parse(mockFetch.calls[0]![1]!.body as string) as {
      update: Array<Record<string, unknown>>;
    };
    expect(body.update[0]).toEqual({ id: 'col-1', projectId: 'proj-1' });
  });

  it('throws an actionable error if projectId is missing (defense against type bypass)', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: { id2etag: {}, id2error: {} } },
    ]);

    // Simulate an untyped JS consumer / `as any` bypass that omits projectId.
    // The TypeScript type makes this illegal, but the runtime must guard too —
    // without projectId, TickTick's server silently no-ops with 200, which
    // is the worst failure mode (looks successful, change discarded).
    await expect(
      client.projects.updateColumn({ id: 'col-1' } as unknown as Parameters<typeof client.projects.updateColumn>[0]),
    ).rejects.toThrow(/projectId is required/);

    expect(mockFetch.calls).toHaveLength(0);
  });
});
