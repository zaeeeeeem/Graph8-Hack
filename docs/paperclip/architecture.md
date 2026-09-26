# Paperclip — Architecture

## Monorepo layout
pnpm workspace (`pnpm-workspace.yaml`): `server`, `ui`, `cli`, `packages/*`, `packages/adapters/*`, `packages/plugins/*`.

| Path | Role |
|---|---|
| `server/` | Express REST API + orchestration (`AGENTS.md` §3) |
| `ui/` | React + Vite board UI, served by API in dev middleware mode |
| `packages/db/` | Drizzle ORM schema, migrations, DB clients |
| `packages/shared/` | shared types, constants, validators, API path constants |
| `packages/adapters/*` | one package per agent runtime: `claude-local`, `codex-local`, `cursor-local`, `cursor-cloud`, `gemini-local`, `grok-local`, `kimi-local`, `opencode-local`, `pi-local`, `openclaw-gateway`, `hermes`, `hermes-gateway` |
| `packages/adapter-utils/` | shared adapter helpers (incl. ACPX engine, duplex observability) |
| `packages/plugins/` | plugin system packages (+ sandbox-provider plugins excluded from lockfile per `pnpm-workspace.yaml`) |
| `cli/` | published `paperclipai` npm bin, agent-facing commands |
| `doc/` | product/operational docs (100+ files, see `AGENTS.md` §2 reading order: `GOAL.md` → `PRODUCT.md` → `SPEC-implementation.md` → `DEVELOPING.md` → `DATABASE.md`) |

## Server stack
- Express REST API, base path `/api` (`AGENTS.md` §8).
- Two auth modes: board access = full-control operator context; agent access = bearer API keys (`agent_api_keys` table, hashed at rest), company-scoped.
- Dev command `pnpm dev` boots API on `http://localhost:3100`, UI served from same port in dev middleware mode.

## Database
- PostgreSQL via Drizzle ORM (`doc/DATABASE.md`). Three run modes, simplest first:
  1. **Embedded Postgres, zero config** — no `DATABASE_URL` set → server starts embedded PG, stores in `~/.paperclip/instances/default/db/`, auto-runs migrations on empty DB.
  2. **Local Postgres via Docker Compose** — `docker compose up -d`, PG 17 on `localhost:5432`.
  3. **Hosted Postgres (Supabase)** for production — same Drizzle schema, just point `DATABASE_URL`.
- Schema change workflow (`AGENTS.md` §6): edit `packages/db/src/schema/*.ts` → export from `schema/index.ts` → `pnpm db:generate` → `pnpm -r typecheck`. `drizzle.config.ts` reads *compiled* schema (`dist/schema/*.js`).
- Note: AGENTS.md §4 says "Auto DB" defaults to PGlite in dev; DATABASE.md describes embedded full Postgres — both docs agree the dev default requires no `DATABASE_URL`.

## Realtime / live updates
No SSE, no socket.io. Raw **WebSocket**, same-origin:
- `ui/src/lib/websocket-url.ts` — `buildSameOriginWebSocketUrl(path)` derives `ws://`/`wss://` from `window.location`, handles wildcard-host dev servers (falls back to `localhost:<port>`).
- `ui/src/lib/websocket.ts` — `tryCreateWebSocket` (soft-fail construction).
- `ui/src/context/LiveUpdatesProvider.tsx` — the hub. Subscribes once, then:
  - Patches TanStack Query cache directly on event (`patchRunStatusInList`, `removeRunFromList`, `upsertIssueCommentInPages`, `clearIssueExecutionRun` — see `ui/src/lib/live-runs-cache.ts`, `ui/src/lib/optimistic-issue-comments.ts`, `ui/src/lib/optimistic-issue-runs.ts`) instead of raw refetch.
  - Batches invalidations (`createInvalidationBatcher`, `createCoalescingQueryClient` in `ui/src/lib/query-invalidation-batcher.ts`) to avoid refetch storms on bursty events.
  - Falls back to **polling every 15s** (`DISCONNECTED_POLL_INTERVAL_MS`) when the socket is down; suppresses reconnect-storm toasts (`RECONNECT_SUPPRESS_MS = 2000`); a terminal outcome delivered >5 min late is treated as historical and applied silently, no toast (mirrors `DESIGN.md` "Contextual feedback" rule).
  - Respects page visibility (`ui/src/lib/page-visibility.ts`) — presumably pauses/reduces work when tab hidden.
  - Typed `LiveEvent` union imported from `@paperclipai/shared`.
