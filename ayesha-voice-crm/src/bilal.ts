// ============================================================
// bilal.ts — Ayesha's silent CRM data agent
// ============================================================
// TODO: replace this whole mock block with a real @graph8/sdk
// integration once G8_API_KEY is available. Keep the function
// names and return shapes identical so nothing above this layer
// needs to change — it's a pure drop-in swap.
// ============================================================

// ── Mock Data ────────────────────────────────────────────────

export interface Client {
  name: string;
  value: number;
}

export interface Deal {
  stage: string;
  value: number;
  owner: string;
  note: string;
}

export interface Meeting {
  time: string;
  who: string;
}

const MOCK_CLIENTS: Client[] = [
  { name: 'Tesla',     value: 48000 },
  { name: 'Nvidia',   value: 32000 },
  { name: 'Stripe',   value: 24000 },
  { name: 'OpenAI',   value: 18500 },
  { name: 'ByteDance',value: 15200 },
  { name: 'Palantir', value: 12800 },
  { name: 'Coinbase', value: 11000 },
];

const MOCK_DEALS: Record<string, Deal> = {
  northwind:  { stage: 'Negotiation', value: 22000, owner: 'Bilal', note: 'proposal sent 3 days ago'  },
  acme:       { stage: 'Discovery',   value: 9000,  owner: 'Sara',  note: 'first call booked'         },
  tesla:      { stage: 'Closed Won',  value: 48000, owner: 'Ahmed', note: 'contract signed last week'  },
  nvidia:     { stage: 'Proposal',    value: 32000, owner: 'Bilal', note: 'awaiting legal review'      },
  stripe:     { stage: 'Closed Won',  value: 24000, owner: 'Sara',  note: 'renewal due in 90 days'     },
  globex:     { stage: 'Churned',     value: 0,     owner: 'Ahmed', note: 'went with competitor'       },
};

const MOCK_MEETINGS: Meeting[] = [
  { time: '10:00 AM', who: 'Tesla — quarterly business review'  },
  { time: '2:00 PM',  who: 'Northwind — renewal call'           },
  { time: '4:30 PM',  who: 'Acme Corp — discovery'              },
];

const MOCK_PIPELINE = {
  totalOpenValue: 127500,
  dealCount: 14,
  closingThisWeek: 3,
  avgDealSize: 18200,
};

// ── Functions ─────────────────────────────────────────────────

/**
 * Returns the top N clients by deal value.
 * TODO: real version → g8.deals.list({ status:'closed_won', sort:'value', order:'desc', limit })
 */
export async function getTopClients(limit = 5): Promise<Client[]> {
  return MOCK_CLIENTS.slice(0, Math.min(limit, MOCK_CLIENTS.length));
}

/**
 * Returns deal status for a given company name.
 * TODO: real version → g8.deals.list({ search: companyName, limit: 1 })
 */
export async function getDealStatus(companyName: string): Promise<Deal | null> {
  const key = companyName.toLowerCase().trim();
  return MOCK_DEALS[key] ?? null;
}

/**
 * Returns today's scheduled meetings.
 * TODO: real version → g8.meetings.list({ date: 'today' })
 */
export async function getTodaysMeetings(): Promise<Meeting[]> {
  return MOCK_MEETINGS;
}

/**
 * Returns a high-level pipeline summary.
 * TODO: real version → g8.deals.pipelines() + aggregate stats
 */
export async function getPipelineSummary() {
  return MOCK_PIPELINE;
}

/**
 * Returns recent deals that have gone quiet (no activity in N days).
 * TODO: real version → g8.deals.list({ lastActivityBefore: daysAgo(7), status:'open' })
 */
export async function getStalledDeals(staleDays = 7) {
  // TODO: replace with real graph8 call
  return [
    { name: 'Northwind', daysSinceActivity: 3, stage: 'Negotiation', value: 22000 },
    { name: 'Acme',      daysSinceActivity: 8, stage: 'Discovery',   value: 9000  },
  ].filter(d => d.daysSinceActivity >= staleDays);
}
