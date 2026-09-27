import { Suspense } from "react";
import { AuthModalHost } from "@/components/auth/AuthModal";
import { AIPoweredSection } from "@/components/fusion/AIPoweredSection";
import { CTAFooter } from "@/components/fusion/CTAFooter";
import { FaqSection } from "@/components/fusion/FaqSection";
import { FeatureGrid } from "@/components/fusion/FeatureGrid";
import { FusionHero } from "@/components/fusion/FusionHero";
import { FusionNav } from "@/components/fusion/FusionNav";
import { IntegrationsSection } from "@/components/fusion/IntegrationsSection";
import { StackedFeatures } from "@/components/fusion/StackedFeatures";

export default function Home() {
  return (
    <div className="relative min-h-screen w-full bg-black">
      <FusionNav />
      <FusionHero />
      <FeatureGrid />
      <AIPoweredSection />
      <StackedFeatures />
      <IntegrationsSection />
      <FaqSection />
      <CTAFooter />
      {/* Sign in / sign up modal, opened by ?auth= (the dashboard guard sends signed-out users here). */}
      <Suspense fallback={null}>
        <AuthModalHost />
      </Suspense>
    </div>
  );
}
