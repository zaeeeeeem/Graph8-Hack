import type { Metadata } from "next";
import { Suspense } from "react";
import { PipelineScreen } from "@/components/portal/pipeline/PipelineScreen";

export const metadata: Metadata = {
  title: "Pipeline — Graphi",
  description: "Every lead your AI sales team found, contacted and closed — mirrored from graph8.",
};

// PipelineScreen reads ?stage= via useSearchParams, which needs a Suspense boundary.
export default function PipelinePage() {
  return (
    <Suspense fallback={null}>
      <PipelineScreen />
    </Suspense>
  );
}
