import {
  BatchScheduler,
  findEchoDuplicate,
  formatUtterance,
  postJson,
  SonioxSession,
  speakerName,
  startPcmCapture,
  toOutline,
  UtteranceAssembler,
  type MeetingSummary,
  type MindmapRequest,
  type MindmapResponse,
  type PcmCapture,
  type SttSession,
  type SttSessionOptions,
  type SttTokenResponse,
  type SummaryRequest,
  type Utterance,
} from "@mm/core";
import { useMeeting } from "./store";
import { saveMeeting } from "./storage";

export interface AudioSource {
  /** "room" (오프라인), "mic" / "system" (온라인) */
  channel: string;
  stream: MediaStream;
  diarization: boolean;
  /** 화자 고정 (예: 온라인 마이크 = "me") */
  fixedSpeakerKey?: string;
}

export interface ControllerOptions {
  /** API 서버 주소. 같은 출처면 "" */
  apiBase: string;
  mode: "online" | "offline";
  /** 마인드맵 갱신 간격 (기본 20초) */
  intervalMs?: number;
  /** 이만큼 발언이 쌓이면 바로 갱신 (기본 8) */
  maxBatch?: number;
  sttModel?: string;
  /** STT 문맥 힌트 (회의 주제, 고유명사) */
  context?: string;
  /** STT 세션 팩토리. 기본값은 SonioxSession. 테스트/데모용으로 교체 가능 */
  createStt?: (opts: SttSessionOptions) => SttSession;
}

interface Pipeline {
  stt: SttSession;
  capture: PcmCapture;
  assembler: UtteranceAssembler;
  source: AudioSource;
}

/**
 * 회의 1건의 전체 흐름을 관리한다.
 * 오디오 → STT → 발언 확정 → (배치) Claude 마인드맵 패치 → 스토어 반영 → 종료 시 회의록.
 */
export class MeetingController {
  private pipelines: Pipeline[] = [];
  private scheduler: BatchScheduler<Utterance>;
  private meetingId = "";

  constructor(private readonly opts: ControllerOptions) {
    this.scheduler = new BatchScheduler<Utterance>({
      intervalMs: opts.intervalMs ?? 20_000,
      maxBatch: opts.maxBatch ?? 8,
      run: (batch) => this.updateMindmap(batch),
      onError: (err) => {
        console.error("[mindmap]", err);
        this.store.setSyncWarning("마인드맵 갱신에 실패했습니다. 녹음은 계속되며 다음 갱신에서 다시 시도합니다.");
      },
    });
  }

  private get store() {
    return useMeeting.getState();
  }

  private async getSttKey(): Promise<string> {
    const res = await postJson<SttTokenResponse>(this.opts.apiBase, "/api/stt-token", {});
    return res.apiKey;
  }

  async start(sources: AudioSource[], title?: string) {
    this.meetingId = `m-${Date.now()}`;
    this.store.reset(title);
    this.store.setStatus("starting");
    const startedAt = Date.now();
    try {
      for (const source of sources) {
        const assembler = new UtteranceAssembler({
          channel: source.channel,
          fixedSpeakerKey: source.fixedSpeakerKey,
          startedAt,
        });
        const createStt =
          this.opts.createStt ??
          ((opts: SttSessionOptions) => new SonioxSession({ ...opts, model: this.opts.sttModel }));
        const stt = createStt({
          getApiKey: () => this.getSttKey(),
          diarization: source.diarization,
          context: this.opts.context,
          onTokens: (tokens) => {
            const { finals, partial } = assembler.feed(tokens);
            finals.forEach((u) => this.onUtterance(u));
            this.store.setPartial(source.channel, partial);
          },
          onError: (err) => this.store.setStatus("error", err.message),
        });
        await stt.start();
        const capture = await startPcmCapture(
          source.stream,
          (pcm) => stt.sendAudio(pcm),
          (rms) => this.store.setLevel(source.channel, rms),
        );
        this.pipelines.push({ stt, capture, assembler, source });
      }
      this.scheduler.start();
      this.store.setStatus("recording");
    } catch (err) {
      await this.teardown();
      this.store.setStatus("error", err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  private onUtterance(u: Utterance) {
    if (this.opts.mode === "online") {
      const recent = this.store.utterances.slice(-20);
      const dup = findEchoDuplicate(u, recent);
      if (dup) {
        // 스피커 소리가 마이크에 다시 잡힌 경우: 시스템 오디오 쪽을 원본으로 남긴다
        if (u.channel === "mic") return;
        if (dup.channel === "mic") this.store.removeUtterance(dup.id);
      }
    }
    this.store.addUtterance(u);
    this.scheduler.push(u);
  }

  private async updateMindmap(batch: Utterance[]) {
    const s = this.store;
    const req: MindmapRequest = {
      outline: toOutline(s.mindmap),
      utterances: batch.map((u) => formatUtterance(u, s.speakerNames)),
      summarySoFar: s.summaryBullets.slice(-30),
      mode: this.opts.mode,
    };
    s.setUpdating(true);
    try {
      const res = await postJson<MindmapResponse>(this.opts.apiBase, "/api/mindmap", req);
      this.store.applyOps(res.ops, res.title);
      this.store.addSummaryBullets(res.summaryBullets);
      this.store.setSyncWarning(null);
    } finally {
      this.store.setUpdating(false);
    }
  }

  private async teardown() {
    for (const p of this.pipelines) {
      await p.capture.stop().catch(() => {});
      await p.stt.stop().catch(() => {});
      p.assembler.flush().forEach((u) => this.onUtterance(u));
      this.store.setPartial(p.source.channel, null);
      p.source.stream.getTracks().forEach((t) => t.stop());
    }
    this.pipelines = [];
  }

  /** 녹음 종료 → 남은 발언 반영 → 최종 회의록 생성 → 로컬 저장 */
  async stop() {
    this.store.setStatus("stopping");
    await this.teardown();
    await this.scheduler.stop();
    const s = this.store;
    if (s.utterances.length) {
      const speakers = [...new Set(s.utterances.map((u) => speakerName(s.speakerNames, u.speakerKey)))];
      const req: SummaryRequest = {
        transcript: s.utterances.map((u) => formatUtterance(u, s.speakerNames)),
        outline: toOutline(s.mindmap),
        speakers,
        mode: this.opts.mode,
      };
      try {
        const summary = await postJson<MeetingSummary>(this.opts.apiBase, "/api/summary", req);
        this.store.setFinalSummary(summary);
      } catch (err) {
        this.store.setStatus("error", `회의록 생성 실패: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (this.store.status !== "error") this.store.setStatus("done");
    await this.save();
  }

  async save() {
    const s = this.store;
    await saveMeeting({
      id: this.meetingId,
      mode: this.opts.mode,
      title: s.finalSummary?.title ?? s.mindmap.nodes[s.mindmap.rootId]?.label ?? "회의",
      createdAt: s.startedAt ?? Date.now(),
      utterances: s.utterances,
      mindmap: s.mindmap,
      summaryBullets: s.summaryBullets,
      speakerNames: s.speakerNames,
      finalSummary: s.finalSummary,
    }).catch((err) => console.warn("[storage]", err));
  }
}
