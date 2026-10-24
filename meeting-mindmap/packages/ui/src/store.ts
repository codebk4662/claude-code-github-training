import { create } from "zustand";
import {
  applyPatch,
  createMindMap,
  type ActionItem,
  type MeetingSummary,
  type MindMap,
  type PartialLine,
  type PatchOp,
  type SpeakerNames,
  type Utterance,
} from "@mm/core";

export type MeetingStatus = "idle" | "starting" | "recording" | "stopping" | "done" | "error";

export interface MeetingState {
  status: MeetingStatus;
  error: string | null;
  startedAt: number | null;
  utterances: Utterance[];
  partials: Record<string, PartialLine | null>;
  levels: Record<string, number>;
  mindmap: MindMap;
  /** 최근 패치로 바뀐 노드 (하이라이트) */
  highlightIds: string[];
  summaryBullets: string[];
  /** 지금까지 파악된 회의의 핵심 주제. 실제로 바뀌었을 때만 갱신됨 */
  topic: string | null;
  /** 진행 중 액션아이템 (회의 중 누적) */
  actionItems: ActionItem[];
  /** 지금까지 드러난 주요 쟁점 (회의 중 누적) */
  keyDebates: string[];
  /** 지금까지 합의/결론 난 내용 (회의 중 누적) */
  conclusions: string[];
  speakerNames: SpeakerNames;
  finalSummary: MeetingSummary | null;
  /** 마인드맵 갱신 요청 진행 중 */
  updating: boolean;
  /** 녹음은 계속되지만 최근 마인드맵 갱신이 실패했을 때의 경고 (status는 바꾸지 않음) */
  syncWarning: string | null;

  reset(title?: string): void;
  setStatus(status: MeetingStatus, error?: string | null): void;
  setSyncWarning(warning: string | null): void;
  addUtterance(u: Utterance): void;
  removeUtterance(id: string): void;
  setPartial(channel: string, p: PartialLine | null): void;
  setLevel(channel: string, rms: number): void;
  applyOps(ops: PatchOp[], title?: string | null): void;
  clearHighlight(): void;
  addSummaryBullets(bullets: string[]): void;
  setTopic(topic: string | null): void;
  addActionItems(items: ActionItem[]): void;
  addKeyDebates(items: string[]): void;
  addConclusions(items: string[]): void;
  renameSpeaker(key: string, name: string): void;
  renameNode(id: string, label: string): void;
  setFinalSummary(s: MeetingSummary | null): void;
  setUpdating(v: boolean): void;
  load(snapshot: Partial<MeetingState>): void;
}

/** 이미 있는 문자열(trim 비교)은 빼고 새 항목만 뒤에 붙인다 */
function dedupeAppend(existing: string[], incoming: string[]): string[] {
  const known = new Set(existing.map((s) => s.trim()));
  const fresh = incoming.filter((s) => s.trim() && !known.has(s.trim()));
  return fresh.length ? [...existing, ...fresh] : existing;
}

const initial = (title = "새 회의") => ({
  status: "idle" as MeetingStatus,
  error: null,
  startedAt: null,
  utterances: [],
  partials: {},
  levels: {},
  mindmap: createMindMap(title),
  highlightIds: [],
  summaryBullets: [],
  topic: null,
  actionItems: [],
  keyDebates: [],
  conclusions: [],
  speakerNames: {},
  finalSummary: null,
  updating: false,
  syncWarning: null,
});

export const useMeeting = create<MeetingState>()((set) => ({
  ...initial(),
  reset: (title) => set({ ...initial(title) }),
  setStatus: (status, error = null) =>
    set((s) => ({ status, error, startedAt: status === "recording" && !s.startedAt ? Date.now() : s.startedAt })),
  addUtterance: (u) => set((s) => ({ utterances: [...s.utterances, u] })),
  removeUtterance: (id) => set((s) => ({ utterances: s.utterances.filter((u) => u.id !== id) })),
  setPartial: (channel, p) => set((s) => ({ partials: { ...s.partials, [channel]: p } })),
  setLevel: (channel, rms) => set((s) => ({ levels: { ...s.levels, [channel]: rms } })),
  applyOps: (ops, title) =>
    set((s) => {
      const { map, changedIds } = applyPatch(s.mindmap, ops);
      const root = map.nodes[map.rootId];
      if (title?.trim() && root) map.nodes[map.rootId] = { ...root, label: title.trim() };
      return { mindmap: map, highlightIds: changedIds };
    }),
  clearHighlight: () => set({ highlightIds: [] }),
  addSummaryBullets: (bullets) =>
    set((s) => ({ summaryBullets: [...s.summaryBullets, ...bullets.filter((b) => b.trim())] })),
  setTopic: (topic) => set({ topic }),
  addActionItems: (items) =>
    set((s) => {
      const known = new Set(s.actionItems.map((a) => a.task.trim()));
      const fresh = items.filter((a) => a.task.trim() && !known.has(a.task.trim()));
      return fresh.length ? { actionItems: [...s.actionItems, ...fresh] } : {};
    }),
  addKeyDebates: (items) => set((s) => ({ keyDebates: dedupeAppend(s.keyDebates, items) })),
  addConclusions: (items) => set((s) => ({ conclusions: dedupeAppend(s.conclusions, items) })),
  renameSpeaker: (key, name) => set((s) => ({ speakerNames: { ...s.speakerNames, [key]: name } })),
  renameNode: (id, label) =>
    set((s) => {
      const node = s.mindmap.nodes[id];
      if (!node || !label.trim()) return {};
      return { mindmap: { ...s.mindmap, nodes: { ...s.mindmap.nodes, [id]: { ...node, label: label.trim() } } } };
    }),
  setFinalSummary: (finalSummary) => set({ finalSummary }),
  setUpdating: (updating) => set({ updating }),
  setSyncWarning: (syncWarning) => set({ syncWarning }),
  load: (snapshot) => set({ ...initial(), ...snapshot, status: "done" }),
}));
