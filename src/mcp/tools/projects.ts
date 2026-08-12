import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TickTickClient } from '../../client.js';
import { mapError, jsonResult, stripUndefined } from '../error-handler.js';

export function registerProjectTools(server: McpServer, client: TickTickClient): void {
  server.tool(
    'list_projects',
    'List all projects. Returns project id, name, color, kind, viewMode, and closed status.',
    {},
    async () => {
      try {
        return jsonResult(await client.projects.list());
      } catch (error) {
        return mapError(error);
      }
    },
  );

  server.tool(
    'create_project',
    'Create a new project (list).',
    {
      name: z.string().describe('Project name.'),
      color: z.string().optional().describe('Project color (hex, e.g. "#F18181").'),
      kind: z.enum(['TASK', 'NOTE']).optional().describe('Project kind: TASK or NOTE.'),
      viewMode: z.enum(['list', 'kanban', 'timeline']).optional().describe('View mode for the project. Use "kanban" if you intend to add columns.'),
      groupId: z.string().optional().describe('Folder to file this project under — see list_project_groups. Omit to leave it unfiled.'),
    },
    async (args) => {
      try {
        return jsonResult(await client.projects.create(stripUndefined(args)));
      } catch (error) {
        return mapError(error);
      }
    },
  );

  server.tool(
    'update_project',
    'Update an existing project. Only include the fields you want to change — omitted fields keep their current value.',
    {
      id: z.string().describe('Project ID to update.'),
      name: z.string().optional().describe('Updated project name. Omit to keep the current name.'),
      color: z.string().optional().describe('Project color (hex).'),
      kind: z.enum(['TASK', 'NOTE']).optional().describe('Project kind.'),
      viewMode: z.enum(['list', 'kanban', 'timeline']).optional().describe('View mode.'),
      groupId: z.string().nullable().optional()
        .describe('Folder to file this project under — see list_project_groups. Pass null to unfile it. Omit to leave it where it is.'),
    },
    async (args) => {
      try {
        await client.projects.update(stripUndefined(args));
        return jsonResult({ success: true, projectId: args.id });
      } catch (error) {
        return mapError(error);
      }
    },
  );

  server.tool(
    'delete_project',
    'Delete a project and all its tasks.',
    {
      projectId: z.string().describe('Project ID to delete.'),
    },
    async ({ projectId }) => {
      try {
        await client.projects.delete(projectId);
        return jsonResult({ success: true, projectId });
      } catch (error) {
        return mapError(error);
      }
    },
  );

  server.tool(
    'list_columns',
    'List kanban columns for a project. Use the returned column IDs when creating or updating tasks with a columnId.',
    {
      projectId: z.string().optional().describe('Project ID. Omit to list columns across all projects.'),
    },
    async ({ projectId }) => {
      try {
        return jsonResult(await client.projects.listColumns(projectId));
      } catch (error) {
        return mapError(error);
      }
    },
  );

  server.tool(
    'list_project_members',
    'List members of a shared project. Returns userId, displayName, permission, and isOwner. Only works for shared projects — personal projects return an empty array.',
    {
      projectId: z.string().describe('Project ID to list members for.'),
    },
    async ({ projectId }) => {
      try {
        return jsonResult(await client.projects.listMembers(projectId));
      } catch (error) {
        return mapError(error);
      }
    },
  );

  server.tool(
    'create_column',
    'Create a kanban column on a project. The project must be in kanban view — create it with viewMode "kanban", or switch it with update_project first. A column added to a list-view project is accepted by the API but never shown in the UI.',
    {
      projectId: z.string().describe('Project the column belongs to.'),
      name: z.string().describe('Column name.'),
      sortOrder: z.number().optional().describe('Sort position among columns. Defaults to 0.'),
    },
    async ({ projectId, ...draft }) => {
      try {
        return jsonResult(await client.projects.createColumn(projectId, stripUndefined(draft)));
      } catch (error) {
        return mapError(error);
      }
    },
  );

  server.tool(
    'update_column',
    'Rename or reorder a kanban column. Only include the fields you want to change. projectId is required even though the column id is unique — the server silently ignores the update without it.',
    {
      id: z.string().describe('Column ID to update.'),
      projectId: z.string().describe('Project the column belongs to. Required.'),
      name: z.string().optional().describe('Updated column name. Omit to keep the current name.'),
      sortOrder: z.number().optional().describe('Updated sort position.'),
    },
    async (args) => {
      try {
        await client.projects.updateColumn(stripUndefined(args));
        return jsonResult({ success: true, columnId: args.id, projectId: args.projectId });
      } catch (error) {
        return mapError(error);
      }
    },
  );

  server.tool(
    'delete_column',
    'Delete a kanban column. Tasks in the column are NOT deleted — they keep a reference to the removed column and the UI shows them as uncategorized. Move them first with update_task if you want clean state.',
    {
      projectId: z.string().describe('Project the column belongs to.'),
      columnId: z.string().describe('Column ID to delete.'),
    },
    async ({ projectId, columnId }) => {
      try {
        await client.projects.deleteColumn(projectId, columnId);
        return jsonResult({ success: true, columnId, projectId });
      } catch (error) {
        return mapError(error);
      }
    },
  );
}
