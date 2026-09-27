// Compact, typed rendering of approvals.payload (docs/portal/02-screens.md §5). Payloads are jsonb
// written by the server, so every field is optional — a missing/partial payload returns null and
// the caller falls back to approvals.summary.
import type {
  BookMeetingPayload,
  BudgetIncreasePayload,
  ConnectAccountPayload,
  LaunchSequencePayload,
  SendReplyPayload,
} from "./types";
import { int } from "./format";
import { CHANNEL } from "./vocab";

export function decisionPayloadLine(kind: string, payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  switch (kind) {
    case "connect_account": {
      const p = payload as Partial<ConnectAccountPayload>;
      if (!p.account) return null;
      const steps = Array.isArray(p.blocked_steps) && p.blocked_steps.length ? ` · steps ${p.blocked_steps.join(", ")}` : "";
      return `${p.account}${steps}`;
    }
    case "launch_sequence": {
      const p = payload as Partial<LaunchSequencePayload>;
      if (p.lead_count == null) return null;
      const channels = Array.isArray(p.channels) && p.channels.length ? ` · ${p.channels.map((c) => CHANNEL[c] ?? c).join(", ")}` : "";
      const enroll = p.enroll_count != null ? ` · enrolls ${p.enroll_count}` : "";
      return `${p.lead_count} leads${channels}${enroll}`;
    }
    case "book_meeting": {
      const p = payload as Partial<BookMeetingPayload>;
      return p.slot ? `${p.event_type ?? "Meeting"} · ${p.slot}` : null;
    }
    case "budget_increase": {
      const p = payload as Partial<BudgetIncreasePayload>;
      return p.requested != null ? `${int(p.current ?? 0)} → ${int(p.requested)} credits/day${p.reason ? ` · ${p.reason}` : ""}` : null;
    }
    case "send_reply": {
      const p = payload as Partial<SendReplyPayload>;
      return p.channel ? `Reply by ${CHANNEL[p.channel] ?? p.channel}` : null;
    }
    default:
      return null;
  }
}

/** The quoted draft for send_reply decisions (only question/objection replies need you). */
export function decisionDraft(kind: string, payload: unknown): string | null {
  if (kind !== "send_reply" || !payload || typeof payload !== "object") return null;
  const d = (payload as Partial<SendReplyPayload>).draft;
  return typeof d === "string" && d.trim() ? d : null;
}
