/**
 * Zara — Closer (docs/agents/05-zara.md). Layer 0 + L9.
 *
 * Playbook `handle_reply`: dedupe → fetch reply text → STOP WHOLE ACCOUNT FIRST → classify → act (Z1):
 *   interested → auto in-thread reply with 2 slots + booking link (or book at once when they gave a time)
 *   out_of_office → note + re-contact date · unsubscribe → do-not-contact · not_now → polite auto reply
 *   question / objection / wrong_person / referral / not_interested / unknown → approval card [Send][Edit][Skip]
 * `meeting.booked` (webhook or our own booking) → deal in "New Meeting" → report 'win' (Ayesha posts 🎉).
 * Voice outcomes (Z11) arrive as `voice.outcome` from the voice layer (W9).
 */
import type { AgentBrain, Checklist, ChecklistItem, RunCtx } from '../contracts';
import { NotAllowlisted } from '../contracts';
import type { Channel, JsonObject, LeadRow, ReplyIntent, TaskRow, UUID } from '../../../shared/types';
import { g8 } from '../lib/g8';
import { slack } from '../lib/slack';
import { store } from '../lib/store';
import { normalize, type NormalizedMeeting, type NormalizedReply, type NormalizedVoice } from '../inbound/normalize';
import { registerInboxPoll } from '../inbound/inbox-poll';
import { classifyReply, AUTO_INTENTS, type Classification } from './zara/classify';
import { addLeadEvent, claimInbound, leadByContact, leadByEmail, leadById, leadEmail, updateLead } from './zara/db';
import { findThread, getThread, latestInbound, replyText, threadContactEmail, type InboxThread } from './zara/inbox';
import { bookingLink, bookMeeting, formatSlot, suggestSlots, type Slot } from './zara/booking';
import { draftReply, templateDraft } from './zara/draft';
import { stopAccount } from './zara/stop';
import { createDeal } from './zara/deal';
import { mapDisposition } from './zara/voice';
import { preview, scrub } from './zara/pii';
import { replyApprovalBlocks, replyStoryLine } from '../slack/cards/reply';
import { winBlocks, winText, usd } from '../slack/cards/win';

type EventCtx = Omit<RunCtx, 'task' | 'runId'> & { task?: TaskRow };
type AnyCtx = RunCtx | EventCtx;

const STAGE_ORDER = ['prospect', 'researched', 'queued', 'contacted', 'replied', 'meeting', 'deal', 'won', 'lost', 'disqualified'];
const stageAtLeast = (cur: string, target: string) => STAGE_ORDER.indexOf(cur) >= STAGE_ORDER.indexOf(target);

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
const firstName = (full: string) => (full || '').trim().split(/\s+/)[0] ?? '';

async function safeStep(ctx: AnyCtx, kind: 'tool' | 'llm' | 'slack' | 'note', name: string, summary: string, data?: JsonObject) {
  try { await ctx.step(kind, name, scrub(summary), data); } catch { /* never break the playbook on logging */ }
}

/** Live checklist in Zara's #sales-team run thread; Slack failure (or SLACK_DISABLED) degrades to no-op. */
async function openChecklist(ctx: RunCtx, title: string, items: ChecklistItem[]): Promise<Pick<Checklist, 'set' | 'add'>> {
  const noop = { set: async () => {}, add: async () => {} };
  try {
    const th = await ctx.thread();
    const cl = await slack.checklist('closer', th.channel, title, items, th.ts);
    return {
      set: async (k, s, n) => { try { await cl.set(k, s, n ? scrub(n) : n); } catch { /* ignore */ } },
      add: async (i) => { try { await cl.add(i); } catch { /* ignore */ } },
    };
  } catch {
    return noop;
  }
}

async function postInThread(ctx: RunCtx, text: string) {
  try {
    const th = await ctx.thread();
    await slack.postAs('closer', th.channel, { text: scrub(text), threadTs: th.ts });
  } catch { /* ignore */ }
}

async function workspaceInfo(workspaceId: UUID) {
  try {
    const ws = await store.workspace(workspaceId);
    return { founderName: ws.founder_name || 'The team', companyName: ws.name || ws.company_domain || '', timezone: ws.timezone || 'UTC' };
  } catch {
    return { founderName: 'The team', companyName: '', timezone: 'UTC' };
  }
}

