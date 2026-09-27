import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportsScreen } from "@/components/portal/reports/ReportsScreen";

export const metadata: Metadata = {
  title: "Reports — Autopilot",
  description: "Standups, wins, handoffs and questions your AI sales team posts up the chain.",
};

// ReportsScreen reads ?kind= via useSearchParams, which needs a Suspense boundary.
export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsScreen />
    </Suspense>
  );
}
