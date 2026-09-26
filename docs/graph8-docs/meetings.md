<!-- https://docs.graph8.com/developers/meetings/ -->
# Meetings

`````` 
The Meetings API lets you query scheduled, past, and upcoming meetings stored in the graph8 inbox, including attendees, transcript status, AI-generated summaries, and linked CRM data.  

## List Meetings 
`GET /inbox/meetings` 
Returns a paginated list of meetings. All query parameters are optional and can be combined. 

### Query Parameters 
| Parameter | Type | Default | Description
| `participant_email` | string (repeatable) | — | Match meetings where the organizer, owner, or any attendee has this email. Repeat the parameter to match any of multiple emails (OR logic).
| `scope` | string | — | `my` — only meetings belonging to the authenticated user; `all` — all meetings in the org.
| `timeframe` | string | — | `all` | `upcoming` | `past`
| `has_transcript` | boolean | — | When `true`, return only meetings that have a linked transcript.
| `internal_mode` | string | — | `include_internal` — include internal-only meetings; `exclude_internal` — omit them.
| `search` | string | — | Full-text match against meeting title or transcript content.
| `page` | integer | `1` | Page number (1-indexed).
| `page_size` | integer | `50` | Items per page (max 100). 

### Example  

-   cURL     

Terminal window
```

# List upcoming meetings for the authenticated user

curl "https://be.graph8.com/api/v1/inbox/meetings?scope=my&timeframe=upcoming" \

-H "Authorization: Bearer $API_KEY"

# Filter by participant email and transcript presence

curl "https://be.graph8.com/api/v1/inbox/[email protected]&has_transcript=true&page=1&page_size=25" \

-H "Authorization: Bearer $API_KEY"

# Search transcript content (exclude internal meetings)

curl "https://be.graph8.com/api/v1/inbox/meetings?search=pricing&internal_mode=exclude_internal" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [

{

"id": "meeting_uuid",

"channel": "meetings",

"subject": "...",

"organizer_email": "...",

"user_email": "...",

"start_time": "...",

"end_time": "...",

"meeting_url": "...",

"attendees": [

{

"email": "...",

"name": "...",

"response_status": "accepted",

"organizer": false

}

],

"transcript_status": "linked",

"transcript_id": "...",

"transcript_source": "fathom",

"transcript_summary": "...",

"transcript_redacted": false,

"audience_type": "prospect",

"is_internal_only": false,

"meeting_sensitivity": null,

"matched_account": {},

"tags": [{}],

"assignees": [{}],

"preview": "...",

"created_at": "...",

"updated_at": "..."

}

],

"pagination": {}

}
```

#### Response Fields 
| Field | Type | Description
| `id` | string | Unique meeting UUID.
| `channel` | string | Always `"meetings"`.
| `subject` | string | Meeting title.
| `organizer_email` | string | Email of the calendar organizer.
| `user_email` | string | Email of the graph8 user who owns this meeting record.
| `start_time` | string | ISO 8601 start timestamp.
| `end_time` | string | ISO 8601 end timestamp.
| `meeting_url` | string | Conferencing join URL.
| `attendees` | array | List of attendee objects (see below).
| `transcript_status` | string | Transcript link state — e.g. `"linked"`, `"none"`, `"processing"`.
| `transcript_id` | string | ID of the linked transcript record, if any.
| `transcript_source` | string | Provider that generated the transcript — e.g. `"fathom"`.
| `transcript_summary` | string | AI-generated summary of the transcript.
| `transcript_redacted` | boolean | Whether the transcript has been redacted.
| `audience_type` | string | Classification of attendees — e.g. `"prospect"`.
| `is_internal_only` | boolean | `true` if all attendees are internal (same org domain).
| `meeting_sensitivity` | string | null | Sensitivity label, if set.
| `matched_account` | object | CRM account matched to this meeting, if any.
| `tags` | array | Tags attached to this meeting.
| `assignees` | array | Team members assigned to this meeting.
| `preview` | string | Short text preview of the meeting content.
| `created_at` | string | ISO 8601 record creation timestamp.
| `updated_at` | string | ISO 8601 record last-updated timestamp. 

#### Attendee Object 
| Field | Type | Description
| `email` | string | Attendee email address.
| `name` | string | Attendee display name.
| `response_status` | string | Calendar response — e.g. `"accepted"`, `"declined"`, `"tentative"`.
| `organizer` | boolean | `true` if this attendee is the meeting organizer.  

## Get Meeting 
`GET /inbox/meetings/{meeting_id}` 
Returns full detail for a single meeting, including the full transcript text and AI analysis fields that are not returned in the list endpoint. 

### Path Parameters 
| Parameter | Type | Description
| `meeting_id` | string | Meeting UUID. 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/inbox/meetings/meeting_uuid" \

-H "Authorization: Bearer $API_KEY"
```

### Response 
All fields from the list endpoint are present, plus the following additional fields: 
| Field | Type | Description
| `transcript_text` | string | Full transcript body text.
| `key_topics` | array | AI-extracted key topics discussed in the meeting.
| `action_items` | array | AI-extracted action items from the meeting.
| `meeting_tasks` | array | Tasks created from this meeting.
| `campaign_mentions` | array | Campaigns or sequences mentioned during the meeting.
| `custom_fields` | object | Custom field values attached to this meeting record.
| `participant_links` | array | CRM links resolved for each participant (contact/company records).
| `owner_team_member` | object | graph8 team member who owns this meeting record.
| `organizer_team_member` | object | graph8 team member who is the calendar organizer.
