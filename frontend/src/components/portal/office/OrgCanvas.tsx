"use client";

import "@xyflow/react/dist/style.css";
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import { Maximize, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onFocusAgent } from "@/lib/portal/hooks";
import { slackChannel, slackThread } from "@/lib/portal/links";
import type { PortalSnapshot } from "@/lib/portal/snapshot";
import { FOUNDER_NODE_ID, NODE_H, NODE_W, layoutOrg, needsYouItems, tasksById } from "@/lib/portal/selectors";
import { TASK_KIND } from "@/lib/portal/vocab";
import { taskId } from "@/lib/portal/format";
import { PILL, PILL_BUTTON, PILL_ICON_BUTTON } from "../ui/surface";
import { AgentNode, type AgentNodeT } from "./AgentNode";
import { FlowEdge, type FlowEdgeT, type FlowTone } from "./FlowEdge";
import { FounderNode, type FounderNodeT } from "./FounderNode";

type AppNode = AgentNodeT | FounderNodeT;

const nodeTypes: NodeTypes = { agent: AgentNode, founder: FounderNode };
const edgeTypes: EdgeTypes = { flow: FlowEdge };

const FIT = { padding: 0.16, maxZoom: 1, duration: 450 } as const;

export function OrgCanvas({ data }: { data: PortalSnapshot }) {
  return (
    <ReactFlowProvider>
      <Canvas data={data} />
    </ReactFlowProvider>
  );
}

/** Nodes with layout positions; `keep` carries positions/measurements the user already has (drag). */
function buildNodes(data: PortalSnapshot, expanded: Set<string>, focus: { id: string; key: number }, keep?: AppNode[]): AppNode[] {
  const prev = new Map((keep ?? []).map((n) => [n.id, n]));
  const byTask = tasksById(data);
  const needs = needsYouItems(data);
  const decideHref = needs[0] ? slackThread(needs[0].slack_channel, needs[0].slack_ts) : null;

  return layoutOrg(data.agents).map((p): AppNode => {
    const old = prev.get(p.id);
    const base = { position: old?.position ?? { x: p.x, y: p.y }, measured: old?.measured };
    if (p.kind === "founder") {
      return {
        ...base,
        id: p.id,
        type: "founder",
        data: {
          name: data.workspace.founder_name ?? "You",
          pending: needs.length,
          decideHref,
          hqHref: slackChannel(data.workspace.slack_channel_hq),
        },
      };
    }
    const a = p.agent!;
    return {
      ...base,
      id: p.id,
      type: "agent",
      zIndex: expanded.has(p.id) ? 20 : 1, // expanded cards float above their siblings
      data: {
        agent: a,
        task: a.current_task_id ? (byTask.get(a.current_task_id) ?? null) : null,
        decideHref,
        expanded: expanded.has(p.id),
        focusKey: focus.id === p.id ? focus.key : 0,
      },
    };
  });
}

