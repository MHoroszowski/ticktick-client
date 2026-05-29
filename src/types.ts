// ───────── Session ─────────

export type TickTickSession = {
  readonly username: string;
  readonly token: string;
  readonly csrfToken?: string;
  readonly cookies: Record<string, string>;
  readonly createdAt: string;
  readonly updatedAt: string;
};

// ───────── Task ─────────

export type TickTickTaskStatus = 0 | -1 | 2; // open=0, abandoned=-1, completed=2
export type TickTickTaskPriority = 0 | 1 | 3 | 5; // none=0, low=1, medium=3, high=5

export type TickTickTaskItem = {
  readonly id: string;
  readonly title: string;
  readonly status: 0 | 2;
  readonly completedTime?: string | null;
  readonly sortOrder?: number;
};

export type TickTickTask = {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly status: TickTickTaskStatus;
  readonly priority?: TickTickTaskPriority;
  readonly startDate?: string | null;
  readonly dueDate?: string | null;
  readonly completedTime?: string | null;
  readonly isAllDay?: boolean | null;
  readonly timeZone?: string;
  readonly content?: string | null;
  readonly tags?: readonly string[];
  readonly items?: readonly TickTickTaskItem[];
  readonly repeatFlag?: string | null;
  readonly columnId?: string | null;
  readonly sortOrder?: number;
  readonly pinnedTime?: string | null;
  /**
   * Assigned user (shared projects only). Numeric TickTick userId.
   * Absent on unshared projects and on unassigned tasks.
   */
  readonly assignee?: number | null;
  /** User who originally created the task. Numeric TickTick userId. */
  readonly creator?: number | null;
  /**
   * The "primary" reminder on the task as an RFC 5545 TRIGGER string
   * (e.g. `"TRIGGER:PT0S"`, `"TRIGGER:-PT15M"`). The TickTick V2 server
   * surfaces this alongside the full {@link TickTickTask.reminders} array;
   * empty string when no reminder is set. Decode with `parseReminderTrigger`.
   *
   * Read-only on `TickTickTask` — the field is populated by the server
   * from {@link TickTickTask.reminders} on readback. To set reminders
   * use {@link TickTickTaskDraft.reminder} on create, or
   * `tasks.setReminders(projectId, taskId, reminders)` on an existing
   * task.
   */
  readonly reminder?: string;
  /**
   * All reminders on the task. Each entry carries a server-stable `id`
   * and an RFC 5545 TRIGGER string. Examples:
   *
   * ```ts
   * [
   *   { id: "699bce82e812d5a47082eb3e", trigger: "TRIGGER:PT0S" },
   *   { id: "699bce82e812d5a47082eb3f", trigger: "TRIGGER:-PT15M" },
   * ]
   * ```
   *
   * Decode each trigger string with `parseReminderTrigger`; compose new
   * triggers with `formatReminderTrigger`.
   *
   * To set reminders use `tasks.setReminders(projectId, taskId, [...])`
   * or pass `reminders` / `reminder` on `TickTickTaskDraft` /
   * `TickTickTaskUpdate`. Writes go through the V2 batch sync endpoint
   * (`POST /api/v2/batch/task`) with read-modify-merge-write — the
   * partial-update endpoint silently drops the field.
   */
  readonly reminders?: readonly TickTickReminder[];
};

/**
 * A single reminder on a {@link TickTickTask}, as it appears on the V2
 * wire. The `id` is server-stable across edits; the `trigger` is an
 * RFC 5545 TRIGGER string (e.g. `"TRIGGER:PT0S"`, `"TRIGGER:-PT15M"`).
 *
 * Read-only via this SDK pending HAR capture of the V2 write-path — see
 * {@link TickTickTask.reminders} for the full status note.
 */
export type TickTickReminder = {
  readonly id: string;
  readonly trigger: string;
};

