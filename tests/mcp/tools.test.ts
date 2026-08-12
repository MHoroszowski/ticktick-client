import { describe, it, expect } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from '../../src/mcp/tools/index.js';
import type { TickTickClient } from '../../src/client.js';

type Registered = { name: string; description: string; schema: Record<string, unknown> };

/**
 * Collect what `registerAllTools` registers. Registration never touches the
 * client — handlers are only invoked on a tool call — so a bare stub is
 * enough to exercise the whole registry.
 */
function collectTools(): Registered[] {
  const tools: Registered[] = [];
  const server = {
    tool(name: string, description: string, schema: Record<string, unknown>) {
      tools.push({ name, description, schema });
    },
  } as unknown as McpServer;

  registerAllTools(server, {} as TickTickClient);
  return tools;
}

/**
 * The full expected roster. This list is deliberately exhaustive: adding a
 * client method without an MCP tool is the exact drift that left activity,
 * project groups, kanban columns, and reminders unexposed after the upstream
 * merge. Update this list intentionally, not reflexively.
 */
const EXPECTED = [
  'checkin_habit', 'complete_task', 'create_column', 'create_countdown',
  'create_habit', 'create_project', 'create_project_group', 'create_subtask',
  'create_tag', 'create_task', 'delete_column', 'delete_countdown',
  'delete_habit', 'delete_project', 'delete_project_group',
  'delete_project_groups', 'delete_tag', 'delete_task', 'finish_focus',
  'get_focus_overview', 'get_habit_week_stats', 'get_ranking',
  'get_user_profile', 'get_user_status', 'list_columns',
  'list_completed_in_range', 'list_completed_tasks', 'list_countdowns',
  'list_habits', 'list_project_activity', 'list_project_groups',
  'list_project_members', 'list_projects', 'list_tags', 'list_task_activity',
  'list_tasks', 'merge_tags', 'move_task', 'pause_focus', 'pin_task',
  'resume_focus', 'set_task_reminders', 'start_focus', 'stop_focus',
  'unpin_task', 'update_column', 'update_countdown', 'update_habit',
  'update_project', 'update_project_group', 'update_tag', 'update_task',
];

describe('registerAllTools', () => {
  it('registers exactly the expected tool roster', () => {
    const names = collectTools().map((t) => t.name).sort();
    expect(names).toEqual(EXPECTED);
  });

  it('registers every tool name exactly once', () => {
    const names = collectTools().map((t) => t.name);
    expect(names.length).toBe(new Set(names).size);
  });

  it('gives every tool a non-empty description', () => {
    for (const tool of collectTools()) {
      expect(tool.description, tool.name).toBeTruthy();
    }
  });
});

describe('partial-update contract exposure', () => {
  const schemaOf = (name: string) => {
    const tool = collectTools().find((t) => t.name === name);
    if (!tool) throw new Error(`no such tool: ${name}`);
    return tool.schema;
  };

  /** Every field on an update tool except its identifiers must be omittable. */
  const IDENTIFIERS: Record<string, readonly string[]> = {
    update_task: ['id', 'projectId'],
    update_project: ['id'],
    update_project_group: ['id'],
    update_column: ['id', 'projectId'],
    update_habit: ['id'],
    update_countdown: ['id'],
    // tags are identified by name, not by an id
    update_tag: ['name'],
  };

  for (const [tool, identifiers] of Object.entries(IDENTIFIERS)) {
    it(`${tool} makes every non-identifier field optional`, () => {
      for (const [field, schema] of Object.entries(schemaOf(tool))) {
        if (identifiers.includes(field)) continue;
        expect(
          (schema as { isOptional(): boolean }).isOptional(),
          `${tool}.${field} should be optional so omitting it preserves the current value`,
        ).toBe(true);
      }
    });
  }

  /**
   * Fields the client types declare as `T | null` must accept null through
   * MCP, otherwise "clear this field" is unreachable for an agent.
   */
  const NULLABLE: Record<string, readonly string[]> = {
    update_task: ['startDate', 'dueDate', 'repeatFlag', 'repeatEndDate', 'columnId', 'assignee', 'reminders'],
    update_project: ['groupId'],
    update_tag: ['parent'],
  };

  for (const [tool, fields] of Object.entries(NULLABLE)) {
    it(`${tool} accepts null on its clearable fields`, () => {
      const schema = schemaOf(tool);
      for (const field of fields) {
        const entry = schema[field];
        expect(entry, `${tool}.${field} missing`).toBeDefined();
        expect(
          (entry as { safeParse(v: unknown): { success: boolean } }).safeParse(null).success,
          `${tool}.${field} should accept null so agents can clear it`,
        ).toBe(true);
      }
    });
  }
});
