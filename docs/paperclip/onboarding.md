# Onboarding: Zero → Running Agent Company

Two entry paths that converge: CLI instance setup, then UI company/agent bootstrap.

## 1. CLI install & instance setup (`doc/CLI.md`, `cli/src/commands/onboard.ts`)
- Install/run via `npx paperclipai <command>` (documented default — inert argv, no shell parsing of untrusted content) or `pnpm paperclipai` only for fully-literal commands (`doc/CLI.md:60-77`).
- `paperclipai onboard` is an interactive `@clack/prompts` wizard (`cli/src/commands/onboard.ts`). First choice is a **mode picker**, defaulting to `quickstart`:
  - `Quickstart` — accepts sane defaults, minimal questions (`onboard.ts:519-543`).
  - `Advanced` — walks through `promptDatabase`, `promptLlm`, `promptLogging`, `promptStorage`, `promptServer` individually (`onboard.ts:19-36, 581`).
- `--yes` flag skips prompts entirely, forcing quickstart + trusted-local loopback defaults (`onboard.ts:314, 524-525`) — good precedent for our own "one command, sane defaults" CLI/setup script.
- What's defaulted in quickstart: DB (embedded PGlite if `DATABASE_URL` unset — `AGENTS.md:29`), storage provider, secrets provider, bind mode (loopback/lan/tailnet, auto-inferred from host via `inferBindModeFromHost`), deployment mode/exposure.
- What's asked even in quickstart: LLM provider/key (`promptLlm`).
- `--install-service` optionally installs the CLI as a persistent background service after onboarding finishes (`onboard.ts:135`).
- Local dev shortcut: `pnpm install && pnpm dev` boots API on `:3100` serving UI via dev middleware, no separate onboarding needed for a dev checkout (`AGENTS.md:26-33`).

## 2. First-admin / CEO bootstrap (`doc/plans/2026-02-19-ceo-agent-creation-and-hiring.md`, `cli auth bootstrap-ceo`)
- `paperclipai auth bootstrap-ceo` creates a one-time bootstrap invite URL for the first instance admin (`cli/src/index.ts:266-276`, command `auth-bootstrap-ceo.ts`).
- Invite type `bootstrap_ceo` is a distinct invite type from a normal `company_join` invite (`doc/spec/invite-flow.md:20,45-47`) — it seeds the very first company + human admin without any pre-existing membership to approve against.

## 3. UI: company + agent creation flow
- `Auth.tsx` → sign in/sign up → `Companies.tsx` (create/select org, "Create or select an organization to view the dashboard" is literally the dashboard's empty-state copy when none is selected — `ui/src/pages/Dashboard.tsx:307`).
- Company with **zero agents** is auto-routed into onboarding rather than shown an empty dashboard: `onboardingStepForCompany` / `shouldRouteAgentlessCompanyToOnboarding` (`ui/src/lib/onboarding-route.ts`, wired at `Dashboard.tsx:5-8`). This is the key "hide complexity" trick — the product decides for the user that an agentless company isn't a valid state to look at.
- Hiring an agent (the "Hire" flow, matches our own working name) is a two-step dialog, not one big form:
  1. `NewAgentDialog.tsx` renders `AgentBasicsDialog` (name/role basics) with an "Invite" branch (`onInvite`) that swaps to `ExternalAgentInviteDialog` for inviting an *external* agent/human instead of creating one in-app.
  2. On `onContinue`, the dialog closes and navigates to `/agents/new?<basics as querystring>` (`NewAgentDialog.tsx:20-27`) — i.e. the lightweight modal captures just enough to seed the URL, then the full `NewAgent.tsx` page (backed by `AgentConfigForm.tsx`) takes over for model/instructions/budget/role detail. Progressive disclosure: quick modal first, deep form second, only if you didn't just invite an external agent.
- Agent join via invite: `CompanyInvites.tsx` (board creates invite) → `InviteLanding.tsx` (invitee accepts) → `server/src/routes/access.ts`. Agent joins go through `pending_approval` unless auto-approved, and can carry a `claimSecret` (available/consumed/expired) so an agent process can self-claim its own API key after a human approves the join (`doc/spec/invite-flow.md:17-19, 60-66`). This claim-secret pattern is directly reusable for "an agent process bootstraps its own credential after a human click-approves it" in our Slack bot flow.

## 4. What's hidden/deferred until later
- Budget/cost config is not part of initial agent creation basics — it's a separate `AgentConfigForm.tsx` concern reached only after continuing past the basics modal.
- Org-wide skills, MCP connections, and secrets are deferred to `CompanySettings`/`SkillStudio`/`Secrets.tsx` — not part of the initial hire flow.
- `BootstrapSetupUxLab.tsx` exists as a UX-lab (design sandbox) variant of the setup flow — suggests the bootstrap/setup UI has been iterated on separately from production before shipping, a pattern worth copying for our own onboarding wizard (build it in isolation, swap in).

## Sequence summary (typical local/self-host path)
```
npx paperclipai onboard  →  (quickstart: LLM key only; advanced: DB/storage/server too)
  →  first run opens UI  →  Auth (sign up)  →  Companies (create org)
  →  Dashboard detects 0 agents → auto-routes to onboarding
  →  "Hire" modal (name/role) → /agents/new (model, instructions, budget)
  →  Org chart shows the seated agent  →  heartbeats begin
```
