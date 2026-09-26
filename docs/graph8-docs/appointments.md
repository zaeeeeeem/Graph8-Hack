<!-- https://docs.graph8.com/developers/appointments/ -->
# Appointments Management

`````` 

```` 

````  

## Event Types 

### Get Event Type Detail 
`GET /appointments/event-types/{event_type_id}` 
Get the full detail for one bookable event type (title, slug, duration, locations, hosts, attached schedule, buffers, booking fields). 

#### Path Parameters 
| Parameter | Type | Description
| `event_type_id` | integer | Event type ID 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/event-types/42" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": { "id": 42, "title": "Intro call", "slug": "intro-call", "length": 30 } }
```

Returns `404` when the ID is not in the caller’s org.  

### Create Event Type 
`POST /appointments/event-types` → `201` 
Create a bookable event type. 

#### Request Body 
| Field | Type | Required | Default | Description
| `title` | string | Yes | — | Display name for the event type
| `slug` | string | Yes | — | URL slug — must be unique in the org (`409` on collision)
| `length` | integer | Yes | — | Meeting duration in minutes
| `description` | string | No | — | Description shown on the booking page
| `scheduling_type` | string | No | — | `round_robin`, `collective`, or `null` (individual)
| `schedule_id` | integer | No | — | Attach an availability schedule
| `time_zone` | string | No | — | IANA timezone string (e.g. `"Europe/London"`)
| `hidden` | boolean | No | `false` | Hide from the public booking page
| `requires_confirmation` | boolean | No | `false` | Host must approve each booking
| `minimum_booking_notice` | integer | No | `120` | Minimum advance notice in minutes
| `before_event_buffer` | integer | No | `0` | Buffer before event in minutes
| `after_event_buffer` | integer | No | `0` | Buffer after event in minutes
| `slot_interval` | integer | No | `null` | Override slot cadence in minutes
| `seats_per_time_slot` | integer | No | `null` | For group events
| `disable_guests` | boolean | No | `false` | Prevent attendees from adding guests
| `disable_cancelling` | boolean | No | `false` | Prevent attendees from cancelling
| `disable_rescheduling` | boolean | No | `false` | Prevent attendees from rescheduling
| `period_type` | string | No | `"unlimited"` | `unlimited`, `rolling`, or `range`
| `period_days` | integer | No | `null` | Number of days ahead (for `rolling` period)
| `period_start_date` | string | No | `null` | ISO date — start of bookable range (for `range` period)
| `period_end_date` | string | No | `null` | ISO date — end of bookable range (for `range` period)
| `success_redirect_url` | string | No | `null` | Redirect URL after booking
| `event_color` | string | No | — | Hex color string (e.g. `"#7E2DF3"`)
| `event_name` | string | No | `null` | Custom booking title template
| `locations` | array | No | — | List of location objects (e.g. `[{"type": "zoom"}]`)
| `booking_fields` | array | No | `[]` | Custom form fields for the booking page
| `layouts` | array | No | `["month"]` | Booking-page layout options
| `default_layout` | string | No | `"month"` | Default booking-page layout
| `recurring_event` | object | No | `null` | Recurring event configuration
| `initial_hosts` | array | No | `[]` | Host user IDs to attach
| `use_common_schedule` | boolean | No | `null` | When `true`, all hosts use the event-level `schedule_id`
| `metadata` | object | No | `null` | Arbitrary metadata dict 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/event-types" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"title": "Intro call",

"slug": "intro-call",

"length": 30,

"description": "A 30-minute introduction call.",

"scheduling_type": "round_robin",

"schedule_id": 7,

"time_zone": "Europe/London",

"hidden": false,

"requires_confirmation": false,

"minimum_booking_notice": 120,

"before_event_buffer": 0,

"after_event_buffer": 0,

"locations": [{"type": "zoom"}],

"event_color": "#7E2DF3"

}'
```

#### Response 

```

{ "data": { "id": 42, "title": "Intro call", "slug": "intro-call", "length": 30 } }
```

### Update Event Type 
`PATCH /appointments/event-types/{event_type_id}` 
Partially update an event type. Only the fields you send are changed (`exclude_unset` semantics). Same fields as create, all optional. 

#### Path Parameters 
| Parameter | Type | Description
| `event_type_id` | integer | Event type ID 

#### Example  

-   cURL     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/appointments/event-types/42" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"title": "Updated Intro Call", "length": 45}'
```

#### Response 

```

{ "data": { "id": 42, "title": "Updated Intro Call", "length": 45 } }
```

Returns `400` when the body is empty, `403` when the event type belongs to another user, `409` on slug collision.  

### Delete Event Type 
`DELETE /appointments/event-types/{event_type_id}` 
Delete an event type. Returns `403` when the caller is not the host/owner. 

#### Path Parameters 
| Parameter | Type | Description
| `event_type_id` | integer | Event type ID 

#### Example  

-   cURL     

Terminal window
```

curl -X DELETE "https://be.graph8.com/api/v1/appointments/event-types/42" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": { "deleted": true, "event_type_id": 42 } }
```

### Duplicate Event Type 
`POST /appointments/event-types/{event_type_id}/duplicate` → `201` 
Duplicate an event type. Generates a unique `{slug}-copy` slug and copies all hosts verbatim. 

#### Path Parameters 
| Parameter | Type | Description
| `event_type_id` | integer | Event type ID to duplicate 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/event-types/42/duplicate" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": { "id": 43, "title": "Intro call", "slug": "intro-call-copy", "length": 30 } }
```

