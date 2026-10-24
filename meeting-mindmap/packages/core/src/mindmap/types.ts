export const ROOT_ID = "root";

export interface MindNode {
  id: string;
  parentId: string | null;
  label: string;
  note?: string;
  /** 추가된 순서. 형제 노드 정렬과 "새 노드" 하이라이트에 사용 */
  seq: number;
}

export interface MindMap {
  rootId: string;
  nodes: Record<string, MindNode>;
  nextSeq: number;
}

/**
 * Claude가 돌려주는 마인드맵 변경 명령.
 * 구조화 출력(JSON schema)과 맞추기 위해 모든 필드를 두고, 쓰지 않는 값은 null.
 * - add:    새 노드 (id, parentId, label 필수)
 * - update: 라벨/메모 수정
 * - move:   다른 부모로 이동
 * - merge:  id 노드를 parentId 노드로 합침 (자식은 parentId 아래로 이동, id는 삭제)
 */
export interface PatchOp {
  op: "add" | "update" | "move" | "merge";
  id: string;
  parentId: string | null;
  label: string | null;
  note: string | null;
}

export function createMindMap(title = "회의"): MindMap {
  return {
    rootId: ROOT_ID,
    nodes: { [ROOT_ID]: { id: ROOT_ID, parentId: null, label: title, seq: 0 } },
    nextSeq: 1,
  };
}

export function childrenOf(map: MindMap, id: string): MindNode[] {
  return Object.values(map.nodes)
    .filter((n) => n.parentId === id)
    .sort((a, b) => a.seq - b.seq);
}

/** 프롬프트에 넣기 위한 들여쓰기 아웃라인. 예: "- [n3] 예산 (메모)" */
export function toOutline(map: MindMap): string {
  const lines: string[] = [];
  const walk = (id: string, depth: number) => {
    const node = map.nodes[id];
    if (!node) return;
    const note = node.note ? ` (${node.note})` : "";
    lines.push(`${"  ".repeat(depth)}- [${node.id}] ${node.label}${note}`);
    for (const child of childrenOf(map, id)) walk(child.id, depth + 1);
  };
  walk(map.rootId, 0);
  return lines.join("\n");
}

/** Markdown 내보내기용 */
export function toMarkdown(map: MindMap): string {
  const lines: string[] = [];
  const walk = (id: string, depth: number) => {
    const node = map.nodes[id];
    if (!node) return;
    if (depth === 0) lines.push(`# ${node.label}`, "");
    else lines.push(`${"  ".repeat(depth - 1)}- ${node.label}${node.note ? ` — ${node.note}` : ""}`);
    for (const child of childrenOf(map, id)) walk(child.id, depth + 1);
  };
  walk(map.rootId, 0);
  return lines.join("\n");
}
