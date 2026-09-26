<!-- https://docs.graph8.com/developers/webhooks/ -->
# Webhooks

`` 
Webhooks let you receive real-time HTTP callbacks when events occur in your organization. You can subscribe to specific event types and graph8 will POST a signed JSON payload to your endpoint.  

## Available Events 
`GET /webhooks/events` 
Returns all event types you can subscribe to, each with a category and a human-readable description — the catalog you browse to decide what to listen for. 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/webhooks/events" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [

{ "event": "campaign.launched", "category": "Campaign", "description": "A campaign was launched and is now sending." },

{ "event": "meeting.booked", "category": "Meetings", "description": "A meeting was booked." }

]

}
```

| Field | Type | Description
| `event` | string | The event type to subscribe to
| `category` | string | Grouping for the event (e.g. `Campaign`, `Engagement`)
| `description` | string | null | What the event means / when it fires 

### Event catalog 
| Event | Category | Description
| `campaign.created` | Campaign | A campaign was created.
| `campaign.updated` | Campaign | A campaign’s configuration was updated.
| `campaign.deleted` | Campaign | A campaign was deleted.
| `campaign.launched` | Campaign | A campaign was launched and is now sending.
| `campaign.paused` | Campaign | A campaign was paused.
| `campaign.completed` | Campaign | A campaign finished all of its steps.
| `campaign.status_changed` | Campaign | A campaign’s status changed.
| `document.generated` | Content | A campaign document finished generating.
| `document.failed` | Content | A campaign document failed to generate.
| `campaign.content_ready` | Content | All content for a campaign is ready.
| `intelligence.completed` | Intelligence | An intelligence/research run completed.
| `intelligence.failed` | Intelligence | An intelligence/research run failed.
| `company.enriched` | Enrichment | A company record was enriched.
| `company_intelligence.completed` | Enrichment | Company intelligence gathering completed.
| `audience.ready` | Audience | An audience finished building and is ready to use.
| `audience.failed` | Audience | An audience failed to build.
| `sequence.draft_created` | Sequence | A campaign created a Sequencer draft; nothing has started sending.
| `sequence.started` | Sequence | A sequence started running for a contact.
| `sequence.paused` | Sequence | A sequence was paused.
| `sequence.completed` | Sequence | A sequence completed all steps for a contact.
| `engagement.email_sent` | Engagement | An email was sent to a contact.
| `engagement.email_replied` | Engagement | A contact replied to an email.
| `engagement.email_bounced` | Engagement | An email to a contact bounced.
| `engagement.email_skipped` | Engagement | An email step was skipped for a contact.
| `engagement.call_dispatched` | Engagement | A call task was dispatched to the dialer.
| `engagement.sms_sent` | Engagement | An SMS was sent to a contact.
| `engagement.sms_replied` | Engagement | A contact replied to an SMS.
| `engagement.whatsapp_sent` | Engagement | A WhatsApp message was sent to a contact.
| `engagement.linkedin_connection_sent` | Engagement | A LinkedIn connection request was sent.
| `engagement.linkedin_message_sent` | Engagement | A LinkedIn message was sent.
| `engagement.linkedin_inmail_sent` | Engagement | A LinkedIn InMail was sent.
| `engagement.linkedin_reply_received` | Engagement | A LinkedIn reply was received from a contact.
| `engagement.linkedin_connection_accepted` | Engagement | A LinkedIn connection request was accepted.
| `meeting.booked` | Meetings | A meeting was booked.
| `meeting.cancelled` | Meetings | A booked meeting was cancelled.
| `meeting.rescheduled` | Meetings | A booked meeting was rescheduled.
| `engagement.email_clicked` | Engagement | A contact first clicked a tracked link in a sequence email (email-security scanner clicks are filtered out).
| `engagement.link_clicked` | Engagement | A contact first clicked a tracked link sent on a non-email channel (SMS, LinkedIn and others).
| `meeting.no_show` | Meetings | A booked meeting’s host or attendee was marked as a no-show.
| `voice_ai.call_started` | Voice AI | A Voice AI agent call was placed.
| `voice_ai.call_completed` | Voice AI | A Voice AI agent call ended, with its duration, disposition and sentiment.
| `voice_ai.voicemail_left` | Voice AI | A Voice AI agent left a voicemail.
| `engagement.call_recording_ready` | Engagement | A dialer call recording is available. Fetch it with `GET /voice/calls/{call_id}/recording`.
| `deal.created` | Deals | A deal was created.
| `deal.updated` | Deals | A deal’s fields were updated.
| `deal.stage_changed` | Deals | A deal moved to a different pipeline stage.
| `deal.deleted` | Deals | A deal was deleted.
| `quote.created` | Quotes | A quote was created.
| `quote.updated` | Quotes | A quote was updated.
| `quote.sent` | Quotes | A quote was sent to the buyer.
| `quote.resent` | Quotes | A quote was sent to the buyer again.
| `quote.resend_failed` | Quotes | Re-sending a quote to the buyer failed.
| `quote.link_generated` | Quotes | A shareable quote link was generated.
| `quote.viewed` | Quotes | The buyer opened a quote.
| `quote.accepted` | Quotes | The buyer accepted a quote.
| `quote.declined` | Quotes | The buyer declined a quote.
| `quote.expired` | Quotes | A quote passed its expiry date.
| `quote.voided` | Quotes | A quote was voided.
| `quote.superseded` | Quotes | A quote was replaced by a newer version.
| `quote.archived` | Quotes | A quote was archived.
| `quote.unarchived` | Quotes | An archived quote was restored.
| `quote.payment_received` | Quotes | A payment for a quote was received.
| `quote.payment_failed` | Quotes | A payment for a quote failed.
| `quote.subscription_canceled` | Quotes | The subscription created from a quote was canceled.
| `quote.provisioned` | Quotes | An accepted quote was provisioned.
| `form.submitted` | Website | A visitor submitted a tracked website or booking form.
| `visitor.identified` | Website | A website visitor was identified as a contact (at most once per visitor per day).
| `intent.signal` | Website | A contact showed buyer intent for one of your tracked keywords.
| `task.created` | Tasks | A task was created.
| `task.updated` | Tasks | A task was updated.
| `task.completed` | Tasks | A task was marked as completed.
| `task.deleted` | Tasks | A task was deleted.
| `enrichment.job_completed` | Enrichment | An enrichment job finished processing all of its records.
| `enrichment.job_failed` | Enrichment | An enrichment job failed.
| `workflow.execution_completed` | Workflows | A workflow run finished.
| `workflow.execution_failed` | Workflows | A workflow run failed.  

## List Webhooks 
`GET /webhooks` 
Returns all webhook subscriptions for your organization. 

### Query Parameters 
| Parameter | Type | Default | Description
| `is_active` | boolean | — | Filter by active status 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl "https://be.graph8.com/api/v1/webhooks" \

-H "Authorization: Bearer $API_KEY"
```