## Bookings 

### List Bookings 
`GET /appointments/bookings` 
List bookings visible to the caller (their own plus event types they host). `is_admin` is always `false`. 

#### Query Parameters 
| Parameter | Type | Default | Description
| `status` | string | — | Filter by status: `accepted`, `pending`, `cancelled`, or `rejected`
| `event_type_id` | integer | — | Filter by event type
| `after_start` | string | — | ISO datetime — return bookings starting after this time
| `before_end` | string | — | ISO datetime — return bookings ending before this time
| `attendee_email` | string | — | Filter by attendee email
| `sort_by` | string | `start_time` | Sort field: `start_time`, `end_time`, `created_at`, or `status`
| `sort_order` | string | `desc` | `asc` or `desc`
| `skip` | integer | `0` | Number of records to skip
| `take` | integer | `20` | Number of records to return (max `100`) 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/bookings?status=accepted&take=20" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{

"data": [

{

"id": 1,

"uid": "uuid",

"title": "Intro call with Jane Doe",

"start_time": "2026-09-01T09:00:00Z",

"end_time": "2026-09-01T09:30:00Z",

"status": "accepted",

"location": "zoom",

"event_type": { "id": 42, "title": "Intro call", "slug": "intro-call", "length": 30 },

"attendees": [{ "id": 1, "email": "[email protected]", "name": "Jane Doe", "no_show": false }],

"sequence_id": null,

"sequence_name": null,

"from_reschedule": null,

"created_at": "2026-08-15T12:00:00Z"

}

],

"pagination": { "page": 1, "limit": 20, "total": 1, "has_next": false }

}
```

### Get Booking Detail 
`GET /appointments/bookings/{booking_uid}` 
Full booking detail including `description`, `responses`, `meeting_url`, `references`, `internal_notes`, `recurring_event_id`, `cancellation_reason`, `rejection_reason`, `no_show_host`, and `rating`. 

#### Path Parameters 
| Parameter | Type | Description
| `booking_uid` | string | Booking UUID 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/bookings/some-booking-uuid" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": { "id": 1, "uid": "some-booking-uuid", "title": "Intro call", "status": "accepted", "meeting_url": "https://zoom.us/j/...", "description": null, "internal_notes": [] } }
```

### Create Booking 
`POST /appointments/bookings` → `201` 
Book an appointment. Charges ~20 credits. Requires an active subscription (`402` if lapsed). Returns `409` on slot conflict. 

#### Request Body 
| Field | Type | Required | Description
| `event_type_id` | integer | Yes | Event type to book
| `start_time` | string | Yes | ISO-8601 UTC start time (e.g. `"2026-09-01T09:00:00Z"`)
| `attendees` | array | Yes | At least one attendee object with `name`, `email`, and `time_zone`
| `location` | string | No | Location key (e.g. `"zoom"`)
| `responses` | object | No | Answers to custom `booking_fields`
| `guests` | array | No | Additional email addresses to invite
| `metadata` | object | No | Arbitrary metadata
| `slot_uid` | string | No | Pre-reserved slot UID 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/bookings" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"event_type_id": 42,

"start_time": "2026-09-01T09:00:00Z",

"attendees": [

{ "name": "Jane Doe", "email": "[email protected]", "time_zone": "America/New_York" }

],

"location": "zoom",

"guests": ["[email protected]"]

}'
```

#### Response 

```

{ "data": { "id": 1, "uid": "new-booking-uuid", "status": "accepted", "meeting_url": "https://zoom.us/j/..." } }
```

### Cancel Booking 
`POST /appointments/bookings/{booking_uid}/cancel` 
Cancel a booking. The request body is optional. 

#### Path Parameters 
| Parameter | Type | Description
| `booking_uid` | string | Booking UUID 

#### Request Body 
| Field | Type | Required | Description
| `cancellation_reason` | string | No | Reason message sent to attendees
| `cancel_subsequent` | boolean | No | For recurring bookings, cancel all following occurrences 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/bookings/some-booking-uuid/cancel" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"cancellation_reason": "Scheduling conflict", "cancel_subsequent": false}'
```

#### Response 

```

{ "data": { "id": 1, "uid": "some-booking-uuid", "status": "cancelled" } }
```

### Reschedule Booking 
`POST /appointments/bookings/{booking_uid}/reschedule` → `201` 
Reschedule a booking to a new time. Free — no credit charge. 

#### Path Parameters 
| Parameter | Type | Description
| `booking_uid` | string | Booking UUID of the original booking 

#### Request Body 
| Field | Type | Required | Description
| `start_time` | string | Yes | New ISO-8601 UTC start time
| `rescheduling_reason` | string | No | Reason for rescheduling 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/bookings/some-booking-uuid/reschedule" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"start_time": "2026-09-02T10:00:00Z", "rescheduling_reason": "Earlier slot available"}'
```

#### Response 
Returns a new booking row representing the rescheduled appointment. 

```

