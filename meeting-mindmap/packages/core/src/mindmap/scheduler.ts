export interface SchedulerOptions<T> {
  /** 이 간격마다 쌓인 항목이 있으면 실행 (ms) */
  intervalMs: number;
  /** 이만큼 쌓이면 간격을 기다리지 않고 바로 실행 */
  maxBatch: number;
  run: (batch: T[]) => Promise<void>;
  onError?: (err: unknown) => void;
}

/**
 * 발언을 모아 일정 간격/개수마다 한 번씩 LLM을 호출한다.
 * 동시에 한 요청만 보내고, 요청 중 들어온 발언은 다음 배치로 넘긴다.
 */
export class BatchScheduler<T> {
  private pending: T[] = [];
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: SchedulerOptions<T>) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), this.opts.intervalMs);
  }

  push(item: T) {
    this.pending.push(item);
    if (this.pending.length >= this.opts.maxBatch) void this.flush();
  }

  get pendingCount() {
    return this.pending.length;
  }

  get busy() {
    return this.running !== null;
  }

  /** 쌓인 항목을 실행. 이미 실행 중이면 그 요청이 끝난 뒤 이어서 처리된다. */
  flush(): Promise<void> {
    if (this.running || this.pending.length === 0) return this.running ?? Promise.resolve();
    const batch = this.pending;
    this.pending = [];
    this.running = this.opts
      .run(batch)
      .catch((err) => this.opts.onError?.(err))
      .finally(() => {
        this.running = null;
        if (this.pending.length >= this.opts.maxBatch) void this.flush();
      });
    return this.running;
  }

  /** 타이머를 멈추고 남은 항목을 모두 처리 */
  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    while (this.running || this.pending.length) {
      await (this.running ?? this.flush());
    }
  }
}
