> **RESOLVED 2026-05-29:** HAR capture against the official web client revealed the endpoint: `POST /api/v2/batch/task` (V2 batch sync envelope) with full read-modify-write + etag. See `Plans/reminders-har-capture-raw.json` for the capture and `ISA.md` Changelog for the full write-up. Write-path landed in commit on 2026-05-29; #2 and #3 closed. Document below kept as historical record of the wrong-endpoint probes.

# Reminders write-path probe — V2 endpoint refuses every shape

Date: 2026-05-28
Account: `doma.spirita@gmail.com` (Premium)
Related: epic [#59](https://github.com/MHoroszowski/ticktick-client/issues/59),
sub-issues [#2](https://github.com/MHoroszowski/ticktick-client/issues/2),
[#3](https://github.com/MHoroszowski/ticktick-client/issues/3),
[#4](https://github.com/MHoroszowski/ticktick-client/issues/4),
[#5](https://github.com/MHoroszowski/ticktick-client/issues/5)

## Summary

`POST /api/v2/task/{id}` (the partial-update endpoint this SDK uses for
`tasks.create` and `tasks.update`) **silently drops every reminder shape
we probed** — request returns 200 OK, response body echoes most of the
sent fields, but `reminder` comes back as `""` and `reminders` as `[]`
regardless of what we sent.

Reminders set through the official TickTick clients DO surface on
readback via this SDK — 133 of 321 live tasks on the test account carry
populated reminders with the V2 shape:

```jsonc
{
  "reminder": "TRIGGER:PT0S",
  "reminders": [
    { "id": "699bce82e812d5a47082eb3e", "trigger": "TRIGGER:PT0S" }
  ]
}
```

We just can't write that shape back through the documented V2 endpoint.

**Resolution path:** HAR capture against the official web client while
the user adds/removes/edits a reminder. The HAR will reveal whichever
endpoint / envelope / required-companion-field the official client uses.
Same pattern that closed Kanban Column delete (#15) and Activity Feed
(#66).

## Hypothesis matrix

All probes against `POST /api/v2/task/{id}` (id of a baseline task with
`dueDate`, `isAllDay: false`, `timeZone`). Baseline task carries no
reminders before each probe.

| # | Body fragment | HTTP | `.reminder` on readback | `.reminders` on readback |
|---|---|:---:|:---:|:---:|
| H1 | `reminders: ["TRIGGER:-PT15M"]` (string array, V1/OAuth shape per jen6) | **500** | n/a | n/a |
| H2 | `reminders: [{trigger:"TRIGGER:-PT15M"}]` | 200 | `""` | `[]` |
| H3 | `reminders: [{id, trigger:"TRIGGER:-PT15M"}]` (24-char hex id) | 200 | `""` | `[]` |
| H4 | `reminders: ["-PT15M"]` (no `TRIGGER:` prefix) | **500** | n/a | n/a |
| H5a | `reminderTime: "2026-12-01T14:45:00.000+0000"` | 200 | `""` | `[]` |
| H5b | `remindTime: "2026-12-01T14:45:00.000+0000"` | 200 | `""` | `[]` — but field echoed back on the task as `.remindTime` |
| H6a | `notify: ["TRIGGER:-PT15M"]` | 200 | `""` | `[]` |
| H6b | `notification: ["TRIGGER:-PT15M"]` | 200 | `""` | `[]` |
| H8 | scalar `reminder` + `reminders[{id, trigger}]` in lockstep | 200 | `""` | `[]` |
| H9 | only `reminders[{id, trigger}]` (no scalar reminder) | 200 | `""` | `[]` |
| H10 | only scalar `reminder: "TRIGGER:-PT1H"` | 200 | `""` | `[]` |
| H11 | scalar + 3-element array (`-PT24H`, `-PT1H`, `PT0S`) | 200 | `""` | `[]` |
| H12 | clear via `reminder: "", reminders: []` | 200 | `""` | `[]` |
| H13 | clear via `reminder: null, reminders: null` | 200 | `""` | `[]` |

## Conclusion

The 200-but-silent-drop signature is **server-side validation rejecting
the partial update for reminder fields specifically**. The endpoint
accepts the request envelope, persists every other field in the body
(verified — title, priority, dueDate, etc. all round-trip), and silently
skips the reminder fields. No 4xx response, no warning header — there's
nothing the SDK can surface to a caller short of "I sent the value, the
server returned 200, but the field came back empty."

H5b (`remindTime`) is interesting in that the server *does* echo the
field back on `.remindTime` (added to the task body), but it does NOT
populate `.reminder` / `.reminders`. So `remindTime` may be a legacy
field that the server stores but ignores — not the live reminder
surface.

## What to capture in the HAR session

Open `https://ticktick.com/webapp/` with Interceptor armed. On the same
test task used above (or a fresh one):

1. **Single reminder add.** Open task → Add reminder → set "15 minutes
   before" → save. Capture the request to whichever endpoint fires.
2. **Multi-reminder add.** Add a second reminder (1 day before). Capture.
3. **Reminder edit.** Change the first reminder's offset. Capture.
4. **Reminder delete.** Remove the second reminder. Capture.
5. **Geofence add.** Add a location-based reminder. Capture. (Closes #5.)

Note the endpoint URL, the full request body, the response body, and any
`Cookie` / `X-CSRFToken` / other headers that look reminder-specific.
Save the capture as `Plans/reminders-har-capture.md` for the follow-up
implementation cycle.

## Files in this probe trail

- `scripts/reminders-probe.ts` — H1–H7 (initial shape sweep)
- `scripts/reminders-probe-2.ts` — H8–H13 (refinement after readback survey)
- `scripts/reminders-survey.ts` — survey of live tasks to find the actual
  readback shape (133/321 tasks carry reminders set via the official
  clients)