{ "data": { "id": 2, "uid": "new-rescheduled-uuid", "status": "accepted", "start_time": "2026-09-02T10:00:00Z" } }
```

### Booking Insights 
`GET /appointments/bookings/insights` 
Aggregated booking insights (counts, show/no-show rates, per-event-type breakdown) for the caller’s org. 

#### Query Parameters 
| Parameter | Type | Default | Description
| `date_from` | string | — | ISO date lower bound (e.g. `"2026-01-01"`)
| `date_to` | string | — | ISO date upper bound (e.g. `"2026-12-31"`)
| `event_type_ids` | string | — | Comma-separated event-type integer IDs to filter by 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/bookings/insights?date_from=2026-01-01&date_to=2026-12-31" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": { "total_bookings": 120, "accepted": 98, "cancelled": 15, "no_show_rate": 0.07 } }
```

### Confirm or Reject Booking 
`POST /appointments/bookings/{booking_uid}/confirm` 
Confirm or reject a booking that requires host approval (`requires_confirmation=true` on the event type). 

#### Path Parameters 
| Parameter | Type | Description
| `booking_uid` | string | Booking UUID 

#### Request Body 
| Field | Type | Required | Description
| `confirmed` | boolean | Yes | `true` to accept, `false` to reject
| `reason` | string | No | Message to attendee on rejection 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/bookings/some-booking-uuid/confirm" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"confirmed": true}'
```

#### Response 

```

{ "data": { "id": 1, "uid": "some-booking-uuid", "status": "accepted" } }
```

### Mark Booking Absent 
`POST /appointments/bookings/{booking_uid}/mark-absent` 
Mark the host and/or specific attendees as no-show. 

#### Path Parameters 
| Parameter | Type | Description
| `booking_uid` | string | Booking UUID 

#### Request Body 
| Field | Type | Required | Description
| `host` | boolean | No | Flag the host as absent
| `attendees` | array | No | List of attendee objects to flag; each must include `email` 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/bookings/some-booking-uuid/mark-absent" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"host": false, "attendees": [{"email": "[email protected]"}]}'
```

#### Response 

```

{ "data": { "id": 1, "uid": "some-booking-uuid", "no_show_host": false } }
```

### Change Booking Location 
`PATCH /appointments/bookings/{booking_uid}/location` 
Change the meeting location for a booked appointment and re-notify both parties. 

#### Path Parameters 
| Parameter | Type | Description
| `booking_uid` | string | Booking UUID 

#### Request Body 
| Field | Type | Required | Description
| `location` | string | Yes | Location key: `zoom`, `google_meet`, `in_person`, a custom URL, etc. 

#### Example  

-   cURL     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/appointments/bookings/some-booking-uuid/location" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"location": "google_meet"}'
```

#### Response 

```

{ "data": { "id": 1, "uid": "some-booking-uuid", "location": "google_meet" } }
```

### Request Reschedule from Attendee 
`POST /appointments/bookings/{booking_uid}/request-reschedule` 
Send a reschedule-request email to the attendee (host-side action). Does not move or cancel the original booking; the attendee reschedules via the link in the email. 

#### Path Parameters 
| Parameter | Type | Description
| `booking_uid` | string | Booking UUID 

#### Request Body 
| Field | Type | Required | Description
| `reason` | string | No | Optional message from the host included in the email 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/bookings/some-booking-uuid/request-reschedule" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"reason": "Something came up on my end."}'
```

#### Response 

```

{ "data": { "id": 1, "uid": "some-booking-uuid", "status": "accepted" } }
```

### Add Guests to Booking 
`POST /appointments/bookings/{booking_uid}/guests` 
Invite additional guests (email addresses) to an existing booking. Sends notification emails. 

#### Path Parameters 
| Parameter | Type | Description
| `booking_uid` | string | Booking UUID 

#### Request Body 
| Field | Type | Required | Description
| `guests` | array | Yes | List of email address strings to invite 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/bookings/some-booking-uuid/guests" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"guests": ["[email protected]", "[email protected]"]}'
```

#### Response 

```

{ "data": { "id": 1, "uid": "some-booking-uuid", "status": "accepted" } }
```

### Add Internal Note to Booking 
`POST /appointments/bookings/{booking_uid}/notes` → `201` 
Append an internal (host-only) note to a booking. Not visible to attendees. 

#### Path Parameters 
| Parameter | Type | Description
| `booking_uid` | string | Booking UUID 

#### Request Body 
| Field | Type | Required | Description
| `text` | string | Yes | Note body text 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/bookings/some-booking-uuid/notes" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"text": "Spoke about Q3 budget."}'
```

#### Response 

```

{

"data": {

"id": 1,

"text": "Spoke about Q3 budget.",

"created_by_id": 7,

"created_by_name": "Jane",

"created_at": "2026-09-01T09:35:00Z"

}

}
```

### Associate Booking with Sequence 
`PATCH /appointments/bookings/{booking_uid}/sequence` 
Associate a booking with a sequencer sequence, or remove the link by passing `null`. 

#### Path Parameters 
| Parameter | Type | Description
| `booking_uid` | string | Booking UUID 

#### Request Body 
| Field | Type | Required | Description
| `sequence_id` | string | No | Sequence UUID to link, or `null` to detach 

#### Example  

-   cURL     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/appointments/bookings/some-booking-uuid/sequence" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"sequence_id": "seq-uuid"}'
```

#### Response 

```

{ "data": { "id": 1, "uid": "some-booking-uuid", "sequence_id": "seq-uuid" } }
```

## Schedules & Availability 

`` 

### List Schedules 
`GET /appointments/schedules` 
List the caller’s availability schedules. Each item includes `id`, `name`, `time_zone`, `is_default`, `availability`, `overrides`, `created_at`, `owner_name`, and `owner_email`. 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/schedules" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": [{ "id": 7, "name": "Business Hours", "time_zone": "America/New_York", "is_default": true }] }
```

