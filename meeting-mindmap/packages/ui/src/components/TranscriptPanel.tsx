import { useEffect, useRef } from "react";
import { speakerName } from "@mm/core";
import { useMeeting } from "../store";

const COLORS = 8;

/** 화자 키마다 고정 색상 번호 */
function colorIndex(key: string): number {
  if (key === "me") return 0;
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % (COLORS - 1)) + 1;
}

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function TranscriptPanel() {
  const utterances = useMeeting((s) => s.utterances);
  const partials = useMeeting((s) => s.partials);
  const names = useMeeting((s) => s.speakerNames);
  const endRef = useRef<HTMLDivElement>(null);
  const live = Object.values(partials).filter((p) => p !== null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [utterances.length, live.length]);

  return (
    <div className="mm-transcript">
      {utterances.length === 0 && live.length === 0 && <p className="mm-muted">아직 기록된 발언이 없습니다.</p>}
      {utterances.map((u) => (
        <div key={u.id} className="mm-line">
          <span className={`mm-speaker c${colorIndex(u.speakerKey)}`}>{speakerName(names, u.speakerKey)}</span>
          <span className="mm-time">{clock(u.at)}</span>
          <p>{u.text}</p>
        </div>
      ))}
      {live.map((p) => (
        <div key={`live-${p.channel}`} className="mm-line live">
          <span className={`mm-speaker c${colorIndex(p.speakerKey)}`}>{speakerName(names, p.speakerKey)}</span>
          <p>{p.text}</p>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
