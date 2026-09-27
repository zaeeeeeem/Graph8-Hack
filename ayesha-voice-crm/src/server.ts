import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import {
  getTopClients,
  getDealStatus,
  getTodaysMeetings,
  getPipelineSummary,
  getStalledDeals,
} from './bilal';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve the UI from the public folder → http://localhost:3000
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', agent: 'Bilal', timestamp: new Date().toISOString() });
});

// ── Vapi function-call webhook ────────────────────────────────
// Vapi calls this URL when Ayesha's LLM decides it needs CRM data.
// Payload shape: { message: { type: 'function-call', functionCall: { name, parameters } } }
app.post('/api/bilal', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    // Vapi sends function-calls inside a message envelope
    if (!message || message.type !== 'function-call') {
      res.status(400).json({ error: 'Expected a Vapi function-call message' });
      return;
    }

    const { name, parameters } = message.functionCall ?? {};
    console.log(`[Bilal] Function called: ${name}`, parameters);

    let result: unknown;

    switch (name) {
      case 'get_top_clients':
        result = await getTopClients(parameters?.limit ?? 5);
        break;

      case 'get_deal_status':
        if (!parameters?.company) {
          result = { error: 'Missing required parameter: company' };
        } else {
          const deal = await getDealStatus(parameters.company);
          result = deal ?? { error: `No deal found for company: "${parameters.company}"` };
        }
        break;

      case 'get_todays_meetings':
        result = await getTodaysMeetings();
        break;

      case 'get_pipeline_summary':
        result = await getPipelineSummary();
        break;

      case 'get_stalled_deals':
        result = await getStalledDeals(parameters?.staleDays ?? 7);
        break;

      default:
        result = { error: `Unknown function: "${name}"` };
    }

    console.log(`[Bilal] Result:`, result);

    // Vapi expects: { result: <string or object> }
    res.json({ result });
  } catch (err) {
    console.error('[Bilal] Error:', err);
    res.status(500).json({ result: { error: 'Internal Bilal error' } });
  }
});

// ── Start server ──────────────────────────────────────────────
const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`\n🤖 Bilal backend running on http://localhost:${PORT}`);
  console.log(`   Webhook: POST http://localhost:${PORT}/api/bilal`);
  console.log(`   Health:  GET  http://localhost:${PORT}/health\n`);
});
