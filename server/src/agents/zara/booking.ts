/**
 * Slots + booking (Z5, Z-T6).
 * Verified 07:12 PKT: GET /appointments/slots?event_type_id&start&end&time_zone → {data:{slots:{"YYYY-MM-DD":[{time, duration}]}}}.
 * GET /appointments/event-types/1/embed returns only widget styling (no public URL) → booking link comes from
 * settings.g8_booking_url (Ayesha T16) when present, otherwise the reply offers plain-text slots (BUILD-PLAN L9 fallback).
 */
import { g8 } from '../../lib/g8';
import type { WorkspaceSettings } from '../../../../shared/types';

export interface Slot { iso: string; label: string }

export function formatSlot(iso: string, timeZone: string): string {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone, timeZoneName: 'short',
    }).format(d);
  } catch {
    return d.toUTCString();
  }
}

/** Two suggested slots on different days when possible, at least `minLeadHours` out. */
export async function suggestSlots(eventTypeId: number, timeZone: string, now = new Date(), minLeadHours = 18): Promise<Slot[]> {
  const start = new Date(now.getTime() + minLeadHours * 3600_000);
  const end = new Date(now.getTime() + 8 * 86400_000);
  const r = await g8.get('/appointments/slots', {
    event_type_id: eventTypeId, start: start.toISOString(), end: end.toISOString(), time_zone: timeZone,
  });
  const byDay: Record<string, Array<{ time: string }>> = r?.data?.slots ?? r?.slots ?? {};
  const days = Object.keys(byDay).sort();
  const picks: string[] = [];
  // Prefer a late-morning/afternoon slot per day (local hour 10–16), two different days.
  for (const day of days) {
    const list = (byDay[day] ?? []).map((s) => s.time).filter((t) => Date.parse(t) >= start.getTime());
    const good = list.find((t) => { const h = localHour(t, timeZone); return h >= 10 && h <= 16; }) ?? list[0];
    if (good) picks.push(good);
    if (picks.length === 2) break;
  }
  return picks.map((iso) => ({ iso, label: formatSlot(iso, timeZone) }));
}

function localHour(iso: string, timeZone: string): number {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone }).format(new Date(iso))) % 24;
  } catch {
    return new Date(iso).getUTCHours();
  }
}

export function bookingLink(settings: WorkspaceSettings): string | null {
  const v = settings.g8_booking_url;
  return typeof v === 'string' && /^https?:\/\//.test(v) ? v : null;
}

export interface Booked { meetingId: string | null; scheduledAt: string; raw: any }

/** POST /appointments/bookings via the allowlist guard (~20 credits). Throws on 409 slot conflict. */
export async function bookMeeting(p: { eventTypeId: number; startIso: string; name: string; email: string; timeZone: string; leadId?: string }): Promise<Booked> {
  const r = await g8.bookGuarded({
    event_type_id: p.eventTypeId, start_time: new Date(p.startIso).toISOString(),
    attendees: [{ name: p.name, email: p.email, time_zone: p.timeZone }],
    metadata: { source: 'graphi-zara', ...(p.leadId ? { lead_id: p.leadId } : {}) },
  });
  const d = r?.data ?? r ?? {};
  const id = d.uid ?? d.booking_uid ?? d.id ?? d.meeting_id ?? null;
  return { meetingId: id === null ? null : String(id), scheduledAt: d.start_time ?? d.startTime ?? p.startIso, raw: d };
}