export type TickTickTaskDraft = {
  readonly title: string;
  readonly projectId?: string;
  readonly priority?: TickTickTaskPriority;
  readonly startDate?: string | null;
  readonly dueDate?: string | null;
  readonly isAllDay?: boolean;
  readonly content?: string;
  readonly tags?: readonly string[];
  readonly repeatFlag?: string | null;
  readonly repeatEndDate?: string | null;
  /**
   * Project section / kanban column to place the task in. Exists on
   * `TickTickTask` but was missing from the Draft surface — this adds
   * it so `tasks.create({..., columnId})` lands the task in a specific
   * section. Obtain valid values via `projects.listColumns(projectId)`.
   */
  readonly columnId?: string | null;
  /**
   * Assign the task to a specific shared-project member by numeric userId.
   * Obtain valid userIds via `projects.listMembers(projectId)`. Pass null
   * to explicitly leave unassigned.
   */
  readonly assignee?: number | null;
  /**
   * Single time-based reminder as an RFC 5545 TRIGGER string
   * (e.g. `"TRIGGER:-PT15M"` for 15 minutes before due). Ergonomic
   * sugar for `reminders: [reminder]`. The library generates the
   * server-stable `id` internally.
   *
   * **`reminders` wins on conflict.** If both are set, `reminders` is
   * used and `reminder` is silently dropped.
   *
   * Compose triggers with `formatReminderTrigger`, e.g.
   * `formatReminderTrigger({ before: '15m' })`. Pass `null` to clear
   * all reminders on the task.
   *
   * Writes route through `POST /api/v2/batch/task` (the V2 batch sync
   * endpoint the official TickTick clients use); the partial-update
   * endpoint silently drops reminder fields. See
   * `Plans/reminders-har-capture-raw.json` for the wire shape.
   */
  readonly reminder?: string | null;
  /**
   * Multiple reminders on a task. Accepts either RFC 5545 TRIGGER
   * strings (the library generates the server-stable `id` per entry) or
   * full `{id, trigger}` objects (use this to preserve existing ids on
   * round-trips — e.g. when echoing back what `tasks.list()` returned).
   *
   * Partial-update semantics: omit to preserve the current reminders,
   * pass an array (incl. `[]`) to set, pass `null` to clear all.
   * Premium TickTick supports multiple reminders per task; the server
   * may return 402/403 for non-Premium accounts that attempt > 1 —
   * the library surfaces that error.
   *
   * Writes use the V2 batch sync endpoint (`POST /api/v2/batch/task`)
   * with read-modify-merge-write semantics; the library fetches the
   * task fresh before writing to obtain the current etag (optimistic
   * concurrency). For explicit set-only-reminders use
   * `tasks.setReminders(projectId, taskId, reminders)`.
   */
  readonly reminders?: readonly (string | TickTickReminder)[] | null;
};

export type TickTickTaskMove = {
  readonly taskId: string;
  readonly fromProjectId: string;
  readonly toProjectId: string;
};

/**
 * Result of a task move operation.
 *
 * **Important:** The TickTick REST API does not support in-place project moves.
 * Moves are implemented as copy-to-destination + delete-from-source, which means
 * the task receives a new server-assigned ID. Use `previousId` to update any
 * references to the old task.
 *
 * Verified 2026-04-07:
 * - `POST /api/v3/batch/taskProject` → 404 (does not exist)
 * - `POST /api/v2/task/{id}` with new projectId → 200 but projectId unchanged
 * - Web app uses WebSocket for native moves (not available via REST)
 */
export type TickTickMoveResult = {
  readonly task: TickTickTask;
  readonly previousId: string;
};

export type TickTickTrashOptions = {
  readonly projectId: string;
  readonly limit?: number;
};

export type TickTickCompletedTaskOptions = {
  readonly status?: 'Completed' | 'Abandoned';
  readonly projectId?: string;
};

