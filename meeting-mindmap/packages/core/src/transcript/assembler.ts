import type { PartialLine, SttToken, Utterance } from "./types";

/** STT 엔진이 발화 끝(엔드포인트)에서 보내는 특수 토큰 */
const ENDPOINT_TOKENS = new Set(["<end>", "<fin>"]);
const MAX_CHARS = 280;

export interface AssemblerOptions {
  channel: string;
  /** 지정하면 화자분리 결과를 무시하고 이 키로 고정 (예: 온라인 버전 마이크 = "me") */
  fixedSpeakerKey?: string;
  /** 회의 시작 시각 (Date.now()) */
  startedAt: number;
  now?: () => number;
}

/**
 * STT 토큰 스트림을 화자별 "발언" 단위로 묶는다.
 * - 확정 토큰은 버퍼에 쌓고, 화자가 바뀌거나 엔드포인트 토큰이 오면 발언을 확정한다.
 * - 미확정 토큰은 매 메시지마다 새로 오는 진행 중 텍스트로 취급한다.
 */
export class UtteranceAssembler {
  private buf = "";
  private bufSpeaker: string | undefined;
  private bufStart = 0;
  private bufEnd = 0;
  private counter = 0;
  private readonly now: () => number;

  constructor(private readonly opts: AssemblerOptions) {
    this.now = opts.now ?? Date.now;
  }

  private key(speaker: string | undefined) {
    return this.opts.fixedSpeakerKey ?? `${this.opts.channel}:${speaker ?? "1"}`;
  }

  private close(out: Utterance[]) {
    const text = this.buf.trim();
    if (text) {
      out.push({
        id: `${this.opts.channel}-${++this.counter}-${this.bufStart}`,
        speakerKey: this.key(this.bufSpeaker),
        channel: this.opts.channel,
        text,
        startMs: this.bufStart,
        endMs: this.bufEnd,
        at: this.now() - this.opts.startedAt,
      });
    }
    this.buf = "";
    this.bufSpeaker = undefined;
  }

  feed(tokens: SttToken[]): { finals: Utterance[]; partial: PartialLine | null } {
    const finals: Utterance[] = [];
    let partialText = "";
    let partialSpeaker: string | undefined;

    for (const t of tokens) {
      if (ENDPOINT_TOKENS.has(t.text)) {
        if (t.isFinal) this.close(finals);
        continue;
      }
      if (!t.isFinal) {
        partialText += t.text;
        partialSpeaker ??= t.speaker;
        continue;
      }
      const speakerChanged =
        !this.opts.fixedSpeakerKey && this.buf.trim() !== "" && t.speaker !== undefined && t.speaker !== this.bufSpeaker;
      if (speakerChanged) this.close(finals);
      if (!this.buf) {
        this.bufSpeaker = t.speaker;
        this.bufStart = t.startMs ?? 0;
      }
      this.buf += t.text;
      this.bufEnd = t.endMs ?? this.bufEnd;
      // 너무 긴 발언은 문장 끝에서 끊는다
      if (this.buf.length > MAX_CHARS && /[.?!。？！]\s*$/.test(this.buf)) this.close(finals);
    }

    const pending = (this.buf + partialText).trim();
    const partial: PartialLine | null = pending
      ? { channel: this.opts.channel, speakerKey: this.key(this.bufSpeaker ?? partialSpeaker), text: pending }
      : null;
    return { finals, partial };
  }

  /** 스트림 종료 시 남은 버퍼를 확정 */
  flush(): Utterance[] {
    const out: Utterance[] = [];
    this.close(out);
    return out;
  }
}
