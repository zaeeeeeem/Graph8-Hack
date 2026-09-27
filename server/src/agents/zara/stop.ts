/**
 * Z-T3 stop_account (Z2): pause every contact at the replying company in all our sequences, BEFORE any reply goes out.
 * Primary: POST /sequences/{sid}/contacts/{cid}/pause (in OpenAPI). Fallback (verify-core V7 / spec §7.1): pause the whole
 * sequence when it only holds this account; otherwise leave a ⚠️ note. Our own `leads.sequence_state` is always set.
 */
import { g8 } from '../../lib/g8';
import type { LeadRow, UUID } from '../../../../shared/types';
import { accountLeads, addLeadEvent, leadsInSequence, sequencesByIds, updateLead } from './db';

export interface StopResult { paused: number; alreadyStopped: number; failed: number; sequencePaused: string[]; notes: string[] }

const sameAccount = (a: LeadRow, b: LeadRow) =>
  (a.company_domain && a.company_domain === b.company_domain) || (!a.company_domain && a.company_name && a.company_name === b.company_name);

export async function stopAccount(p: {
  workspaceId: UUID; agentId: UUID; taskId?: UUID; lead: LeadRow; extraG8SequenceId?: string | null; reason: string;
}): Promise<StopResult> {
  const res: StopResult = { paused: 0, alreadyStopped: 0, failed: 0, sequencePaused: [], notes: [] };
  const leads = await accountLeads(p.workspaceId, p.lead);
  const seqRows = await sequencesByIds([...new Set(leads.map((l) => l.sequence_id).filter(Boolean) as UUID[])]);
  const g8SeqOf = new Map(seqRows.map((s) => [s.id, s.g8_sequence_id]));
  const pausedSequences = new Set<string>();

  for (const l of leads) {
    if (l.sequence_state === 'stopped') { res.alreadyStopped++; continue; }
    const targets = new Set<string>();
    const own = l.sequence_id ? g8SeqOf.get(l.sequence_id) : null;
    if (own) targets.add(own);
    if (l.id === p.lead.id && p.extraG8SequenceId) targets.add(p.extraG8SequenceId);
    if (!targets.size && l.sequence_state !== 'enrolled' && l.sequence_state !== 'queued') continue;
    let ok = true;
    if (l.g8_contact_id) {
      for (const sid of targets) {
        if (pausedSequences.has(sid)) continue;
        try {
          await g8.post(`/sequences/${sid}/contacts/${l.g8_contact_id}/pause`);
        } catch {
          // Fallback: pause the sequence itself if every lead in it belongs to this account.
          const seq = seqRows.find((s) => s.g8_sequence_id === sid);
          const members = seq ? await leadsInSequence(seq.id) : [];
          if (seq && members.length && members.every((m) => sameAccount(m, p.lead))) {
            try {
              await g8.post(`/sequences/${sid}/pause`);
              pausedSequences.add(sid);
              res.sequencePaused.push(sid);
            } catch { ok = false; }
          } else {
            ok = false;
          }
        }
      }
    }
    if (ok) res.paused++; else { res.failed++; res.notes.push(`could not pause ${l.full_name} in graph8`); }
    await updateLead(l.id, { sequence_state: 'stopped' });
    await addLeadEvent({
      workspaceId: p.workspaceId, leadId: l.id, agentId: p.agentId, taskId: p.taskId, type: 'stopped',
      summary: l.id === p.lead.id ? `Outreach stopped: ${p.reason}` : `Outreach stopped: ${p.lead.company_name ?? 'account'} replied`,
      data: { account: p.lead.company_domain ?? p.lead.company_name ?? null, g8_paused: ok },
    });
  }
  return res;
}