/**
 * Partial-update payload for {@link TasksModule.update}.
 *
 * **Only `id` and `projectId` are required.** Every other field is
 * optional. The implementation distinguishes three caller intents and
 * maps them to wire behavior:
 *
 * | Caller intent | How to express it | Wire effect |
 * |---|---|---|
 * | "Leave this field alone" | Omit the key, or pass `undefined` | Field is NOT sent → server preserves current value |
 * | "Set this field to X" | Pass the value (incl. `0`, `""`, `false`) | Field is sent with the new value |
 * | "Clear this field" | Pass explicit `null` | Field is sent as `null` → TickTick clears it |
 *
 * @remarks
 * Callers that build update payloads from generic kwargs (MCP servers,
 * dynamic dispatchers) MUST distinguish "user didn't mention this field"
 * from "user wants this field cleared" before calling. The most common
 * pattern is a sentinel for unset:
 *
 * ```ts
 * const UNSET = Symbol('UNSET');
 * function callerSide(args: { dueDate?: string | null | typeof UNSET }) {
 *   const payload: Record<string, unknown> = { id, projectId };
 *   if (args.dueDate !== UNSET) payload.dueDate = args.dueDate; // null OR string
 *   return tasks.update(payload as TickTickTaskUpdate);
 * }
 * ```
 *
 * In Python (e.g. an MCP server): default the kwarg to a custom sentinel,
 * and only forward the field to this library when it's not the sentinel.
 * Bare `None` defaults will reach this library as `null` and WILL clear
 * the field — that is intentional given the contract above.
 */
export type TickTickTaskUpdate = Partial<TickTickTaskDraft> & {
  readonly id: string;
  readonly projectId: string;
};

// ───────── Project ─────────

export type TickTickProject = {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  readonly kind?: string;
  readonly viewMode?: string;
  readonly permission?: string;
  readonly closed?: boolean | null;
  readonly sortOrder?: number;
  /**
   * Folder (projectGroup) the project lives under. `null` (or absent) means
   * top-level. Folders are one level only — folders cannot contain folders.
   * Manage folders via {@link TickTickClient.projectGroups}.
   */
  readonly groupId?: string | null;
};

export type TickTickProjectDraft = {
  readonly name: string;
  readonly color?: string;
  readonly kind?: 'TASK' | 'NOTE';
  readonly viewMode?: 'list' | 'kanban' | 'timeline';
  /**
   * Nest the new project inside a folder. Pass the folder id from
   * {@link ProjectGroupsModule.create} or `.list()`. Pass `null` (on
   * `projects.update`) to unparent — the library translates `null` to the
   * server's `"NONE"` sentinel internally. Folders are one level only.
   */
  readonly groupId?: string | null;
};

/**
 * A folder / projectGroup — a one-level container for projects.
 *
 * TickTick calls these "projectGroups" on the wire and "folders" in the UI.
 * This library uses the server name everywhere.
 *
 * **One level only.** Folders cannot contain other folders. A project can
 * live in at most one folder, set via {@link TickTickProject.groupId}.
 *
 * Verified 2026-05-27 via live probe against `doma.spirita@gmail.com`:
 * see `Plans/nested-projects-probe.md` for the full wire shape capture.
 */
export type TickTickProjectGroup = {
  readonly id: string;
  readonly name: string;
  readonly sortOrder?: number;
  /** Server-assigned change marker; updates on every edit. */
  readonly etag?: string;
  /** `0` = active, `1` = deleted. */
  readonly deleted?: number;
  /** Owner's numeric TickTick userId. */
  readonly userId?: number;
  /** Whether the folder shows all child projects expanded by default. */
  readonly showAll?: boolean;
  /** UI sort criterion the folder applies to its children (`project`, etc.). */
  readonly sortType?: string;
  readonly sortOption?: string | null;
  readonly viewMode?: string | null;
  readonly teamId?: string | null;
};

export type TickTickProjectGroupDraft = {
  readonly name: string;
  readonly sortOrder?: number;
  /** Defaults to `"group"` — the only value observed in live probes. */
  readonly listType?: string;
};

export type TickTickProjectGroupUpdate = Partial<TickTickProjectGroupDraft> & {
  readonly id: string;
};

export type TickTickColumn = {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly sortOrder?: number;
  readonly createdTime?: string;
  readonly modifiedTime?: string;
  /** Server-assigned change marker; rotates on every edit. */
  readonly etag?: string;
};

/**
 * Payload for {@link ProjectsModule.createColumn}.
 *
 * `projectId` is passed positionally to the method (not in the draft) for
 * symmetry with {@link TickTickProjectDraft.kind} style. A `sortOrder` of
 * `0` slots the new column at the front of the list.
 */
