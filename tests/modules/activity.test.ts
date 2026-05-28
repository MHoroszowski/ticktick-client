import { describe, it, expect } from 'vitest';
import { createClient } from '../helpers.js';
import type { TickTickActivityEvent } from '../../src/types.js';

const sampleTaskEvent: TickTickActivityEvent = {
  id: 'evt-task-1',
  action: 'T_CONTENT',
  when: '2026-05-27T21:25:33.360+0000',
  deviceChannel: 'web',
  content: 'New notes',
  kind: 'TEXT',
  whoProfile: { isMyself: true },
};

const sampleProjectEvent: TickTickActivityEvent = {
  id: 'evt-proj-1',
  action: 'P_CREATE',
  when: '2026-04-17T19:27:14.933+0000',
  deviceChannel: 'web',
  name: 'TEST - PAI Skill',
  whoProfile: { isMyself: true },
};

describe('ActivityModule.listForTask()', () => {
  it('GETs /api/v1/task/activity/{taskId} and returns the bare event array', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: [sampleTaskEvent] },
    ]);

    const events = await client.activity.listForTask('task-abc');

    const [url, init] = mockFetch.calls[0]!;
    expect(url).toContain('/api/v1/task/activity/task-abc');
    expect(init?.method).toBe('GET');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(sampleTaskEvent);
  });

  it('returns empty array when feed is exhausted', async () => {
    const { client } = createClient([{ status: 200, body: [] }]);
    const events = await client.activity.listForTask('task-abc');
    expect(events).toEqual([]);
  });

  it('appends ?skip and ?lastId when pagination params are passed', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: [] },
    ]);
    await client.activity.listForTask('task-abc', { skip: 4, lastId: 'evt-4' });

    const [url] = mockFetch.calls[0]!;
    expect(url).toContain('/api/v1/task/activity/task-abc');
    expect(url).toContain('skip=4');
    expect(url).toContain('lastId=evt-4');
  });

  it('omits the query string entirely when no pagination params are passed', async () => {
    const { client, mockFetch } = createClient([{ status: 200, body: [] }]);
    await client.activity.listForTask('task-abc');
    const [url] = mockFetch.calls[0]!;
    expect(url).not.toContain('?');
  });

  it('sends skip=0 verbatim (the partial-update contract for optional numbers)', async () => {
    const { client, mockFetch } = createClient([{ status: 200, body: [] }]);
    await client.activity.listForTask('task-abc', { skip: 0 });
    const [url] = mockFetch.calls[0]!;
    expect(url).toContain('skip=0');
  });
});

describe('ActivityModule.listForProject()', () => {
  it('GETs /api/v1/project/{projectId}/activity and returns the bare event array', async () => {
    const { client, mockFetch } = createClient([
      { status: 200, body: [sampleProjectEvent] },
    ]);

    const events = await client.activity.listForProject('proj-xyz');

    const [url, init] = mockFetch.calls[0]!;
    expect(url).toContain('/api/v1/project/proj-xyz/activity');
    expect(init?.method).toBe('GET');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(sampleProjectEvent);
  });

  it('uses the project-scoped URL shape (id before /activity, not after)', async () => {
    const { client, mockFetch } = createClient([{ status: 200, body: [] }]);
    await client.activity.listForProject('proj-xyz');
    const [url] = mockFetch.calls[0]!;
    // Regression guard: the task endpoint puts the id at the end; the project
    // endpoint puts it BEFORE /activity. Verified empirically — `/project/activity/{id}`
    // returns 404; `/project/{id}/activity` works.
    expect(url).toContain('/project/proj-xyz/activity');
    expect(url).not.toContain('/project/activity/');
  });

  it('appends pagination params when supplied', async () => {
    const { client, mockFetch } = createClient([{ status: 200, body: [] }]);
    await client.activity.listForProject('proj-xyz', { skip: 10, lastId: 'evt-10' });
    const [url] = mockFetch.calls[0]!;
    expect(url).toContain('skip=10');
    expect(url).toContain('lastId=evt-10');
  });
});