- Live run transcripts specifically stream via `ui/src/components/transcript/useLiveRunTranscripts.ts` (chunked, see `ui/src/lib/run-log-chunks.ts`).

**For us:** Supabase Realtime (Postgres logical replication → websocket) is a drop-in equivalent to this whole layer — we get the "patch query cache on row change" pattern for free via `@supabase/supabase-js` channel subscriptions instead of hand-rolling a WS server + invalidation batcher. The batching/dedup/reconnect-fallback ideas are worth copying even though the transport differs.

## API style
- REST, base path `/api`, consistent HTTP error codes required: `400/401/403/404/409/422/500` (`AGENTS.md` §8).
- Contract kept in sync across 4 layers on any schema/behavior change: `packages/db` → `packages/shared` (types/constants/validators) → `server` (routes/services) → `ui` (API clients/pages) (`AGENTS.md` §5.2).
- Every mutating endpoint must write an activity-log entry and enforce company-scoping (`AGENTS.md` §5.1, §8).

## Adapter pattern (running agents)
- `packages/adapters/*` — one adapter package per provider/runtime, invoked **directly** by the Paperclip server today (`doc/architecture/paperclip-runner.md`: "Existing adapters invoke those services directly from the Paperclip server").
- Providers as of this checkout: Claude (local), Codex (local), Cursor (local + cloud), Gemini (local), Grok (local), Kimi (local), OpenCode (local), Pi (local), OpenClaw (gateway), Hermes (+ gateway variant).
- New/experimental: **Paperclip Runner** (`@paperclipai/paperclip-runner`, ADR in `doc/architecture/paperclip-runner.md`) — a *separate* Rust execution process talking a language-neutral "Paperclip Runner Protocol" (PRP) over an authenticated WebSocket, gated behind one explicit adapter (`paperclip_runner`) + one default-off instance flag. Topology: `Paperclip server —PRP/WS→ paperclip-runnerd —native protocol→ Codex/OpenCode/ACPX/Claude Managed/AWS AgentCore`. Rationale: durable delivery + restart recovery + governed action dispatch without turning the runner into a second control plane; browser never talks to runnerd directly, only reads projections via existing APIs.
- Sandboxing/execution environments: Docker-based (`doc/DOCKER.md`, `Dockerfile`, `docker/`), plus cloud sandbox networking research (`doc/architecture/paperclip-runner-daytona-networking.md` — Daytona as a sandbox provider candidate).
- Adapter authoring contract documented in `packages/adapters/AUTHORING.md`.

## Definition of done / verification (relevant if we borrow code, not process)
`pnpm -r typecheck && pnpm test:run && pnpm build` is their full gate (`AGENTS.md` §7, §11); default cheap path is just `pnpm test` (Vitest only, browser suites `test:e2e`/`test:release-smoke` are opt-in).

## Relevance filter for us
We are NOT adopting their DB-schema-sync rigor, adapter-runner protocol, or Docker sandboxing — that's overkill for a hackathon Slack bot. What's directly reusable: the **WebSocket + query-cache-patch** realtime pattern (mirrors what Supabase Realtime gives us natively), the **REST + activity-log-on-mutation** discipline (cheap to copy for audit trail), and the **adapter-per-provider** shape (maps to our per-agent LLM call wrapper, e.g. `tools/g8.ts` + `llm.ts` in `docs/IMPLEMENTATION-PLAN.md` Phase 1).
