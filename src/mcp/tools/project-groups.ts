import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TickTickClient } from '../../client.js';
import { mapError, jsonResult, stripUndefined } from '../error-handler.js';

export function registerProjectGroupTools(server: McpServer, client: TickTickClient): void {
  server.tool(
    'list_project_groups',
    'List all project groups — the folders that hold projects (the TickTick UI calls them "folders"). Returns id, name, and sortOrder. May include soft-deleted folders, which carry deleted=1.',
    {},
    async () => {
      try {
        return jsonResult(await client.projectGroups.list());
      } catch (error) {
        return mapError(error);
      }
    },
  );

  server.tool(
    'create_project_group',
    'Create a project group (folder). Folders are one level deep — a folder cannot contain another folder. To put a project inside it, call update_project with the returned id as groupId.',
    {
      name: z.string().describe('Folder name.'),
      sortOrder: z.number().optional().describe('Sort position among folders. Defaults to 0.'),
    },
    async (args) => {
      try {
        return jsonResult(await client.projectGroups.create(stripUndefined(args)));
      } catch (error) {
        return mapError(error);
      }
    },
  );

  server.tool(
    'update_project_group',
    'Rename or reorder a project group. Only include the fields you want to change — omitted fields keep their current value.',
    {
      id: z.string().describe('Folder ID to update.'),
      name: z.string().optional().describe('Updated folder name. Omit to keep the current name.'),
      sortOrder: z.number().optional().describe('Updated sort position.'),
    },
    async (args) => {
      try {
        await client.projectGroups.update(stripUndefined(args));
        return jsonResult({ success: true, projectGroupId: args.id });
      } catch (error) {
        return mapError(error);
      }
    },
  );

  server.tool(
    'delete_project_group',
    'Delete a project group (folder). Projects inside the folder are NOT deleted — they keep a reference to the removed folder and the UI treats them as unfiled. Reassign them first with update_project if you want clean state.',
    {
      projectGroupId: z.string().describe('Folder ID to delete.'),
    },
    async ({ projectGroupId }) => {
      try {
        await client.projectGroups.delete(projectGroupId);
        return jsonResult({ success: true, projectGroupId });
      } catch (error) {
        return mapError(error);
      }
    },
  );

  server.tool(
    'delete_project_groups',
    'Delete several project groups (folders) in one call. Same non-cascading behavior as delete_project_group.',
    {
      projectGroupIds: z.array(z.string()).describe('Folder IDs to delete.'),
    },
    async ({ projectGroupIds }) => {
      try {
        await client.projectGroups.deleteMany(projectGroupIds);
        return jsonResult({ success: true, projectGroupIds });
      } catch (error) {
        return mapError(error);
      }
    },
  );
}