function Canvas({ data }: { data: PortalSnapshot }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const flow = useReactFlow<AppNode, FlowEdgeT>();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [focus, setFocus] = useState<{ id: string; key: number }>({ id: "", key: 0 });
  const [nodes, setNodes] = useState<AppNode[]>(() => buildNodes(data, expanded, focus));

  // Keep node data in sync with realtime data without losing dragged positions
  // ("adjust state while rendering" pattern — no effect, no extra paint).
  const [synced, setSynced] = useState({ data, expanded, focus });
  if (synced.data !== data || synced.expanded !== expanded || synced.focus !== focus) {
    setSynced({ data, expanded, focus });
    setNodes((prev) => buildNodes(data, expanded, focus, prev));
  }

  // A new report = one agent talking to another: play a one-off wave along that edge.
  const latest = data.reports[0];
  const [burst, setBurst] = useState<{ reportId: string | undefined; edge: string | null; reverse: boolean }>({
    reportId: latest?.id,
    edge: null,
    reverse: false,
  });
  if (latest?.id !== burst.reportId) {
    const from = latest?.from_agent_id;
    const to = latest?.to_agent_id ?? FOUNDER_NODE_ID;
    const fromAgent = data.agents.find((a) => a.id === from);
    const toAgent = data.agents.find((a) => a.id === to);
    let edge: string | null = null;
    let reverse = false;
    if (fromAgent && (fromAgent.reports_to ?? FOUNDER_NODE_ID) === to) {
      edge = `${to}->${from}`; // report goes up: child → parent
      reverse = true;
    } else if (toAgent && toAgent.reports_to === from) {
      edge = `${from}->${to}`; // assignment goes down
    }
    setBurst({ reportId: latest?.id, edge, reverse });
  }

  const edges = useMemo<FlowEdgeT[]>(() => {
    const byTask = tasksById(data);
    const needs = needsYouItems(data);
    return layoutOrg(data.agents)
      .filter((p) => p.parentId && p.agent)
      .map((p) => {
        const a = p.agent!;
        const task = a.current_task_id ? byTask.get(a.current_task_id) : undefined;
        let tone: FlowTone = "idle";
        let label: string | undefined;
        let reverse = false;
        if (a.status === "working") {
          tone = "working";
          label = task ? `${taskId(task.number)} · ${TASK_KIND[task.kind]}` : "Working";
        } else if (a.status === "waiting_on_you") {
          tone = "waiting";
          reverse = true; // the ask flows up to you
          label = needs.some((n) => n.agent_id === a.id) ? "Needs your decision" : "Waiting on you";
        } else if (a.status === "paused" || a.status === "error") {
          tone = "paused";
          label = a.status === "paused" && a.pause_reason === "budget" ? "Over budget" : "Paused";
        }
        const id = `${p.parentId}->${p.id}`;
        return {
          id,
          source: p.parentId!,
          target: p.id,
          type: "flow" as const,
          data: {
            tone,
            label,
            reverse,
            burst: burst.edge === id ? { key: burst.reportId ?? id, reverse: burst.reverse } : null,
          },
        };
      });
  }, [data, burst]);

  const onNodesChange = useCallback((changes: NodeChange<AppNode>[]) => setNodes((ns) => applyNodeChanges(changes, ns)), []);

  const toggle = useCallback((id: string) => {
    if (id === FOUNDER_NODE_ID) return;
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const resetLayout = useCallback(() => {
    const none = new Set<string>();
    setExpanded(none);
    setSynced({ data, expanded: none, focus });
    setNodes(buildNodes(data, none, focus));
    setTimeout(() => flow.fitView(FIT), 60);
  }, [data, focus, flow]);

  // Fit when the board mounts and whenever the panel changes size (window, sidebar).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => flow.fitView(FIT), 140);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [flow]);

  // Sidebar team list → expand that card, pan to it, flash it.
  useEffect(
    () =>
      onFocusAgent((id) => {
        const node = flow.getNode(id);
        if (!node) return;
        setExpanded((s) => new Set(s).add(id));
        setFocus((f) => ({ id, key: f.key + 1 }));
        flow.setCenter(node.position.x + NODE_W / 2, node.position.y + NODE_H * 1.6, { zoom: 1.25, duration: 650 });
      }),
    [flow],
  );

  // Keyboard: F = fit, Esc = collapse all.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "f" || e.key === "F") flow.fitView(FIT);
      if (e.key === "Escape") setExpanded(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flow]);

  const hasTasks = data.agents.some((a) => a.current_task_id) || data.tasks.length > 0;

  return (
    <div ref={wrapRef} className="portal-flow absolute inset-0">
      <ReactFlow<AppNode, FlowEdgeT>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => toggle(n.id)}
        colorMode="dark"
        fitView
        fitViewOptions={FIT}
        minZoom={0.1}
        maxZoom={4}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        nodesFocusable={false}
        panOnDrag
        zoomOnScroll={false}
        zoomOnPinch
        zoomActivationKeyCode={["Meta", "Control"]}
        preventScrolling={false}
        zoomOnDoubleClick={false}
        nodeDragThreshold={4}
        proOptions={{ hideAttribution: true }}
      >
        <Background id="dots" variant={BackgroundVariant.Dots} gap={22} size={1.1} color="rgba(255,255,255,0.08)" />
        {!hasTasks && (
          <Panel position="bottom-center" className="!mb-20">
            <p className={PILL}>Waiting for the first assignment.</p>
          </Panel>
        )}
        <Panel position="bottom-left" className="!m-4 hidden md:block">
          <p className={`${PILL} text-[12px] text-white/45`}>Drag to pan · ⌘/Ctrl + scroll to zoom · drag cards · click for details</p>
        </Panel>
        <Panel position="bottom-right" className="!m-4">
          <Toolbar onReset={resetLayout} />
        </Panel>
      </ReactFlow>
    </div>
  );
}

function Toolbar({ onReset }: { onReset: () => void }) {
  const flow = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={PILL_ICON_BUTTON} onClick={() => flow.zoomOut({ duration: 200 })} aria-label="Zoom out" title="Zoom out">
        <Minus className="size-4" strokeWidth={2.2} />
      </button>
      <span className={`${PILL} w-[68px] justify-center font-mono text-[12px] tabular-nums`}>{Math.round(zoom * 100)}%</span>
      <button type="button" className={PILL_ICON_BUTTON} onClick={() => flow.zoomIn({ duration: 200 })} aria-label="Zoom in" title="Zoom in">
        <Plus className="size-4" strokeWidth={2.2} />
      </button>
      <button type="button" className={PILL_BUTTON} onClick={() => flow.fitView(FIT)} title="Fit to screen (F)">
        <Maximize className="size-3.5" />
        Fit
      </button>
      <button type="button" className={PILL_BUTTON} onClick={onReset} title="Put every card back and collapse them">
        <RotateCcw className="size-3.5" />
        Reset
      </button>
    </div>
  );
}
