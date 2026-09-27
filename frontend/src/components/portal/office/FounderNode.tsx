"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { NODE_H, NODE_W } from "@/lib/portal/selectors";
import { LogoOrb } from "@/components/fusion/FusionNav";
import { ToneIcon } from "../ui/primitives";
import { UI_ICON } from "@/lib/portal/vocab";
import { PillLink } from "../ui/surface";
import { Chip, HANDLE_Y, HIDDEN_HANDLE, NODE_FILL } from "./AgentNode";

export type FounderNodeData = {
  name: string;
  pending: number;
  decideHref: string | null;
  hqHref: string | null;
};
export type FounderNodeT = Node<FounderNodeData, "founder">;

/** Root of the chart: the founder ("You"). Same card as the agents — the chips carry the ask. */
export function FounderNode({ data }: NodeProps<FounderNodeT>) {
  const hot = data.pending > 0;
  return (
    <div className={`relative rounded-[16px] border border-white/10 ${NODE_FILL}`} style={{ width: NODE_W, minHeight: NODE_H }}>
      <div className="flex items-center gap-3 px-3.5 pt-3">
        <span className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
          <LogoOrb size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-tight font-medium text-white">{data.name}</p>
          <p className="text-[12px] text-white/45">You · Founder</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-3.5 pt-2.5 pb-3">
        <Chip>
          <ToneIcon icon={hot ? UI_ICON.needsYou : UI_ICON.nothingWaiting} tone={hot ? "attention" : "neutral"} className="size-3" />
          {hot ? `${data.pending} ${data.pending === 1 ? "decision" : "decisions"} waiting` : "Nothing waiting"}
        </Chip>
        {hot && <PillLink href={data.decideHref}>Decide</PillLink>}
      </div>
      <Handle type="source" position={Position.Right} className={HIDDEN_HANDLE} style={HANDLE_Y} isConnectable={false} />
    </div>
  );
}
