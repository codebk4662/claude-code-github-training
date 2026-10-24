import type { PatchOp } from "../mindmap/types";

/** POST /api/mindmap */
export interface MindmapRequest {
  /** 현재 마인드맵 아웃라인 (toOutline 결과) */
  outline: string;
  /** 지난 호출 이후 새로 확정된 발언들 (formatUtterance 결과) */
  utterances: string[];
  /** 지금까지 요약 bullet (중복 방지용) */
  summarySoFar: string[];
  /** 회의 유형 힌트 */
  mode: "online" | "offline";
}

export interface MindmapResponse {
  ops: PatchOp[];
  /** 새로 추가할 요약 bullet */
  summaryBullets: string[];
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
