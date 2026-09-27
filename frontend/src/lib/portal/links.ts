// Link-out rules — the only "actions" in the portal (docs/portal/01-data-access.md §5).
// Builders return null when an id is missing; callers hide the link (never render it disabled).

export const slackThread = (channel: string | null, ts: string | null) =>
  channel && ts ? `https://slack.com/archives/${channel}/p${ts.replace(".", "")}` : null;

export const slackChannel = (channel: string | null) => (channel ? `https://slack.com/archives/${channel}` : null);

const G8 = process.env.NEXT_PUBLIC_G8_APP_URL ?? "https://app.graph8.com";

// Verified on real records (27 Sep, live org). Meetings have no per-record page: the bookings list.
export const g8Contact = (id: string | number | null) => (id ? `${G8}/contacts/${id}` : null);
export const g8Deal = (id: string | number | null) => (id ? `${G8}/deals/${id}` : null);
export const g8Sequence = (id: string | null) => (id ? `${G8}/sequencer/sequence/${id}` : null); // NOT /sequences, NOT /sequencer/{id}
export const g8Meeting = (id: string | null) => (id ? `${G8}/appointments?tab=bookings` : null);
export const g8Deals = () => `${G8}/deals/pipeline`;
export const g8Settings = () => `${G8}/studio/settings`;
