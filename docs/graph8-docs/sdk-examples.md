<!-- https://docs.graph8.com/developers/sdk-examples/ -->
# SDK Examples

Six worked workflows you can copy. Each one chains multiple SDK modules to do something real. See SDK overview for the full module reference, SDK FAQ for common questions. 

`` 

## 1. Prospect, enrich, save to list 
Find VPs of Engineering at SaaS companies sized 50-500, enrich them, save the qualified ones to a campaign list. 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: process.env.G8_API_KEY! });

// Search graph8's 700M+ contact index — free on both PAYG and Platform within 50 rps

const leads = await g8.enrich.search([

{ field: 'seniority_level', operator: 'any_of', value: ['VP'] },

{ field: 'job_title', operator: 'contains', value: ['Engineering'] },

{ field: 'company_industry', operator: 'contains', value: ['SaaS'] },

{ field: 'company_employee_count', operator: 'between', value: [50, 500] },

], 1, 50);

// Create a target list

const list = await g8.lists.create('Q3 VP Engineering — SaaS SMB', 'contacts');

// Save the top results into the list (each save creates the contact in your CRM)

for (const lead of leads.data) {

await g8.contacts.create({

work_email: lead.work_email!,

first_name: lead.first_name!,

last_name: lead.last_name!,

job_title: lead.job_title!,

company_domain: lead.company_domain!,

list_id: list.id,

});

}

console.log(`Saved ${leads.data.length} contacts to list ${list.id}`);
```

## 2. Multi-step sequence enrollment 
List sequences, enroll a saved list of contacts into the right one, monitor analytics. 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: process.env.G8_API_KEY! });

// Find the sequence by name

const sequences = await g8.sequences.list();

const target = sequences.find(s => s.name === 'Q3 VP Engineering Outbound');

if (!target) throw new Error('Sequence not found');

// Enroll a list (this triggers real sends — confirm before running)

await g8.sequences.add({

sequenceId: target.id,

contactIds: [5028106, 5028105, 5028104],

listId: 637,

});

// 24 hours later — check engagement

const analytics = await fetch(`/api/v1/sequences/${target.id}/analytics`, {

headers: { Authorization: `Bearer ${process.env.G8_API_KEY}` },

}).then(r => r.json());

console.log(`Sent: ${analytics.data.sent}, opened: ${analytics.data.opened}, replied: ${analytics.data.replied}`);
```

## 3. Quote-to-cash flow 
Generate a quote from a contact, send it for signature with a payment link, listen for the signed event. 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: process.env.G8_API_KEY! });

// Build the quote

const quote = await g8.quotes.create({

contact_id: 5028106,

company_id: 8821,

line_items: [

{ product_id: 'prod_platform', quantity: 1, unit_price: 499, recurring: true },

{ name: 'Onboarding (one-time)', quantity: 1, unit_price: 2500 },

],

currency: 'USD',

expires_at: '2026-07-15T00:00:00Z',

notes: 'Includes 90-day money-back guarantee.',

});

// Send for signature

await g8.quotes.send(quote.id, {

recipient_email: '[email protected]',

send_signing_link: true,

});

// Listen for the signed event

g8.webhooks.on('contact_enriched', (event) => {

// ...optional: track when the prospect engages

});
```

## 4. Inbound: form submit → intent check → priority routing 
Visitor fills out a form. SDR-route them based on company intent score. 

```

import { g8 } from '@graph8/sdk';

g8.init({ writeKey: process.env.NEXT_PUBLIC_G8_WRITE_KEY!, apiKey: process.env.G8_API_KEY });

// On submit (Next.js server action)

