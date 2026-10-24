import { useEffect, useRef } from "react";
import { speakerColorIndex, speakerName } from "@mm/core";
import { useMeeting } from "../store";

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
      {utterances.map((u) => {
        const name = speakerName(names, u.speakerKey);
        return (
          <div key={u.id} className="mm-line">
            <span className={`mm-speaker c${speakerColorIndex(name)}`}>{name}</span>
            <span className="mm-time">{clock(u.at)}</span>
            <p>{u.text}</p>
          </div>
        );
      })}
      {live.map((p) => {
        const name = speakerName(names, p.speakerKey);
        return (
          <div key={`live-${p.channel}`} className="mm-line live">
            <span className={`mm-speaker c${speakerColorIndex(name)}`}>{name}</span>
            <p>{p.text}</p>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
