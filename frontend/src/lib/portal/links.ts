// Link-out rules — the only "actions" in the portal (docs/portal/01-data-access.md §5).
// Builders return null when an id is missing; callers hide the link (never render it disabled).

export const slackThread = (channel: string | null, ts: string | null) =>
  channel && ts ? `https://slack.com/archives/${channel}/p${ts.replace(".", "")}` : null;

export const slackChannel = (channel: string | null) => (channel ? `https://slack.com/archives/${channel}` : null);

const G8 = process.env.NEXT_PUBLIC_G8_APP_URL ?? "https://app.graph8.com";

// See docs/graph8-app-links.md. LIST pages are verified; RECORD patterns are not yet,
// so each builder falls back to the verified list page until RECORD_VERIFIED is flipped.
const RECORD_VERIFIED = { contact: false, deal: false, sequence: false, meeting: false };
const LIST = {
  contacts: `${G8}/contacts`,
  deals: `${G8}/deals/pipeline`,
  sequences: `${G8}/sequencer`,
  meetings: `${G8}/appointments?tab=bookings`,
  settings: `${G8}/studio/settings`,
};

export const g8Contact = (id: string | null) =>
  !id ? null : RECORD_VERIFIED.contact ? `${G8}/contacts/${id}` : LIST.contacts;
export const g8Deal = (id: string | null) => (!id ? null : RECORD_VERIFIED.deal ? `${G8}/deals/${id}` : LIST.deals);
export const g8Sequence = (id: string | null) =>
  !id ? null : RECORD_VERIFIED.sequence ? `${G8}/sequencer/${id}` : LIST.sequences;
export const g8Meeting = (id: string | null) =>
  !id ? null : RECORD_VERIFIED.meeting ? `${G8}/appointments/${id}` : LIST.meetings;
export const g8Settings = () => LIST.settings;
