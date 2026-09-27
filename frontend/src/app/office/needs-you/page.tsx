import type { Metadata } from "next";
import { NeedsYouScreen } from "@/components/portal/needs/NeedsYouScreen";

export const metadata: Metadata = {
  title: "Needs you — Graphi",
  description: "Every decision and blocked task waiting on you. Decide in Slack.",
};

export default function NeedsYouPage() {
  return <NeedsYouScreen />;
}