```

response = requests.get(

f"{BASE_URL}/webhooks",

headers=HEADERS

)
```

### Response 

```

{

"data": [

{

"id": "wh-abc",

"name": "CRM Sync",

"url": "https://example.com/webhooks/graph8",

"events": ["campaign.created", "campaign.updated"],

"is_active": true,

"secret": null,

"created_at": "2026-02-20T10:00:00",

"updated_at": "2026-02-20T10:00:00"

}

]

}
```

## Create Webhook 
`POST /webhooks` 
Create a new webhook subscription. The signing `secret` is returned only once in the response — store it securely. 
Maximum 10 active webhooks per organization. 
Returns `201 Created`. 

### Request Body 
| Field | Type | Required | Description
| `url` | string | Yes | Target URL for delivery
| `events` | string[] | Yes | Event types to subscribe to
| `name` | string | No | Human-readable name 

### Example  

-   cURL  
-   Python     

Terminal window
```

curl -X POST "https://be.graph8.com/api/v1/webhooks" \

-H "Authorization: Bearer $API_KEY" \

-H "Content-Type: application/json" \

-d '{

"url": "https://example.com/webhooks/graph8",

"events": ["campaign.created", "campaign.launched"],

"name": "CRM Sync"

}'
```

```

response = requests.post(

f"{BASE_URL}/webhooks",

headers=HEADERS,

json={

"url": "https://example.com/webhooks/graph8",

"events": ["campaign.created", "campaign.launched"],

"name": "CRM Sync"

}

)

secret = response.json()["data"]["secret"]  # Store this!
```

