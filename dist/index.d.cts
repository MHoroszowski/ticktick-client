type TickTickSession = {
    readonly username: string;
    readonly token: string;
    readonly csrfToken?: string;
    readonly cookies: Record<string, string>;
    readonly createdAt: string;
    readonly updatedAt: string;
};
type TickTickTaskStatus = 0 | -1 | 2;
type TickTickTaskPriority = 0 | 1 | 3 | 5;
type TickTickTaskItem = {
    readonly id: string;
    readonly title: string;
    readonly status: 0 | 2;
    readonly completedTime?: string | null;
    readonly sortOrder?: number;
};
type TickTickTask = {
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
type TickTickReminder = {
    readonly id: string;
    readonly trigger: string;
};
type TickTickTaskDraft = {
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
type TickTickTaskMove = {
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
type TickTickMoveResult = {
    readonly task: TickTickTask;
    readonly previousId: string;
};
type TickTickTrashOptions = {
    readonly projectId: string;
    readonly limit?: number;
};
type TickTickCompletedTaskOptions = {
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
type TickTickTaskUpdate = Partial<TickTickTaskDraft> & {
    readonly id: string;
    readonly projectId: string;
};
type TickTickProject = {
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
type TickTickProjectDraft = {
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
type TickTickProjectGroup = {
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
type TickTickProjectGroupDraft = {
    readonly name: string;
    readonly sortOrder?: number;
    /** Defaults to `"group"` — the only value observed in live probes. */
    readonly listType?: string;
};
type TickTickProjectGroupUpdate = Partial<TickTickProjectGroupDraft> & {
    readonly id: string;
};
type TickTickColumn = {
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
type TickTickColumnDraft = {
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
type TickTickColumnUpdate = Partial<TickTickColumnDraft> & {
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
type TickTickProjectMember = {
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
/**
 * Originating client of an activity event. Common values observed
 * empirically: `"web"`, `"ios"`, `"android"`, `"api"`. Typed as the
 * open string the server actually returns rather than a closed union.
 */
type TickTickActivityDeviceChannel = string;
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
type TickTickActivityAction = string;
/**
 * Identity of the actor that performed an activity event.
 *
 * On personal projects the only observable field is `isMyself: true`.
 * On shared projects this likely carries `userId`, `displayName`,
 * `avatarUrl`, etc. for actions by other users — typed as optional
 * pending an empirical capture.
 */
type TickTickActivityActor = {
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
type TickTickActivityEvent = {
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
type TickTickActivityPaginationParams = {
    readonly skip?: number;
    readonly lastId?: string;
};
type TickTickTagDraft = {
    readonly name: string;
    readonly label?: string;
    readonly color?: string;
    readonly parent?: string | null;
    readonly sortOrder?: number;
};
type TickTickTag = {
    readonly name: string;
    readonly label?: string;
    readonly color?: string;
    readonly parent?: string | null;
    readonly sortOrder?: number;
};
type TickTickHabit = {
    readonly id: string;
    readonly name: string;
    readonly status: 0 | 1;
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
type TickTickHabitCheckin = {
    readonly id?: string | null;
    readonly habitId: string;
    readonly checkinStamp: number;
    readonly checkinTime?: string | null;
    readonly goal: number;
    readonly value: number;
    readonly status: 0 | 1 | 2;
};
type TickTickUserProfile = {
    readonly username?: string;
    readonly email?: string | null;
    readonly name?: string | null;
    readonly displayName?: string | null;
    readonly userId?: string;
    readonly phone?: string | null;
    readonly picture?: string;
    readonly locale?: string;
};
type TickTickUserStatus = {
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
type TickTickHabitDraft = {
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
type TickTickCheckinInput = {
    readonly habitId: string;
    readonly date: Date | number | string;
    readonly value?: number;
    readonly status?: 'done' | 'undone' | 'unlabeled';
    readonly goal: number;
};
type TickTickHabitWeekStats = Record<string, {
    readonly totalHabitCount: number;
    readonly completedHabitCount: number;
}>;
type FocusStartOptions = {
    readonly duration?: number;
    readonly focusOnId?: string;
    readonly focusOnTitle?: string | null;
    readonly note?: string;
    readonly manual?: boolean;
};
type FocusState = {
    readonly lastPoint: number;
    readonly focusId: string | null;
    readonly status: 'idle' | 'running' | 'paused' | null;
    readonly duration: number;
    readonly pomoCount: number;
    readonly focusOnId: string | null;
    readonly focusOnTitle: string | null;
};
type TickTickRanking = {
    readonly ranking: number;
    readonly taskCount: number;
    readonly projectCount: number;
    readonly dayCount: number;
    readonly completedCount: number;
    readonly score: number;
    readonly level: number;
};
type TickTickCountdownType = 'countdown' | 'anniversary' | 'birthday' | 'holiday';
type TickTickCountdownDraft = {
    readonly name: string;
    readonly date: Date | number | string;
    readonly type?: TickTickCountdownType;
    readonly color?: string;
    readonly ignoreYear?: boolean;
    readonly remark?: string;
};
type TickTickCountdown = {
    readonly id: string;
    readonly name: string;
    readonly date: number;
    readonly type?: TickTickCountdownType;
    readonly color?: string;
    readonly ignoreYear?: boolean;
    readonly remark?: string;
};
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
type ReminderDuration = {
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
type ReminderTrigger = {
    readonly at: 'due';
} | {
    readonly before: ReminderDuration;
} | {
    readonly after: ReminderDuration;
};
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
type ReminderTriggerInput = {
    readonly at: 'due';
} | {
    readonly before: ReminderDuration | string;
} | {
    readonly after: ReminderDuration | string;
};

type TickTickSessionStore = {
    load(): Promise<TickTickSession | null>;
    save(session: TickTickSession): Promise<void>;
    delete(): Promise<void>;
};
declare class MemorySessionStore implements TickTickSessionStore {
    #private;
    load(): Promise<TickTickSession | null>;
    save(session: TickTickSession): Promise<void>;
    delete(): Promise<void>;
}
declare class FileSessionStore implements TickTickSessionStore {
    private readonly path;
    constructor(path: string);
    load(): Promise<TickTickSession | null>;
    save(session: TickTickSession): Promise<void>;
    delete(): Promise<void>;
}

declare class TasksModule {
    private readonly client;
    constructor(client: TickTickClient);
    list(): Promise<readonly TickTickTask[]>;
    listCompleted(options?: {
        projectId?: string;
        limit?: number;
    }): Promise<readonly TickTickTask[]>;
    /**
     * Create a task.
     *
     * **Reminder handling:** if the draft includes `reminder` (sugar) or
     * `reminders`, the library executes two HTTP calls under the hood —
     * (a) `POST /api/v2/task` to create the bare task, then (b)
     * {@link setReminders} to attach the reminders via the V2 batch sync
     * endpoint. This is the same pattern the official TickTick web
     * client uses; the partial-create endpoint silently drops reminder
     * fields.
     */
    create(draft: TickTickTaskDraft): Promise<TickTickTask>;
    /**
     * Partial-update a task. By default sends a partial body to
     * `POST /api/v2/task/{id}` — only the fields you pass are touched.
     *
     * **Reminder handling:** if `reminder` (sugar) or `reminders` is in
     * the params, the library re-routes the entire update through the V2
     * batch sync endpoint (`POST /api/v2/batch/task`) with full
     * read-modify-merge-write semantics — this is required because the
     * partial-update endpoint silently drops reminder fields. All other
     * fields you pass land in the same batch write; fields you omit
     * preserve their current value.
     */
    update(params: TickTickTaskUpdate): Promise<TickTickTask>;
    /**
     * Replace the full reminders array on an existing task. Pass `null`
     * to clear all reminders.
     *
     * Implementation note: this is a read-modify-write — the library
     * fetches the current task body, swaps in the new reminders + the
     * current etag, and POSTs to `POST /api/v2/batch/task`. Reminder
     * entries with a `TickTickReminder` shape preserve their existing
     * `id` (use this on round-trips); plain trigger strings get a
     * client-generated id.
     */
    setReminders(projectId: string, taskId: string, reminders: readonly (string | TickTickReminder)[] | null): Promise<TickTickTask>;
    /**
     * Internal: read-modify-merge-write through the V2 batch sync
     * endpoint. Fetches the current task body (so we have all fields +
     * the current etag), applies the caller's partial overrides plus the
     * resolved reminders, and POSTs to `POST /api/v2/batch/task` in an
     * `update` envelope. Returns the post-write task body (re-fetched so
     * the response reflects the new etag + populated `reminder` scalar).
     */
    private updateWithReminders;
    complete(projectId: string, taskId: string): Promise<void>;
    delete(projectId: string, taskId: string): Promise<void>;
    createMany(drafts: readonly TickTickTaskDraft[]): Promise<void>;
    updateMany(params: readonly TickTickTaskUpdate[]): Promise<void>;
    deleteMany(items: readonly {
        taskId: string;
        projectId: string;
    }[]): Promise<void>;
    /**
     * Move a task to a different project.
     *
     * **⚠️ ID changes:** The TickTick REST API does not support in-place project
     * moves. This method copies the task to the destination project and deletes
     * the original. The returned `TickTickMoveResult` contains both the new task
     * and the `previousId` for reference tracking.
     */
    move(item: TickTickTaskMove): Promise<TickTickMoveResult>;
    /**
     * Move multiple tasks to different projects.
     *
     * **⚠️ ID changes:** Same copy+delete limitation as {@link move}.
     * Returns an array of `TickTickMoveResult` with old-to-new ID mappings.
     */
    moveMany(items: readonly TickTickTaskMove[]): Promise<readonly TickTickMoveResult[]>;
    createSubtask(parentTaskId: string, parentProjectId: string, draft: {
        title: string;
        sortOrder?: number;
    }): Promise<TickTickTask>;
    pin(taskId: string, projectId: string, date?: Date): Promise<void>;
    unpin(taskId: string, projectId: string): Promise<void>;
    /**
     * Lists tasks in a project (intended for trash retrieval).
     *
     * **⚠️ Known limitation (confirmed 2026-04-07):** The `status=-1` query
     * parameter is **ignored** by the TickTick REST API. This endpoint returns
     * active tasks regardless of the status filter. Deleted tasks do not appear
     * in any known REST endpoint.
     *
     * - `GET /api/v2/project/{id}/tasks?status=-1` → returns active tasks (status=0)
     * - `GET /api/v2/trash/tasks` → 404 (does not exist)
     *
     * This method is kept for forward compatibility in case TickTick fixes the
     * endpoint, but callers should not rely on it returning deleted tasks.
     *
     * @see https://github.com/jaeyeonling/ticktick-client/issues/33
     */
    listTrash(options: TickTickTrashOptions & {
        projectId: string;
    }): Promise<readonly TickTickTask[]>;
    /**
     * Restores a deleted task by setting its status back to 0 (open).
     *
     * **⚠️ Known limitation:** Since {@link listTrash} cannot reliably retrieve
     * deleted task IDs, this method requires you to know the task ID beforehand
     * (e.g., saved before deletion).
     */
    restore(taskId: string, projectId: string): Promise<void>;
    iterateCompleted(options?: TickTickCompletedTaskOptions): AsyncGenerator<readonly TickTickTask[]>;
}

declare class ProjectsModule {
    private readonly client;
    constructor(client: TickTickClient);
    list(): Promise<readonly TickTickProject[]>;
    create(draft: TickTickProjectDraft): Promise<TickTickProject>;
    update(params: Partial<TickTickProjectDraft> & {
        id: string;
    }): Promise<void>;
    delete(projectId: string): Promise<void>;
    deleteMany(projectIds: readonly string[]): Promise<void>;
    /**
     * List kanban columns.
     *
     * **Response shape fix (2026-04-12):** The TickTick API returns a wrapper
     * object `{update: TickTickColumn[]}`, not a bare array. Previously this
     * method's return type advertised `readonly TickTickColumn[]` but the
     * actual value at runtime was the wrapper — callers calling `.map()` on
     * the result got `TypeError: undefined is not a function`. This version
     * unwraps and returns the actual column array.
     *
     * **Projection filter (2026-04-12):** The server-side `projectId` query
     * parameter is **not honored** — passing it does NOT filter to a single
     * project's columns. The endpoint always returns all columns across all
     * projects. When `projectId` is provided, this method now filters client-
     * side for the expected subset.
     */
    listColumns(projectId?: string): Promise<readonly TickTickColumn[]>;
    /**
     * Create a kanban column on a project.
     *
     * Hits `POST /api/v2/column` with body `{add: [{id, projectId, name, sortOrder?}]}`.
     * The id is client-generated as a 24-hex ObjectID, mirroring the
     * project / projectGroup / task create patterns.
     *
     * **Project must be in kanban view.** Creating a column on a list-view
     * project succeeds at the API but the column is not surfaced in the UI —
     * pass `viewMode: "kanban"` on {@link ProjectsModule.create} (or update
     * the project to `viewMode: "kanban"`) before adding columns.
     *
     * Wire shape verified 2026-05-27 against the test account; see
     * `Plans/kanban-columns-probe.md`.
     */
    createColumn(projectId: string, draft: TickTickColumnDraft): Promise<TickTickColumn>;
    /**
     * Update a kanban column — rename, reorder, or both.
     *
     * Hits `POST /api/v2/column` with body `{update: [{id, projectId, name?, sortOrder?}]}`.
     * Applies the partial-update contract: omit a field to preserve it,
     * pass a value to set it.
     *
     * **`projectId` is required** on the update payload — TickTick's server
     * silently drops the change if `projectId` is missing from the update
     * item (returns 200 with empty `id2etag`). The TypeScript type enforces
     * `projectId` so callers cannot omit it; the implementation forwards it
     * verbatim. Verified empirically 2026-05-27.
     */
    updateColumn(params: TickTickColumnUpdate): Promise<void>;
    /**
     * Delete a kanban column.
     *
     * Hits `POST /api/v2/column` with body `{delete: [{columnId, projectId}]}`.
     *
     * **Gotcha — field name.** The delete item uses the key **`columnId`**,
     * NOT `id`. This is unique to the column-delete payload; create and
     * update both use `id`. Six rounds of API probing with `{delete:[id-string]}`
     * and `{delete:[{id, projectId}]}` all returned server 500
     * `unknown_exception` — the bug was the field name, not the endpoint.
     * Discovered via Interceptor capture of the TickTick web UI's actual
     * delete request on 2026-05-27. Full discovery trail in
     * `Plans/kanban-columns-probe.md`.
     *
     * **Post-delete task behavior:** tasks that referenced the deleted
     * `columnId` keep the dangling reference on their `columnId` field
     * (same non-cascading behavior as folder-delete; verified during
     * Interceptor capture). The TickTick web UI silently treats those
     * tasks as "uncategorized" in the kanban view. If clean state matters,
     * reassign tasks via `tasks.update({id, projectId, columnId: <other>})`
     * before deleting the column.
     */
    deleteColumn(projectId: string, columnId: string): Promise<void>;
    /**
     * List members of a shared project.
     *
     * Hits `GET /api/v2/project/{projectId}/users`. Returns an empty array
     * for unshared (personal) projects — the endpoint only populates once
     * the project has been explicitly shared with another TickTick account.
     *
     * Use the returned `userId` values with `TickTickTaskDraft.assignee`
     * to assign tasks to specific members.
     *
     * Discovered via live traffic probe in April 2026.
     */
    listMembers(projectId: string): Promise<readonly TickTickProjectMember[]>;
}

/**
 * Manage projectGroups — TickTick's term for folders that hold a flat list
 * of projects. **One level only:** folders cannot contain other folders.
 *
 * Move projects into a folder by setting {@link TickTickProjectDraft.groupId}
 * on `projects.create` or `projects.update`. Unparent a project by passing
 * `groupId: null` (the library translates to the server's `"NONE"` sentinel).
 *
 * Wire endpoints (V2, cookie-session):
 * - `POST /api/v2/batch/projectGroup` — batch CRUD with `{add, update, delete}`.
 * - `GET /api/v2/batch/check/0` — `projectGroups[]` lives on this tree pull.
 *   No dedicated list endpoint exists in V2.
 */
declare class ProjectGroupsModule {
    private readonly client;
    constructor(client: TickTickClient);
    /**
     * List all folders for the current account. Derives `projectGroups[]`
     * from `GET /api/v2/batch/check/0`. Includes soft-deleted folders if the
     * server returns them; callers can filter on `deleted === 0` if needed.
     */
    list(): Promise<readonly TickTickProjectGroup[]>;
    create(draft: TickTickProjectGroupDraft): Promise<TickTickProjectGroup>;
    update(params: TickTickProjectGroupUpdate): Promise<void>;
    delete(id: string): Promise<void>;
    deleteMany(ids: readonly string[]): Promise<void>;
}

declare class TagsModule {
    private readonly client;
    constructor(client: TickTickClient);
    list(): Promise<readonly TickTickTag[]>;
    create(draft: TickTickTagDraft): Promise<void>;
    createMany(drafts: readonly TickTickTagDraft[]): Promise<void>;
    update(draft: Partial<TickTickTagDraft> & {
        name: string;
    }): Promise<void>;
    delete(name: string): Promise<void>;
    deleteMany(names: readonly string[]): Promise<void>;
    rename(name: string, label: string): Promise<void>;
    merge(sourceTagName: string, targetTagName: string): Promise<void>;
}

declare class HabitsModule {
    private readonly client;
    constructor(client: TickTickClient);
    list(): Promise<readonly TickTickHabit[]>;
    getCheckins(habitIds: readonly string[], startDate: string, endDate: string): Promise<readonly TickTickHabitCheckin[]>;
    create(draft: TickTickHabitDraft): Promise<void>;
    update(params: Partial<TickTickHabitDraft> & {
        id: string;
    }): Promise<void>;
    delete(habitId: string): Promise<void>;
    deleteMany(habitIds: readonly string[]): Promise<void>;
    upsertCheckin(input: TickTickCheckinInput): Promise<void>;
    getWeekStats(): Promise<TickTickHabitWeekStats>;
}

type FocusTimeline = {
    readonly id: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly status: number;
    readonly pauseDuration: number;
    readonly type: number;
};
type FocusOverview = {
    readonly todayPomoCount: number;
    readonly todayPomoDuration: number;
    readonly totalPomoCount: number;
    readonly totalPomoDuration: number;
};
declare class FocusModule {
    #private;
    private readonly client;
    constructor(client: TickTickClient);
    getTimeline(startDate: string, endDate: string): Promise<readonly FocusTimeline[]>;
    getOverview(): Promise<FocusOverview>;
    start(options?: FocusStartOptions): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    finish(): Promise<void>;
    stop(): Promise<void>;
    getTiming(startDate: string, endDate: string): Promise<unknown>;
    /**
     * Returns focus heatmap data for the given date range.
     *
     * **⚠️ Server bug (confirmed 2026-04-07):** This endpoint returns HTTP 500
     * regardless of parameter format (ms timestamps, seconds, ISO dates, YYYYMMDD,
     * no params) or account data. Tested with an account that has 5 completed
     * pomodoros. The endpoint exists (not 404) but is broken server-side.
     * Alternative v3 endpoints do not exist (404).
     *
     * @see https://github.com/jaeyeonling/ticktick-client/issues/31
     * @throws {TickTickApiError} Always throws with status 500 due to server bug
     */
    getHeatmap(startDate: string, endDate: string): Promise<unknown>;
    /**
     * Returns focus hour-distribution data for the given date range.
     *
     * **⚠️ Server bug (confirmed 2026-04-07):** This endpoint returns HTTP 500
     * regardless of parameter format or account data. See {@link getHeatmap} for
     * full investigation details.
     *
     * @see https://github.com/jaeyeonling/ticktick-client/issues/31
     * @throws {TickTickApiError} Always throws with status 500 due to server bug
     */
    getHourDistribution(startDate: string, endDate: string): Promise<unknown>;
    /**
     * Returns focus distribution data for the given date range.
     *
     * **⚠️ Server bug (confirmed 2026-04-07):** This endpoint returns HTTP 500
     * regardless of parameter format or account data. See {@link getHeatmap} for
     * full investigation details.
     *
     * @see https://github.com/jaeyeonling/ticktick-client/issues/31
     * @throws {TickTickApiError} Always throws with status 500 due to server bug
     */
    getDistribution(startDate: string, endDate: string): Promise<unknown>;
    getState(): FocusState;
    resetState(): void;
    syncState(): Promise<FocusState>;
}

declare class StatisticsModule {
    private readonly client;
    constructor(client: TickTickClient);
    getRanking(): Promise<TickTickRanking>;
    listCompleted(from: string, to: string, limit?: number): Promise<readonly TickTickTask[]>;
}

declare class UserModule {
    private readonly client;
    constructor(client: TickTickClient);
    getProfile(): Promise<TickTickUserProfile>;
    getStatus(): Promise<TickTickUserStatus>;
}

declare class CountdownsModule {
    private readonly client;
    constructor(client: TickTickClient);
    list(): Promise<readonly TickTickCountdown[]>;
    create(draft: TickTickCountdownDraft): Promise<void>;
    update(params: Partial<TickTickCountdownDraft> & {
        id: string;
    }): Promise<void>;
    delete(id: string): Promise<void>;
}

/**
 * Activity-feed / history surface.
 *
 * **Premium-only.** TickTick gates the activity-feed feature behind a
 * Premium subscription; non-Premium accounts are expected to receive a
 * 4xx response from these endpoints. Verified working against a Premium
 * test account on 2026-05-28; wire-shape capture in
 * `Plans/activity-probe.md`.
 *
 * Both list methods accept an optional `{skip, lastId}` pagination
 * object — pass the `id` of the last event from the previous page as
 * `lastId` and the running count as `skip` to fetch the next page.
 * The server returns an empty array when the feed is exhausted.
 *
 * Both endpoints live on the **V1 API surface** (`/api/v1/...`), not
 * V2 — this is one of the few endpoints the library exposes through
 * the older path. The V1 path is what the TickTick web UI hits.
 */
declare class ActivityModule {
    private readonly client;
    constructor(client: TickTickClient);
    /**
     * List activity events for a single task.
     *
     * Hits `GET /api/v1/task/activity/{taskId}` with optional pagination.
     * Returns events in newest-first order (matches the TickTick UI's
     * task-history panel).
     */
    listForTask(taskId: string, params?: TickTickActivityPaginationParams): Promise<readonly TickTickActivityEvent[]>;
    /**
     * List activity events for a project.
     *
     * Hits `GET /api/v1/project/{projectId}/activity` — note the URL
     * shape is asymmetric with `listForTask` (the task endpoint puts
     * the id at the end; the project endpoint puts it before `/activity`).
     * The library hides the asymmetry; callers pass the id positionally.
     */
    listForProject(projectId: string, params?: TickTickActivityPaginationParams): Promise<readonly TickTickActivityEvent[]>;
}

type TickTickClientOptions = {
    readonly credentials?: {
        readonly username: string;
        readonly password: string;
    };
    readonly session?: TickTickSession;
    readonly sessionStore?: TickTickSessionStore;
    readonly baseUrl?: string;
    readonly timeZone?: string;
    readonly fetch?: typeof globalThis.fetch;
};
declare class TickTickClient {
    #private;
    readonly tasks: TasksModule;
    readonly projects: ProjectsModule;
    readonly projectGroups: ProjectGroupsModule;
    readonly tags: TagsModule;
    readonly habits: HabitsModule;
    readonly focus: FocusModule;
    readonly statistics: StatisticsModule;
    readonly user: UserModule;
    readonly countdowns: CountdownsModule;
    readonly activity: ActivityModule;
    constructor(options?: TickTickClientOptions);
    login(): Promise<void>;
    logout(): Promise<void>;
    isAuthenticated(): Promise<boolean>;
    getSession(): TickTickSession | null;
    request<T>(method: string, path: string, body?: unknown): Promise<T>;
}

declare class TickTickError extends Error {
    constructor(message: string);
}
declare class TickTickAuthError extends TickTickError {
    constructor(message: string);
}
declare class TickTickApiError extends TickTickError {
    readonly url: string;
    readonly method: string;
    readonly status: number;
    readonly responseBody: unknown;
    constructor(message: string, url: string, method: string, status: number, responseBody: unknown);
}
/**
 * Thrown when `POST /api/v2/batch/task` returns HTTP 200 but reports a
 * per-item failure via the `id2error` envelope. The most common cause
 * is an etag conflict — the task was modified between the SDK's
 * read-modify-write fetch and the write — but the envelope is open
 * (e.g. permission / shared-project edge cases). The `errors` map
 * keys task ids to the server's error string.
 *
 * Callers handling concurrent edits should catch this and re-call the
 * operation (the SDK will re-read the task body, getting the fresh
 * etag).
 */
declare class TickTickBatchError extends TickTickError {
    readonly errors: Record<string, string>;
    constructor(message: string, errors: Record<string, string>);
}

declare function parseTaskPriority(input: string | TickTickTaskPriority): TickTickTaskPriority | undefined;
declare function formatTaskPriority(priority: TickTickTaskPriority): string;
declare function parseTaskStatus(input: string | TickTickTaskStatus): TickTickTaskStatus | undefined;
declare function formatTaskStatus(status: TickTickTaskStatus): string;
declare function parseHabitStatus(input: string | 0 | 1): 0 | 1 | undefined;
declare function formatHabitStatus(status: 0 | 1): string;
declare function parseCheckinStatus(input: string | 0 | 1 | 2): 0 | 1 | 2 | undefined;
declare function formatCheckinStatus(status: 0 | 1 | 2): string;
/**
 * Build an RFC 5545 TRIGGER string from a structured input.
 *
 * Three input shapes:
 *
 * - `{ at: 'due' }` → `"TRIGGER:PT0S"` (fires at the task's due time)
 * - `{ before: ReminderDuration | shorthand }` → negative trigger
 *   (e.g. `{ before: { minutes: 15 } }` or `{ before: '15m' }` → `"TRIGGER:-PT15M"`)
 * - `{ after: ReminderDuration | shorthand }` → positive trigger
 *   (e.g. `{ after: { minutes: 30 } }` → `"TRIGGER:PT30M"`)
 *
 * Shorthand grammar: space-separated `<n><unit>` tokens where unit is one
 * of `w`/`d`/`h`/`m`/`s`. Whitespace is optional (`'1d 9h'` and `'1d9h'`
 * both parse to `{ days: 1, hours: 9 }`).
 *
 * Returns `undefined` for an empty / invalid / zero duration on
 * `before`/`after` (a zero duration is not a meaningful before/after
 * offset — use `{ at: 'due' }` instead).
 *
 * Encoding note: weeks are emitted as `P{n}W` only when no other field is
 * set; mixed-form inputs (e.g. `{ weeks: 2, days: 1 }`) are normalized to
 * `P{days}D` because TickTick's server follows the strict RFC 5545
 * subset, which forbids mixing `W` with other components.
 */
declare function formatReminderTrigger(input: ReminderTriggerInput): string | undefined;
/**
 * Decode an RFC 5545 TRIGGER string into a structured {@link ReminderTrigger}.
 *
 * Returns `undefined` for malformed inputs (anything that doesn't match
 * the TRIGGER grammar, or `TRIGGER:P` / `TRIGGER:PT` with no duration
 * components).
 *
 * Zero-valued fields are dropped on parse — `"TRIGGER:-P0DT9H0M0S"`
 * decodes to `{ before: { hours: 9 } }`, not the noisier full-field form.
 * A trigger whose duration is entirely zero (e.g. `"TRIGGER:PT0S"` or
 * `"TRIGGER:P0D"`) decodes to `{ at: 'due' }` regardless of sign.
 */
declare function parseReminderTrigger(input: string): ReminderTrigger | undefined;

export { FileSessionStore, MemorySessionStore, type ReminderDuration, type ReminderTrigger, type ReminderTriggerInput, type TickTickActivityAction, type TickTickActivityActor, type TickTickActivityDeviceChannel, type TickTickActivityEvent, type TickTickActivityPaginationParams, TickTickApiError, TickTickAuthError, TickTickBatchError, type TickTickCheckinInput, TickTickClient, type TickTickClientOptions, type TickTickColumn, type TickTickColumnDraft, type TickTickColumnUpdate, type TickTickCountdown, type TickTickCountdownDraft, type TickTickCountdownType, TickTickError, type TickTickHabit, type TickTickHabitCheckin, type TickTickHabitDraft, type TickTickMoveResult, type TickTickProject, type TickTickProjectDraft, type TickTickProjectGroup, type TickTickProjectGroupDraft, type TickTickProjectGroupUpdate, type TickTickProjectMember, type TickTickRanking, type TickTickReminder, type TickTickSession, type TickTickSessionStore, type TickTickTag, type TickTickTagDraft, type TickTickTask, type TickTickTaskDraft, type TickTickTaskItem, type TickTickTaskMove, type TickTickTaskPriority, type TickTickTaskStatus, type TickTickTaskUpdate, type TickTickUserProfile, type TickTickUserStatus, formatCheckinStatus, formatHabitStatus, formatReminderTrigger, formatTaskPriority, formatTaskStatus, parseCheckinStatus, parseHabitStatus, parseReminderTrigger, parseTaskPriority, parseTaskStatus };