async function resolveLead(workspaceId: UUID, contactId: string | null, email: string | null, leadId?: string | null): Promise<LeadRow | null> {
  if (leadId) { const l = await leadById(leadId); if (l) return l; }
  return (await leadByContact(workspaceId, contactId)) ?? (await leadByEmail(workspaceId, email));
}

async function isSafeToAutoSend(lead: LeadRow): Promise<boolean> {
  if (lead.do_not_contact) return false;
  if (lead.is_test_contact) return true;
  try { return await g8.isAllowlisted({ g8ContactId: lead.g8_contact_id }); } catch { return false; }
}

/** Z-T5 send_reply — always via the allowlist guard; in the same thread/channel. */
async function sendInThread(ctx: AnyCtx, lead: LeadRow, threadId: string, channel: string, body: string, subject?: string | null) {
  if (lead.do_not_contact) throw new Error('lead is do-not-contact');
  const settings = ctx.settings;
  const res = await g8.sendReplyGuarded(threadId, {
    body, channel,
    ...(channel === 'email' && subject ? { subject: /^re:/i.test(subject) ? subject : `Re: ${subject}` } : {}),
    ...(channel === 'email' && settings.g8_mailbox_email ? { from_address: settings.g8_mailbox_email } : {}),
  });
  await addLeadEvent({
    workspaceId: ctx.workspaceId, leadId: lead.id, agentId: ctx.agentId, taskId: ctx.task?.id,
    type: 'reply_sent', channel: channel as Channel, direction: 'outbound',
    summary: `Zara replied in thread: ${preview(body, 120)}`,
    data: { g8_thread_id: threadId, message_id: res?.data?.message_id ?? null },
  });
  await safeStep(ctx, 'tool', 'send_reply', `Sent in-thread ${channel} reply to ${lead.full_name}`);
  return res;
}

// ---------------------------------------------------------------------------
// meeting booked → deal → win (Z3/Z4/Z9)
// ---------------------------------------------------------------------------
async function onMeetingBooked(ctx: AnyCtx, leadIn: LeadRow, m: { meetingId: string | null; scheduledAt: string | null; source: string }): Promise<string> {
  const tz = (await workspaceInfo(ctx.workspaceId)).timezone;
  const label = m.scheduledAt ? formatSlot(m.scheduledAt, tz) : null;
  let lead = (await leadById(leadIn.id)) ?? leadIn;
  if (m.meetingId !== lead.g8_meeting_id || !lead.meeting_at) {
    await updateLead(lead.id, {
      g8_meeting_id: m.meetingId ?? lead.g8_meeting_id, meeting_at: m.scheduledAt ?? lead.meeting_at,
      ...(stageAtLeast(lead.stage, 'meeting') ? {} : { stage: 'meeting' as const }),
    });
    await addLeadEvent({
      workspaceId: ctx.workspaceId, leadId: lead.id, agentId: ctx.agentId, taskId: ctx.task?.id,
      type: 'meeting_booked', channel: 'system', direction: 'inbound',
      summary: `Discovery call booked${label ? ` for ${label}` : ''}`,
      data: { g8_meeting_id: m.meetingId, scheduled_at: m.scheduledAt, source: m.source },
    });
  }
  lead = (await leadById(lead.id)) ?? lead;
  if (lead.g8_deal_id) {
    await safeStep(ctx, 'note', 'create_deal', 'Deal already exists for this lead — skipped');
    return `Meeting recorded; deal already exists`;
  }
  const deal = await createDeal({ lead, settings: ctx.settings, agentId: ctx.agentId, workspaceId: ctx.workspaceId, taskId: ctx.task?.id });
  await updateLead(lead.id, {
    g8_deal_id: deal.dealId, deal_amount: String(deal.amount), deal_stage: deal.stageName,
    ...(stageAtLeast(lead.stage, 'deal') ? {} : { stage: 'deal' as const }),
  });
  await addLeadEvent({
    workspaceId: ctx.workspaceId, leadId: lead.id, agentId: ctx.agentId, taskId: ctx.task?.id,
    type: 'deal_created', channel: 'system', direction: 'internal',
    summary: `Deal created in ${deal.stageName}: ${usd(deal.amount)} est.`,
    data: { g8_deal_id: deal.dealId, amount: deal.amount, estimated: true, plan: deal.plan },
  });
  await safeStep(ctx, 'tool', 'create_deal', `Deal ${usd(deal.amount)} est. in ${deal.stageName}`, { g8_deal_id: deal.dealId });
  let threadUrl: string | null = null;
  if ('runId' in ctx) {
    try { const th = await ctx.thread(); threadUrl = await slack.permalink(th.channel, th.ts); } catch { /* ignore */ }
  }
  const p = { leadName: lead.full_name, company: lead.company_name, meetingLabel: label, amount: deal.amount, plan: deal.plan, stageName: deal.stageName, dealUrl: deal.url, threadUrl };
  await ctx.report('win', winText(p), `Meeting booked and deal created in graph8 (${deal.stageName}, ${usd(deal.amount)} est. — ${deal.plan}).`, {
    lead_id: lead.id, g8_deal_id: deal.dealId, amount: deal.amount, estimated: true, plan: deal.plan,
    meeting_at: m.scheduledAt, g8_url: deal.url, blocks: winBlocks(p) as unknown as JsonObject[],
  });
  return `Meeting booked; deal ${usd(deal.amount)} est. created`;
}

