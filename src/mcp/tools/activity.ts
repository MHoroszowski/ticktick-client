import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TickTickClient } from '../../client.js';
import { mapError, jsonResult, stripUndefined } from '../error-handler.js';

const PREMIUM_NOTE =
  'Premium-only — non-Premium accounts get a 4xx error. Paginate by passing the last event\'s id as lastId and the running count as skip; an empty array means the feed is exhausted.';

export function registerActivityTools(server: McpServer, client: TickTickClient): void {
  server.tool(
    'list_task_activity',
    `Read the change history for a single task — who changed what and when. ${PREMIUM_NOTE}`,
    {
      taskId: z.string().describe('Task ID to read history for.'),
      skip: z.number().optional().describe('Number of events already seen. Omit for the first page.'),
      lastId: z.string().optional().describe('id of the last event from the previous page.'),
    },
    async ({ taskId, ...pagination }) => {
      try {
        return jsonResult(
          await client.activity.listForTask(taskId, stripUndefined(pagination)),
        );
      } catch (error) {
        return mapError(error);
      }
    },
  );

  server.tool(
    'list_project_activity',
    `Read the change history for a project — every task event within it, newest first. ${PREMIUM_NOTE}`,
    {
      projectId: z.string().describe('Project ID to read history for.'),
      skip: z.number().optional().describe('Number of events already seen. Omit for the first page.'),
      lastId: z.string().optional().describe('id of the last event from the previous page.'),
    },
    async ({ projectId, ...pagination }) => {
      try {
        return jsonResult(
          await client.activity.listForProject(projectId, stripUndefined(pagination)),
        );
      } catch (error) {
        return mapError(error);
      }
    },
  );
}
