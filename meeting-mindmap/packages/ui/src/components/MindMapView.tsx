import { useEffect, useMemo, type CSSProperties } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import { hierarchy, tree } from "d3-hierarchy";
import { childrenOf, speakerColorIndex, type MindMap, type MindNode } from "@mm/core";
import { useMeeting } from "../store";

type TreeDatum = MindNode & { children: TreeDatum[] };
type MindFlowNode = Node<
  { label: string; note?: string; depth: number; fresh: boolean; speakers?: string[]; branchColor: number },
  "mind"
>;

const NODE_W = 224;
const ROW_H = 64;

function toTree(map: MindMap, id: string): TreeDatum | null {
  const n = map.nodes[id];
  if (!n) return null;
  return {
    ...n,
    children: childrenOf(map, id)
      .map((c) => toTree(map, c.id))
      .filter((c): c is TreeDatum => c !== null),
  };
}

const BRANCH_COLORS = 8;

/** 1단계(안건) 노드마다 색상 하나씩 배정하고, 그 하위 자손은 같은 색을 물려받는다 */
function computeBranchColors(root: ReturnType<typeof hierarchy<TreeDatum>>): Map<string, number> {
  const colorOf = new Map<string, number>();
  let i = 0;
  for (const d of root.descendants()) {
    if (d.depth === 0) colorOf.set(d.data.id, -1);
    else if (d.depth === 1) colorOf.set(d.data.id, i++ % BRANCH_COLORS);
    else colorOf.set(d.data.id, (d.parent && colorOf.get(d.parent.data.id)) ?? -1);
  }
  return colorOf;
}

/** 왼쪽→오른쪽으로 펼쳐지는 트리 레이아웃 */
export function layoutMindMap(map: MindMap, highlight: string[]): { nodes: MindFlowNode[]; edges: Edge[] } {
  const data = toTree(map, map.rootId);
  if (!data) return { nodes: [], edges: [] };
  const root = tree<TreeDatum>().nodeSize([ROW_H, NODE_W + 60])(hierarchy(data));
  const fresh = new Set(highlight);
  const branchColor = computeBranchColors(root);
  const nodes: MindFlowNode[] = root.descendants().map((d) => ({
    id: d.data.id,
    type: "mind",
    position: { x: d.y, y: d.x },
    data: {
      label: d.data.label,
      note: d.data.note,
      depth: d.depth,
      fresh: fresh.has(d.data.id),
      speakers: d.data.speakers,
      branchColor: branchColor.get(d.data.id) ?? -1,
    },
    draggable: false,
  }));
  const edges: Edge[] = root.links().map((l) => ({
    id: `${l.source.data.id}-${l.target.data.id}`,
    source: l.source.data.id,
    target: l.target.data.id,
    type: "smoothstep",
  }));
  return { nodes, edges };
}

function MindNodeView({ id, data }: NodeProps<MindFlowNode>) {
  const renameNode = useMeeting((s) => s.renameNode);
  const style = data.branchColor >= 0 ? ({ "--branch-color": `var(--c${data.branchColor})` } as CSSProperties) : undefined;
  return (
    <div
      className={`mm-node depth-${Math.min(data.depth, 3)}${data.fresh ? " fresh" : ""}`}
      style={style}
      title={data.note ? `${data.label}\n${data.note}` : data.label}
      onDoubleClick={() => {
        const next = window.prompt("노드 이름 바꾸기", data.label);
        if (next) renameNode(id, next);
      }}
    >
      {data.depth > 0 && <Handle type="target" position={Position.Left} />}
      <div className="mm-node-label">{data.label}</div>
      {data.note && <div className="mm-node-note">{data.note}</div>}
      {data.speakers && data.speakers.length > 0 && (
        <div className="mm-node-speakers">
          {data.speakers.slice(0, 3).map((name) => (
            <span key={name} className={`mm-chip c${speakerColorIndex(name)}`}>
              {name}
            </span>
          ))}
          {data.speakers.length > 3 && <span className="mm-chip-more">+{data.speakers.length - 3}</span>}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { mind: MindNodeView };

/** 노드 수가 바뀔 때마다 전체가 보이도록 화면을 맞춘다 */
function AutoFit({ nodes }: { nodes: MindFlowNode[] }) {
  const { fitBounds } = useReactFlow();
  // 레이아웃 좌표로 범위를 직접 계산한다 (노드 크기 측정 시점에 영향받지 않음)
  const key = nodes.map((n) => `${n.id}:${n.position.x},${n.position.y}`).join("|");
  useEffect(() => {
    if (!nodes.length) return;
    const xs = nodes.map((n) => n.position.x);
    const ys = nodes.map((n) => n.position.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys) - 10;
    const rect = { x, y, width: Math.max(...xs) + NODE_W - x, height: Math.max(...ys) + ROW_H + 10 - y };
    const t = setTimeout(() => void fitBounds(rect, { padding: 0.15, duration: 400 }), 30);
    return () => clearTimeout(t);
  }, [key, fitBounds]);
  return null;
}

export function MindMapView() {
  const mindmap = useMeeting((s) => s.mindmap);
  const highlight = useMeeting((s) => s.highlightIds);
  const clearHighlight = useMeeting((s) => s.clearHighlight);
  const updating = useMeeting((s) => s.updating);

  // 새로 바뀐 노드는 잠깐만 강조
  useEffect(() => {
    if (!highlight.length) return;
    const t = setTimeout(clearHighlight, 4000);
    return () => clearTimeout(t);
  }, [highlight, clearHighlight]);
  const { nodes, edges } = useMemo(() => layoutMindMap(mindmap, highlight), [mindmap, highlight]);
  const count = nodes.length;

  return (
    <div className="mm-mindmap">
      {updating && <div className="mm-badge">마인드맵 정리 중…</div>}
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
          nodesConnectable={false}
          minZoom={0.2}
          maxZoom={1.3}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
          <AutoFit nodes={nodes} />
        </ReactFlow>
      </ReactFlowProvider>
      {count < 2 && <div className="mm-empty">대화가 시작되면 마인드맵이 여기에 자라납니다</div>}
    </div>
  );
}