// ---------------------------------------------------------------------------
// handle_reply playbook
// ---------------------------------------------------------------------------
interface HandleReplyInput {
  reply: NormalizedReply;
  lead_id?: string;
  /** Voice layer: skip the classifier (callback → interested; wrong_person/referred → wrong_person). */
  forced_intent?: ReplyIntent;
  voice_summary?: string;
  inbound_event_id?: string | number;
}

async function handleReply(ctx: RunCtx): Promise<string> {
  const input = ctx.task.input as unknown as HandleReplyInput;
  const r = input.reply;
  const lead0 = await resolveLead(ctx.workspaceId, r.contactId, r.email, input.lead_id);
  if (!lead0) {
    await safeStep(ctx, 'note', 'get_reply', 'Reply from a contact we do not track — ignored');
    return 'Reply from an unknown contact — ignored';
  }
  let lead = lead0;
  const info = await workspaceInfo(ctx.workspaceId);
  const cl = await openChecklist(ctx, `Reply from ${lead.full_name}${lead.company_name ? ` (${lead.company_name})` : ''}`, [
    { key: 'read', label: 'Read the reply', state: 'doing' },
    { key: 'stop', label: 'Stop outreach to the whole account', state: 'todo' },
    { key: 'intent', label: 'Understand what they want', state: 'todo' },
    { key: 'act', label: 'Respond', state: 'todo' },
  ]);

  // 1. Z-T1 get the reply text + thread ------------------------------------------------------------
  let thread: InboxThread | null = null;
  let text = r.text ?? '';
  let messageId = r.messageId;
  const contactEmail = r.email ?? (await leadEmail(lead.id));
  if (r.replyId) thread = await getThread(r.replyId, r.channel);
  if (!thread && !input.forced_intent) {
    thread = await findThread({ sequenceId: r.sequenceId, contactId: r.contactId ?? lead.g8_contact_id, email: contactEmail, channel: r.channel });
  }
  if (thread && !text) {
    const msg = latestInbound(thread, [ctx.settings.g8_mailbox_email ?? ''], contactEmail ?? threadContactEmail(thread));
    text = replyText(msg);
    messageId = messageId ?? msg?.message_id ?? null;
  }
  if (!thread && input.forced_intent) {
    // voice follow-ups reuse the latest email thread with this contact when there is one
    thread = await findThread({ contactId: lead.g8_contact_id, email: contactEmail, channel: 'email' }).catch(() => null);
  }
  const threadId = thread?.id ?? r.replyId ?? null;
  const channel = (thread?.channel ?? r.channel ?? 'email').toLowerCase();

  // Zara-level gate: webhook + poll can both announce the same prospect message under different keys.
  if (threadId && messageId) {
    const claimed = await claimInbound({
      workspaceId: ctx.workspaceId, source: r.source === 'simulated' ? 'simulated' : 'graph8',
      eventType: 'zara.reply_handled', dedupeKey: `zara:reply:${threadId}:${messageId}`, payload: { lead_id: lead.id },
    }).catch(() => 'unknown');
    if (claimed === null) {
      await cl.set('read', 'done', 'already handled');
      return 'Duplicate reply — already handled';
    }
  }

  if (!input.forced_intent) {
    await addLeadEvent({
      workspaceId: ctx.workspaceId, leadId: lead.id, agentId: ctx.agentId, taskId: ctx.task.id,
      inboundEventId: typeof input.inbound_event_id === 'string' ? input.inbound_event_id : null,
      type: 'reply_received', channel: channel as Channel, direction: 'inbound',
      summary: text ? `Reply: "${preview(text, 140)}"` : 'Reply received (text not available yet)',
      data: { g8_thread_id: threadId, message_id: messageId, source: r.source },
    });
    if (!stageAtLeast(lead.stage, 'replied')) await updateLead(lead.id, { stage: 'replied' });
  }
  await cl.set('read', 'done', text ? `"${preview(text, 80)}"` : input.voice_summary ? 'from the call' : 'no text found');
  await safeStep(ctx, 'tool', 'get_reply', `Reply from ${lead.full_name} via ${r.source}`, { g8_thread_id: threadId });

  // 2. Z-T3 stop the whole account FIRST ------------------------------------------------------------
  await cl.set('stop', 'doing');
  try {
    const s = await stopAccount({ workspaceId: ctx.workspaceId, agentId: ctx.agentId, taskId: ctx.task.id, lead, extraG8SequenceId: r.sequenceId, reason: 'they replied' });
    await cl.set('stop', s.failed ? 'warn' : 'done', `${s.paused} paused${s.alreadyStopped ? `, ${s.alreadyStopped} already stopped` : ''}${s.failed ? `, ${s.failed} need a manual pause` : ''}`);
    await safeStep(ctx, 'tool', 'stop_account', `Paused ${s.paused} contact(s) at ${lead.company_name ?? 'the account'}`, { failed: s.failed, sequence_paused: s.sequencePaused });
  } catch (e) {
    await cl.set('stop', 'warn', 'could not pause in graph8 — check the sequence');
    await safeStep(ctx, 'note', 'stop_account', `Stop failed: ${(e as Error).message}`);
  }
  lead = (await leadById(lead.id)) ?? lead;

  // 3. Z-T2 classify ---------------------------------------------------------------------------------
  await cl.set('intent', 'doing');
  let cls: Classification;
  if (input.forced_intent) cls = { intent: input.forced_intent, summary: input.voice_summary ?? 'from call outcome' };
  else cls = await classifyReply(text || '(empty reply)', {
    agentId: ctx.agentId, workspaceId: ctx.workspaceId, taskId: ctx.task.id,
    leadName: lead.full_name, company: lead.company_name ?? undefined, timezone: info.timezone,
  });
  await updateLead(lead.id, { last_reply_intent: cls.intent });
  await addLeadEvent({
    workspaceId: ctx.workspaceId, leadId: lead.id, agentId: ctx.agentId, taskId: ctx.task.id,
    type: 'reply_classified', channel: 'system', direction: 'internal',
    summary: `Intent: ${cls.intent.replace(/_/g, ' ')}${cls.summary ? ` — ${preview(cls.summary, 100)}` : ''}`,
    data: { intent: cls.intent, proposed_time: cls.proposed_time ?? null, ooo_until: cls.ooo_until ?? null },
  });
  await cl.set('intent', 'done', cls.intent.replace(/_/g, ' ').toUpperCase());
  await safeStep(ctx, 'llm', 'classify_reply', `Intent ${cls.intent}`);

  // 4. act (Z1) ---------------------------------------------------------------------------------------
  await cl.set('act', 'doing');
  const safe = await isSafeToAutoSend(lead);
  const eventTypeId = ctx.settings.g8_event_type_id ?? 1;
  const link = bookingLink(ctx.settings);
  const draftBase = {
    replyText: text || input.voice_summary || '', firstName: firstName(lead.full_name), company: lead.company_name,
    founderName: info.founderName, companyName: info.companyName, bookingLink: link,
  };
  const llmOpts = { agentId: ctx.agentId, workspaceId: ctx.workspaceId, taskId: ctx.task.id };
  const say = (action: string) => postInThread(ctx, replyStoryLine({ leadName: lead.full_name, intent: cls.intent, action }));

  if (cls.intent === 'unsubscribe') {
    await markDoNotContact(ctx, lead, 'unsubscribed');
    await cl.set('act', 'done', 'do-not-contact, no reply sent');
    await say('marked do-not-contact, no reply');
    return `${lead.full_name}: unsubscribe → do-not-contact`;
  }

  if (cls.intent === 'out_of_office') {
    const back = cls.ooo_until ?? new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    await addLeadEvent({
      workspaceId: ctx.workspaceId, leadId: lead.id, agentId: ctx.agentId, taskId: ctx.task.id, type: 'note',
      summary: `Out of office — re-contact after ${back}`, data: { recontact_at: back, reason: 'out_of_office' },
    });
    await cl.set('act', 'done', `re-contact after ${back}`);
    await say(`paused until ${back}`);
    return `${lead.full_name}: out of office until ${back}`;
  }

  // interested — book straight away when they named a time (Z5), else 2 slots + booking link
  if (cls.intent === 'interested' && safe && cls.proposed_time && contactEmail) {
    let booked: Awaited<ReturnType<typeof bookMeeting>> | null = null;
    try {
      booked = await bookMeeting({ eventTypeId, startIso: cls.proposed_time, name: lead.full_name, email: contactEmail, timeZone: info.timezone, leadId: lead.id });
    } catch (e) {
      if (e instanceof NotAllowlisted) throw e;
      await safeStep(ctx, 'note', 'book_meeting', `Could not book the proposed time (${(e as Error).message.slice(0, 80)}) — offering slots`);
    }
    if (booked) {
      const when = formatSlot(booked.scheduledAt, info.timezone);
      try { await store.spend({ workspaceId: ctx.workspaceId, agentId: ctx.agentId, source: 'graph8', action: 'book_meeting', credits: 20, taskId: ctx.task.id, runId: ctx.runId }); } catch { /* ledger only */ }
      await safeStep(ctx, 'tool', 'book_meeting', `Booked discovery call for ${when}`, { g8_meeting_id: booked.meetingId });
      if (threadId) {
        const body = templateDraft({ ...draftBase, intent: 'booked_confirmation', bookedLabel: when });
        try { await sendInThread(ctx, lead, threadId, channel, body, thread?.subject ?? r.subject); } catch (e) {
          await safeStep(ctx, 'note', 'send_reply', `Confirmation not sent: ${(e as Error).message}`);
        }
      }
      await cl.set('act', 'done', `booked ${when}`);
      await cl.add({ key: 'deal', label: 'Create the deal in graph8', state: 'doing' });
      try {
        const summary = await onMeetingBooked(ctx, lead, { meetingId: booked.meetingId, scheduledAt: booked.scheduledAt, source: 'zara_booking' });
        await cl.set('deal', 'done', summary);
        await say(`booked ${when} · deal created`);
        return `${lead.full_name}: interested → ${summary}`;
      } catch (e) {
        await cl.set('deal', 'fail', 'graph8 deal create failed');
        throw e;
      }
    }
  }
  if (!threadId || !safe || !AUTO_INTENTS.includes(cls.intent)) {
    return requestReplyApproval(ctx, lead, cls, { ...draftBase, threadId, channel, subject: thread?.subject ?? r.subject, cl, safe });
  }

  if (cls.intent === 'not_now') {
    const body = await draftReply({ ...draftBase, intent: 'not_now' }, llmOpts);
    await sendInThread(ctx, lead, threadId, channel, body, thread?.subject ?? r.subject);
    const later = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);
    await addLeadEvent({
      workspaceId: ctx.workspaceId, leadId: lead.id, agentId: ctx.agentId, taskId: ctx.task.id, type: 'note',
      summary: `Not now — re-contact after ${later}`, data: { recontact_at: later, reason: 'not_now' },
    });
    await cl.set('act', 'done', `polite reply sent, re-contact ${later}`);
    await say('sent a polite reply, will check back later');
    return `${lead.full_name}: not now → polite reply`;
  }

  let slots: Slot[] = [];
  try { slots = await suggestSlots(eventTypeId, info.timezone); } catch { /* plain reply without slots */ }
  const body = await draftReply({ ...draftBase, intent: 'interested', slots }, llmOpts);
  await sendInThread(ctx, lead, threadId, channel, body, thread?.subject ?? r.subject);
  await addLeadEvent({
    workspaceId: ctx.workspaceId, leadId: lead.id, agentId: ctx.agentId, taskId: ctx.task.id,
    type: 'meeting_proposed', channel: channel as Channel, direction: 'outbound',
    summary: `Proposed ${slots.length} time(s)${link ? ' + booking link' : ''}`, data: { slots: slots.map((s) => s.iso), booking_link: !!link },
  });
  await cl.set('act', 'done', `sent ${slots.length} slot(s)${link ? ' + booking link' : ''}`);
  await say(`sent ${slots.length ? slots.map((s) => s.label).join(' / ') : 'a reply'}${link ? ' + booking link' : ''}`);
  return `${lead.full_name}: interested → proposed times`;
}