export type TickTickColumnDraft = {
  readonly name: string;
  readonly sortOrder?: number;
};

/**
 * Partial-update payload for {@link ProjectsModule.updateColumn}.
 *
 * **`projectId` is required on every update** — TickTick's `POST /api/v2/column`
 * endpoint silently no-ops (returns 200 with empty `id2etag`) if the update
 * item omits `projectId`. This is a server-side requirement, not a library
 * choice. Verified empirically 2026-05-27 — see
 * `Plans/kanban-columns-probe.md` for the wire capture.
 *
 * Beyond `id` + `projectId`, the partial-update contract applies: omit a
 * field to preserve, pass a value to set.
 */
export type TickTickColumnUpdate = Partial<TickTickColumnDraft> & {
  readonly id: string;
  readonly projectId: string;
};

/**
 * A member of a shared project. Returned by
 * `projects.listMembers(projectId)`, which hits `/api/v2/project/{id}/users`.
 *
 * **Shared-only:** Personal (unshared) projects return an empty array from
 * this endpoint. Members only appear once a project has been explicitly
 * shared with another TickTick account.
 *
 * Verified 2026-04-12 via live traffic probe.
 */
export type TickTickProjectMember = {
  /** Numeric TickTick userId — use for `TickTickTaskDraft.assignee`. */
  readonly userId: number;
  readonly displayName?: string | null;
  readonly username?: string | null;
  readonly avatarUrl?: string | null;
  /** True for the project owner; false for invited members. */
  readonly isOwner?: boolean;
  /** Permission level: "read" | "write" | "comment" (string because the enum is open). */
  readonly permission?: string;
  /**
   * Accept status. `1` = accepted, `0` = pending invite.
   * Also surfaced more plainly via the normalized adapter layer;
   * this is the raw value the API returns.
   */
  readonly acceptStatus?: number;
  readonly createdTime?: string;
  readonly userCode?: string;
};

// ───────── Activity ─────────

/**
 * Originating client of an activity event. Common values observed
 * empirically: `"web"`, `"ios"`, `"android"`, `"api"`. Typed as the
 * open string the server actually returns rather than a closed union.
 */
export type TickTickActivityDeviceChannel = string;

/**
 * Activity event action discriminator.
 *
 * Naming pattern: `<RESOURCE>_<VERB>` — `T_*` for task-scoped events,
 * `P_*` for project-scoped events. Empirically observed on 2026-05-28
 * against the test account: `T_CREATE`, `T_TITLE`, `T_CONTENT`,
 * `T_DONE`, `T_CANCEL`, `P_CREATE`, `P_TITLE`, `P_ADD_COLUMN`,
 * `P_COLUMN_TITLE`, `P_DEL_COLUMN`. Many more action types almost
 * certainly exist (priority, due-date, assignee on shared projects,
 * task moves, attachments, etc.).
 *
 * Typed as `string` rather than a closed union so callers see the
 * actual server values; pattern-match on the prefix for stable
 * categorisation.
 */
export type TickTickActivityAction = string;

/**
 * Identity of the actor that performed an activity event.
 *
 * On personal projects the only observable field is `isMyself: true`.
 * On shared projects this likely carries `userId`, `displayName`,
 * `avatarUrl`, etc. for actions by other users — typed as optional
 * pending an empirical capture.
 */
export type TickTickActivityActor = {
  readonly isMyself?: boolean;
  readonly userId?: number;
  readonly displayName?: string | null;
  readonly avatarUrl?: string | null;
};

/**
 * A single activity event from the TickTick history feed.
 *
 * Returned by `client.activity.listForTask(taskId)` and
 * `client.activity.listForProject(projectId)`. The shape was captured
 * empirically from the TickTick Premium web UI on 2026-05-28; see
 * `Plans/activity-probe.md` for the wire-shape table.
 *
 * **Premium-only.** TickTick gates the activity-feed feature behind a
 * Premium subscription. Non-Premium accounts are expected to receive a
 * 4xx response from the underlying endpoint.
 */