### Response 

```

{

"data": {

"id": "wh-abc",

"name": "CRM Sync",

"url": "https://example.com/webhooks/graph8",

"events": ["campaign.created", "campaign.launched"],

"is_active": true,

"secret": "whsec_a1b2c3d4e5f6..."

}

}
```

### Verifying Signatures 
Each delivery includes an `X-Studio-Signature` header (format: `sha256=<hex>`). Verify it with HMAC-SHA256 over `{X-Studio-Timestamp}.{raw_body}`: 

```

import hashlib, hmac

def verify_signature(body: bytes, timestamp: str, signature: str, secret: str) -> bool:

signed = f"{timestamp}.".encode() + body

expected = "sha256=" + hmac.new(

secret.encode(), signed, hashlib.sha256

).hexdigest()

return hmac.compare_digest(expected, signature)
```

## Get Webhook 
`GET /webhooks/{webhook_id}` 
Returns webhook details. The `secret` is not included in the response.  

## Update Webhook 
`PATCH /webhooks/{webhook_id}` 
Partial update — send only the fields you want to change. 

### Request Body 
| Field | Type | Description
| `url` | string | Target URL
| `events` | string[] | Event types
| `name` | string | Human-readable name
| `is_active` | boolean | Enable or disable  

## List Deliveries 
`GET /webhooks/{webhook_id}/deliveries` 
Returns delivery attempts for a webhook, with pagination. 

### Query Parameters 
| Parameter | Type | Default | Description
| `page` | integer | 1 | Page number
| `limit` | integer | 50 | Items per page (max 200)
| `status` | string | — | Filter by delivery status (`success`, `failed`, `pending`) 

### Example  

-   cURL     

Terminal window
```

curl "https://be.graph8.com/api/v1/webhooks/wh-abc/deliveries" \

-H "Authorization: Bearer $API_KEY"
```

### Response 

```

{

"data": [

{

"id": "del-1",

"event": "campaign.created",

"status": "success",

"attempts": 1,

"max_attempts": 3,

"response_code": 200,

"error_message": null,

"created_at": "2026-02-25T10:00:00",

"completed_at": "2026-02-25T10:00:01"

}

],

"pagination": {

"page": 1,

"limit": 50,

"total": 1,

"has_next": false

}

}
```

Failed deliveries are retried up to 3 times with increasing delays (10s, 60s, 300s).  

## Payload Envelope 
Every webhook delivery uses the same outer envelope: 

```

{

"event": "campaign.launched",

"timestamp": "2026-05-25T12:34:56.789000Z",

"org_id": "org_xxx123",

"data": { /* event-specific payload below */ }

}
```

## Delivery Headers 
graph8 sets the following headers on every webhook POST: 
| Header | Example | Purpose
| `Content-Type` | `application/json` | —
| `X-Studio-Signature` | `sha256=8a91...c2f4` | HMAC-SHA256 over `{timestamp}.{raw_body}`
| `X-Studio-Timestamp` | `1716624896` | Unix epoch seconds, also part of the signed message
| `X-Studio-Event` | `campaign.launched` | Quick filter without parsing body
| `X-Studio-Delivery-Id` | `del-abc-uuid` | Unique per delivery attempt (idempotency) 