async function requestReplyApproval(ctx: RunCtx, lead: LeadRow, cls: Classification, p: {
  replyText: string; firstName: string; company: string | null; founderName: string; companyName: string; bookingLink: string | null;
  threadId: string | null; channel: string; subject?: string | null; cl: Pick<Checklist, 'set'>; safe: boolean; revision?: number;
}): Promise<string> {
  let slots: Slot[] = [];
  if (['question', 'objection', 'interested'].includes(cls.intent)) {
    try { slots = await suggestSlots(ctx.settings.g8_event_type_id ?? 1, (await workspaceInfo(ctx.workspaceId)).timezone); } catch { /* ignore */ }
  }
  const draft = await draftReply({ ...p, intent: cls.intent, slots }, { agentId: ctx.agentId, workspaceId: ctx.workspaceId, taskId: ctx.task.id });
  const why = !p.threadId ? 'no email thread to reply in' : !p.safe ? 'contact is not on the test allowlist — drafts only' : 'needs your call';
  const blocks = replyApprovalBlocks({ leadName: lead.full_name, company: lead.company_name, intent: cls.intent, replyPreview: preview(p.replyText, 1200), draft });
  await ctx.requestApproval('send_reply', `Reply to ${lead.full_name}${lead.company_name ? ` (${lead.company_name})` : ''}`, {
    channel: p.channel as Channel, draft, slots: slots.map((s) => s.label), g8_thread_id: p.threadId ?? undefined,
    lead_id: lead.id, intent: cls.intent, subject: p.subject ?? null, reply_preview: preview(p.replyText, 1200), revision: p.revision ?? 0,
  } as JsonObject, blocks, 'Send');
  await p.cl.set('act', 'paused', `waiting for your OK in #sales-hq (${why})`);
  await postInThread(ctx, replyStoryLine({ leadName: lead.full_name, intent: cls.intent, action: 'draft sent to #sales-hq for approval' }));
  return `${lead.full_name}: ${cls.intent} → approval requested`;
}