### Get Schedule Detail 
`GET /appointments/schedules/{schedule_id}` 
Full schedule detail including `linked_event_types` — the list of event types currently using this schedule. 

#### Path Parameters 
| Parameter | Type | Description
| `schedule_id` | integer | Schedule ID 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/schedules/7" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": { "id": 7, "name": "Business Hours", "time_zone": "America/New_York", "is_default": true, "linked_event_types": [{ "id": 42, "title": "Intro call" }] } }
```

### Create Schedule 
`POST /appointments/schedules` → `201` 
Create a named availability schedule. `days` is an array of weekday integers: `0` = Sunday, `1` = Monday, … `6` = Saturday. 

#### Request Body 
| Field | Type | Required | Description
| `name` | string | Yes | Schedule display name
| `time_zone` | string | Yes | IANA timezone string (e.g. `"America/New_York"`)
| `is_default` | boolean | No | Immediately set as the caller’s default schedule
| `availability` | array | No | Weekly recurring rules; defaults to Mon–Fri 09:00–17:00
| `overrides` | array | No | Date-specific override windows 
Each `availability` item: `{ "days": [1,2,3,4,5], "start_time": "09:00", "end_time": "17:00" }`. 
Each `overrides` item: `{ "date": "2026-12-25", "start_time": "00:00", "end_time": "00:00" }`. 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/schedules" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"name": "Business Hours",

"time_zone": "America/New_York",

"is_default": false,

"availability": [

{ "days": [1, 2, 3, 4, 5], "start_time": "09:00", "end_time": "17:00" }

],

"overrides": [

{ "date": "2026-12-25", "start_time": "00:00", "end_time": "00:00" }

]

}'
```

#### Response 

```

{ "data": { "id": 7, "name": "Business Hours", "time_zone": "America/New_York", "is_default": false } }
```

### Update Schedule 
`PATCH /appointments/schedules/{schedule_id}` 
Partially update a schedule. When `availability` is provided it replaces all weekly recurring rules. When `overrides` is provided it replaces all date-specific overrides. Omit a key to leave that set unchanged. 

#### Path Parameters 
| Parameter | Type | Description
| `schedule_id` | integer | Schedule ID 

#### Request Body 
All fields optional. 
| Field | Type | Description
| `name` | string | New display name
| `time_zone` | string | New IANA timezone
| `is_default` | boolean | Set as default
| `availability` | array | Replaces all weekly recurring rules
| `overrides` | array | Replaces all date-specific overrides 

#### Example  

-   cURL     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/appointments/schedules/7" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"name": "Extended Hours", "availability": [{"days": [1,2,3,4,5], "start_time": "08:00", "end_time": "18:00"}]}'
```

#### Response 

```

{ "data": { "id": 7, "name": "Extended Hours", "time_zone": "America/New_York" } }
```

### Delete Schedule 
`DELETE /appointments/schedules/{schedule_id}` 
Delete a schedule. Returns `409` when this is the caller’s last schedule (every user must keep at least one). Returns `404` when the schedule does not exist or belongs to another user. 

#### Path Parameters 
| Parameter | Type | Description
| `schedule_id` | integer | Schedule ID 

#### Example  

-   cURL     

Terminal window
```

curl -X DELETE "https://be.graph8.com/api/v1/appointments/schedules/7" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": { "deleted": true, "schedule_id": 7 } }
```

### Get Schedule Availability 
`GET /appointments/schedules/{schedule_id}/availability` 
Return the weekly recurring rules and date-specific overrides for a schedule. 

#### Path Parameters 
| Parameter | Type | Description
| `schedule_id` | integer | Schedule ID 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/schedules/7/availability" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{

"data": {

"schedule_id": 7,

"availability": [

{ "id": 1, "days": [1, 2, 3, 4, 5], "start_time": "09:00", "end_time": "17:00", "date": null }

],

"overrides": [

{ "id": 2, "days": null, "start_time": "00:00", "end_time": "00:00", "date": "2026-12-25" }

]

}

}
```

### Update Schedule Availability 
`PATCH /appointments/schedules/{schedule_id}/availability` 
Replace weekly rules and/or date overrides. At least one of `availability` or `overrides` is required (returns `400` otherwise). Omit a key to leave that set unchanged. 

#### Path Parameters 
| Parameter | Type | Description
| `schedule_id` | integer | Schedule ID 

#### Request Body 
| Field | Type | Required | Description
| `availability` | array | Conditional | Replaces all weekly recurring rules
| `overrides` | array | Conditional | Replaces all date-specific overrides (pass `[]` to clear all) 

#### Example  

-   cURL     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/appointments/schedules/7/availability" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"availability": [{ "days": [1,2,3,4,5], "start_time": "08:00", "end_time": "18:00" }],

"overrides": []

}'
```

#### Response 

```

{

"data": {

"schedule_id": 7,

"availability": [{ "id": 1, "days": [1,2,3,4,5], "start_time": "08:00", "end_time": "18:00", "date": null }],

"overrides": []

}

}
```

### Set Default Schedule 
`POST /appointments/schedules/{schedule_id}/set-default` 
Mark a schedule as the caller’s default. Used when an event type has no schedule attached. Returns `404` when the schedule does not exist or belongs to another user. 

#### Path Parameters 
| Parameter | Type | Description
| `schedule_id` | integer | Schedule ID 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/schedules/7/set-default" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": { "id": 7, "name": "Business Hours", "is_default": true } }
```

