"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { FileText, Inbox, LayoutGrid, LogOut, PanelLeft, Sparkles, Workflow, X } from "lucide-react";
import type { ComponentType } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { LogoOrb } from "@/components/fusion/FusionNav";
import { taskId } from "@/lib/portal/format";
import { focusAgent } from "@/lib/portal/hooks";
import { slackChannel } from "@/lib/portal/links";
import { agentHref, needsYouItems, tasksById } from "@/lib/portal/selectors";
import { usePortal } from "@/lib/portal/store";
import type { PortalAgentRow } from "@/lib/portal/types";
import { AGENT_STATUS, UI_ICON, agentStatusLabel } from "@/lib/portal/vocab";
import { AvatarStatus, LinkOut, Skeleton, TONE, ToneIcon } from "../ui/primitives";
import { LaserBorder } from "../ui/surface";

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  ready: boolean;
  countKey?: "needsYou";
};

// Unbuilt screens stay visible (so the map of the product is clear) but are not links yet.
const NAV: NavItem[] = [
  { label: "Office", href: "/office", icon: LayoutGrid, ready: true },
  { label: "Pipeline", href: "/office/pipeline", icon: Workflow, ready: true },
  { label: "Reports", href: "/office/reports", icon: FileText, ready: true },
  { label: "Needs you", href: "/office/needs-you", icon: Inbox, ready: true, countKey: "needsYou" },
];

export const SIDEBAR_W = 272;
export const SIDEBAR_W_COLLAPSED = 76;

export function Sidebar({
  collapsed,
  onToggle,
  onClose,
  mobile = false,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onClose?: () => void;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const { load, data, live } = usePortal();
  const needsYouCount = data ? needsYouItems(data).length : 0;
  const agents = data ? [...data.agents].sort((a, b) => a.sort_order - b.sort_order) : [];
  const byTask = data ? tasksById(data) : new Map();
  const working = agents.filter((a) => a.status === "working").length;
  const router = useRouter();
  const onOffice = pathname === "/office";

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W }}
      transition={{ type: "spring", stiffness: 320, damping: 36 }}
      className="relative flex h-full shrink-0 flex-col overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.015)_40%,rgba(255,255,255,0.03)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_30px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
      aria-label="Portal navigation"
    >
      {/* ambient glow inside the glass */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -left-16 size-64 rounded-full bg-fu-glow-blue/25 blur-[80px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -bottom-24 size-64 rounded-full bg-fu-orange/15 blur-[90px]" />

      {/* Brand + collapse toggle */}
      <div className={`relative flex h-16 shrink-0 items-center ${collapsed ? "justify-center" : "justify-between pr-3 pl-4"}`}>
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2.5" title="Graphi home">
            <LogoOrb size={30} />
            <span className="font-display text-[19px] leading-none text-white">Graphi</span>
          </Link>
        )}
        <button
          type="button"
          onClick={mobile ? onClose : onToggle}
          aria-label={mobile ? "Close menu" : collapsed ? "Expand sidebar ( [ )" : "Collapse sidebar ( [ )"}
          title={mobile ? "Close" : collapsed ? "Expand  [" : "Collapse  ["}
          className="flex size-9 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/8 hover:text-white"
        >
          {mobile ? <X className="size-4.5" /> : <PanelLeft className="size-4.5" strokeWidth={1.8} />}
        </button>
      </div>

      {/* Workspace */}
      <div
        className={`relative mx-3 mb-3 rounded-xl border border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${collapsed ? "flex justify-center py-2" : "px-3 py-2.5"}`}
      >
        {collapsed ? (
          <span className="font-display text-sm text-white/80" title={data?.workspace.name}>
            {(data?.workspace.name ?? "·").slice(0, 2)}
          </span>
        ) : load === "loading" || !data ? (
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ) : (
          <>
            <p className="truncate text-sm font-medium text-white">{data.workspace.name}</p>
            <p className="truncate text-xs text-white/45">for {data.workspace.founder_name ?? "you"}</p>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="relative flex flex-col gap-0.5 px-3">
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href === "/office" && pathname.startsWith("/office/agents/"));
          const count = item.countKey === "needsYou" ? needsYouCount : 0;
          const Icon = item.icon;
          const inner = (
            <>
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-[11px] border border-white/12 bg-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]"
                  transition={{ type: "spring", stiffness: 400, damping: 36 }}
                />
              )}
              <span className="relative">
                <Icon className={`size-4.5 ${active ? "text-white" : "text-white/55"}`} strokeWidth={1.8} />
                {collapsed && count > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 size-2 rounded-full bg-st-attention ring-2 ring-[#0b0c0f]" />
                )}
              </span>
              {!collapsed && (
                <>
                  <span className={`relative flex-1 truncate ${active ? "text-white" : item.ready ? "text-white/70" : "text-white/35"}`}>
                    {item.label}
                  </span>
                  {count > 0 && (
                    <span className="relative min-w-5 rounded-full bg-st-attention/15 px-1.5 text-center font-mono text-[11px] leading-5 text-[#ffa46b] ring-1 ring-st-attention/35 ring-inset">
                      {count}
                    </span>
                  )}
                  {!item.ready && count === 0 && <span className="relative text-[10px] tracking-wide text-white/25 uppercase">Soon</span>}
                </>
              )}
            </>
          );
          const cls = `relative flex h-10 items-center gap-3 rounded-[11px] text-sm ${collapsed ? "justify-center" : "px-3"}`;
          return item.ready ? (
            <Link key={item.href} href={item.href} className={`${cls} transition-colors hover:bg-white/5`} title={collapsed ? item.label : undefined}>
              {inner}
            </Link>
          ) : (
            <span key={item.href} className={`${cls} cursor-default`} title={`${item.label} — next screens`}>
              {inner}
            </span>
          );
        })}
      </nav>

      {/* AI team */}
      <div className="relative mt-5 min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        {!collapsed && (
          <div className="mb-2 flex items-center justify-between px-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-[0.08em] text-white/45 uppercase">
              <Sparkles className="size-3.5 text-white/60" />
              AI team
            </p>
            {load === "ready" && <span className="text-[11px] text-white/35">{working > 0 ? `${working} working` : `${agents.length} agents`}</span>}
          </div>
        )}
        <ul className="flex flex-col gap-1">
          {load !== "ready" &&
            Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className={`flex h-14 items-center gap-3 ${collapsed ? "justify-center" : "px-3"}`}>
                <Skeleton className="size-9 rounded-full" />
                {!collapsed && <Skeleton className="h-3 w-24" />}
              </li>
            ))}
          {agents.map((a) => (
            <TeamRow
              key={a.id}
              agent={a}
              taskNumber={a.current_task_id ? byTask.get(a.current_task_id)?.number : undefined}
              collapsed={collapsed}
              onClick={() => (onOffice ? focusAgent(a.id) : router.push(agentHref(a)))}
              focusable={onOffice}
              current={pathname === agentHref(a)}
            />
          ))}
        </ul>
      </div>

      {/* Footer: live + Slack */}
      <div className={`relative flex shrink-0 flex-col gap-2 border-t border-white/8 p-3 ${collapsed ? "items-center" : ""}`}>
        <div
          className={`flex items-center gap-2 text-xs ${collapsed ? "" : "px-2"}`}
          title={live === "joined" ? "Updates arrive automatically" : "Reconnecting — showing last known state"}
        >
          <ToneIcon icon={UI_ICON.live} tone={live === "joined" ? "success" : "muted"} />
          {!collapsed && <span className={live === "joined" ? "text-white/70" : "text-white/40"}>{live === "joined" ? "Live" : "Reconnecting…"}</span>}
          {!collapsed && data?.workspace.is_demo && (
            <span className="ml-auto rounded bg-white/6 px-1.5 py-0.5 text-[10px] tracking-wide text-white/35 uppercase" title="Public demo workspace">
              Demo
            </span>
          )}
        </div>
        {!collapsed && data && (
          <LinkOut href={slackChannel(data.workspace.slack_channel_hq)} className="px-2 text-xs">
            Open #sales-hq
          </LinkOut>
        )}
        <Account collapsed={collapsed} />
      </div>
    </motion.aside>
  );
}