async function markDoNotContact(ctx: AnyCtx, lead: LeadRow, reason: 'unsubscribed' | 'do_not_contact' | 'not_interested') {
  await updateLead(lead.id, { do_not_contact: reason !== 'not_interested' ? true : lead.do_not_contact, stage: 'disqualified', disqualify_reason: reason, sequence_state: 'stopped' });
  if (reason !== 'not_interested' && lead.g8_contact_id) {
    try { await g8.post(`/contacts/${lead.g8_contact_id}/suppress`, { reason }); } catch { /* optional (Z-T9) */ }
  }
  await addLeadEvent({
    workspaceId: ctx.workspaceId, leadId: lead.id, agentId: ctx.agentId, taskId: ctx.task?.id, type: 'disqualified',
    summary: reason === 'not_interested' ? 'Not interested — outreach stopped' : 'Do-not-contact — no more outreach', data: { reason },
  });
  await safeStep(ctx, 'tool', 'mark_do_not_contact', `${lead.full_name}: ${reason}`);
}

// ---------------------------------------------------------------------------
// events → tasks
// ---------------------------------------------------------------------------
async function enqueue(workspaceId: UUID, kind: 'handle_reply' | 'create_deal' | 'book_meeting', title: string, input: JsonObject) {
  const { runtime } = await import('./runtime');
  return runtime.enqueue(workspaceId, 'closer', kind, title, input, { priority: 0 });
}

