"use client";

import { AnimatePresence, motion } from "motion/react";
import { Menu } from "lucide-react";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { LogoOrb } from "@/components/fusion/FusionNav";
import { useSidebarCollapsed } from "@/lib/portal/hooks";
import { PortalDataProvider, usePortal } from "@/lib/portal/store";
import { Sidebar } from "./Sidebar";
import { TaskDrawer } from "../task/TaskDrawer";
import { LeadDrawer } from "../pipeline/LeadDrawer";

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <PortalDataProvider>
      <ShellFrame>{children}</ShellFrame>
    </PortalDataProvider>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);

  // `[` toggles the sidebar (Linear/Paperclip convention). Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (e.key === "[" && !e.metaKey && !e.ctrlKey && !e.altKey) setCollapsed(!collapsed);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, setCollapsed]);

  return (
    <div className="relative flex h-dvh w-full gap-3 overflow-hidden bg-black p-3 text-white">
      {/* page-level colour fields: the glass sidebar and board blur these */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -bottom-56 -left-40 size-[640px] rounded-full bg-fu-orange/20 blur-[160px]" />
        <div className="absolute -right-40 -bottom-56 size-[640px] rounded-full bg-fu-glow-blue/20 blur-[160px]" />
      </div>
      {/* Desktop sidebar */}
      <div className="relative hidden lg:flex">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </div>

      {/* Mobile drawer sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <motion.div
              className="absolute inset-y-3 left-3"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            >
              <Sidebar collapsed={false} onToggle={() => {}} onClose={() => setMobileOpen(false)} mobile />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <MobileTopBar onMenu={() => setMobileOpen(true)} />
        <div id="portal-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">{children}</div>
      </main>

      {/* Drawers read ?task= from the URL (useSearchParams needs a Suspense boundary). */}
      <Suspense fallback={null}>
        <TaskDrawer />
        <LeadDrawer />
      </Suspense>
    </div>
  );
}

function MobileTopBar({ onMenu }: { onMenu: () => void }) {
  const { data } = usePortal();
  return (
    <div className="mb-3 flex h-14 shrink-0 items-center justify-between rounded-2xl border border-white/10 bg-white/2 px-3 lg:hidden">
      <div className="flex items-center gap-2.5">
        <LogoOrb size={28} />
        <span className="font-display text-lg">{data?.workspace.name ?? "Graphi"}</span>
      </div>
      <button type="button" onClick={onMenu} aria-label="Open menu" className="flex size-10 items-center justify-center rounded-lg text-white/70 hover:bg-white/6">
        <Menu className="size-5" />
      </button>
    </div>
  );
}
