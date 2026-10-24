import type { SttToken } from "../transcript/types";
import type { SttSession, SttSessionOptions } from "./types";

export const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";
/** 실시간 모델 이름. Soniox가 새 모델을 내면 이 값(또는 옵션)만 바꾸면 된다. */
export const SONIOX_DEFAULT_MODEL = "stt-rt-v3";

interface SonioxToken {
  text: string;
  is_final: boolean;
  speaker?: string;
  start_ms?: number;
  end_ms?: number;
}

interface SonioxMessage {
  tokens?: SonioxToken[];
  finished?: boolean;
  error_code?: number;
  error_message?: string;
}

export interface SonioxOptions extends SttSessionOptions {
  model?: string;
  url?: string;
}

/** Soniox 실시간 WebSocket 세션 (브라우저/Electron 렌더러에서 동작) */
export class SonioxSession implements SttSession {
  private ws: WebSocket | null = null;
  private finished: (() => void) | null = null;

  constructor(private readonly opts: SonioxOptions) {}

  async start() {
    const apiKey = await this.opts.getApiKey();
    const ws = new WebSocket(this.opts.url ?? SONIOX_WS_URL);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            api_key: apiKey,
            model: this.opts.model ?? SONIOX_DEFAULT_MODEL,
            audio_format: "pcm_s16le",
            sample_rate: 16000,
            num_channels: 1,
            language_hints: this.opts.languageHints ?? ["ko", "en"],
            enable_speaker_diarization: this.opts.diarization,
            enable_endpoint_detection: true,
            ...(this.opts.context ? { context: this.opts.context } : {}),
          }),
        );
        resolve();
      };
      ws.onerror = () => reject(new Error("STT 서버에 연결하지 못했습니다."));
    });

    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      let msg: SonioxMessage;
      try {
        msg = JSON.parse(ev.data) as SonioxMessage;
      } catch {
        return;
      }
      if (msg.error_code) {
        this.opts.onError?.(new Error(`STT 오류 ${msg.error_code}: ${msg.error_message ?? ""}`));
        return;
      }
      if (msg.tokens?.length) {
        const tokens: SttToken[] = msg.tokens.map((t) => ({
          text: t.text,
          isFinal: t.is_final,
          speaker: t.speaker,
          startMs: t.start_ms,
          endMs: t.end_ms,
        }));
        this.opts.onTokens(tokens);
      }
      if (msg.finished) this.finished?.();
    };
    ws.onerror = () => this.opts.onError?.(new Error("STT 연결 오류"));
    ws.onclose = () => {
      this.finished?.();
      this.opts.onClose?.();
    };
  }

  sendAudio(pcm: Int16Array) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
    }
  }

  /** 빈 프레임으로 스트림 종료를 알리고, 남은 확정 결과를 받은 뒤 닫는다 */
  async stop() {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const done = new Promise<void>((resolve) => {
      this.finished = resolve;
      setTimeout(resolve, 4000);
    });
    ws.send("");
    await done;
    ws.close();
    this.ws = null;
  }
}
