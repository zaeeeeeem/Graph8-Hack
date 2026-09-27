import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/shell/PortalShell";

export const metadata: Metadata = {
  title: "Office — Autopilot",
  description: "Your AI sales team at work: who is working, what needs you, what it achieved today.",
};

export default function OfficeLayout({ children }: LayoutProps<"/office">) {
  return <PortalShell>{children}</PortalShell>;
}