async function onReplyEvent(ctx: EventCtx, r: NormalizedReply, inboundEventId?: string | number) {
  const lead = await resolveLead(ctx.workspaceId, r.contactId, r.email);
  if (!lead) { ctx.log.info('zara: reply from untracked contact ignored', { source: r.source }); return; }
  await enqueue(ctx.workspaceId, 'handle_reply', `Handle reply from ${lead.full_name}`, {
    reply: r as unknown as JsonObject, lead_id: lead.id, ...(inboundEventId !== undefined ? { inbound_event_id: String(inboundEventId) } : {}),
  });
}

async function onMeetingEvent(ctx: EventCtx, m: NormalizedMeeting) {
  const lead = await resolveLead(ctx.workspaceId, m.contactId, m.email);
  if (!lead) { ctx.log.info('zara: meeting for untracked contact ignored'); return; }
  if (m.action === 'booked') {
    await enqueue(ctx.workspaceId, 'create_deal', `Deal for ${lead.full_name}`, { lead_id: lead.id, meeting_id: m.meetingId, scheduled_at: m.scheduledAt, source: 'meeting.booked' });
    return;
  }
  const type = m.action === 'cancelled' ? 'meeting_cancelled' : m.action === 'rescheduled' ? 'meeting_rescheduled' : 'meeting_no_show';
  if (m.action === 'rescheduled' && m.scheduledAt) await updateLead(lead.id, { meeting_at: m.scheduledAt });
  if (m.action === 'cancelled') await updateLead(lead.id, { meeting_at: null });
  await addLeadEvent({
    workspaceId: ctx.workspaceId, leadId: lead.id, agentId: ctx.agentId, type, direction: 'inbound',
    summary: `Meeting ${m.action.replace('_', '-')}${m.scheduledAt && m.action === 'rescheduled' ? ` to ${formatSlot(m.scheduledAt, 'UTC')}` : ''}`,
    data: { g8_meeting_id: m.meetingId, scheduled_at: m.scheduledAt },
  });
  if (m.action !== 'rescheduled') {
    await ctx.report('alert', `Meeting ${m.action.replace('_', '-')}: ${lead.full_name}`, `${lead.full_name}${lead.company_name ? ` (${lead.company_name})` : ''} — meeting ${m.action.replace('_', ' ')}.`, { lead_id: lead.id });
  }
}

