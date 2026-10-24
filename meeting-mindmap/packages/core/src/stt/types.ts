import type { SttToken } from "../transcript/types";

export interface SttSessionOptions {
  /** 브라우저에서 쓸 단기(임시) API 키를 받아오는 함수. 실제 키는 서버에만 둔다. */
  getApiKey: () => Promise<string>;
  /** 화자분리 사용 여부 (오프라인/시스템 오디오 = true, 온라인 마이크 = false) */
  diarization: boolean;
  languageHints?: string[];
  /** 문맥 힌트 (회의 주제, 고유명사 등) */
  context?: string;
  onTokens: (tokens: SttToken[]) => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
}

/** STT 공급자 교체가 쉽도록 둔 최소 인터페이스 (Soniox → Deepgram 등) */
export interface SttSession {
  start(): Promise<void>;
  /** 16kHz mono PCM s16le */
  sendAudio(pcm: Int16Array): void;
  stop(): Promise<void>;
}
