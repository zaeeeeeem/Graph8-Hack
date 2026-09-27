/** Supabase helpers Zara needs that the Store contract does not wrap. All via store.db (service role). */
import { store } from '../../lib/store';
import type {
  InboundSource, JsonObject, LeadEventType, EventChannel, EventDirection, LeadRow, SequenceRow, UUID,
} from '../../../../shared/types';

export async function leadByContact(workspaceId: UUID, g8ContactId: string | number | null | undefined): Promise<LeadRow | null> {
  if (g8ContactId === null || g8ContactId === undefined || g8ContactId === '') return null;
  const { data } = await store.db.from('leads').select('*')
    .eq('workspace_id', workspaceId).eq('g8_contact_id', String(g8ContactId)).limit(1);
  return (data?.[0] as LeadRow) ?? null;
}

export async function leadById(id: UUID): Promise<LeadRow | null> {
  const { data } = await store.db.from('leads').select('*').eq('id', id).limit(1);
  return (data?.[0] as LeadRow) ?? null;
}

/** Match a lead by email via lead_contacts (server-only PII table). */
export async function leadByEmail(workspaceId: UUID, email: string | null | undefined): Promise<LeadRow | null> {
  if (!email) return null;
  const { data } = await store.db.from('lead_contacts').select('lead_id')
    .eq('workspace_id', workspaceId).ilike('email', email).limit(1);
  const id = data?.[0]?.lead_id as UUID | undefined;
  return id ? leadById(id) : null;
}

export async function leadEmail(leadId: UUID): Promise<string | null> {
  const { data } = await store.db.from('lead_contacts').select('email').eq('lead_id', leadId).limit(1);
  return (data?.[0]?.email as string) ?? null;
}

export async function updateLead(id: UUID, patch: Partial<LeadRow>): Promise<void> {
  const { error } = await store.db.from('leads').update(patch).eq('id', id);
  if (error) throw new Error(`leads update failed: ${error.message}`);
}

/** Every lead at the same company (domain, else company name) — Z2 "stop whole account". */
export async function accountLeads(workspaceId: UUID, lead: LeadRow): Promise<LeadRow[]> {
  let q = store.db.from('leads').select('*').eq('workspace_id', workspaceId);
  if (lead.company_domain) q = q.eq('company_domain', lead.company_domain);
  else if (lead.company_name) q = q.eq('company_name', lead.company_name);
  else q = q.eq('id', lead.id);
  const { data } = await q;
  return (data as LeadRow[]) ?? [lead];
}

export async function sequencesByIds(ids: UUID[]): Promise<SequenceRow[]> {
  if (!ids.length) return [];
  const { data } = await store.db.from('sequences').select('*').in('id', ids);
  return (data as SequenceRow[]) ?? [];
}

export async function liveSequences(workspaceId: UUID): Promise<SequenceRow[]> {
  const { data } = await store.db.from('sequences').select('*')
    .eq('workspace_id', workspaceId).in('status', ['live', 'paused']).not('g8_sequence_id', 'is', null);
  return (data as SequenceRow[]) ?? [];
}

export async function leadsInSequence(sequenceId: UUID): Promise<LeadRow[]> {
  const { data } = await store.db.from('leads').select('*').eq('sequence_id', sequenceId);
  return (data as LeadRow[]) ?? [];
}

export async function addLeadEvent(e: {
  workspaceId: UUID; leadId: UUID; agentId?: UUID; taskId?: UUID; inboundEventId?: UUID | null;
  type: LeadEventType; channel?: EventChannel; direction?: EventDirection; summary: string; data?: JsonObject;
}): Promise<void> {
  const { error } = await store.db.from('lead_events').insert({
    workspace_id: e.workspaceId, lead_id: e.leadId, agent_id: e.agentId ?? null, task_id: e.taskId ?? null,
    inbound_event_id: e.inboundEventId ?? null, type: e.type, channel: e.channel ?? 'system',
    direction: e.direction ?? 'internal', summary: e.summary, data: e.data ?? {},
  });
  if (error) throw new Error(`lead_events insert failed: ${error.message}`);
}

/**
 * Idempotency gate (docs/SCHEMA.md §3.6): insert inbound_events on conflict do nothing.
 * Returns the new row id, or null when the key was already seen.
 */
export async function claimInbound(row: {
  workspaceId: UUID | null; source: InboundSource; eventType: string; dedupeKey: string; payload: JsonObject;
}): Promise<string | null> {
  const { data, error } = await store.db.from('inbound_events').upsert({
    workspace_id: row.workspaceId, source: row.source, event_type: row.eventType,
    dedupe_key: row.dedupeKey, payload: row.payload, status: 'received',
  }, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id');
  if (error) throw new Error(`inbound_events insert failed: ${error.message}`);
  return (data?.[0]?.id as string) ?? null;
}

export async function markInbound(id: string | number, status: 'processed' | 'ignored' | 'failed', err?: string): Promise<void> {
  await store.db.from('inbound_events')
    .update({ status, error: err ?? null, processed_at: new Date().toISOString() }).eq('id', id);
}