## Out of Office 

### List Out-of-Office Entries 
`GET /appointments/out-of-office` 
List the API caller’s out-of-office entries. API keys do not receive team-wide visibility. 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/out-of-office" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{

"data": [

{

"id": 1,

"uuid": "ooo-entry-uuid",

"start": "2026-08-01T04:00:00Z",

"end": "2026-08-16T04:00:00Z",

"start_date": "2026-08-01",

"end_date": "2026-08-15",

"time_zone": "America/New_York",

"notes": "Summer holiday",

"public_note": "I will be back on August 16.",

"to_user_id": null,

"to_user_name": null,

"reason": "vacation",

"conflict_count": 0,

"created_at": "2026-07-01T10:00:00Z"

}

]

}
```

### Create Out-of-Office Entry 
`POST /appointments/out-of-office` → `201` 
Create an out-of-office entry. While active, the caller’s slots are blocked for booking. 

#### Request Body 
| Field | Type | Required | Description
| `start` | string | Yes | Local `YYYY-MM-DD` date, or legacy ISO-8601 datetime
| `end` | string | Yes | Inclusive local `YYYY-MM-DD` date, or legacy ISO-8601 datetime
| `time_zone` | string | For local dates | IANA timezone used for the date range
| `notes` | string | No | Internal notes
| `public_note` | string | No | Message shown to public bookers while the organizer is away
| `to_user_id` | integer | No | Offer this active teammate’s public event types as an alternative
| `reason` | string | No | Free-text label (e.g. `"vacation"`) 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/out-of-office" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"start": "2026-08-01",

"end": "2026-08-15",

"time_zone": "America/New_York",

"notes": "Summer holiday",

"public_note": "I will be back on August 16.",

"to_user_id": 12,

"reason": "vacation"

}'
```

#### Response 

```

{

"data": {

"id": 1,

"uuid": "ooo-entry-uuid",

"start": "2026-08-01T04:00:00Z",

"end": "2026-08-16T04:00:00Z",

"start_date": "2026-08-01",

"end_date": "2026-08-15",

"time_zone": "America/New_York",

"notes": "Summer holiday",

"public_note": "I will be back on August 16.",

"to_user_id": 12,

"to_user_name": "Coverage Teammate",

"reason": "vacation",

"conflict_count": 1,

"created_at": "2026-07-01T10:00:00Z"

}

}
```

### Update Out-of-Office Entry 
`PATCH /appointments/out-of-office/{ooo_uuid}` 
Update dates, timezone, notes, reason, or coverage. Send `start` and `end` together when changing the date range. API keys can update only the caller’s entries.  

### Delete Out-of-Office Entry 
`DELETE /appointments/out-of-office/{ooo_uuid}` 
Delete an out-of-office entry owned by the API caller. 

#### Path Parameters 
| Parameter | Type | Description
| `ooo_uuid` | string | Out-of-office entry UUID 

#### Example  

-   cURL     

Terminal window
```

curl -X DELETE "https://be.graph8.com/api/v1/appointments/out-of-office/ooo-entry-uuid" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": { "deleted": true, "ooo_uuid": "ooo-entry-uuid" } }
```

## Routing Forms 

### List Routing Forms 
`GET /appointments/routing-forms` 
List routing forms owned by the calling user. Each item includes `response_count` (total submissions). 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/routing-forms" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": [{ "id": 3, "name": "Sales Triage", "response_count": 42 }], "pagination": { "total": 3 } }
```

### Get Routing Form Detail 
`GET /appointments/routing-forms/{form_id}` 
Full routing form detail including fields, routes, and `response_count`. Returns `404` when not found or owned by another user. 

#### Path Parameters 
| Parameter | Type | Description
| `form_id` | integer | Routing form ID 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/routing-forms/3" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": { "id": 3, "name": "Sales Triage", "fields": [], "routes": [], "response_count": 42 } }
```

### Create Routing Form 
`POST /appointments/routing-forms` → `201` 
Create a routing form with optional fields and conditional routes. 

#### Request Body 
| Field | Type | Required | Description
| `name` | string | Yes | Form display name
| `description` | string | No | Form description
| `disabled` | boolean | No | Disable the form (default `false`)
| `fields` | array | No | List of form question field objects
| `routes` | array | No | List of conditional routing rule objects 
Each `fields` item: 
| Field | Type | Required | Description
| `label` | string | Yes | Question label
| `type` | string | No | `select`, `text`, `number`, `email`, `phone`, or `textarea` (default `"select"`)
| `required` | boolean | No | Whether the field is required (default `true`)
| `identifier` | string | No | Slug used in conditions and responses; auto-generated when omitted
| `options` | array | No | Options for `select` / radio fields. Each option has `value` (required) and optionally `label` and `event_type_id`. Conditions reference fields via `field_id` = the field’s `identifier`. 
Each `routes` item: 
| Field | Type | Required | Description
| `conditions` | array | No | Conditions: `[{ "field": "company_size", "operator": "eq", "value": "sm" }]`
| `action_type` | string | No | `"redirect_event_type"` (default)
| `action_value` | string | No | Event type ID for `redirect_event_type`
| `is_fallback` | boolean | No | Designate as the catch-all route
| `position` | integer | No | Display ordering 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/routing-forms" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"name": "Sales Triage",

