import type { PatchOp } from "../mindmap/types";

/** POST /api/mindmap */
export interface MindmapRequest {
  /** 현재 마인드맵 아웃라인 (toOutline 결과) */
  outline: string;
  /** 지난 호출 이후 새로 확정된 발언들 (formatUtterance 결과) */
  utterances: string[];
  /** 지금까지 요약 bullet (중복 방지용) */
  summarySoFar: string[];
  /** 지금까지 나온 액션아이템 (중복 방지용) */
  actionItemsSoFar: string[];
  /** 지금까지 나온 쟁점 (중복 방지용) */
  keyDebatesSoFar: string[];
  /** 지금까지 나온 결론/합의 (중복 방지용) */
  conclusionsSoFar: string[];
  /** 회의 유형 힌트 */
  mode: "online" | "offline";
}

export interface MindmapResponse {
  ops: PatchOp[];
  /** 새로 추가할 요약 bullet */
  summaryBullets: string[];
  /** 지금까지 파악된 회의의 핵심 주제. 실제로 바뀌었을 때만 채움, 아니면 null */
  topic: string | null;
  /** 이번 발언에서 새로 나온 액션아이템만 (누적은 클라이언트가 처리) */
  newActionItems: ActionItem[];
  /** 이번 발언에서 새로 드러난 쟁점만 (대립하는 입장을 한 줄에) */
  newKeyDebates: string[];
  /** 이번 발언에서 새로 합의/결론 난 내용만 */
  newConclusions: string[];
  /** 회의 제목 제안 (루트 노드). 바꿀 필요 없으면 null */
  title: string | null;
}

/** POST /api/summary */
export interface SummaryRequest {
  transcript: string[];
  outline: string;
  speakers: string[];
  mode: "online" | "offline";
}

export interface ActionItem {
  task: string;
  owner: string | null;
  due: string | null;
}

export interface MeetingSummary {
  title: string;
  overview: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
  openQuestions: string[];
}

/** POST /api/stt-token */
export interface SttTokenResponse {
  apiKey: string;
  expiresAt?: string;
}

export async function postJson<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} 실패 (${res.status}) ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}
