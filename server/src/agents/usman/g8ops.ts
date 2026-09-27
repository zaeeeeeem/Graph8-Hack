/** graph8 calls Usman makes (U-T1, U-T3, U-T6, Edit PATCH). Shapes from docs/graph8-openapi.json. */
import { env } from '../../lib/env';
import { g8 } from '../../lib/g8';
import type { JsonObject, LeadRow, WorkspaceSettings } from '../../../../shared/types';
import { packOf, unwrap } from './util';

export const DEFAULT_MAILBOX_ID = 1; // U15
export const SALES_HOOK_FIELD = 'sales_hook';

export async function resolveMailbox(settings: WorkspaceSettings): Promise<{ id: number; email: string }> {
  const id = Number(settings.g8_mailbox_id ?? DEFAULT_MAILBOX_ID);
  if (settings.g8_mailbox_email) return { id, email: settings.g8_mailbox_email };
  const mb = unwrap<{ id: number; email: string }>(await g8.get(`/mailboxes/${id}`));
  if (!mb?.email) throw new Error(`mailbox ${id} has no email`);
  return { id, email: mb.email };
}

export function scheduleId(settings: WorkspaceSettings): string | undefined {
  return env.G8_DEMO_SCHEDULE_ID || settings.g8_schedule_id || undefined;
}

/**
 * U-T3. SAFETY: no `associated_list_id` — a list-bound sequence could pull the whole list (real prospects) on run.
 * Contacts are only ever added through g8.enrollGuarded.
 */
export async function createSequence(a: {
  name: string; mailbox: { id: number; email: string }; steps: JsonObject[]; scheduleId?: string;
}): Promise<{ id: string; status: string; warnings: string[] }> {
  const warnings: string[] = [];
  const res = unwrap<{ id: string; status: string }>(await g8.post('/sequences', {
    name: a.name,
    description: 'Built by Usman (Graphi SDR)',
    user_email: a.mailbox.email,
    finish_on_reply: true,
    send_in_same_thread: true,
    wait_for_new_contacts: false,
    sequence_kind: 'cold_outbound',
    pinned_mailbox_id: a.mailbox.id,
    steps: a.steps,
    channels: [{ channel_id: a.mailbox.id, channel_value: a.mailbox.email, channel_type: 'GMAIL' }],
  }));
  if (!res?.id) throw new Error('POST /sequences returned no id');
  if (a.scheduleId) {
    try { await g8.patch(`/sequences/${res.id}`, { schedule_id: a.scheduleId }); }
    catch (e) { warnings.push(`schedule not set (${e instanceof Error ? e.message.slice(0, 80) : 'error'})`); }
  }
  return { id: String(res.id), status: String(res.status ?? 'drafted'), warnings };
}

/** Edit: PATCH each EMAIL step's step_data (replaced wholesale, so send the full object). */
export async function patchEmailSteps(g8SequenceId: string, stepData: JsonObject[], inputType: string): Promise<number> {
  const res = unwrap<{ steps: Array<{ id: string; step_order: number; step_type: string }> }>(await g8.get(`/sequences/${g8SequenceId}/steps`));
  const emails = (res?.steps ?? []).filter((s) => String(s.step_type).toUpperCase() === 'EMAIL').sort((a, b) => a.step_order - b.step_order);
  let n = 0;
  for (let i = 0; i < emails.length && i < stepData.length; i++) {
    await g8.patch(`/sequences/${g8SequenceId}/steps/${emails[i].id}`, { step_data: stepData[i], input_type: inputType });
    n++;
  }
  return n;
}

/** U-T1 (L8 only): write Hira's hook onto each graph8 contact's `sales_hook` custom field. */
export async function setLeadContext(leads: LeadRow[]): Promise<number> {
  const fields = unwrap<Array<{ id: number; title: string; name?: string }>>(await g8.get('/fields')) ?? [];
  let col = fields.find((f) => f.title === SALES_HOOK_FIELD || f.name === SALES_HOOK_FIELD)?.id;
  if (!col) col = unwrap<{ id: number }>(await g8.post('/fields', { title: SALES_HOOK_FIELD, data_type: 'text', entity: 'contacts' }))?.id;
  if (!col) throw new Error('could not create sales_hook field');
  const rows = leads.filter((l) => l.g8_contact_id).map((l) => {
    const p = packOf(l);
    const value = [p.hook, ...p.talking_points].filter(Boolean).join(' | ').slice(0, 1000);
    return { record_id: Number(l.g8_contact_id), fields: [{ column_id: col, value }] };
  });
  if (!rows.length) return 0;
  await g8.patch('/fields/values/batch', { rows, entity: 'contacts' });
  return rows.length;
}

/** Start a drafted sequence after the first enroll. 409 while transitional is fine (already starting). */
export async function runSequence(g8SequenceId: string): Promise<void> {
  await g8.post(`/sequences/${g8SequenceId}/run`, {});
}

export async function archiveSequence(g8SequenceId: string): Promise<void> {
  await g8.post(`/sequences/${g8SequenceId}/archive`, {});
}