async function onVoiceEvent(ctx: EventCtx, v: NormalizedVoice) {
  const lead = await resolveLead(ctx.workspaceId, v.contactId, null, v.leadId);
  if (!lead) return;
  const action = mapDisposition(v.disposition);
  const summary = v.summary ? preview(v.summary, 200) : undefined;
  const replyStub = (): JsonObject => ({
    kind: 'reply', eventType: 'voice.outcome', channel: 'email', contactId: lead.g8_contact_id, email: null, sequenceId: null,
    replyId: null, messageId: null, subject: null, repliedAt: null, isPositive: null, text: null, source: 'webhook',
  });
  switch (action) {
    case 'deal':
      await enqueue(ctx.workspaceId, 'create_deal', `Deal for ${lead.full_name} (call)`, { lead_id: lead.id, meeting_id: null, scheduled_at: v.scheduledAt, source: 'voice' });
      return;
    case 'propose_times':
      await enqueue(ctx.workspaceId, 'handle_reply', `Follow up call with ${lead.full_name}`, { reply: replyStub(), lead_id: lead.id, forced_intent: 'interested', voice_summary: summary ?? 'Asked for a call back' });
      return;
    case 'approval_draft':
      await enqueue(ctx.workspaceId, 'handle_reply', `Referral from call with ${lead.full_name}`, { reply: replyStub(), lead_id: lead.id, forced_intent: 'wrong_person', voice_summary: summary ?? 'Said they are not the right person' });
      return;
    case 'stop':
    case 'do_not_contact':
      await stopAccount({ workspaceId: ctx.workspaceId, agentId: ctx.agentId, lead, reason: `call outcome: ${v.disposition}` }).catch(() => undefined);
      await markDoNotContact(ctx, lead, action === 'stop' ? 'not_interested' : 'do_not_contact');
      return;
    default:
      await addLeadEvent({
        workspaceId: ctx.workspaceId, leadId: lead.id, agentId: ctx.agentId, type: 'note', channel: 'phone',
        summary: `Call outcome: ${v.disposition.replace(/_/g, ' ')}${action === 'continue' ? ' — sequence continues' : ''}`,
        data: { disposition: v.disposition, call_id: v.callId },
      });
  }
}

