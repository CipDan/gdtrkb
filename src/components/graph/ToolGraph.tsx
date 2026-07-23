"use client";

import { useMemo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  getStraightPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type InternalNode,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import type { ToolGraphProps } from "@/components/graph/types";

// Reusable ToolGraph (app-spec §7.7), rendered as a static diagram (no
// drag/zoom/pan chrome) rather than a general-purpose graph editor, to match
// phosphor-hifi-mock.html's plain relationship diagram. Node/edge dressing
// (square boxes, VT323 text, solid vs dotted lines) is built from the design
// tokens rather than React Flow's default theme — see base.css import above,
// which carries only positioning rules, no default colors/shapes.

interface FlowNodeData extends Record<string, unknown> {
  label: string;
  isFocus: boolean;
}
type FlowNode = Node<FlowNodeData>;

interface FlowEdgeData extends Record<string, unknown> {
  label: string;
  mirrored: boolean;
}
type FlowEdge = Edge<FlowEdgeData>;

const HIDDEN_HANDLE_STYLE = { opacity: 0, pointerEvents: "none" as const };

function ToolNode({ data }: NodeProps<FlowNode>) {
  return (
    <div
      className={
        data.isFocus
          ? "border-2 border-bright px-2.5 py-1.5 text-[17px] whitespace-nowrap text-pale"
          : "border border-line px-2.5 py-1.5 text-[16px] whitespace-nowrap text-ink"
      }
      style={{ background: "var(--bg)", fontFamily: "var(--font-display)" }}
    >
      <Handle type="target" position={Position.Top} style={HIDDEN_HANDLE_STYLE} />
      {data.label}
      <Handle type="source" position={Position.Top} style={HIDDEN_HANDLE_STYLE} />
    </div>
  );
}

const nodeTypes: NodeTypes = { tool: ToolNode };

// Floating-edge geometry: finds where the straight line between two node
// centers crosses each node's rectangular boundary, so edges meet the box
// border exactly (phosphor-hifi-mock.html's hand-placed SVG does this by
// hand; here it's computed since the neighbor count is dynamic). Standard
// React Flow "floating edges" recipe.
function getNodeCenter(node: InternalNode<FlowNode>) {
  const width = node.measured.width ?? 120;
  const height = node.measured.height ?? 40;
  return {
    x: node.internals.positionAbsolute.x + width / 2,
    y: node.internals.positionAbsolute.y + height / 2,
  };
}

function getNodeIntersection(intersectionNode: InternalNode<FlowNode>, targetNode: InternalNode<FlowNode>) {
  const w = (intersectionNode.measured.width ?? 120) / 2;
  const h = (intersectionNode.measured.height ?? 40) / 2;
  const x2 = intersectionNode.internals.positionAbsolute.x + w;
  const y2 = intersectionNode.internals.positionAbsolute.y + h;
  const { x: x1, y: y1 } = getNodeCenter(targetNode);

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);

  return { x: w * (a * xx1 + a * yy1) + x2, y: h * (-a * xx1 + a * yy1) + y2 };
}

function RelationshipEdge({ source, target, data, markerEnd }: EdgeProps<FlowEdge>) {
  const sourceNode = useInternalNode<FlowNode>(source);
  const targetNode = useInternalNode<FlowNode>(target);
  if (!sourceNode || !targetNode || !data) return null;

  const { x: sx, y: sy } = getNodeIntersection(sourceNode, targetNode);
  const { x: tx, y: ty } = getNodeIntersection(targetNode, sourceNode);
  const [edgePath, labelX, labelY] = getStraightPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty });

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={data.mirrored ? undefined : markerEnd}
        style={{ stroke: "var(--ink)", strokeDasharray: data.mirrored ? "2 5" : undefined }}
      />
      <EdgeLabelRenderer>
        <div
          className="absolute px-1 text-[13px] whitespace-nowrap"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            color: data.mirrored ? "var(--dim)" : "var(--bright)",
            background: "var(--bg)",
          }}
        >
          {data.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes: EdgeTypes = { relationship: RelationshipEdge };

// Radial layout: the focus node (if any) at the center, every other node
// evenly spaced on a ring around it. With no focus node (or none found), all
// nodes share the ring — a reasonable fallback for a future peer graph
// (Phase 2, §12) with no single "current" tool.
function layoutNodes(props: ToolGraphProps): FlowNode[] {
  const focusIndex = props.focusSlug ? props.nodes.findIndex((n) => n.slug === props.focusSlug) : -1;
  const ring = focusIndex >= 0 ? props.nodes.filter((_, i) => i !== focusIndex) : props.nodes;
  const radius = Math.max(130, 70 + ring.length * 22);

  const positioned: FlowNode[] = [];
  if (focusIndex >= 0) {
    const focusNode = props.nodes[focusIndex];
    positioned.push({
      id: focusNode.slug,
      type: "tool",
      position: { x: 0, y: 0 },
      data: { label: focusNode.name, isFocus: true },
    });
  }
  ring.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / ring.length - Math.PI / 2;
    positioned.push({
      id: node.slug,
      type: "tool",
      position: { x: radius * Math.cos(angle), y: radius * Math.sin(angle) },
      data: { label: node.name, isFocus: false },
    });
  });
  return positioned;
}

export default function ToolGraph(props: ToolGraphProps) {
  const { edges, onNodeClick } = props;
  const flowNodes = useMemo(() => layoutNodes(props), [props]);
  const flowEdges = useMemo<FlowEdge[]>(
    () =>
      edges.map((edge) => ({
        id: `${edge.source}-${edge.target}-${edge.type}`,
        source: edge.source,
        target: edge.target,
        type: "relationship",
        data: { label: edge.type, mirrored: edge.mirrored },
        markerEnd: edge.mirrored
          ? undefined
          : { type: MarkerType.ArrowClosed, color: "var(--ink)", width: 14, height: 14 },
      })),
    [edges],
  );

  return (
    <div>
      <div style={{ height: 260 }}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.35 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          onNodeClick={(_, node) => onNodeClick(node.id)}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-[15px] text-dim">
        <span>
          <span className="mr-1.5 text-ink">──</span>directional
        </span>
        <span>
          <span className="mr-1.5 tracking-widest text-ink">··</span>pairs well with
        </span>
      </div>
    </div>
  );
}
