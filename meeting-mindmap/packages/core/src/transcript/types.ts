/** STT 엔진과 무관한 공통 토큰 형식 */
export interface SttToken {
  text: string;
  isFinal: boolean;
  /** STT 화자분리 결과 ("1", "2" …). 없으면 undefined */
  speaker?: string;
  startMs?: number;
  endMs?: number;
}

/** 확정된 한 발언 */
export interface Utterance {
  id: string;
  /** 화자 식별 키. 예: "room:1", "system:2", "me" */
  speakerKey: string;
  /** 오디오 출처. 오프라인="room", 온라인=마이크 "mic" / 시스템 오디오 "system" */
  channel: string;
  text: string;
  startMs: number;
  endMs: number;
  /** 회의 시작 기준 벽시계 시간 (ms) */
  at: number;
}

/** 아직 확정되지 않은 진행 중 텍스트 */
export interface PartialLine {
  channel: string;
  speakerKey: string;
  text: string;
}

/** 화자 키 → 표시 이름 */
export type SpeakerNames = Record<string, string>;