## HMAC Verification 
Verify every webhook before processing. The signed message is `{X-Studio-Timestamp}.{raw_body}`. Compare against `X-Studio-Signature` using a constant-time comparator.  

-   Python  
-   Node.js     

```

import hmac, hashlib

def verify(body: bytes, timestamp: str, signature: str, secret: str) -> bool:

signed = f"{timestamp}.".encode() + body

expected = "sha256=" + hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()

return hmac.compare_digest(expected, signature)
```

```

import crypto from 'crypto';

function verify(body, timestamp, signature, secret) {

const signed = `${timestamp}.${body}`;

const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(signed).digest('hex');

return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));

}
```

The `body` here is the raw request body (bytes / string), not the parsed JSON. Parse only after the signature passes. 

## Replay Protection 
Reject deliveries where `|now - X-Studio-Timestamp| > 5 minutes` to prevent replay attacks. graph8 retries failed deliveries but never resigns — every retry carries the original timestamp. 

## Event Payload Schemas 

### `campaign.launched` 
Fires when a campaign transitions to `launched` / `active`. 

```

{

"id": "camp_abc123",

"name": "Q2 Outreach Campaign",

"slug": "q2-outreach",

"concept_slug": "saas-retargeting",

"goal": "Drive trial signups",

"target_persona": "VP Sales, B2B SaaS",

"status": "launched",

"created_at": "2026-05-20T10:00:00Z"

}
```

### `campaign.created` / `campaign.updated` / `campaign.deleted` / `campaign.paused` / `campaign.completed` 
Same shape as `campaign.launched`, with `status` reflecting the new state. 

### `company.enriched` 
Fires after a successful Apollo (or fallback provider) enrichment of a company record. 

```

{

"mashup_company_id": 12345,

"company_ext_id": "cext_xyz789",

"account_name": "Acme Corp",

"domain": "acme.com",

"fields_updated": ["phone", "industry", "headcount"],

"enriched_at": "2026-05-25T12:34:56.789000Z"

}
```

### `intelligence.completed` 
Global context or per-company intelligence generation finishes. 

```

{

"website_url": "https://acme.com",

"task_id": "task_uuid",

"status": "completed",

"success_count": 12,

"fail_count": 0,

"completed_at": "2026-05-25T12:34:56.789000Z"

}
```

### `audience.ready` / `audience.failed` 
Audience build finishes. 

```

{

"audience_id": 42,

"list_id": 637,

"platform": "meta",

"status": "ready",

"record_count": 8421

}
```

### `sequence.draft_created` 

```

{

"sequence_id": "seq_abc123",

"sequence_name": "Q2 Cold Outreach",

"campaign_id": "camp_def456",

"status": "drafted",

"steps_created": 4,

"created_at": "2026-05-25T12:34:56.789000Z"

}
```

Creating a draft does not activate the sequence or send anything. Activation is reported separately as `sequence.started`. 

### `sequence.started` / `sequence.paused` / `sequence.completed` 

```

{

"sequence_id": "seq_abc123",

"campaign_id": "camp_def456",

"contacts_completed": 247,

"completed_at": "2026-05-25T12:34:56.789000Z"

}
```

### `engagement.email_replied` (subscribers ask for this as `reply_received`) 
Fires when a reply is detected on an outbound message via AI Inbox. 

```

{

"contact_id": "contact_uuid",

"email": "[email protected]",

"reply_subject": "Re: Your Q2 offer",

"sequence_id": "seq_abc123",

"campaign_id": "camp_def456",

"replied_at": "2026-05-25T12:34:56.789000Z",

"is_positive": true

}
```

Related engagement events follow the same per-channel shape:  
- `engagement.email_sent` / `email_bounced` / `email_skipped` 
- `engagement.call_dispatched` 
- `engagement.sms_sent` / `sms_replied` 
- `engagement.whatsapp_sent` 
- `engagement.linkedin_connection_sent` / `linkedin_message_sent` / `linkedin_inmail_sent` / `linkedin_reply_received` / `linkedin_connection_accepted`  

