import { create } from "zustand";
import {
  applyPatch,
  createMindMap,
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
  speakerNames: SpeakerNames;
  finalSummary: MeetingSummary | null;
  /** 마인드맵 갱신 요청 진행 중 */
  updating: boolean;

  reset(title?: string): void;
  setStatus(status: MeetingStatus, error?: string | null): void;
  addUtterance(u: Utterance): void;
  removeUtterance(id: string): void;
  setPartial(channel: string, p: PartialLine | null): void;
  setLevel(channel: string, rms: number): void;
  applyOps(ops: PatchOp[], title?: string | null): void;
  clearHighlight(): void;
  addSummaryBullets(bullets: string[]): void;
  renameSpeaker(key: string, name: string): void;
  renameNode(id: string, label: string): void;
  setFinalSummary(s: MeetingSummary | null): void;
  setUpdating(v: boolean): void;
  load(snapshot: Partial<MeetingState>): void;
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
  speakerNames: {},
  finalSummary: null,
  updating: false,
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
  renameSpeaker: (key, name) => set((s) => ({ speakerNames: { ...s.speakerNames, [key]: name } })),
  renameNode: (id, label) =>
    set((s) => {
      const node = s.mindmap.nodes[id];
      if (!node || !label.trim()) return {};
      return { mindmap: { ...s.mindmap, nodes: { ...s.mindmap.nodes, [id]: { ...node, label: label.trim() } } } };
    }),
  setFinalSummary: (finalSummary) => set({ finalSummary }),
  setUpdating: (updating) => set({ updating }),
  load: (snapshot) => set({ ...initial(), ...snapshot, status: "done" }),
}));
