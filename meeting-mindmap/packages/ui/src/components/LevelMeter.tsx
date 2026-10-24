import { useMeeting } from "../store";

/** 채널별 입력 음량 표시. 소리가 안 잡히는지 바로 확인할 수 있게 한다. */
export function LevelMeter({ channel, label }: { channel: string; label: string }) {
  const rms = useMeeting((s) => s.levels[channel] ?? 0);
  const pct = Math.min(100, Math.round(Math.sqrt(rms) * 220));
  return (
    <div className="mm-level" title={`${label} 입력 음량`}>
      <span>{label}</span>
      <div className="bar">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