export async function onDemoSubmit(formData: FormData) {

const email = formData.get('work_email') as string;

const domain = email.split('@')[1];

// Upsert the contact

const contact = await g8.contacts.create({

work_email: email,

first_name: formData.get('first_name') as string,

company_domain: domain,

});

// Check intent for the company domain

const signals = await g8.signals.company(domain);

const isHotAccount = signals.intent === 'high' || signals.score >= 75;

// Route based on intent

if (isHotAccount) {

await g8.tasks.create(contact.id, {

title: `🔥 Hot inbound demo — ${signals.score} score`,

priority: 'high',

assignee_id: 'user_enterprise_ae',

due_date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),

});

} else {

// Standard nurture sequence

await g8.sequences.add({

sequenceId: 'seq_demo_nurture',

contactIds: [contact.id],

listId: 0,

});

}

}
```

## 5. Build a workflow with an LLM skill 
Author an LLM skill that qualifies leads, then bake it into a workflow triggered by form submissions. 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: process.env.G8_API_KEY! });

// 1. Author the LLM skill

const qualifySkill = await g8.skills.createLLM({

title: 'Qualify inbound lead',

description: 'Returns tier A/B/C and a reason',

prompt: `You are an SDR triaging an inbound lead.

Contact: {{contact}}

Company: {{company}}

Return JSON: {"tier": "A"|"B"|"C", "reason": "<one sentence>"}`,

model: 'claude-sonnet-4-6',

input_schema: {

fields: [

{ name: 'contact', type: 'object', required: true },

{ name: 'company', type: 'object', required: true },

],

},

});

// 2. Build the workflow

const workflow = await g8.workflows.create({

name: 'Inbound qualification + routing',

config: {

nodes: [

{ id: 'n_trigger', type: 'form_trigger', config: { form_id: 'demo_request' } },

{ id: 'n_qualify', type: 'skill', config: { skill_id: qualifySkill.id } },

{ id: 'n_branch', type: 'branch', config: { condition: '{{n_qualify.output.tier}} == "A"' } },

{ id: 'n_slack', type: 'slack_message', config: {

channel_id: 'C_alerts',

text: 'New A-tier lead: {{n_trigger.contact.work_email}} — {{n_qualify.output.reason}}',

} },

{ id: 'n_nurture', type: 'sequence_enroll', config: { sequence_id: 'seq_demo_nurture' } },

],

connections: [

{ from_node_id: 'n_trigger', to_node_id: 'n_qualify' },

{ from_node_id: 'n_qualify', to_node_id: 'n_branch' },

{ from_node_id: 'n_branch', to_node_id: 'n_slack', condition: 'true' },

{ from_node_id: 'n_branch', to_node_id: 'n_nurture', condition: 'false' },

],

},

});

// 3. Validate before activating

const { data: check } = await g8.workflows.validate({ config: workflow.config });

if (!check.valid) throw new Error('Workflow invalid: ' + JSON.stringify(check.errors));

// 4. Activate

await g8.workflows.update(workflow.id, { is_active: true });
```

## 6. Account-level intent → outreach 
Find companies showing intent on a competitor URL, find their contacts, add to a “competitive displacement” sequence. 

```

import { g8 } from '@graph8/sdk';

g8.init({ apiKey: process.env.G8_API_KEY! });

// 1. Companies visiting competitor pricing

const { data: hotAccounts } = await g8.intent.urlCompanies(

'https://competitor.com/pricing',

{ date_from: '2026-05-01', limit: 50 },

);

// 2. For each hot account, find decision-makers via search

const allContacts: number[] = [];

for (const acct of hotAccounts) {

if (!acct.domain) continue;

const results = await g8.enrich.search([

{ field: 'company_domain', operator: 'any_of', value: [acct.domain] },

{ field: 'seniority_level', operator: 'any_of', value: ['C-Suite', 'VP', 'Director'] },

], 1, 5);

for (const lead of results.data) {

const c = await g8.contacts.create({

work_email: lead.work_email!,

first_name: lead.first_name!,

last_name: lead.last_name!,

job_title: lead.job_title!,

company_domain: lead.company_domain!,

});

allContacts.push(c.id);

}

}

// 3. Enroll into competitive displacement sequence

await g8.sequences.add({

sequenceId: 'seq_competitive_displacement',

contactIds: allContacts,

listId: 0,

});

console.log(`Enrolled ${allContacts.length} contacts from ${hotAccounts.length} intent-active accounts.`);
```

## See also  
- SDK overview — full module reference 
- SDK FAQ — install, auth, parity, errors 
- CLI Examples — same workflows from the terminal 
- MCP Examples — same workflows from an AI agent 
- Pricing — what each call costs
