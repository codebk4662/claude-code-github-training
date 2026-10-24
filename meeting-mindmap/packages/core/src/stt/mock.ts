import type { SttToken } from "../transcript/types";
import type { SttSession, SttSessionOptions } from "./types";

interface ScriptLine {
  speaker: string;
  text: string;
}

const DEFAULT_SCRIPT: ScriptLine[] = [
  { speaker: "1", text: "오늘은 신제품 출시 일정을 확정하려고 모였습니다." },
  { speaker: "2", text: "마케팅팀은 SNS 광고 중심으로 예산을 20퍼센트 늘리고 싶습니다." },
  { speaker: "3", text: "QA 쪽은 베타 테스트 인력이 더 필요합니다. 최소 두 명은 추가해야 할 것 같아요." },
  { speaker: "1", text: "좋습니다. 테스트 인력은 제가 확인해서 다음 주까지 배정하겠습니다." },
  { speaker: "3", text: "베타 테스트 기간은 2주 정도로 잡으면 될 것 같습니다." },
  { speaker: "2", text: "그러면 출시일은 11월 셋째 주로 하는 게 맞겠네요." },
  { speaker: "1", text: "네, 11월 셋째 주로 확정하죠. 가격 정책은 어떻게 할까요?" },
  { speaker: "2", text: "가격 정책은 아직 데이터가 부족해서 다음 회의에서 다시 논의하면 좋겠습니다." },
  { speaker: "1", text: "알겠습니다. 오늘 회의는 여기서 정리하겠습니다." },
];

const WORD_INTERVAL_MS = 90;
const LINE_GAP_MS = 1200;

/**
 * Soniox API 키 없이도 마인드맵·회의록 파이프라인 전체를 검증할 수 있도록 만든 가짜 STT.
 * 실제 오디오는 무시하고, 미리 정해둔 한국어 다화자 대본을 타이머로 흘려보낸다.
 * SttSession 인터페이스만 구현하면 되므로 SonioxSession과 동일하게 MeetingController에 꽂힌다.
 */
export class MockSttSession implements SttSession {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private elapsedMs = 0;

  constructor(
    private readonly opts: SttSessionOptions,
    private readonly script: ScriptLine[] = DEFAULT_SCRIPT,
  ) {}

  async start() {
    this.playLine(0);
  }

  sendAudio(): void {
    // 실제 오디오는 무시한다. (레벨미터는 pcmCapture가 직접 계산한다)
  }

  private playLine(index: number) {
    const line = this.script[index];
    if (this.stopped || !line) return;
    const words = line.text.split(" ");
    const speaker = this.opts.diarization ? line.speaker : undefined;

    words.forEach((_, i) => {
      setTimeout(() => {
        if (this.stopped) return;
        const partialText = words.slice(0, i + 1).join(" ");
        this.opts.onTokens([{ text: partialText, isFinal: false, speaker }]);
      }, i * WORD_INTERVAL_MS);
    });

    const lineDurationMs = words.length * WORD_INTERVAL_MS;
    this.timer = setTimeout(() => {
      if (this.stopped) return;
      const startMs = this.elapsedMs;
      const endMs = startMs + lineDurationMs;
      this.elapsedMs = endMs;
      const tokens: SttToken[] = [
        { text: line.text, isFinal: true, speaker, startMs, endMs },
        { text: "<end>", isFinal: true, speaker },
      ];
      this.opts.onTokens(tokens);
      this.playLine(index + 1);
    }, lineDurationMs + LINE_GAP_MS);
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