// ---------------------------------------------------------------------------
// brain
// ---------------------------------------------------------------------------
export const zara: AgentBrain = {
  role: 'closer',

  async run(ctx) {
    const input = ctx.task.input as Record<string, any>;
    switch (ctx.task.kind) {
      case 'handle_reply':
        return handleReply(ctx);
      case 'create_deal': {
        const lead = input.lead_id ? await leadById(input.lead_id) : null;
        if (!lead) throw new Error('create_deal: lead not found');
        const cl = await openChecklist(ctx, `Meeting booked: ${lead.full_name}`, [{ key: 'deal', label: 'Create the deal in graph8', state: 'doing' }]);
        try {
          const s = await onMeetingBooked(ctx, lead, { meetingId: input.meeting_id ?? null, scheduledAt: input.scheduled_at ?? null, source: String(input.source ?? 'meeting.booked') });
          await cl.set('deal', 'done', s);
          return s;
        } catch (e) {
          await cl.set('deal', 'fail', 'graph8 deal create failed');
          throw e;
        }
      }
      case 'book_meeting': {
        const lead = input.lead_id ? await leadById(input.lead_id) : null;
        if (!lead) throw new Error('book_meeting: lead not found');
        const email = await leadEmail(lead.id);
        if (!email || !input.start_time) throw new Error('book_meeting: need contact email and start_time');
        const info = await workspaceInfo(ctx.workspaceId);
        const booked = await bookMeeting({ eventTypeId: ctx.settings.g8_event_type_id ?? 1, startIso: input.start_time, name: lead.full_name, email, timeZone: info.timezone, leadId: lead.id });
        return onMeetingBooked(ctx, lead, { meetingId: booked.meetingId, scheduledAt: booked.scheduledAt, source: 'zara_booking' });
      }
      default:
        return `Zara has no playbook for ${ctx.task.kind}`;
    }
  },

  async onApproval(ctx, approval, decision, note) {
    if (approval.kind !== 'send_reply') return;
    const p = approval.payload as Record<string, any>;
    const lead = p.lead_id ? await leadById(p.lead_id) : null;
    if (!lead) return;
    if (decision === 'rejected') {
      await addLeadEvent({ workspaceId: ctx.workspaceId, leadId: lead.id, agentId: ctx.agentId, taskId: ctx.task.id, type: 'note', summary: 'Founder skipped the reply draft' });
      await postInThread(ctx, `⏭️ Skipped the reply to ${lead.full_name}.`);
      return;
    }
    if (decision === 'edit') {
      const info = await workspaceInfo(ctx.workspaceId);
      const draft = await draftReply({
        intent: p.intent ?? 'question', replyText: p.reply_preview ?? '', firstName: firstName(lead.full_name), company: lead.company_name,
        founderName: info.founderName, companyName: info.companyName, bookingLink: bookingLink(ctx.settings),
        slots: (p.slots ?? []).map((label: string) => ({ iso: '', label })), note: note ?? '', previousDraft: p.draft,
      }, { agentId: ctx.agentId, workspaceId: ctx.workspaceId, taskId: ctx.task.id });
      const revision = Number(p.revision ?? 0) + 1;
      const blocks = replyApprovalBlocks({ leadName: lead.full_name, company: lead.company_name, intent: p.intent ?? 'reply', replyPreview: p.reply_preview ?? '', draft, revision });
      await ctx.requestApproval('send_reply', `Reply to ${lead.full_name} (revised)`, { ...p, draft, revision } as JsonObject, blocks, 'Send');
      return;
    }
    // approved
    if (!p.g8_thread_id) {
      await postInThread(ctx, `⚠️ No email thread to reply in for ${lead.full_name} — please send it from graph8.`);
      return;
    }
    try {
      await sendInThread(ctx, lead, p.g8_thread_id, p.channel ?? 'email', p.draft, p.subject);
      await postInThread(ctx, `✅ Sent your approved reply to ${lead.full_name}.`);
    } catch (e) {
      const blocked = e instanceof NotAllowlisted;
      await postInThread(ctx, blocked ? `🛡️ Not sent: ${lead.full_name} is not on the test allowlist.` : `⚠️ Send failed for ${lead.full_name}.`);
      await ctx.report('alert', `Reply to ${lead.full_name} not sent`, blocked ? 'Blocked by the test-contact guard.' : 'graph8 send failed — check the inbox.', { lead_id: lead.id });
    }
  },

  async onEvent(ctx, type, payload) {
    const n = normalize(type, payload);
    // Unknown types: runtime already dispatches layer inbound handlers (runtime.onGraph8Event) — nothing to do here.
    if (!n) return;
    const inboundId = (payload as any)?._inbound_event_id;
    if (n.kind === 'reply') return onReplyEvent(ctx, n, inboundId);
    if (n.kind === 'meeting') return onMeetingEvent(ctx, n);
    if (n.kind === 'voice') return onVoiceEvent(ctx, n);
    if (n.kind === 'unsubscribe') {
      const lead = await resolveLead(ctx.workspaceId, n.contactId, n.email);
      if (!lead) return;
      await stopAccount({ workspaceId: ctx.workspaceId, agentId: ctx.agentId, lead, reason: 'unsubscribed' }).catch(() => undefined);
      await markDoNotContact(ctx, lead, 'unsubscribed');
    }
  },
};

// Inbox polling backup (Z8): registers the `cron.tick inbox_poll` handler once, when index.ts loads this brain.
registerInboxPoll();

export default zara;
