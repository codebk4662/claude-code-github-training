import type { MindMap, PatchOp } from "./types";

export interface ApplyResult {
  map: MindMap;
  /** 이번 패치로 추가·수정된 노드 id (UI 하이라이트용) */
  changedIds: string[];
  /** 적용하지 못하고 무시한 명령 (디버깅용) */
  skipped: PatchOp[];
}

function isAncestor(map: MindMap, ancestorId: string, id: string): boolean {
  let cur = map.nodes[id];
  const seen = new Set<string>();
  while (cur && cur.parentId && !seen.has(cur.id)) {
    if (cur.parentId === ancestorId) return true;
    seen.add(cur.id);
    cur = map.nodes[cur.parentId];
  }
  return false;
}

/**
 * 마인드맵에 패치를 적용한다. 원본은 바꾸지 않는다.
 * LLM 출력은 틀릴 수 있으므로 잘못된 명령은 조용히 건너뛰거나 안전하게 보정한다.
 */
export function applyPatch(input: MindMap, ops: PatchOp[]): ApplyResult {
  const map: MindMap = { ...input, nodes: { ...input.nodes } };
  const changed = new Set<string>();
  const skipped: PatchOp[] = [];

  const parentOrRoot = (parentId: string | null) =>
    parentId && map.nodes[parentId] ? parentId : map.rootId;

  for (const op of ops) {
    const id = op.id?.trim();
    if (!id) {
      skipped.push(op);
      continue;
    }
    const existing = map.nodes[id];

    switch (op.op) {
      case "add": {
        const label = op.label?.trim();
        if (!label) {
          skipped.push(op);
          break;
        }
        if (existing) {
          // 이미 있는 id면 수정으로 취급
          map.nodes[id] = { ...existing, label, note: op.note ?? existing.note };
        } else {
          map.nodes[id] = {
            id,
            parentId: parentOrRoot(op.parentId),
            label,
            note: op.note ?? undefined,
            seq: map.nextSeq++,
          };
        }
        changed.add(id);
        break;
      }
      case "update": {
        if (!existing) {
          skipped.push(op);
          break;
        }
        map.nodes[id] = {
          ...existing,
          label: op.label?.trim() || existing.label,
          note: op.note ?? existing.note,
        };
        changed.add(id);
        break;
      }
      case "move": {
        const target = parentOrRoot(op.parentId);
        if (!existing || id === map.rootId || target === id || isAncestor(map, id, target)) {
          skipped.push(op);
          break;
        }
        map.nodes[id] = { ...existing, parentId: target };
        changed.add(id);
        break;
      }
      case "merge": {
        const into = op.parentId;
        if (!existing || !into || !map.nodes[into] || id === map.rootId || into === id || isAncestor(map, id, into)) {
          skipped.push(op);
          break;
        }
        for (const node of Object.values(map.nodes)) {
          if (node.parentId === id) map.nodes[node.id] = { ...node, parentId: into };
        }
        delete map.nodes[id];
        changed.delete(id);
        changed.add(into);
        break;
      }
      default:
        skipped.push(op);
    }
  }

  return { map, changedIds: [...changed], skipped };
}
