// The only words, status tones and status icons the portal may use (docs/portal/03-vocabulary.md).
// Components read labels from here; never hard-code a status label in JSX.
import {
  Activity,
  Ban,
  CalendarCheck,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDollarSign,
  CirclePause,
  CirclePlay,
  CircleSlash,
  CircleX,
  Clock,
  Coins,
  Cpu,
  FileSearch,
  GitBranch,
  Hand,
  ListOrdered,
  MessageSquare,
  MessageSquareReply,
  MousePointerClick,
  Moon,
  OctagonAlert,
  PencilLine,
  Plug,
  Radio,
  Send,
  SlidersHorizontal,
  SquareSlash,
  StickyNote,
  Trophy,
  UserSearch,
  Webhook,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type {
  AgentPauseReason,
  AgentStatus,
  ApprovalKind,
  ApprovalStatus,
  Channel,
  CreditSource,
  DisqualifyReason,
  EventDirection,
  LeadEventType,
  LeadSequenceState,
  LeadStage,
  ReplyIntent,
  ReportKind,
  RunStatus,
  RunStepKind,
  RunTrigger,
  SequenceStatus,
  TaskBlockedOn,
  TaskKind,
  TaskStatus,
} from "./types";

export type Tone = "neutral" | "active" | "attention" | "success" | "danger" | "muted";

/** label + semantic token + icon (03-vocabulary.md: "label + semantic token + icon"). */
type Entry = { label: string; tone: Tone; icon: LucideIcon };

export const AGENT_STATUS: Record<AgentStatus, Entry> = {
  idle: { label: "Idle", tone: "neutral", icon: Moon },
  working: { label: "Working", tone: "active", icon: Zap },
  waiting_on_you: { label: "Waiting on you", tone: "attention", icon: Hand },
  paused: { label: "Paused", tone: "danger", icon: CirclePause },
  error: { label: "Error", tone: "danger", icon: OctagonAlert },
};

export const PAUSE_REASON: Record<AgentPauseReason, string> = {
  budget: "over budget",
  manual: "paused in Slack",
  error: "error",
};

export function agentStatusLabel(status: AgentStatus, pauseReason: AgentPauseReason | null): string {
  if (status === "paused") return `Paused · ${pauseReason ? PAUSE_REASON[pauseReason] : "paused in Slack"}`;
  return AGENT_STATUS[status].label;
}

export const TASK_STATUS: Record<TaskStatus, Entry> = {
  todo: { label: "To do", tone: "neutral", icon: Circle },
  in_progress: { label: "In progress", tone: "active", icon: CirclePlay },
  blocked: { label: "Blocked", tone: "attention", icon: CircleAlert },
  done: { label: "Done", tone: "success", icon: CircleCheck },
  failed: { label: "Failed", tone: "danger", icon: CircleX },
  cancelled: { label: "Cancelled", tone: "muted", icon: CircleSlash },
};

export const BLOCKED_ON_OWNER: Record<TaskBlockedOn, string> = {
  founder: "you",
  approval: "your decision",
  task: "another task",
  graph8: "graph8",
  connection: "an account connection",
  budget: "budget",
  lead: "the lead to reply",
};

export function taskStatusLabel(status: TaskStatus, blockedOn: TaskBlockedOn | null): string {
  if (status === "blocked" && blockedOn) return `Blocked · waiting on ${BLOCKED_ON_OWNER[blockedOn]}`;
  return TASK_STATUS[status].label;
}

export const TASK_KIND: Record<TaskKind, string> = {
  onboard: "Hire team",
  plan: "Plan",
  find_prospects: "Find prospects",
  research_leads: "Research leads",
  build_sequence: "Build sequence",
  launch_sequence: "Launch sequence",
  handle_reply: "Handle reply",
  book_meeting: "Book meeting",
  create_deal: "Create deal",
  standup: "Standup",
  answer_question: "Answer question",
  custom: "Task",
};

export const REPORT_KIND: Record<ReportKind, Entry> = {
  plan: { label: "Plan", tone: "neutral", icon: ListOrdered },
  update: { label: "Update", tone: "neutral", icon: Activity },
  handoff: { label: "Handoff", tone: "active", icon: Send },
  standup: { label: "Standup", tone: "neutral", icon: Radio },
  win: { label: "Win 🎉", tone: "success", icon: Trophy },
  alert: { label: "Alert", tone: "attention", icon: CircleAlert },
  question: { label: "Question for you", tone: "attention", icon: Hand },
  answer: { label: "Answer", tone: "neutral", icon: MessageSquareReply },
};

export const APPROVAL_STATUS: Record<ApprovalStatus, Entry> = {
  pending: { label: "Needs your decision", tone: "attention", icon: Hand },
  approved: { label: "Approved", tone: "success", icon: CircleCheck },
  rejected: { label: "Skipped", tone: "muted", icon: CircleSlash },
  edit_requested: { label: "Edit requested", tone: "attention", icon: PencilLine },
  expired: { label: "Expired", tone: "muted", icon: Clock },
  cancelled: { label: "Cancelled", tone: "muted", icon: CircleSlash },
};

export const APPROVAL_KIND: Record<ApprovalKind, string> = {
  launch_sequence: "Launch sequence",
  enroll_leads: "Enroll leads",
  send_reply: "Send reply",
  book_meeting: "Book meeting",
  budget_increase: "Raise budget",
  connect_account: "Connect account",
  custom: "Decision",
};

/** Not in 03-vocabulary.md yet; words follow its rules (decision = approval, you = founder). */
export const SEQUENCE_STATUS: Record<SequenceStatus, Entry> = {
  draft: { label: "Draft", tone: "neutral", icon: PencilLine },
  pending_approval: { label: "Waiting for your decision", tone: "attention", icon: Hand },
  live: { label: "Live", tone: "active", icon: Radio },
  paused: { label: "Paused", tone: "danger", icon: CirclePause },
  completed: { label: "Finished", tone: "success", icon: CircleCheck },
  cancelled: { label: "Cancelled", tone: "muted", icon: CircleSlash },
};

export const APPROVAL_KIND_ICON: Record<ApprovalKind, LucideIcon> = {
  launch_sequence: Send,
  enroll_leads: UserSearch,
  send_reply: MessageSquareReply,
  book_meeting: CalendarCheck,
  budget_increase: CircleDollarSign,
  connect_account: Plug,
  custom: Hand,
};

export const LEAD_STAGE: Record<LeadStage, Entry> = {
  prospect: { label: "Prospect", tone: "neutral", icon: UserSearch },
  researched: { label: "Researched", tone: "neutral", icon: FileSearch },
  queued: { label: "Queued", tone: "neutral", icon: CircleDashed },
  contacted: { label: "Contacted", tone: "active", icon: Send },
  replied: { label: "Replied", tone: "attention", icon: MessageSquareReply },
  meeting: { label: "Meeting", tone: "success", icon: CalendarCheck },
  deal: { label: "Deal", tone: "success", icon: CircleDollarSign },
  won: { label: "Won", tone: "success", icon: Trophy },
  lost: { label: "Lost", tone: "muted", icon: CircleX },
  disqualified: { label: "Disqualified", tone: "muted", icon: Ban },
};

export const CHANNEL: Record<Channel, string> = {
  email: "Email",
  linkedin: "LinkedIn",
  phone: "Call",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

export const DISQUALIFY_REASON: Record<DisqualifyReason, string> = {
  not_interested: "not interested",
  unsubscribed: "unsubscribed",
  bounced: "bounced",
  wrong_person: "wrong person",
  no_fit: "no fit",
  do_not_contact: "do not contact",
};

export function leadStageLabel(stage: LeadStage, reason: DisqualifyReason | null): string {
  if (stage === "disqualified" && reason) return `Disqualified · ${DISQUALIFY_REASON[reason]}`;
  return LEAD_STAGE[stage].label;
}

export const SEQUENCE_STATE: Record<LeadSequenceState, string> = {
  none: "—",
  queued: "Queued",
  enrolled: "In sequence",
  stopped: "Stopped (replied)",
  completed: "Sequence finished",
};

export const REPLY_INTENT: Record<ReplyIntent, string> = {
  interested: "Interested",
  question: "Has a question",
  objection: "Objection",
  not_now: "Not now",
  wrong_person: "Wrong person",
  referral: "Referred someone",
  not_interested: "Not interested",
  unsubscribe: "Unsubscribed",
  out_of_office: "Out of office",
  unknown: "Unclear",
};

/** lead_events.type → the verb shown in the timeline (03-vocabulary.md §5). */
export const LEAD_EVENT_VERB: Record<LeadEventType, string> = {
  found: "Found",
  researched: "Researched",
  enrolled: "Enrolled in sequence",
  stopped: "Outreach stopped",
  email_sent: "Email sent",
  email_opened: "Email opened",
  email_clicked: "Link clicked",
  email_bounced: "Email bounced",
  linkedin_connection_sent: "LinkedIn request sent",
  linkedin_connection_accepted: "Connected on LinkedIn",
  linkedin_message_sent: "LinkedIn message sent",
  call_placed: "Call placed",
  call_completed: "Call completed",
  voicemail_left: "Voicemail left",
  sms_sent: "SMS sent",
  reply_received: "Replied",
  reply_classified: "Reply read",
  reply_sent: "Reply sent",
  meeting_proposed: "Times proposed",
  meeting_booked: "Meeting booked",
  meeting_rescheduled: "Meeting moved",
  meeting_cancelled: "Meeting cancelled",
  meeting_no_show: "No-show",
  deal_created: "Deal opened",
  deal_stage_changed: "Deal moved",
  deal_won: "Deal won",
  deal_lost: "Deal lost",
  disqualified: "Closed out",
  note: "Note",
};

export const DIRECTION_MARK: Record<EventDirection, string> = { outbound: "→", inbound: "←", internal: "·" };

/** Icons for UI states that are not a row value. */
// --- agent runs + credit ledger (agent page) ------------------------------------

/** What woke the agent for a run ("heartbeat" evidence). `delegation` reads "Assigned by <manager>". */
export const RUN_TRIGGER: Record<RunTrigger, { label: string; icon: LucideIcon }> = {
  slack_message: { label: "Woke by a Slack message", icon: MessageSquare },
  slack_action: { label: "Woke by a Slack button", icon: MousePointerClick },
  slash_command: { label: "Woke by a slash command", icon: SquareSlash },
  cron: { label: "Woke on schedule", icon: Clock },
  webhook: { label: "Woke by a graph8 webhook", icon: Webhook },
  delegation: { label: "Assigned by the manager", icon: GitBranch },
  approval: { label: "Woke by your decision", icon: CircleCheck },
  system: { label: "Started by the system", icon: Cpu },
  manual: { label: "Started manually", icon: Hand },
};

/** portal_activity.kind — one step inside a run. */
export const RUN_STEP_KIND: Record<RunStepKind, { label: string; icon: LucideIcon }> = {
  tool: { label: "Tool call", icon: Wrench },
  llm: { label: "Model", icon: Cpu },
  slack: { label: "Slack", icon: MessageSquare },
  note: { label: "Note", icon: StickyNote },
};

export const RUN_STATUS: Record<RunStatus, Entry> = {
  running: { label: "Running", tone: "active", icon: Activity },
  succeeded: { label: "Done", tone: "success", icon: CircleCheck },
  failed: { label: "Failed", tone: "danger", icon: CircleX },
  cancelled: { label: "Cancelled", tone: "muted", icon: CircleSlash },
};

export const CREDIT_SOURCE: Record<CreditSource, { label: string; icon: LucideIcon }> = {
  graph8: { label: "graph8 credits", icon: Coins },
  llm: { label: "LLM", icon: Cpu },
  manual: { label: "Adjustment", icon: SlidersHorizontal },
};

const CREDIT_ACTION: Record<string, string> = {
  enrich_person: "Enrich person",
  enrich_company: "Enrich company",
  verify_email: "Verify email",
  ai_generate: "AI copy",
  sequence_send: "Sequence send",
  voice_minutes: "Voice minutes",
  intelligence_analyze: "Call analysis",
  llm_run: "Model run",
  adjustment: "Adjustment",
};
/** `credit_events.action` is free text server-side: unknown values fall back to a readable form. */
export const creditActionLabel = (action: string) => CREDIT_ACTION[action] ?? action.replace(/_/g, " ");

export const UI_ICON = { live: Radio, needsYou: Hand, nothingWaiting: CircleCheck, paused: CirclePause } as const;

/** `to_agent_id = null` means the founder. Missing agent (e.g. after a reseed) falls back to "Team". */
export const FOUNDER_LABEL = "you";
export const UNKNOWN_AGENT_LABEL = "Team";
