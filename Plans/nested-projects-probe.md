# Nested Projects (projectGroups / folders) — Discovery Probe

Captured: 2026-05-27T03:35:53.089Z
Test account: doma.spirita@gmail.com
Probe script: scripts/probe-nested-projects.ts

## Findings — wire shape

These are the empirical results from probing the TickTick V2 API against the test account. Implementation MUST match what this doc captures, not the ticktick-py reference (which is canonical for endpoint discovery but may have drifted from current server behavior).

### Step 1: baseline batch/check/0

**Request:**

```http
GET /api/v2/batch/check/0
```

**Response:**

```json
{
  "top_level_keys": [
    "checkPoint",
    "syncTaskBean",
    "projectProfiles",
    "projectGroups",
    "filters",
    "tags",
    "syncTaskOrderBean",
    "syncOrderBean",
    "syncOrderBeanV3",
    "inboxId",
    "checks",
    "remindChanges"
  ],
  "projectGroups_count": 0,
  "first_projectGroup_sample": null
}
```

**Notes:** Sample shape of an existing projectGroup if any exist.

### Step 2: create folder

**Request:**

```http
POST /api/v2/batch/projectGroup
```

**Body:**

```json
{
  "add": [
    {
      "id": "6a1666975c1e62e98ca88403",
      "name": "[probe-nested] probe folder mpnihqwk",
      "sortOrder": 0,
      "listType": "group"
    }
  ]
}
```

**Response:**

```json
{
  "id2etag": {
    "6a1666975c1e62e98ca88403": "ffvmng8h"
  },
  "id2error": {}
}
```

**Notes:** Generated folder id: 6a1666975c1e62e98ca88403

### Step 3: confirm folder via batch/check/0

**Request:**

```http
GET /api/v2/batch/check/0
```

**Response:**

```json
{
  "projectGroups_count": 1,
  "created_folder": {
    "id": "6a1666975c1e62e98ca88403",
    "etag": "ffvmng8h",
    "name": "[probe-nested] probe folder mpnihqwk",
    "showAll": true,
    "sortOrder": 0,
    "viewMode": null,
    "deleted": 0,
    "userId": 130490066,
    "sortType": "project",
    "sortOption": null,
    "teamId": null,
    "background": null,
    "timeline": null
  }
}
```

**Notes:** These are the fields available on a freshly-created projectGroup.

### Step 4: create project with groupId

**Request:**

```http
POST /api/v2/batch/project
```

**Body:**

```json
{
  "add": [
    {
      "id": "6a16669894464794cfd17983",
      "name": "[probe-nested] probe project mpnihqwk",
      "groupId": "6a1666975c1e62e98ca88403",
      "kind": "TASK"
    }
  ]
}
```

**Response:**

```json
{
  "created_project": {
    "id": "6a16669894464794cfd17983",
    "name": "[probe-nested] probe project mpnihqwk",
    "isOwner": true,
    "color": null,
    "sortOrder": 0,
    "sortOption": null,
    "sortType": null,
    "userCount": 1,
    "etag": "85molzqm",
    "modifiedTime": "2026-05-27T03:35:52.130+0000",
    "inAll": true,
    "showType": null,
    "muted": false,
    "reminderType": null,
    "closed": null,
    "transferred": null,
    "groupId": "6a1666975c1e62e98ca88403",
    "viewMode": null,
    "notificationOptions": null,
    "teamId": null,
    "permission": null,
    "kind": "TASK",
    "timeline": null,
    "needAudit": true,
    "barcodeNeedAudit": false,
    "openToTeam": null,
    "teamMemberPermission": null,
    "source": 1,
    "background": null
  }
}
```

**Notes:** Confirms wire field is `groupId` and that GET /api/v2/projects returns it.

### Step 5: unparent via groupId: null

**Request:**

```http
POST /api/v2/batch/project
```

**Body:**

```json
{
  "update": [
    {
      "id": "6a16669894464794cfd17983",
      "groupId": null
    }
  ]
}
```

**Response:**

```json
{
  "project_after_unparent": {
    "id": "6a16669894464794cfd17983",
    "name": null,
    "isOwner": true,
    "color": null,
    "sortOrder": 0,
    "sortOption": null,
    "sortType": null,
    "userCount": 1,
    "etag": "2ogp1ylg",
    "modifiedTime": "2026-05-27T03:35:52.293+0000",
    "inAll": true,
    "showType": null,
    "muted": false,
    "reminderType": null,
    "closed": null,
    "transferred": null,
    "groupId": "6a1666975c1e62e98ca88403",
    "viewMode": null,
    "notificationOptions": null,
    "teamId": null,
    "permission": null,
    "kind": "TASK",
    "timeline": null,
    "needAudit": true,
    "barcodeNeedAudit": false,
    "openToTeam": null,
    "teamMemberPermission": null,
    "source": 1,
    "background": null
  }
}
```

**Notes:** Does the project lose its groupId? Current groupId: "6a1666975c1e62e98ca88403"

### Step 6: groupId "NONE" semantics

**Request:**

```http
POST /api/v2/batch/project
```

**Body:**

```json
{
  "update": [
    {
      "id": "6a16669894464794cfd17983",
      "groupId": "NONE"
    }
  ]
}
```

**Response:**

```json
{
  "project_after_NONE": {
    "id": "6a16669894464794cfd17983",
    "name": null,
    "isOwner": true,
    "color": null,
    "sortOrder": 0,
    "sortOption": null,
    "sortType": null,
    "userCount": 1,
    "etag": "bby3yxkq",
    "modifiedTime": "2026-05-27T03:35:52.542+0000",
    "inAll": true,
    "showType": null,
    "muted": false,
    "reminderType": null,
    "closed": null,
    "transferred": null,
    "groupId": null,
    "viewMode": null,
    "notificationOptions": null,
    "teamId": null,
    "permission": null,
    "kind": "TASK",
    "timeline": null,
    "needAudit": true,
    "barcodeNeedAudit": false,
    "openToTeam": null,
    "teamMemberPermission": null,
    "source": 1,
    "background": null
  }
}
```

**Notes:** Does the literal string "NONE" also unparent? groupId after NONE: null

### Step 7: delete folder while project is inside

**Request:**

```http
POST /api/v2/batch/projectGroup
```

**Body:**

```json
{
  "delete": [
    "6a1666975c1e62e98ca88403"
  ]
}
```

**Response:**

```json
{
  "response_body": {
    "id2etag": {},
    "id2error": {}
  },
  "error": null,
  "project_after_folder_delete": {
    "id": "6a16669894464794cfd17983",
    "name": null,
    "isOwner": true,
    "color": null,
    "sortOrder": 0,
    "sortOption": null,
    "sortType": null,
    "userCount": 1,
    "etag": "tpcdsw0x",
    "modifiedTime": "2026-05-27T03:35:52.716+0000",
    "inAll": true,
    "showType": null,
    "muted": false,
    "reminderType": null,
    "closed": null,
    "transferred": null,
    "groupId": "6a1666975c1e62e98ca88403",
    "viewMode": null,
    "notificationOptions": null,
    "teamId": null,
    "permission": null,
    "kind": "TASK",
    "timeline": null,
    "needAudit": true,
    "barcodeNeedAudit": false,
    "openToTeam": null,
    "teamMemberPermission": null,
    "source": 1,
    "background": null
  }
}
```

**Notes:** Cascade behavior: child project survives with groupId still pointing at deleted folder? becomes top-level? was deleted?
