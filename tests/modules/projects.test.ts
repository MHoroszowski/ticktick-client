import { describe, it, expect } from 'vitest';
import { createClient } from '../helpers.js';
import type { TickTickProject } from '../../src/types.js';

const mockProject: TickTickProject = {
  id: 'proj123',
  name: 'Test Project',
  color: '#ff0000',
  kind: 'TASK',
};

describe('ProjectsModule', () => {
  describe('list()', () => {
    it('should GET /api/v2/projects', async () => {
      const { client, mockFetch } = createClient([{ status: 200, body: [mockProject] }]);
      await client.projects.list();
      expect(mockFetch.calls[0]![0]).toContain('/api/v2/projects');
      expect(mockFetch.calls[0]![1]?.method).toBe('GET');
    });

    it('should return list of projects', async () => {
      const { client } = createClient([{ status: 200, body: [mockProject] }]);
      const projects = await client.projects.list();
      expect(projects).toHaveLength(1);
      expect(projects[0]?.name).toBe('Test Project');
    });

    it('should return empty array when no projects', async () => {
      const { client } = createClient([{ status: 200, body: [] }]);
      expect(await client.projects.list()).toEqual([]);
    });
  });

  describe('create() — groupId nesting', () => {
    it('passes groupId through to the wire when nesting at creation', async () => {
      const { client, mockFetch } = createClient([
        { status: 200, body: { id2etag: {}, id2error: {} } },
      ]);
      await client.projects.create({ name: 'Nested', groupId: 'group-abc' });

      const body = JSON.parse(mockFetch.calls[0]![1]!.body as string) as {
        add: Array<Record<string, unknown>>;
      };
      expect(body.add[0]!.groupId).toBe('group-abc');
      expect(body.add[0]!.name).toBe('Nested');
    });

    it('translates groupId: null to "NONE" on the wire (V2 unparent sentinel)', async () => {
      const { client, mockFetch } = createClient([
        { status: 200, body: { id2etag: {}, id2error: {} } },
      ]);
      await client.projects.create({ name: 'Top-level', groupId: null });

      const body = JSON.parse(mockFetch.calls[0]![1]!.body as string) as {
        add: Array<Record<string, unknown>>;
      };
      expect(body.add[0]!.groupId).toBe('NONE');
    });
  });

  describe('update() — groupId nesting', () => {
    it('sends groupId when moving a project into a folder', async () => {
      const { client, mockFetch } = createClient([
        { status: 200, body: { id2etag: {}, id2error: {} } },
      ]);
      await client.projects.update({ id: 'proj123', groupId: 'group-abc' });

      const body = JSON.parse(mockFetch.calls[0]![1]!.body as string) as {
        update: Array<Record<string, unknown>>;
      };
      expect(body.update[0]!).toEqual({ id: 'proj123', groupId: 'group-abc' });
    });

    it('translates groupId: null to "NONE" on the wire to unparent', async () => {
      const { client, mockFetch } = createClient([
        { status: 200, body: { id2etag: {}, id2error: {} } },
      ]);
      await client.projects.update({ id: 'proj123', groupId: null });

      const body = JSON.parse(mockFetch.calls[0]![1]!.body as string) as {
        update: Array<Record<string, unknown>>;
      };
      expect(body.update[0]!).toEqual({ id: 'proj123', groupId: 'NONE' });
    });

    it('omits groupId from the wire when caller does not supply it (partial-update preserved)', async () => {
      const { client, mockFetch } = createClient([
        { status: 200, body: { id2etag: {}, id2error: {} } },
      ]);
      await client.projects.update({ id: 'proj123', name: 'Renamed only' });

      const body = JSON.parse(mockFetch.calls[0]![1]!.body as string) as {
        update: Array<Record<string, unknown>>;
      };
      expect(body.update[0]!).toEqual({ id: 'proj123', name: 'Renamed only' });
      expect(body.update[0]!).not.toHaveProperty('groupId');
    });
  });
});