"description": "Route inbound leads to the right event type.",

"fields": [

{

"label": "Company size",

"type": "select",

"required": true,

"identifier": "company_size",

"options": [{ "label": "1-50", "value": "sm" }]

}

],

"routes": [

{

"conditions": [{ "field": "company_size", "operator": "eq", "value": "sm" }],

"action_type": "redirect_event_type",

"action_value": "42",

"is_fallback": false,

"position": 0

}

]

}'
```

#### Response 

```

{ "data": { "id": 3, "name": "Sales Triage", "fields": [], "routes": [], "response_count": 0 } }
```

### Update Routing Form 
`PATCH /appointments/routing-forms/{form_id}` 
Partially update a routing form. `fields` and `routes` are replaced wholesale when present. `slug` must be unique in the org (`409` on collision). 

#### Path Parameters 
| Parameter | Type | Description
| `form_id` | integer | Routing form ID 

#### Request Body 
All fields optional. 
| Field | Type | Description
| `name` | string | Form display name
| `slug` | string | URL slug — must be unique in the org
| `description` | string | Form description
| `disabled` | boolean | Enable or disable the form
| `fields` | array | Replaces all fields
| `routes` | array | Replaces all routes 

#### Example  

-   cURL     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/appointments/routing-forms/3" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"name": "Updated Sales Triage", "disabled": false}'
```

#### Response 

```

{ "data": { "id": 3, "name": "Updated Sales Triage", "disabled": false } }
```

### Delete Routing Form 
`DELETE /appointments/routing-forms/{form_id}` 
Delete a routing form permanently. Cascades to its fields and routes. 

#### Path Parameters 
| Parameter | Type | Description
| `form_id` | integer | Routing form ID 

#### Example  

-   cURL     

Terminal window
```

curl -X DELETE "https://be.graph8.com/api/v1/appointments/routing-forms/3" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": { "deleted": true, "form_id": 3 } }
```

### Duplicate Routing Form 
`POST /appointments/routing-forms/{form_id}/duplicate` → `201` 
Duplicate a routing form with all fields and routes. The copy is named `"{name} (copy)"` with a unique auto-generated slug. 

#### Path Parameters 
| Parameter | Type | Description
| `form_id` | integer | Routing form ID to duplicate 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/routing-forms/3/duplicate" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": { "id": 4, "name": "Sales Triage (copy)", "fields": [], "routes": [], "response_count": 0 } }
```

### List Routing Form Responses 
`GET /appointments/routing-forms/{form_id}/responses` 
List captured form responses. Paginated via `skip` / `take`. 

#### Path Parameters 
| Parameter | Type | Description
| `form_id` | integer | Routing form ID 

#### Query Parameters 
| Parameter | Type | Default | Description
| `skip` | integer | `0` | Number of records to skip
| `take` | integer | `50` | Number of records to return (max `500`) 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/routing-forms/3/responses?skip=0&take=50" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{

"data": {

"responses": [

{

"id": 1,

"form_id": 3,

"responses": { "company_size": "sm" },

"routed_to_event_type_id": 42,

"created_at": "2026-09-01T10:00:00Z"

}

],

"total_count": 1

},

"pagination": { "skip": 0, "take": 50, "total": 1, "has_next": false }

}
```

## Workflows 

Appointment workflows fire automated notifications (email / SMS reminders) at configurable trigger points in the booking lifecycle. 

### List Workflows 
`GET /appointments/workflows` 
List all workflows for the org. 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/workflows" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": [{ "id": 5, "name": "24h Reminder", "trigger": "before_event", "time": 1440, "is_active_on_all": true }] }
```

### Get Workflow Detail 
`GET /appointments/workflows/{workflow_id}` 
Full workflow detail including steps and linked event types. 

#### Path Parameters 
| Parameter | Type | Description
| `workflow_id` | integer | Workflow ID 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/workflows/5" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": { "id": 5, "name": "24h Reminder", "trigger": "before_event", "time": 1440, "steps": [], "linked_event_types": [] } }
```

### Create Workflow 
`POST /appointments/workflows` → `201` 
Create a workflow. 

#### Request Body 
| Field | Type | Required | Description
| `name` | string | Yes | Workflow display name
| `trigger` | string | Yes | Trigger event: `new_booking`, `before_event`, `after_event`, `booking_cancelled`, or `booking_rescheduled`
| `time` | integer | Conditional | Minutes offset — required when trigger is `before_event` or `after_event`
| `time_unit` | string | Conditional | Time unit — required when trigger is `before_event` or `after_event`
| `is_active_on_all` | boolean | No | Apply org-wide (default `false`)
| `event_type_ids` | array | No | Attach to specific event type IDs; ignored when `is_active_on_all` is `true`
| `steps` | array | Yes | At least one step object 
Each `steps` item: 
| Field | Type | Required | Description
| `action` | string | Yes | `EMAIL_HOST`, `EMAIL_ATTENDEE`, `EMAIL_ADDRESS`, `SMS_ATTENDEE`, `SMS_NUMBER`, `WHATSAPP_ATTENDEE`, or `WHATSAPP_NUMBER`
| `template` | string | No | Message template (default `"REMINDER"`)
| `email_subject` | string | No | Email subject line
| `reminder_body` | string | No | Message body
| `send_to` | string | No | Required when `action` is `EMAIL_ADDRESS`
| `sender` | string | No | Sender name or address
| `include_calendar_event` | boolean | No | Attach calendar invite (default `false`) 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/workflows" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"name": "24h Reminder",

