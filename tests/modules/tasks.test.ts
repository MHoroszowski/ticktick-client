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
    // The TickTick V2 server returns reminders as { reminder: string, reminders:
    // [{ id, trigger }] }. Setting them via /api/v2/task is silently dropped
    // (200 OK + empty field on readback) — see fork issues #2 and #3.
    // These tests pin the *readback* type so callers can iterate reminders set
    // through the official TickTick clients.
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
