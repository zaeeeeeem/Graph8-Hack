import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Voice — Graphi",
  description: "Talk to Ayesha: a live voice call that answers pipeline, deal and meeting questions.",
};

// The voice CRM is a self-contained static page (public/voice) with its own CSS and the Vapi web SDK.
// An iframe keeps its styles and scripts fully isolated from the portal; it only needs the microphone.
export default function VoicePage() {
  return (
    <iframe
      src="/voice/index.html"
      title="Ayesha voice assistant"
      allow="microphone; autoplay"
      className="h-full w-full rounded-[22px] border-0 bg-transparent"
    />
  );
}