"trigger": "before_event",

"time": 1440,

"time_unit": "minutes",

"is_active_on_all": true,

"steps": [

{

"action": "EMAIL_ATTENDEE",

"template": "REMINDER",

"email_subject": "Reminder: Your meeting is tomorrow",

"reminder_body": "See you soon.",

"include_calendar_event": false

}

]

}'
```

#### Response 

```

{ "data": { "id": 5, "name": "24h Reminder", "trigger": "before_event", "time": 1440, "is_active_on_all": true } }
```

### Update Workflow 
`PATCH /appointments/workflows/{workflow_id}` 
Partially update a workflow. Only owned workflows may be updated (`403` otherwise). When provided, `steps` replaces all steps and `event_type_ids` replaces all linked event-type attachments. 

#### Path Parameters 
| Parameter | Type | Description
| `workflow_id` | integer | Workflow ID 

#### Request Body 
All fields optional. 
| Field | Type | Description
| `name` | string | Workflow display name
| `trigger` | string | Trigger event
| `time` | integer | Minutes offset
| `time_unit` | string | Time unit
| `is_active_on_all` | boolean | Apply org-wide
| `event_type_ids` | array | Replaces all linked event type IDs
| `steps` | array | Replaces all steps 

#### Example  

-   cURL     

Terminal window
```

curl -X PATCH "https://be.graph8.com/api/v1/appointments/workflows/5" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"name": "48h Reminder", "time": 2880}'
```

#### Response 

```

{ "data": { "id": 5, "name": "48h Reminder", "trigger": "before_event", "time": 2880 } }
```

### Delete Workflow 
`DELETE /appointments/workflows/{workflow_id}` → `204` 
Delete a workflow and cancel any pending reminder rows. Only owned workflows may be deleted. 

#### Path Parameters 
| Parameter | Type | Description
| `workflow_id` | integer | Workflow ID 

#### Example  

-   cURL     

Terminal window
```

curl -X DELETE "https://be.graph8.com/api/v1/appointments/workflows/5" \

-H "Authorization: Bearer $API_KEY"
```

No response body (`204 No Content`).  

### Toggle Workflow 
`POST /appointments/workflows/{workflow_id}/toggle` 
Activate or deactivate a workflow. Only owned workflows may be toggled. Deactivating cancels all pending reminder rows. 

#### Path Parameters 
| Parameter | Type | Description
| `workflow_id` | integer | Workflow ID 

#### Request Body 
| Field | Type | Required | Description
| `active` | boolean | Yes | `true` to activate, `false` to deactivate 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/workflows/5/toggle" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"active": false}'
```

#### Response 

```

{ "data": { "id": 5, "name": "24h Reminder", "active": false } }
```

## Integrations (Calendars & Conferencing) 

```` 

### List Calendar Accounts 
`GET /appointments/calendars` 
List calendar accounts (Google Calendar, Outlook) connected to the caller’s appointments profile, each with sub-calendars and their selection state. 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/calendars" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

[

{

"credential_id": 1,

"provider": "google_calendar",

"email": "[email protected]",

"is_valid": true,

"sub_calendars": [

{

"external_id": "[email protected]",

"name": "Jane's Calendar",

"is_selected": true,

"is_primary": true,

"read_only": false

}

]

}

]
```

### Add Calendar to Conflict-Checking 
`POST /appointments/calendars/selected` → `201` 
Add a sub-calendar to the caller’s conflict-checking set. 

#### Request Body 
| Field | Type | Required | Description
| `credential_id` | integer | Yes | Calendar credential ID
| `integration` | string | Yes | Provider slug (e.g. `"google_calendar"`)
| `external_id` | string | Yes | Calendar’s external ID 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/calendars/selected" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"credential_id": 1,

"integration": "google_calendar",

"external_id": "[email protected]"

}'
```

#### Response 

```

{ "data": { "id": "...", "integration": "google_calendar", "external_id": "[email protected]", "credential_id": 1 } }
```

### Remove Calendar from Conflict-Checking 
`DELETE /appointments/calendars/selected` 
Remove a sub-calendar from conflict checking. Returns `204`, no body. 

#### Query Parameters 
| Parameter | Type | Required | Description
| `credential_id` | integer | Yes | Calendar credential ID
| `integration` | string | Yes | Provider slug
| `external_id` | string | Yes | Calendar’s external ID 

#### Example  

-   cURL     

Terminal window
```

curl -X DELETE "https://be.graph8.com/api/v1/appointments/calendars/selected?credential_id=1&integration=google_calendar&[email protected]" \

-H "Authorization: Bearer $API_KEY"
```

Returns `204 No Content`.  

### Disconnect Calendar Account 
`DELETE /appointments/calendars/{credential_id}` 
Disconnect a calendar account (best-effort token revocation plus credential row deletion). Returns `404` when not found; `403` when it belongs to another user. 

#### Path Parameters 
| Parameter | Type | Description
| `credential_id` | integer | Calendar credential ID 

#### Example  

-   cURL     

Terminal window
```

curl -X DELETE "https://be.graph8.com/api/v1/appointments/calendars/1" \

-H "Authorization: Bearer $API_KEY"
```

Returns `204 No Content`.  

### Get Destination Calendar 
`GET /appointments/calendars/destination` 
Get the destination calendar where booking events are pushed. Returns `{"data": null}` when none is configured. 

