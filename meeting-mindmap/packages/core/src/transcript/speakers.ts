import type { SpeakerNames, Utterance } from "./types";

/** 이름이 지정되지 않은 화자의 기본 표시 이름 */
export function defaultSpeakerName(speakerKey: string): string {
  if (speakerKey === "me") return "나";
  const [channel, n] = speakerKey.split(":");
  if (channel === "system") return `참가자 ${n ?? "?"}`;
  return `화자 ${n ?? "?"}`;
}

export function speakerName(names: SpeakerNames, speakerKey: string): string {
  return names[speakerKey]?.trim() || defaultSpeakerName(speakerKey);
}

const SPEAKER_COLORS = 8;

/** 화자 표시 이름(또는 키)마다 고정 색상 번호(0~7). 자막·마인드맵에서 동일 화자는 같은 색을 쓰도록 공유한다 */
export function speakerColorIndex(name: string): number {
  if (name === "나" || name === "me") return 0;
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % (SPEAKER_COLORS - 1)) + 1;
}

/** LLM 프롬프트용 한 줄: "[03:12] 김부장: 예산은…" */
export function formatUtterance(u: Utterance, names: SpeakerNames): string {
  const sec = Math.floor(u.at / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `[${mm}:${ss}] ${speakerName(names, u.speakerKey)}: ${u.text}`;
}

function bigrams(s: string): Map<string, number> {
  const clean = s.replace(/[\s.,?!·…~"'“”‘’-]/g, "");
  const m = new Map<string, number>();
  for (let i = 0; i < clean.length - 1; i++) {
    const g = clean.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** 두 문장의 글자 바이그램 유사도 (Dice 계수, 0~1) */
export function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  let total = 0;
  let overlap = 0;
  for (const v of A.values()) total += v;
  for (const v of B.values()) total += v;
  for (const [g, v] of A) overlap += Math.min(v, B.get(g) ?? 0);
  return total === 0 ? 0 : (2 * overlap) / total;
}

/**
 * 온라인 버전: 스피커로 나온 상대방 목소리가 마이크에 다시 잡히면(에코) 같은 문장이 두 번 생긴다.
 * 비슷한 시각에 다른 채널에서 거의 같은 문장이 있으면 그 발언을 돌려준다.
 */
export function findEchoDuplicate(
  utt: Utterance,
  recent: Utterance[],
  { windowMs = 4000, threshold = 0.6 } = {},
): Utterance | undefined {
  return recent.find(
    (r) =>
      r.channel !== utt.channel &&
      Math.abs(r.at - utt.at) <= windowMs &&
      similarity(r.text, utt.text) >= threshold,
  );
}
