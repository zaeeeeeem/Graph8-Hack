<!-- https://docs.graph8.com/developers/tasks/ -->
# Tasks

Tasks let you create follow-up reminders and action items linked to one or more business records.  

## List Contact Tasks 
`GET /contacts/{contact_id}/tasks` 
Returns tasks linked to a specific contact. 

### Query Parameters 
| Parameter | Type | Default | Description
| `status` | string | — | Filter by status: `open` or `completed` 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl "https://be.graph8.com/api/v1/contacts/12345/tasks?status=open" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.get(

f"{BASE_URL}/contacts/12345/tasks",

headers=HEADERS,

params={"status": "open"}

)
```

### Response 

```

{

"data": [

{

"id": "task_uuid",

"entity_type": "contact",

"entity_id": "101",

"title": "Follow up",

"description": "...",

"due_date": "2026-06-01T17:00:00Z",

"assignee_id": "user_x",

"assignee_name": "John",

"status": "open",

"priority": 2,

"task_type": "...",

"created_by": "user_y",

"created_at": "...",

"updated_at": "...",

"parent_task_id": null,

"subtask_sort_order": 0,

"subtask_count": 0,

"completed_subtask_count": 0

}

]

}
```

## List All Tasks 
`GET /tasks` 
Returns the tasks the caller can read, with optional filters and authoritative pagination. Use `pagination.has_next` and advance the requested `offset` to read beyond the first page. `pagination.total` is the filtered total, not the page length. 

### Query Parameters 
| Parameter | Type | Default | Description
| `status` | string | — | Filter by status
| `priority` | integer | — | Filter by priority (0=none, 1=urgent, 2=high, 3=normal, 4=low)
| `assignee_id` | string | — | Filter by assignee
| `search` | string | — | Partial match on task title
| `entity_type` | string | — | Related record type; pair with `entity_id`
| `entity_id` | string | — | Exact related record ID
| `limit` | integer | 100 | Page size, from 1 to 200
| `offset` | integer | 0 | Number of matching tasks to skip 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/tasks?status=open&priority=2&assignee_id=user_x" \

-H "Authorization: Bearer $API_KEY"
```

## Create Task 
`POST /contacts/{contact_id}/tasks` 

### Request Body 
| Field | Type | Required | Description
| `title` | string | Yes | Task title
| `description` | string | No | Task details
| `due_date` | string | No | ISO 8601 due date
| `assignee_id` | string | No | User ID to assign
| `priority` | integer | No | 0=none, 1=urgent, 2=high, 3=normal, 4=low
| `parent_task_id` | string | No | ID of parent task — makes this a subtask (one level deep)
| `subtask_sort_order` | integer | No | Sort order among sibling subtasks 

### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/contacts/12345/tasks" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"title": "Send proposal", "due_date": "2026-03-05", "priority": 2}'
```

### Response `201 Created` 
Returns the full task object — same shape as the items in `GET /contacts/{contact_id}/tasks`.  

## Update Task 
`PATCH /tasks/{task_id}` 
Supports partial updates. Send only the fields you want to change. 

### Request Body 
All fields are optional. 
| Field | Type | Description
| `title` | string | Task title
| `description` | string | Task details
| `due_date` | string | ISO 8601 due date
| `assignee_id` | string | User ID to assign
| `status` | string | Task status (`open` or `completed`)
| `priority` | integer | 0=none, 1=urgent, 2=high, 3=normal, 4=low
| `parent_task_id` | string | ID of parent task (or `null` to remove subtask relationship)
| `subtask_sort_order` | integer | Sort order among sibling subtasks 

### Example  

-   cURL     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/tasks/task_uuid" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"status": "completed", "priority": 1}'
```

## Get an exact task 
`GET /tasks/{task_id}` returns one task, including subtasks that do not appear in the top-level list. Missing tasks and tasks outside the caller’s access return HTTP 404. 

## Create a task with multiple records 
`POST /tasks` accepts the usual task fields plus `records`, an array of objects containing `entity_type` and `entity_id`. Supported types are `contact`, `company`, `deal`, `team_member`, `lead`, and `application`. The first record is the primary association. Alternatively, supply a primary `entity_type` and `entity_id` pair. 

```

{

"title": "Review the lead with its company",

"records": [

{ "entity_type": "lead", "entity_id": "789" },

{ "entity_type": "company", "entity_id": "456" }

]

}
```

For a restricted API key, creating a contact-linked task requires both `tasks:write` and `contacts:read`. A key with task-write access alone receives HTTP 404 for an unavailable contact. Other newly attached records require their corresponding read access. Linking a record does not modify that record, so source-record write access is not required. Legacy keys without an explicit scope list retain their existing behavior. 
Use the native lead ID and application UUID. A contact ID is not interchangeable with a lead ID; an application ID identifies one submission, not the candidate’s first application. 
Task responses preserve `entity_type`, `entity_id`, `entity_label`, `links`, and source context such as `source_url`, `source_meeting_id`, and `source_transcript_id`. Each related link includes its availability and canonical record ID when accessible. A task-read grant does not grant access to its records: the API key also needs the applicable record-read scopes. Unavailable records do not expose labels. 
When using `PATCH /tasks/{task_id}`, omit `records` to leave existing associations unchanged. Supply `records` only when deliberately replacing the association list; retain every link you intend to keep. Ordinary title or due-date updates preserve unfamiliar record types. 
The MCP tools `g8_create_task`, `g8_update_task`, `g8_get_task`, and `g8_get_tasks` retain these typed records and source fields. Paginated MCP results expose `total`, `offset`, `limit`, and `has_next`; do not treat one capped page as the full task count. 

## Assign an executor without starting work 
`PUT /tasks/{task_id}/assignment` requires `tasks:write` and the same task and agent access checks as the browser. Send `agent_id` (an eligible Work profile UUID, or `null` for human execution) and `expected_updated_at` from the current task. A stale version returns a conflict. Agent assignment requires an active human assignee in the organization. The response reports `execution_started: false`. 

## Explicitly start execution 
`POST /tasks/{task_id}/start` requires `tasks:run` and a UUID `Idempotency-Key` header. Reuse that key for retries of the same logical request. Assignment never implies execution. Active runs cannot be duplicated or reassigned, and completed tasks must be reopened before a new run. A dispatch that cannot be confirmed returns 503; retry with the same key to check the existing run. 

## Read execution history 
`GET /tasks/{task_id}/execution` requires `tasks:read` and permission to view the task. It returns the latest 50 runs, including distinct lifecycle states and timestamps. `details_available` indicates whether private progress, next action and session links are visible to the caller. Run completion does not automatically approve operator work or complete the CRM task. 
MCP clients use `g8_assign_task_executor`, `g8_start_task_execution` and `g8_get_task_execution` for these operations. Pass a stable UUID `request_id` to Start and retain it through uncertain retries. Ordinary update tools cannot approve or reject operator approval tasks.
