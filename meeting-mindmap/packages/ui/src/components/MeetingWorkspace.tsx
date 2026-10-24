import { useState, type ReactNode } from "react";
import { MindMapView } from "./MindMapView";
import { SpeakerEditor } from "./SpeakerEditor";
import { SummaryPanel } from "./SummaryPanel";
import { TranscriptPanel } from "./TranscriptPanel";
import { useMeeting } from "../store";

type Tab = "map" | "transcript" | "summary";

/**
 * 두 앱이 함께 쓰는 회의 화면.
 * 넓은 화면: 마인드맵 | 자막 + 요약. 좁은 화면(폰): 탭으로 전환.
 */
export function MeetingWorkspace({ header, compact = false }: { header: ReactNode; compact?: boolean }) {
  const [tab, setTab] = useState<Tab>("map");
  const error = useMeeting((s) => s.error);

  return (
    <div className={`mm-app${compact ? " compact" : ""}`}>
      <header className="mm-header">{header}</header>
      {error && <div className="mm-error">{error}</div>}
      <nav className="mm-tabs">
        {(
          [
            ["map", "마인드맵"],
            ["transcript", "자막"],
            ["summary", "요약"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>
      <main className={`mm-main tab-${tab}`}>
        <section className="mm-pane pane-map">
          <MindMapView />
        </section>
        <section className="mm-pane pane-transcript">
          <TranscriptPanel />
        </section>
        <section className="mm-pane pane-summary">
          <SummaryPanel />
          <SpeakerEditor />
        </section>
      </main>
    </div>
  );
}
