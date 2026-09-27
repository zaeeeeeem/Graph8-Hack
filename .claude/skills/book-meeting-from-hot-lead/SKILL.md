---
name: book-meeting-from-hot-lead
description: Check real availability and book a graph8 meeting with a hot lead, or send a reply with concrete proposed times, closing the loop from interest to calendar. Use when someone asks for a meeting or shows strong intent.
---

# Book a Meeting from a Hot Lead

The moment a lead says "sure, let's talk" is the highest-leverage moment in outbound. This skill closes it: pull real availability, book the meeting directly when the lead's intent is explicit, or reply with 2-3 concrete times when it is not.

## When to use

- A reply says "happy to chat" / "send me times" / "how about next week?"
- "Book a call with <contact>"
- Tier A signal accounts from `prioritize-hot-accounts-from-signals` with a known champion

## Prerequisites

- graph8 appointments configured (an event type / schedule exists for the user).
- The lead's email (enrich first via `enrich-stale-contacts` if missing).
- Activate missing tools: `g8_tool_search("appointments")`, or call via `g8_execute`.

## Steps

1. **Get the context.** `g8_get_contact_detail` for the lead: name, company, timezone if known, and the thread that triggered this. Never book someone into the wrong timezone.
2. **Pull real availability.** `g8_appointments_get_availability` for the user's relevant event type over the next 5-7 business days. Use actual open slots; never invent times.
3. **Branch on intent clarity.**
   - **Lead proposed a time or said "book me":** confirm the slot exists in availability, then show the user: contact, date/time (in the lead's timezone), event type, and ask to proceed.
   - **Lead was open but vague:** draft a reply with 2-3 specific slots (spread across days/times) via the thread, using `g8_send_reply` after the user approves the draft. Include the scheduling link if the org prefers self-serve booking.
4. **The booking gate (hard rule).** `g8_appointments_create_booking` creates a real calendar event and emails the invitee. Book only after explicit user approval of the exact slot and attendee.
5. **Confirm both directions.** Report the booked slot, and if the booking flow does not auto-notify, send a short confirmation reply in the thread ("Booked Tue 2pm ET, invite on its way").
6. **Set the safety net.** Offer a `g8_create_task` reminder to prep for the meeting (use `call-review-and-followup` after it happens).

## Example prompts

- "Jane replied 'sure, next week works' - get something on the calendar."
- "Book a demo with the Acme CTO, afternoons only."
- "Send the TechCorp lead three times for a 30-minute intro."

## Troubleshooting

- **No availability configured:** stop and tell the user to set up an event type/schedule in graph8 appointments first.
- **Timezone unknown:** infer from company location, say the assumption out loud in the proposed times, and format times in the lead's zone.
- **Tool not visible:** `g8_tool_search("appointments")` then retry.
