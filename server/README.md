# Graphi server

Node/TypeScript (tsx, no build step) process that runs the 5-agent Slack sales team: Slack Bolt (Socket Mode) +
graph8 REST + Gemini + Supabase (service role). See `src/contracts.ts` for the module seams and `docs/BUILD-PLAN.md`
for the full plan.

## Env vars

Copy the root `.env.example` to `.env.local` (repo root, gitignored) and fill in values. Never commit real values.

| Var | Required | Notes |
|---|---|---|
| `G8_API_KEY` | yes | graph8 API key |
| `G8_BASE_URL` | yes | `https://be.graph8.com/api/v1` |
| `G8_WEBHOOK_SECRET` | on first webhook register | returned once by graph8; paste into env after `register-webhook` first run |
| `G8_DEMO_SCHEDULE_ID` | yes | "Demo 24/7" schedule id used for sequence sends |
| `GEMINI_API_KEY` | yes | Gemini API key |
| `GEMINI_MODEL` | yes | e.g. `gemini-3.8-flash` |
| `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` / `SLACK_SIGNING_SECRET` | yes | Slack app credentials (Socket Mode) |
| `SLACK_CHANNEL_TEAM` / `SLACK_CHANNEL_HQ` | yes | `#sales-team` / `#sales-hq` channel ids |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | yes | service-role Supabase access (never the anon key server-side) |
| `WORKSPACE_ID` | yes | which workspace row this process serves (test workspace before 12:00, demo workspace after) |
| `PUBLIC_URL` | for webhooks | public base URL (Render URL, or ngrok URL on the hot-spare laptop) |
| `PORT` | yes | HTTP port for `/healthz` and `/webhooks/graph8` |
| `LAYERS_DISABLED` | optional | comma list of layers to force into fallback mode, e.g. `voice,ai_research` |
| `SLACK_DISABLED` | optional | `1` on the hot-spare laptop so it doesn't open a second Slack Socket Mode connection |
| `TEST_ALLOWLIST` | yes | `Name\|email\|phone\|linkedin;...` — only these contacts can ever be sent to |

## Commands

```bash
pnpm -C server start      # run once (tsx, no watch) — same command Render uses
pnpm -C server dev        # tsx watch, local development
pnpm -C server typecheck  # tsc --noEmit
pnpm -C server test       # vitest run
```

Scripts (repo-root `scripts/`, run with `tsx scripts/<name>.ts` or `bash scripts/<name>.sh`):

- `allowlist.ts` — validates `TEST_ALLOWLIST` parses and every entry resolves in graph8.
- `reset-demo.ts --workspace test|demo --clean` / `--stage` — creates/cleans a workspace's data for a run or a rehearsal.
- `register-webhook.ts` — creates or PATCHes the graph8 webhook to `${PUBLIC_URL}/webhooks/graph8`; prints the secret
  once on first create (paste into `G8_WEBHOOK_SECRET`).
- `simulate-reply.ts` — injects a fake inbound reply event for rehearsal without waiting on a real teammate reply.
- `try-voice.ts`, `try-linkedin.ts`, `try-intent.ts`, `try-ai-research.ts` — one-off verify scripts for each optional
  layer (§4 of `docs/BUILD-PLAN.md`); require `--yes` to actually spend/write, and only ever touch allowlisted contacts.
- `secret-scan.sh` — run before making the repo public (see root README).
- `prewarm.ts` — runs Bilal + Hira ahead of the demo so stage timing doesn't wait on live search/enrichment.

## Webhook registration

1. Deploy (or run locally with a public tunnel).
2. Run `register-webhook.ts` once against that base URL — it calls `POST /webhooks` (see `docs/graph8-docs/webhooks.md`)
   pointed at `${PUBLIC_URL}/webhooks/graph8`.
3. The response includes the webhook signing secret **once** — copy it into `G8_WEBHOOK_SECRET` (Render env or
   `.env.local`) immediately; graph8 does not show it again.
4. If the public URL changes (e.g. promoting the laptop hot-spare), re-run `register-webhook.ts` — it PATCHes the
   existing webhook rather than creating a duplicate.

## Hot-spare laptop mode

Only one process may hold the Slack Socket Mode connection at a time. To run the laptop as a warm standby while
Render is primary:

```bash
SLACK_DISABLED=1 pnpm -C server start
```

With `SLACK_DISABLED=1` the process still runs the inbox poller, webhook receiver, and schedulers, but does not open
a second Slack connection (two connections would double-post everything). To promote the laptop to primary during
the demo:

1. Stop the Render service (or let it keep running read-only paths — but not both handling Slack).
2. Start an ngrok tunnel: `ngrok http $PORT`.
3. Run `register-webhook.ts` again with `PUBLIC_URL` set to the ngrok URL, so graph8 webhooks reach the laptop.
4. Restart the laptop process without `SLACK_DISABLED` so it takes over Slack Socket Mode.
