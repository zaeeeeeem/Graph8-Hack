# graph8 app URL patterns (read-only research, g8-links)

Org used: "Hackathon zaeemulhassanyt" (org_f3f1e5df96e5). Workspace is fresh
("onboarding" mode) — contacts, companies, deals, sequences, meetings, lists,
campaigns are all EMPTY (0 records) via API. Only real records that exist:
inbox threads (405) and 1 mailbox. This limited what could be verified
end-to-end (list page confirmed, but record-level deep link into an existing
row could not be tested for empty object types — no row existed to click).

| Object type | URL pattern | API id used | Example | Verified | Notes |
|---|---|---|---|---|---|
| Contacts (list) | `https://app.graph8.com/contacts` | — | `https://app.graph8.com/contacts` | yes | Confirmed via Data > Contacts nav. List shows "0 to 0 of 0" (no rows). |
| Contact (record) | guessed: `https://app.graph8.com/contacts/{id}` | `contact_id` (g8_get_contact_detail) | n/a | **no** | No contact rows exist in this org to click into and confirm. Unverified. |
| Companies (list) | `https://app.graph8.com/companies` | — | `https://app.graph8.com/companies` | yes | Confirmed via Data > Companies nav. Empty (0 rows). |
| Company (record) | guessed: `https://app.graph8.com/companies/{id}` | company id (g8_search_companies) | n/a | **no** | No company rows exist. Unverified. |
| Deals (pipeline) | `https://app.graph8.com/deals/pipeline` | — | `https://app.graph8.com/deals/pipeline` | yes | Confirmed via Revenue > Deals nav. Kanban view, 0 deals. |
| Deal (record) | guessed: `https://app.graph8.com/deals/{id}` | deal id (g8_get_deals/g8_get_deal) | n/a | **no** | No deal rows exist. Unverified. |
| Sequences (list) | `https://app.graph8.com/sequencer` | — | `https://app.graph8.com/sequencer` | yes | Confirmed via Engage > Sequencer nav. "No sequences yet". |
| Sequence (record) | guessed: `https://app.graph8.com/sequences/{id}` | sequence_id (g8_list_sequences) | n/a | **no** | No sequence rows exist. Unverified — note actual list lives at `/sequencer`, not `/sequences`, so the guessed pattern's base path is already likely wrong. |
| Meetings/Appointments (list) | `https://app.graph8.com/appointments?tab=bookings` | — | same | yes | Confirmed via Engage > Appointments > Bookings. "No upcoming bookings" (0 rows). Also has `Upcoming/Unconfirmed/Recurring/Past/Canceled` sub-tabs on same base URL. |
| Meeting (record) | guessed: `https://app.graph8.com/meetings/{id}` | meeting_id (g8_list_meetings/g8_get_meeting) | n/a | **no** | No meeting rows exist; also base path in-app is `/appointments`, not `/meetings` — guessed pattern's base path is likely wrong. |
| Inbox / reply thread | `https://app.graph8.com/inbox/all?channel=email&org_id={org_id}&c={thread_id}` | thread `id` from g8_list_inbox | `https://app.graph8.com/inbox/all?channel=email&org_id=org_f3f1e5df96e5&c=010001a0dfd83115-8c1c6c50-613a-46d0-95a2-8e263a9f13e9-000000@email.amazonses.com` | **yes** | Opened a real thread from the list, clicked it, address bar `c=` param matched the same message-id-shaped string the API returns as `id`. Only fully record-level verified pattern in this pass. |
| Campaigns (list) | not found | — | — | **no** | `g8_gtm_list_campaigns` returns empty/total null; did not locate a distinct campaigns list surface separate from Sequencer/Studio in the nav during this pass. Needs follow-up. |
| Global Context | `https://app.graph8.com/studio?mode=global` | — | same | yes | Confirmed via Studio > Global. Tree-based UI (Company Info > Brand/Market/Audience/Messaging/Research/Library); individual documents (e.g. "ICPs") do NOT get their own URL/id — clicking a doc changes the left-tree selection only, address bar stays `?mode=global`. So there is no deep-linkable per-document URL here. |
| Settings / Company Profile | `https://app.graph8.com/studio/settings?tab=company` | — | same | yes | Confirmed via avatar menu > Settings > Organization > Company Profile. |
| Mailbox / connections page | `https://app.graph8.com/studio/settings?tab=mailboxes&category=personal` (list) | — | same | yes (list) | Confirmed via Settings > Channels > Mailboxes > "Personal Mailboxes" tab. Real row shown: mailbox id `1`, `zaeemulhassanyt@gmail.com`. |
| Mailbox (record) | no dedicated URL | mailbox `id` (g8_gtm_list_mailboxes) | — | partial | Clicking the mailbox row opens an "Edit Mailbox" **modal** over the list page — address bar does NOT change/add an id param. So there's no "Connect in graph8" deep-link URL for a specific mailbox; the list page URL above is as specific as it gets. Modal was closed via X without saving (no data touched). |

## Summary / handoff

- Only the **inbox thread** pattern is fully id-verified end-to-end (list id == URL id == API id).
- **Mailboxes** list URL is verified; record-level view is a modal with no unique URL.
- **Global Context** page URL is verified; it has no per-document deep link (tree/state based, not route based).
- Contacts / Companies / Deals / Sequences / Meetings: list-page URLs are verified (all real graph8 base paths, confirmed by nav clicks), but the four guessed record-level patterns in the brief could **not** be verified because this org has zero real records of those types. Two of the guessed base paths look likely wrong already (`/sequences/{id}` vs actual `/sequencer`; `/meetings/{id}` vs actual `/appointments`) — worth re-testing once real contacts/deals/sequences/meetings exist (e.g. after the team's first campaign run or CRM import), by grabbing a real id from `g8_get_contact_detail` / `g8_get_deal` / `g8_list_sequences` / `g8_get_meeting` and opening a real row in the UI to read the resulting URL.
- Campaigns list surface not located in this pass (`g8_gtm_list_campaigns` is empty and nav didn't surface a distinct "Campaigns" page separate from Sequencer/Studio) — needs another look, possibly under Engage > Sequencer > "Team Sequences" or a not-yet-found Studio sub-tab.
