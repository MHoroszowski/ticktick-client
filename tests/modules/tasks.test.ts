import { describe, it, expect } from 'vitest';
import { createClient } from '../helpers.js';
import type { TickTickTask } from '../../src/types.js';

const mockTask: TickTickTask = {
  id: 'task123',
  projectId: 'proj123',
  title: 'Test Task',
  status: 0,
  priority: 0,
};

describe('TasksModule', () => {
  describe('list()', () => {
    it('should return tasks array', async () => {
      const { client } = createClient([{ status: 200, body: { syncTaskBean: { update: [mockTask] } } }]);
      const tasks = await client.tasks.list();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.title).toBe('Test Task');
    });

    it('should return empty array if response is empty', async () => {
      const { client } = createClient([{ status: 200, body: { syncTaskBean: { update: [] } } }]);
      expect(await client.tasks.list()).toEqual([]);
    });

    it('should return empty array if syncTaskBean is missing', async () => {
      const { client } = createClient([{ status: 200, body: {} }]);
      expect(await client.tasks.list()).toEqual([]);
    });

    it('should call GET /api/v3/batch/check/0', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: { syncTaskBean: { update: [] } } }]);
      await client.tasks.list();
      expect(mockFetch.calls[0]![0]).toContain('/api/v3/batch/check/0');
      expect(mockFetch.calls[0]![1]?.method).toBe('GET');
    });
  });

  describe('listCompleted()', () => {
    it('should call correct endpoint', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: [] }]);
      await client.tasks.listCompleted();
      expect(mockFetch.calls[0]![0]).toContain('/api/v2/project/all/closed');
    });

    it('should include projectId and limit in query params', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: [] }]);
      await client.tasks.listCompleted({ projectId: 'proj1', limit: 10 });
      const url = mockFetch.calls[0]![0]!;
      expect(url).toContain('projectId=proj1');
      expect(url).toContain('limit=10');
    });

    it('should include status=Completed', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: [] }]);
      await client.tasks.listCompleted();
      expect(mockFetch.calls[0]![0]).toContain('status=Completed');
    });
  });

  describe('create()', () => {
    it('should POST to /api/v2/task', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: mockTask }]);
      await client.tasks.create({ title: 'New Task' });
      expect(mockFetch.calls[0]![0]).toContain('/api/v2/task');
      expect(mockFetch.calls[0]![1]?.method).toBe('POST');
    });

    it('should include generated id in request body', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: mockTask }]);
      await client.tasks.create({ title: 'New Task', projectId: 'proj123' });
      const body = JSON.parse(mockFetch.calls[0]![1]?.body as string);
      expect(body.id).toMatch(/^[0-9a-f]{24}$/);
      expect(body.title).toBe('New Task');
      expect(body.projectId).toBe('proj123');
    });

    it('should return created task', async () => {
      const { client } = createClient([{ status: 200, body: mockTask }]);
      const task = await client.tasks.create({ title: 'New Task' });
      expect(task).toEqual(mockTask);
    });
  });

  describe('update()', () => {
    it('should POST to /api/v2/task/:id', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: mockTask }]);
      await client.tasks.update({ id: 'task123', projectId: 'proj123', title: 'Updated' });
      expect(mockFetch.calls[0]![0]).toContain('/api/v2/task/task123');
      expect(mockFetch.calls[0]![1]?.method).toBe('POST');
    });

    it('should send only id, projectId, and explicitly-provided fields', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: mockTask }]);
      await client.tasks.update({ id: 'task123', projectId: 'proj123', content: 'New description' });
      const body = JSON.parse(mockFetch.calls[0]![1]?.body as string);
      expect(body).toEqual({ id: 'task123', projectId: 'proj123', content: 'New description' });
      expect(body).not.toHaveProperty('title');
      expect(body).not.toHaveProperty('dueDate');
      expect(body).not.toHaveProperty('startDate');
      expect(body).not.toHaveProperty('priority');
      expect(body).not.toHaveProperty('tags');
    });

    it('should preserve explicit null values so the server clears the field', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: mockTask }]);
      await client.tasks.update({
        id: 'task123',
        projectId: 'proj123',
        content: 'Just the content',
        dueDate: null,
        startDate: null,
        repeatFlag: null,
      });
      const body = JSON.parse(mockFetch.calls[0]![1]?.body as string);
      expect(body).toEqual({
        id: 'task123',
        projectId: 'proj123',
        content: 'Just the content',
        dueDate: null,
        startDate: null,
        repeatFlag: null,
      });
    });

    it('should strip undefined values but keep nulls', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: mockTask }]);
      await client.tasks.update({
        id: 'task123',
        projectId: 'proj123',
        content: 'New',
        dueDate: undefined,
        startDate: null,
      });
      const body = JSON.parse(mockFetch.calls[0]![1]?.body as string);
      expect(body).toEqual({
        id: 'task123',
        projectId: 'proj123',
        content: 'New',
        startDate: null,
      });
      expect(body).not.toHaveProperty('dueDate');
    });

    it('should preserve falsy non-null values like 0 and empty string', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: mockTask }]);
      await client.tasks.update({
        id: 'task123',
        projectId: 'proj123',
        priority: 0,
        content: '',
      });
      const body = JSON.parse(mockFetch.calls[0]![1]?.body as string);
      expect(body.priority).toBe(0);
      expect(body.content).toBe('');
    });
  });

  describe('reminders readback typing', () => {
    // Readback type stable from prior cycle; this test pins the shape.
    it('surfaces reminders array of { id, trigger } objects on readback', async () => {
      const taskWithReminders: TickTickTask = {
        id: 'task123',
        projectId: 'proj123',
        title: 'reminded',
        status: 0,
        reminder: 'TRIGGER:PT0S',
        reminders: [
          { id: 'rem-1', trigger: 'TRIGGER:PT0S' },
          { id: 'rem-2', trigger: 'TRIGGER:-PT15M' },
        ],
      };
      const { client } = createClient([
        { status: 200, body: { syncTaskBean: { update: [taskWithReminders] } } },
      ]);
      const tasks = await client.tasks.list();
      expect(tasks[0]?.reminder).toBe('TRIGGER:PT0S');
      expect(tasks[0]?.reminders).toEqual([
        { id: 'rem-1', trigger: 'TRIGGER:PT0S' },
        { id: 'rem-2', trigger: 'TRIGGER:-PT15M' },
      ]);
    });
  });

  describe('reminders write path (epic #59 / #2 + #3)', () => {
    // baseTask carries dueDate — see the dateless-task guard test
    // below for why that matters (server silently drops reminders on
    // dateless tasks; SDK rejects with a typed error).
    const baseTask: TickTickTask = {
      id: 'task123',
      projectId: 'proj123',
      title: 'reminded',
      status: 0,
      priority: 0,
      dueDate: '2027-06-01T15:00:00.000+0000',
      reminders: [],
    };
    const taskListResponse = (task: TickTickTask = baseTask) => ({
      status: 200 as const,
      body: { syncTaskBean: { update: [task] } },
    });
    const batchOk = { status: 200 as const, body: { id2etag: { task123: 'e1' }, id2error: {} } };

    it('setReminders POSTs to /api/v2/batch/task with the new reminders array', async () => {
      const updatedTask: TickTickTask = {
        ...baseTask,
        reminder: 'TRIGGER:-PT15M',
        reminders: [{ id: 'rid-1', trigger: 'TRIGGER:-PT15M' }],
      };
      const { client, mockFetch } = createClient([
        taskListResponse(baseTask),
        batchOk,
        taskListResponse(updatedTask),
      ]);
      const result = await client.tasks.setReminders('proj123', 'task123', ['TRIGGER:-PT15M']);
      const batchCall = mockFetch.calls[1]!;
      expect(batchCall[0]).toContain('/api/v2/batch/task');
      expect(batchCall[1]?.method).toBe('POST');
      const body = JSON.parse(batchCall[1]?.body as string);
      expect(body.add).toEqual([]);
      expect(body.delete).toEqual([]);
      expect(body.update).toHaveLength(1);
      const entry = body.update[0];
      expect(entry.id).toBe('task123');
      expect(entry.projectId).toBe('proj123');
      expect(entry.reminder).toBeNull();
      expect(entry.reminders).toHaveLength(1);
      expect(entry.reminders[0].trigger).toBe('TRIGGER:-PT15M');
      expect(entry.reminders[0].id).toMatch(/^[0-9a-f]{24}$/);
      expect(result.reminders).toEqual([{ id: 'rid-1', trigger: 'TRIGGER:-PT15M' }]);
    });

    it('setReminders(..., null) clears reminders (sends empty array on wire)', async () => {
      const cleared: TickTickTask = { ...baseTask, reminder: '', reminders: [] };
      const { client, mockFetch } = createClient([
        taskListResponse({ ...baseTask, reminders: [{ id: 'r0', trigger: 'TRIGGER:PT0S' }] }),
        batchOk,
        taskListResponse(cleared),
      ]);
      await client.tasks.setReminders('proj123', 'task123', null);
      const body = JSON.parse(mockFetch.calls[1]![1]?.body as string);
      expect(body.update[0].reminders).toEqual([]);
      expect(body.update[0].reminder).toBeNull();
    });

    it('setReminders preserves existing id when caller passes { id, trigger } object', async () => {
      const { client, mockFetch } = createClient([
        taskListResponse(baseTask),
        batchOk,
        taskListResponse(baseTask),
      ]);
      await client.tasks.setReminders('proj123', 'task123', [
        { id: 'stable-id-123', trigger: 'TRIGGER:-PT15M' },
      ]);
      const body = JSON.parse(mockFetch.calls[1]![1]?.body as string);
      expect(body.update[0].reminders[0].id).toBe('stable-id-123');
    });

    it('setReminders carries the current etag on the wire', async () => {
      const taskWithEtag = { ...baseTask, etag: 'abc123' } as TickTickTask & { etag: string };
      const { client, mockFetch } = createClient([
        taskListResponse(taskWithEtag),
        batchOk,
        taskListResponse(taskWithEtag),
      ]);
      await client.tasks.setReminders('proj123', 'task123', ['TRIGGER:PT0S']);
      const body = JSON.parse(mockFetch.calls[1]![1]?.body as string);
      expect(body.update[0].etag).toBe('abc123');
    });

    it('setReminders throws if the task disappeared (ENOENT-shaped)', async () => {
      const { client } = createClient([taskListResponse({ ...baseTask, id: 'other' })]);
      await expect(
        client.tasks.setReminders('proj123', 'task123', ['TRIGGER:PT0S']),
      ).rejects.toThrow(/task123 not found/);
    });

    it('setReminders throws when the task has neither dueDate nor startDate', async () => {
      // Server silently drops reminders on dateless tasks (verified
      // empirically — see scripts/reminders-edge-probe.ts). Guard at
      // the SDK boundary so callers get a typed error.
      const datelessTask: TickTickTask = {
        id: 'task123', projectId: 'proj123', title: 't', status: 0,
      };
      const { client } = createClient([taskListResponse(datelessTask)]);
      await expect(
        client.tasks.setReminders('proj123', 'task123', ['TRIGGER:PT0S']),
      ).rejects.toThrow(/neither dueDate nor startDate/);
    });

    it('setReminders allows clearing reminders even on a dateless task', async () => {
      // Empty array / null is a no-op on a dateless task, not an error.
      const datelessTask: TickTickTask = {
        id: 'task123', projectId: 'proj123', title: 't', status: 0,
      };
      const { client } = createClient([
        taskListResponse(datelessTask),
        batchOk,
        taskListResponse(datelessTask),
      ]);
      await expect(
        client.tasks.setReminders('proj123', 'task123', null),
      ).resolves.toBeTruthy();
    });

    it('update lets reminders land when dueDate is set in the same call', async () => {
      // Caller passes both dueDate and reminders → guard sees the
      // merged state has dueDate, allows the write.
      const datelessTask: TickTickTask = {
        id: 'task123', projectId: 'proj123', title: 't', status: 0,
      };
      const { client, mockFetch } = createClient([
        taskListResponse(datelessTask),
        batchOk,
        taskListResponse(datelessTask),
      ]);
      await client.tasks.update({
        id: 'task123',
        projectId: 'proj123',
        dueDate: '2027-06-01T15:00:00.000+0000',
        reminders: ['TRIGGER:-PT15M'],
      });
      const body = JSON.parse(mockFetch.calls[1]![1]?.body as string);
      expect(body.update[0].dueDate).toBe('2027-06-01T15:00:00.000+0000');
      expect(body.update[0].reminders).toHaveLength(1);
    });

    it('setReminders surfaces id2error from the batch envelope as TickTickBatchError', async () => {
      // Server returns 200 with per-item failure (e.g. stale etag) —
      // common RMW concurrency case. Without explicit check the SDK
      // would silently succeed and the re-fetch would mask the failure.
      const { client } = createClient([
        taskListResponse(baseTask),
        { status: 200, body: { id2etag: {}, id2error: { task123: 'etag mismatch' } } },
      ]);
      await expect(
        client.tasks.setReminders('proj123', 'task123', ['TRIGGER:PT0S']),
      ).rejects.toMatchObject({
        name: 'TickTickBatchError',
        errors: { task123: 'etag mismatch' },
      });
    });

    it('update routes through /api/v2/batch/task when reminders are in params', async () => {
      const { client, mockFetch } = createClient([
        taskListResponse(baseTask),
        batchOk,
        taskListResponse(baseTask),
      ]);
      await client.tasks.update({
        id: 'task123',
        projectId: 'proj123',
        title: 'renamed',
        reminders: ['TRIGGER:-PT30M'],
      });
      const url0 = mockFetch.calls[0]![0]!;
      expect(url0).toContain('/api/v3/batch/check/0');
      const url1 = mockFetch.calls[1]![0]!;
      expect(url1).toContain('/api/v2/batch/task');
      expect(url1).not.toContain('/api/v2/task/task123');
      const body = JSON.parse(mockFetch.calls[1]![1]?.body as string);
      expect(body.update[0].title).toBe('renamed');
      expect(body.update[0].reminders[0].trigger).toBe('TRIGGER:-PT30M');
    });

    it('update routes through /api/v2/batch/task when only `reminder` sugar is set', async () => {
      const { client, mockFetch } = createClient([
        taskListResponse(baseTask),
        batchOk,
        taskListResponse(baseTask),
      ]);
      await client.tasks.update({
        id: 'task123',
        projectId: 'proj123',
        reminder: 'TRIGGER:PT0S',
      });
      expect(mockFetch.calls[1]![0]).toContain('/api/v2/batch/task');
      const body = JSON.parse(mockFetch.calls[1]![1]?.body as string);
      expect(body.update[0].reminders).toEqual([
        expect.objectContaining({ trigger: 'TRIGGER:PT0S', id: expect.stringMatching(/^[0-9a-f]{24}$/) }),
      ]);
    });

    it('update keeps the partial-update path when no reminder fields are passed', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: baseTask }]);
      await client.tasks.update({ id: 'task123', projectId: 'proj123', content: 'just content' });
      expect(mockFetch.calls[0]![0]).toContain('/api/v2/task/task123');
      expect(mockFetch.calls[0]![0]).not.toContain('/api/v2/batch/task');
    });

    it('`reminders` wins on conflict — `reminder` sugar dropped', async () => {
      const { client, mockFetch } = createClient([
        taskListResponse(baseTask),
        batchOk,
        taskListResponse(baseTask),
      ]);
      await client.tasks.update({
        id: 'task123',
        projectId: 'proj123',
        reminder: 'TRIGGER:-PT15M',
        reminders: [{ id: 'win', trigger: 'TRIGGER:PT0S' }],
      });
      const body = JSON.parse(mockFetch.calls[1]![1]?.body as string);
      expect(body.update[0].reminders).toEqual([{ id: 'win', trigger: 'TRIGGER:PT0S' }]);
      expect(body.update[0].reminder).toBeNull();
    });

    it('create chains a setReminders call when draft.reminder is set', async () => {
      const { client, mockFetch } = createClient([
        { status: 200, body: { ...baseTask, id: 'new-task' } }, // create response
        taskListResponse({ ...baseTask, id: 'new-task' }),       // list inside setReminders
        batchOk,                                                  // batch write
        taskListResponse({ ...baseTask, id: 'new-task' }),       // re-fetch
      ]);
      await client.tasks.create({ title: 'r', projectId: 'proj123', reminder: 'TRIGGER:PT0S' });
      // First call: plain create (no reminders in body)
      const createBody = JSON.parse(mockFetch.calls[0]![1]?.body as string);
      expect(createBody.title).toBe('r');
      expect(createBody).not.toHaveProperty('reminder');
      expect(createBody).not.toHaveProperty('reminders');
      // Third call: batch/task with the reminders
      expect(mockFetch.calls[2]![0]).toContain('/api/v2/batch/task');
    });

    it('create chains setReminders when draft.reminders array is set', async () => {
      const { client, mockFetch } = createClient([
        { status: 200, body: { ...baseTask, id: 'new-task' } },
        taskListResponse({ ...baseTask, id: 'new-task' }),
        batchOk,
        taskListResponse({ ...baseTask, id: 'new-task' }),
      ]);
      await client.tasks.create({
        title: 'r',
        projectId: 'proj123',
        reminders: ['TRIGGER:-PT15M', 'TRIGGER:PT0S'],
      });
      const batchBody = JSON.parse(mockFetch.calls[2]![1]?.body as string);
      expect(batchBody.update[0].reminders).toHaveLength(2);
      expect(batchBody.update[0].reminders.map((r: { trigger: string }) => r.trigger)).toEqual([
        'TRIGGER:-PT15M',
        'TRIGGER:PT0S',
      ]);
    });

    it('create skips setReminders chain when no reminder fields in draft', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: baseTask }]);
      await client.tasks.create({ title: 'plain', projectId: 'proj123' });
      expect(mockFetch.calls).toHaveLength(1);
      expect(mockFetch.calls[0]![0]).toContain('/api/v2/task');
      expect(mockFetch.calls[0]![0]).not.toContain('/api/v2/batch/task');
    });
  });

  describe('updateMany()', () => {
    it('should apply partial-update semantics per item', async () => {
      const { client, mockFetch } = createClient([
        { status: 200, body: mockTask },
        { status: 200, body: mockTask },
      ]);
      await client.tasks.updateMany([
        { id: 't1', projectId: 'p1', content: 'First', startDate: undefined },
        { id: 't2', projectId: 'p2', priority: 3, dueDate: null },
      ]);
      const body0 = JSON.parse(mockFetch.calls[0]![1]?.body as string);
      const body1 = JSON.parse(mockFetch.calls[1]![1]?.body as string);
      expect(body0).toEqual({ id: 't1', projectId: 'p1', content: 'First' });
      expect(body0).not.toHaveProperty('startDate');
      expect(body1).toEqual({ id: 't2', projectId: 'p2', priority: 3, dueDate: null });
    });
  });

  describe('complete()', () => {
    it('should POST to /api/v2/task/{id} with status 2', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: {} }]);
      await client.tasks.complete('proj123', 'task123');
      expect(mockFetch.calls[0]![0]).toContain('/api/v2/task/task123');
      const body = JSON.parse(mockFetch.calls[0]![1]?.body as string);
      expect(body.status).toBe(2);
      expect(body.id).toBe('task123');
      expect(body.projectId).toBe('proj123');
    });

    it('should include completedTime in ISO format', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: {} }]);
      await client.tasks.complete('proj123', 'task123');
      const body = JSON.parse(mockFetch.calls[0]![1]?.body as string);
      expect(body.completedTime).toBeDefined();
    });
  });

  describe('delete()', () => {
    it('should POST to /api/v2/task/{id} with status -1', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: {} }]);
      await client.tasks.delete('proj123', 'task123');
      expect(mockFetch.calls[0]![0]).toContain('/api/v2/task/task123');
      expect(mockFetch.calls[0]![1]?.method).toBe('POST');
      const body = JSON.parse(mockFetch.calls[0]![1]?.body as string);
      expect(body.id).toBe('task123');
      expect(body.projectId).toBe('proj123');
      expect(body.status).toBe(-1);
    });
  });
});