/** The signed-in user (Supabase Auth) and sign out. */
function Account({ collapsed }: { collapsed: boolean }) {
  const { user, signOut } = useAuth();
  if (!user) return null;
  const name = (user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined);
  const photo = (user.user_metadata?.avatar_url as string | undefined) ?? (user.user_metadata?.picture as string | undefined);
  const label = name ?? user.email ?? "Signed in";
  const initial = label.trim().charAt(0).toUpperCase();
  return (
    <div className={`mt-1 flex items-center gap-2.5 border-t border-white/8 pt-3 ${collapsed ? "flex-col" : "px-1"}`}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- Google avatar host is not in next/image config
        <img src={photo} alt="" referrerPolicy="no-referrer" className="size-8 shrink-0 rounded-full border border-white/10 object-cover" />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[13px] font-medium text-white/80">
          {initial}
        </span>
      )}
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] text-white/85">{label}</span>
          {name && user.email && <span className="block truncate text-[11px] text-white/40">{user.email}</span>}
        </span>
      )}
      <button
        type="button"
        onClick={() => void signOut()}
        aria-label="Sign out"
        title="Sign out"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/8 hover:text-white"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

/**
 * Row: photo with its status dot on the circle's edge, name, one status line. The agent that is
 * working gets the same orbiting laser border as its card on the canvas; the photo stays still.
 */
function TeamRow({
  agent: a,
  taskNumber,
  collapsed,
  onClick,
  focusable,
  current,
}: {
  agent: PortalAgentRow;
  taskNumber?: number;
  collapsed: boolean;
  onClick: () => void;
  focusable: boolean;
  current: boolean;
}) {
  const st = AGENT_STATUS[a.status];
  const working = a.status === "working";
  const line =
    working && taskNumber ? `Working on ${taskId(taskNumber)}` : a.status === "idle" ? `${a.title} · idle` : agentStatusLabel(a.status, a.pause_reason);

  const button = (
    <button
      type="button"
      onClick={onClick}
      title={`${a.name} · ${a.title} — ${agentStatusLabel(a.status, a.pause_reason)}${focusable ? " (show on board)" : " (open agent page)"}`}
      aria-current={current ? "page" : undefined}
      className={`flex w-full items-center gap-3 rounded-xl text-left transition-colors ${
        working || current ? "bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl hover:bg-white/[0.08]" : "border border-transparent hover:border-white/8 hover:bg-white/[0.04]"
      } ${collapsed ? "h-14 justify-center" : "h-14 px-2.5"}`}
    >
      <AvatarStatus
        emoji={a.emoji}
        color="rgba(255,255,255,0.14)"
        src={a.avatar_url}
        size={40}
        tone={st.tone}
        surface="#0f1013"
        className={a.status === "paused" ? "grayscale" : ""}
      />
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-white/90">{a.name}</span>
          <span className={`block truncate text-[11px] ${a.status === "idle" ? "text-white/35" : TONE[st.tone].text}`}>{line}</span>
        </span>
      )}
    </button>
  );

  return (
    <li>
      {working ? (
        <LaserBorder radius={13}>
          {button}
        </LaserBorder>
      ) : (
        button
      )}
    </li>
  );
}