#### Query Parameters 
| Parameter | Type | Default | Description
| `event_type_id` | integer | — | When provided, returns the event-type-specific override with fallback to the user-level default 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/calendars/destination" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{

"data": {

"id": 5,

"integration": "google_calendar",

"external_id": "[email protected]",

"credential_id": 1,

"event_type_id": null,

"primary_email": "[email protected]"

}

}
```

### Set Destination Calendar 
`PUT /appointments/calendars/destination` 
Set (upsert) the destination calendar where booking events are pushed. Optionally scope to a specific event type. 

#### Request Body 
| Field | Type | Required | Description
| `integration` | string | Yes | Provider slug (e.g. `"google_calendar"`)
| `external_id` | string | Yes | Calendar’s external ID
| `credential_id` | integer | No | Credential ID
| `event_type_id` | integer | No | Event-type-scoped override; `null` sets the user-level default 

#### Example  

-   cURL     

Terminal window
```

curl -X PUT "https://be.graph8.com/api/v1/appointments/calendars/destination" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"integration": "google_calendar",

"external_id": "[email protected]",

"credential_id": 1,

"event_type_id": null

}'
```

#### Response 

```

{ "data": { "id": 5, "integration": "google_calendar", "external_id": "[email protected]", "credential_id": 1 } }
```

### List Conferencing Providers 
`GET /appointments/conferencing` 
List conferencing providers connected to the caller’s profile (Zoom, Google Meet, Microsoft Teams, Roam, Whereby, Jitsi). Google Meet is synthesized from an existing Google Calendar credential. 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/conferencing" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

[{ "provider": "google_meet", "name": "Google Meet", "is_default": true, "credential_id": null, "link": null }]
```

### Connect Conferencing Provider 
`POST /appointments/conferencing/connect/{provider}` → `201` 
Connect a no-OAuth / link-based conferencing provider. Supported values for `{provider}`: `google_meet`, `roam`, `roam_auto`, `whereby`, `jitsi`. Zoom and `office365_video` (Teams) are excluded — they require a browser OAuth flow.  
- `google_meet`: clears the `google_meet_suppressed` flag; requires an existing `google_calendar` credential. 
- `roam` / `whereby` / `jitsi`: creates a credential row; optional `link` is the meeting URL. 
- `roam_auto`: creates a stub credential row (no OAuth tokens).  

#### Path Parameters 
| Parameter | Type | Description
| `provider` | string | Provider slug: `google_meet`, `roam`, `roam_auto`, `whereby`, or `jitsi` 

#### Request Body 
| Field | Type | Required | Description
| `link` | string | No | Meeting URL — only relevant for `roam`, `whereby`, and `jitsi` 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/conferencing/connect/google_meet" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": { "provider": "google_meet", "status": "connected" } }
```

### Disconnect Conferencing Provider 
`DELETE /appointments/conferencing/{provider}/disconnect` 
Disconnect a conferencing provider. For `google_meet`, sets `google_meet_suppressed` and clears the default if it pointed at Meet. 

#### Path Parameters 
| Parameter | Type | Description
| `provider` | string | Provider slug 

#### Example  

-   cURL     

Terminal window
```

curl -X DELETE "https://be.graph8.com/api/v1/appointments/conferencing/google_meet/disconnect" \

-H "Authorization: Bearer $API_KEY"
```

Returns `204 No Content`.  

### Update Conferencing Provider Link 
`PUT /appointments/conferencing/{provider}/link` 
Set or update the meeting URL for a link-based provider (`roam`, `whereby`, `jitsi`). The provider must already be installed. The URL is validated against the provider’s expected URL pattern. 

#### Path Parameters 
| Parameter | Type | Description
| `provider` | string | Provider slug: `roam`, `whereby`, or `jitsi` 

#### Request Body 
| Field | Type | Required | Description
| `link` | string | Yes | Meeting URL — validated against provider’s URL pattern 

#### Example  

-   cURL     

Terminal window
```

curl -X PUT "https://be.graph8.com/api/v1/appointments/conferencing/roam/link" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"link": "https://meet.example.com/room"}'
```

#### Response 

```

{ "data": { "provider": "roam", "link": "https://meet.example.com/room" } }
```

### Get Default Conferencing Provider 
`GET /appointments/conferencing/default` 
Get the current default conferencing provider. Returns `{"data": {"provider": null}}` when none is configured. 

#### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/appointments/conferencing/default" \

-H "Authorization: Bearer $API_KEY"
```

#### Response 

```

{ "data": { "provider": "google_meet", "credential_id": null, "link": null } }
```

### Set Default Conferencing Provider 
`POST /appointments/conferencing/{provider}/default` 
Set the default conferencing provider for new meetings. For link-based providers (`roam`, `whereby`, `jitsi`) a meeting URL is required — either in the request body or stored from a prior `PUT /appointments/conferencing/{provider}/link`. 

#### Path Parameters 
| Parameter | Type | Description
| `provider` | string | Provider slug to set as default 

#### Request Body 
| Field | Type | Required | Description
| `credential_id` | integer | No | Credential ID for the provider
| `link` | string | No | Meeting URL — required for link-based providers if not already set 

#### Example  

-   cURL     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/appointments/conferencing/zoom/default" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{"credential_id": 5}'
```

#### Response 

```

{ "data": { "provider": "zoom", "credential_id": 5, "link": null } }
```
