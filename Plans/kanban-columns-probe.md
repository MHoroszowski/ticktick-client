# Kanban Columns CRUD — Wire Discovery

Captured: 2026-05-27T10:17:01.253Z
Test account: doma.spirita@gmail.com
Probe script: scripts/probe-kanban-columns.ts

## Wire shape — confirmed

| Operation | Method | Path | Body | Persisted? |
|-----------|--------|------|------|------------|
| **CREATE** | POST | `/api/v2/column` | `{add: [{id, projectId, name, sortOrder?}]}` | Yes |
| **UPDATE** | POST | `/api/v2/column` | `{update: [{id, projectId, name?, sortOrder?}]}` | Yes |
| **DELETE** | POST | `/api/v2/column` | `{delete: [{id, projectId}]}` | **Upstream-broken (500 unknown_exception)** |
| LIST | GET | `/api/v2/column?from=0&projectId=<id>` | — | (existing — server filter not honored; client-side projection) |

### Critical gotcha (UPDATE)

TickTick's update endpoint **silently no-ops** if the `projectId` field is missing from the update item. The server returns 200 with `{id2etag: {}, id2error: {}}` and discards the change. Every update payload MUST include the column's `projectId`.

### DELETE upstream bug

After six probe iterations (REST DELETE, batch envelopes, `{deleteIds}`, soft-delete via `update {deleted: 1}`, full-record body, kebab paths, per-id verb paths) **no working delete path exists** at the V2 cookie-session API surface. The closest behavior is `POST /api/v2/column {delete:[{id,projectId}]}` which returns a malformed 200+500 hybrid containing `"errorCode":"unknown_exception"`.

Library decision: ship `createColumn` + `updateColumn` only. Document the delete gap as a tracking issue. Filed as a `tracking: server-bug` issue on the fork; references issue #15.

## Step-by-step capture

### Step 1: create kanban project

**Request:**

```http
POST /api/v2/batch/project
```

**Body:**

```json
{
  "add": [
    {
      "id": "6a16c49ce44786da0a84f656",
      "name": "[probe-columns] mpnwtmgu",
      "viewMode": "kanban",
      "kind": "TASK"
    }
  ]
}
```

**Response:**

```json
{
  "id2etag": {
    "6a16c49ce44786da0a84f656": "umrdjahm"
  },
  "id2error": {}
}
```

**Notes:** projectId: 6a16c49ce44786da0a84f656

### Step 2: CREATE column — POST /api/v2/column {add:[...]}

**Request:**

```http
POST /api/v2/column
```

**Body:**

```json
{
  "add": [
    {
      "id": "6a16c49cd969ca81499bc669",
      "projectId": "6a16c49ce44786da0a84f656",
      "name": "[probe-columns] new",
      "sortOrder": 0
    }
  ]
}
```

**Response:**

```json
{
  "id2etag": {
    "6a16c49cd969ca81499bc669": "7kn11p18"
  },
  "id2error": {}
}
```

**Notes:** persisted: true; etag: 7kn11p18

### Step 3: UPDATE column — POST /api/v2/column {update:[...]} with projectId

**Request:**

```http
POST /api/v2/column
```

**Body:**

```json
{
  "update": [
    {
      "id": "6a16c49cd969ca81499bc669",
      "projectId": "6a16c49ce44786da0a84f656",
      "name": "[probe-columns] renamed",
      "sortOrder": 42
    }
  ]
}
```

**Response:**

```json
{
  "id2etag": {
    "6a16c49cd969ca81499bc669": "u3h9g0mr"
  },
  "id2error": {}
}
```

**Notes:** name: [probe-columns] renamed; sortOrder: 42 (expected: renamed/42)

### Step 4: PARTIAL UPDATE — name only, sortOrder preserved

**Request:**

```http
POST /api/v2/column
```

**Body:**

```json
{
  "update": [
    {
      "id": "6a16c49cd969ca81499bc669",
      "projectId": "6a16c49ce44786da0a84f656",
      "name": "[probe-columns] partial-rename"
    }
  ]
}
```

**Response:**

```json
{
  "id2etag": {
    "6a16c49cd969ca81499bc669": "a9g7kawk"
  },
  "id2error": {}
}
```

**Notes:** name: [probe-columns] partial-rename; sortOrder preserved at 42? true

### Step 5: DELETE column — documented upstream bug (server 500 unknown_exception)

**Request:**

```http
POST /api/v2/column
```

**Body:**

```json
{
  "delete": [
    {
      "id": "6a16c49cd969ca81499bc669",
      "projectId": "6a16c49ce44786da0a84f656"
    }
  ]
}
```

**Response:**

```json
{
  "status": 500,
  "raw_body": "{\"id2etag\":{},\"id2error\":{}}{\"errorId\":\"0ct5r09g@tw10\",\"errorCode\":\"unknown_exception\",\"errorMessage\":\"Unknown exception\",\"data\":null}"
}
```

**Notes:** Raw fetch used because the standard client throws on the concatenated 200+500 body. The server returns `errorCode: "unknown_exception"`. No working delete path discovered after 6 probe iterations covering: REST DELETE, batch envelopes, deleteIds, soft-delete via update{deleted:1}, full-record body, kebab paths, and per-id verb paths. Tracking as upstream bug.
