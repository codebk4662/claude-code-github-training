import { describe, expect, it } from "vitest";
import { applyPatch } from "./applyPatch";
import { createMindMap, toOutline, type PatchOp } from "./types";

const op = (o: Partial<PatchOp> & Pick<PatchOp, "op" | "id">): PatchOp => ({
  parentId: null,
  label: null,
  note: null,
  speakers: null,
  ...o,
});

describe("applyPatch", () => {
  it("adds nodes under root and under each other", () => {
    const { map, changedIds } = applyPatch(createMindMap("주간회의"), [
      op({ op: "add", id: "a", parentId: "root", label: "예산" }),
      op({ op: "add", id: "b", parentId: "a", label: "마케팅 비용" }),
    ]);
    expect(changedIds).toEqual(["a", "b"]);
    expect(toOutline(map)).toBe("- [root] 주간회의\n  - [a] 예산\n    - [b] 마케팅 비용");
  });

  it("does not mutate the input map", () => {
    const base = createMindMap();
    applyPatch(base, [op({ op: "add", id: "a", label: "x" })]);
    expect(Object.keys(base.nodes)).toEqual(["root"]);
  });

  it("attaches to root when the parent is unknown", () => {
    const { map } = applyPatch(createMindMap(), [op({ op: "add", id: "a", parentId: "nope", label: "x" })]);
    expect(map.nodes.a?.parentId).toBe("root");
  });

  it("treats add with an existing id as update", () => {
    let { map } = applyPatch(createMindMap(), [op({ op: "add", id: "a", label: "x" })]);
    ({ map } = applyPatch(map, [op({ op: "add", id: "a", label: "y" })]));
    expect(map.nodes.a?.label).toBe("y");
    expect(Object.keys(map.nodes)).toHaveLength(2);
  });

  it("skips moves that would create a cycle", () => {
    let { map } = applyPatch(createMindMap(), [
      op({ op: "add", id: "a", label: "a" }),
      op({ op: "add", id: "b", parentId: "a", label: "b" }),
    ]);
    const res = applyPatch(map, [op({ op: "move", id: "a", parentId: "b" })]);
    expect(res.skipped).toHaveLength(1);
    expect(res.map.nodes.a?.parentId).toBe("root");
    ({ map } = applyPatch(map, [op({ op: "move", id: "b", parentId: "root" })]));
    expect(map.nodes.b?.parentId).toBe("root");
  });

  it("merges a node into another and re-parents its children", () => {
    const { map } = applyPatch(createMindMap(), [
      op({ op: "add", id: "a", label: "일정" }),
      op({ op: "add", id: "b", label: "스케줄" }),
      op({ op: "add", id: "c", parentId: "b", label: "11월 출시" }),
      op({ op: "merge", id: "b", parentId: "a" }),
    ]);
    expect(map.nodes.b).toBeUndefined();
    expect(map.nodes.c?.parentId).toBe("a");
  });

  it("unions speakers on add-as-update and on merge", () => {
    let { map } = applyPatch(createMindMap(), [
      op({ op: "add", id: "a", label: "일정", speakers: ["김부장"] }),
      op({ op: "add", id: "b", label: "스케줄", speakers: ["이과장"] }),
    ]);
    ({ map } = applyPatch(map, [op({ op: "add", id: "a", label: "일정", speakers: ["박대리"] })]));
    expect(map.nodes.a?.speakers).toEqual(["김부장", "박대리"]);
    ({ map } = applyPatch(map, [op({ op: "merge", id: "b", parentId: "a" })]));
    expect(map.nodes.a?.speakers).toEqual(["김부장", "박대리", "이과장"]);
  });

  it("never moves or merges the root", () => {
    const res = applyPatch(createMindMap(), [
      op({ op: "add", id: "a", label: "a" }),
      op({ op: "move", id: "root", parentId: "a" }),
      op({ op: "merge", id: "root", parentId: "a" }),
    ]);
    expect(res.skipped).toHaveLength(2);
    expect(res.map.nodes.root?.parentId).toBeNull();
  });
});