### `meeting.booked` / `meeting.cancelled` / `meeting.rescheduled` 

```

{

"contact_id": "contact_uuid",

"email": "[email protected]",

"meeting_id": "meeting_uuid",

"meeting_title": "Discovery Call",

"scheduled_at": "2026-05-28T14:00:00Z",

"duration_minutes": 30,

"sequence_id": "seq_abc123",

"campaign_id": "camp_def456",

"booked_at": "2026-05-25T12:34:56.789000Z"

}
```

### Event data for bridged events 
Events that come from graph8’s event pipeline (engagement, meetings, deals, quotes, tasks, enrichment jobs, workflow runs, Voice AI calls, forms and visitors) deliver the producer’s message as `data`, plus `eda_event` (the internal event name), `g8_correlation` and `idempotency_key`. Each of them can also be read through `GET /events` under its `eda_event` name, with the same message (filter with `name`, `type`, `contact_id`, `since` and `cursor`). 

### `form.submitted` 
Fires once per submission of a tracked website form or booking form, after duplicate submissions from the tracker are collapsed. 

```

{

"eda_event": "form_submitted",

"form_id": "demo-request",

"form_group_id": null,

"form_kind": "web",

"url": "https://acme.com/demo",

"referrer": "https://www.google.com/",

"submitter_email": "[email protected]",

"fields": [{ "name": "email", "value": "[email protected]" }, { "name": "company", "value": "Acme" }],

"submission_id": "3f1c9a2b7d4e5f60718293a4b5c6d7e8"

}
```

### `visitor.identified` / `intent.signal` 
`visitor.identified` fires when a website visitor is matched to a contact, at most once per contact per day. `intent.signal` fires when a contact shows intent for one of your tracked keywords, at most once per contact, keyword and page per day. 

```

{

"eda_event": "visitor_identified",

"contact_id": 46699,

"company_id": 812,

"signal_type": "visitor_identified",

"signal_group": "website"

}
```

### `engagement.email_clicked` / `engagement.link_clicked` 
The first human click on a tracked link. Clicks from email-security scanners are filtered out. `email_clicked` is for sequence emails; `link_clicked` covers SMS, WhatsApp, LinkedIn and other channels. 

```

{

"eda_event": "sequence_email_clicked",

"utm_id": "AbCd1234",

"contact_id": 46699,

"campaign_id": "8f0d0b52-5a1e-4a55-9c3e-2f7d1b0c9e11",

"step_id": "step_uuid",

"channel": "email",

"sent_at": "2026-09-24T14:58:12+00:00",

"clicked_at": "2026-09-25T09:02:44+00:00",

"detected_by": "click_resolver"

}
```

Email opens are not tracked. graph8 does not put a tracking pixel in outbound mail, so there is no open event. 

### `engagement.call_recording_ready` 
A dialer call recording is available. It carries no recording URL: download the audio with `GET /voice/calls/{call_id}/recording`. The event includes that path. 

```

{

"eda_event": "sdr.recording_ready",

"call_id": "dialer_46699_sess_1790261892",

"session_id": "sess_uuid",

"contact_id": "46699",

"recording_sid": "RE0123456789abcdef",

"recording_duration_seconds": 37,

"recording_api_path": "/voice/calls/dialer_46699_sess_1790261892/recording"

}
```

### `test` 
Verification ping. Use this when first wiring a subscription to confirm signature validation works. 

```

{

"test": true,

"message": "This is a test webhook from Graph8 Studio"

}
```

## Full Event List 
For the complete catalog (campaign lifecycle, content generation, intelligence, enrichment, audience, sequence deployment, engagement per channel, meetings), call `GET /webhooks/events` — it returns the live registry. Subscribe to all events via `events: ["*"]` if you want a single firehose listener.
