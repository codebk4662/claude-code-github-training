/**
 * MediaStream(마이크/시스템 오디오)을 16kHz mono PCM(Int16)으로 바꿔 약 100ms 단위로 전달한다.
 * AudioWorklet 안에서 다운샘플링하므로 기기 샘플레이트(44.1k/48k)와 무관하게 동작한다.
 */

const WORKLET_SOURCE = `
class PcmDownsampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0;
    this.out = new Int16Array(1600);
    this.n = 0;
    this.sumSq = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) this.sumSq += ch[i] * ch[i];
    while (this.pos < ch.length) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      const a = ch[i];
      const b = i + 1 < ch.length ? ch[i + 1] : a;
      const s = Math.max(-1, Math.min(1, a + (b - a) * frac));
      this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.out.length) {
        const rms = Math.sqrt(this.sumSq / (this.out.length * this.ratio));
        this.port.postMessage({ pcm: this.out, rms }, [this.out.buffer]);
        this.out = new Int16Array(1600);
        this.n = 0;
        this.sumSq = 0;
      }
      this.pos += this.ratio;
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor("pcm-downsampler", PcmDownsampler);
`;

export interface PcmCapture {
  stop(): Promise<void>;
}

export async function startPcmCapture(
  stream: MediaStream,
  onChunk: (pcm: Int16Array) => void,
  onLevel?: (rms: number) => void,
): Promise<PcmCapture> {
  const ctx = new AudioContext();
  const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm-downsampler", { numberOfInputs: 1, numberOfOutputs: 0 });
  node.port.onmessage = (ev: MessageEvent<{ pcm: Int16Array; rms: number }>) => {
    onChunk(ev.data.pcm);
    onLevel?.(ev.data.rms);
  };
  source.connect(node);
  return {
    async stop() {
      source.disconnect();
      node.port.onmessage = null;
      node.disconnect();
      await ctx.close();
    },
  };
}

/** 오프라인 회의용 마이크: 원거리 수음을 위해 자동 게인은 켜고, 에코 제거는 상황에 따라 */
export function getMicStream(opts: { echoCancellation?: boolean; deviceId?: string } = {}) {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: opts.deviceId ? { exact: opts.deviceId } : undefined,
      echoCancellation: opts.echoCancellation ?? false,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  });
}