export type TickTickActivityEvent = {
  readonly id: string;
  readonly action: TickTickActivityAction;
  /** ISO timestamp with timezone offset, e.g. `"2026-05-27T21:25:33.360+0000"`. */
  readonly when: string;
  readonly deviceChannel: TickTickActivityDeviceChannel;
  readonly whoProfile: TickTickActivityActor;
  /** Set on events that name a resource (e.g. `P_CREATE`, `P_ADD_COLUMN`). */
  readonly name?: string;
  /** Set on `T_CREATE` events — the task description / surrounding context. */
  readonly description?: string;
  /** Set on `T_CONTENT` events — the new content / notes value. */
  readonly content?: string;
  /** Set on `T_CONTENT` events — usually `"TEXT"`. Other kinds exist for non-text content. */
  readonly kind?: string;
  /** Set on events that affect one or more tasks (e.g. `T_CREATE`, `T_DONE`, `T_CANCEL`). */
  readonly taskIds?: readonly string[];
};

/**
 * Optional pagination params accepted by the activity list endpoints.
 *
 * The TickTick web UI sends both `skip` (offset) and `lastId` (cursor)
 * on every paginated call. Pass both to fetch the next page; the server
 * returns an empty array when the feed is exhausted.
 */
export type TickTickActivityPaginationParams = {
  readonly skip?: number;
  readonly lastId?: string;
};

// ───────── Tag ─────────

export type TickTickTagDraft = {
  readonly name: string;
  readonly label?: string;
  readonly color?: string;
  readonly parent?: string | null;
  readonly sortOrder?: number;
};

export type TickTickTag = {
  readonly name: string;
  readonly label?: string;
  readonly color?: string;
  readonly parent?: string | null;
  readonly sortOrder?: number;
};

// ───────── Habit ─────────

export type TickTickHabit = {
  readonly id: string;
  readonly name: string;
  readonly status: 0 | 1; // normal=0, archived=1
  readonly repeatRule: string;
  readonly goal: number;
  readonly step: number;
  readonly unit: string;
  readonly type: string;
  readonly recordEnable: boolean;
  readonly currentStreak?: number;
  readonly totalCheckIns?: number;
  readonly sectionId?: string;
};

export type TickTickHabitCheckin = {
  readonly id?: string | null;
  readonly habitId: string;
  readonly checkinStamp: number; // YYYYMMDD format (e.g. 20260407)
  readonly checkinTime?: string | null;
  readonly goal: number;
  readonly value: number;
  readonly status: 0 | 1 | 2; // unlabeled=0, undone=1, done=2
};

// ───────── User ─────────

export type TickTickUserProfile = {
  readonly username?: string;
  readonly email?: string | null;
  readonly name?: string | null;
  readonly displayName?: string | null;
  readonly userId?: string;
  readonly phone?: string | null;
  readonly picture?: string;
  readonly locale?: string;
};

export type TickTickUserStatus = {
  readonly userId: string;
  readonly username: string;
  readonly pro: boolean;
  readonly teamPro: boolean;
  readonly proStartDate?: string;
  readonly proEndDate?: string;
  readonly inboxId: string;
  readonly freeTrial: boolean;
  readonly subscribeType?: string;
};

export type TickTickHabitDraft = {
  readonly name: string;
  readonly repeatRule: string;
  readonly goal: number;
  readonly step: number;
  readonly unit: string;
  readonly type: string;
  readonly recordEnable: boolean;
  readonly color?: string;
  readonly iconRes?: string;
  readonly sectionId?: string;
};

export type TickTickCheckinInput = {
  readonly habitId: string;
  readonly date: Date | number | string;
  readonly value?: number;
  readonly status?: 'done' | 'undone' | 'unlabeled';
  readonly goal: number;
};

export type TickTickHabitWeekStats = Record<string, {
  readonly totalHabitCount: number;
  readonly completedHabitCount: number;
}>;

// ───────── Focus ─────────

export type FocusStartOptions = {
  readonly duration?: number;
  readonly focusOnId?: string;
  readonly focusOnTitle?: string | null;
  readonly note?: string;
  readonly manual?: boolean;
};

