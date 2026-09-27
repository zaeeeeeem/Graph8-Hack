import type { Metadata } from "next";
import { AgentScreen } from "@/components/portal/agent/AgentScreen";

export const metadata: Metadata = {
  title: "Agent — Graphi",
  description: "How one AI agent is spending and waking: budget, credit ledger, runs and tasks.",
};

// `id` is the agent's name in lower case (e.g. /office/agents/hira) or its uuid.
export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentScreen slug={id} />;
}