export type FocusState = {
  readonly lastPoint: number;
  readonly focusId: string | null;
  readonly status: 'idle' | 'running' | 'paused' | null;
  readonly duration: number;
  readonly pomoCount: number;
  readonly focusOnId: string | null;
  readonly focusOnTitle: string | null;
};

// ───────── Statistics ─────────

export type TickTickRanking = {
  readonly ranking: number;
  readonly taskCount: number;
  readonly projectCount: number;
  readonly dayCount: number;
  readonly completedCount: number;
  readonly score: number;
  readonly level: number;
};


export type TickTickCountdownType = 'countdown' | 'anniversary' | 'birthday' | 'holiday';

export type TickTickCountdownDraft = {
  readonly name: string;
  readonly date: Date | number | string;
  readonly type?: TickTickCountdownType;
  readonly color?: string;
  readonly ignoreYear?: boolean;
  readonly remark?: string;
};

export type TickTickCountdown = {
  readonly id: string;
  readonly name: string;
  readonly date: number; // YYYYMMDD integer (e.g. 20261231)
  readonly type?: TickTickCountdownType;
  readonly color?: string;
  readonly ignoreYear?: boolean;
  readonly remark?: string;
};

// ───────── Reminder TRIGGER (RFC 5545 §3.8.6.3) ─────────

/**
 * Duration components for a reminder offset, decomposed into discrete
 * units. All fields are optional; an empty object represents zero
 * duration. The semantic helpers `parseReminderTrigger` /
 * `formatReminderTrigger` use this shape on the structured side of the
 * conversion to/from RFC 5545 TRIGGER strings.
 *
 * Spec note: RFC 5545 duration grammar is `P[nW][nD]T[nH][nM][nS]`. Weeks
 * (`W`) and the calendar-day/time split (`D`/`T...`) are mutually
 * exclusive in strict iCal, but TickTick's server accepts the mixed forms
 * its own UI produces — the library normalizes via the `weeks`-vs-rest
 * precedence convention documented on `formatReminderTrigger`.
 */
export type ReminderDuration = {
  readonly weeks?: number;
  readonly days?: number;
  readonly hours?: number;
  readonly minutes?: number;
  readonly seconds?: number;
};

/**
 * Structured representation of an RFC 5545 TRIGGER string, returned by
 * `parseReminderTrigger`. Discriminated union over the three semantic
 * cases TickTick supports:
 *
 * - `{ at: 'due' }` — reminder fires at the task's due time (`TRIGGER:PT0S`)
 * - `{ before: ReminderDuration }` — fires *before* due (negative trigger,
 *   e.g. `TRIGGER:-PT15M` → `{ before: { minutes: 15 } }`)
 * - `{ after: ReminderDuration }` — fires *after* due (positive trigger,
 *   e.g. `TRIGGER:PT30M` → `{ after: { minutes: 30 } }`)
 *
 * Zero-valued fields are dropped on parse — `TRIGGER:-P0DT9H0M0S` decodes
 * to `{ before: { hours: 9 } }`, not the noisier full-field form.
 */
export type ReminderTrigger =
  | { readonly at: 'due' }
  | { readonly before: ReminderDuration }
  | { readonly after: ReminderDuration };

/**
 * Input shape for `formatReminderTrigger`. Mirrors {@link ReminderTrigger}
 * but accepts a string shorthand on `before`/`after` for ergonomics:
 *
 * - `'15m'` → `{ minutes: 15 }`
 * - `'1d 9h'` → `{ days: 1, hours: 9 }`
 * - `'1h 30m'` → `{ hours: 1, minutes: 30 }`
 * - `'2w'` → `{ weeks: 2 }`
 *
 * Shorthand grammar: space-separated `<n><unit>` tokens, where unit is one
 * of `w`/`d`/`h`/`m`/`s`. Whitespace between tokens is optional
 * (`'1d9h'` is also accepted). Returns `undefined` from
 * `formatReminderTrigger` if the shorthand cannot be parsed.
 */
export type ReminderTriggerInput =
  | { readonly at: 'due' }
  | { readonly before: ReminderDuration | string }
  | { readonly after: ReminderDuration | string };

