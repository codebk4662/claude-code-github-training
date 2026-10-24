import { useMeeting } from "../store";
import { buildMeetingMarkdown, downloadText } from "../export";

export function SummaryPanel() {
  const summary = useMeeting((s) => s.finalSummary);
  const summaryBullets = useMeeting((s) => s.summaryBullets);
  const currentFocus = useMeeting((s) => s.currentFocus);
  const actionItems = useMeeting((s) => s.actionItems);
  const status = useMeeting((s) => s.status);
  const hasUtterances = useMeeting((s) => s.utterances.length > 0);

  const exportMd = () => {
    const s = useMeeting.getState();
    const md = buildMeetingMarkdown({
      summary: s.finalSummary,
      bullets: s.summaryBullets,
      mindmap: s.mindmap,
      utterances: s.utterances,
      names: s.speakerNames,
    });
    const date = new Date(s.startedAt ?? Date.now()).toISOString().slice(0, 10);
    downloadText(`회의록-${date}.md`, md);
  };

  return (
    <div className="mm-summary">
      {status === "stopping" && <p className="mm-muted">회의록을 작성하고 있습니다…</p>}
      {summary ? (
        <>
          <h3>{summary.title}</h3>
          <p>{summary.overview}</p>
          <Section title="주요 내용" items={summary.keyPoints} />
          <Section title="✅ 결정사항" items={summary.decisions} />
          <Section
            title="📌 할 일"
            items={summary.actionItems.map(
              (a) => `${a.task}${a.owner ? ` — ${a.owner}` : ""}${a.due ? ` (기한: ${a.due})` : ""}`,
            )}
          />
          <Section title="❓ 미해결 질문" items={summary.openQuestions} />
        </>
      ) : (
        <>
          <div className="mm-live-focus">
            <h4>🎯 지금 논의 주제</h4>
            <p className={currentFocus ? undefined : "mm-muted"}>{currentFocus ?? "파악 중…"}</p>
          </div>
          {actionItems.length > 0 && (
            <div className="mm-action-items">
              <h4>📌 진행 중 액션 아이템</h4>
              <ul>
                {actionItems.map((a, i) => (
                  <li key={i}>
                    {a.task}
                    {a.owner && <span className="mm-owner-badge">{a.owner}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <h3>실시간 요약</h3>
          {summaryBullets.length ? (
            <ul>
              {summaryBullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : (
            <p className="mm-muted">회의 내용이 쌓이면 핵심이 여기에 정리됩니다.</p>
          )}
        </>
      )}
      {(hasUtterances || summary) && (
        <button className="mm-btn secondary" onClick={exportMd}>
          Markdown으로 내보내기
        </button>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <>
      <h4>{title}</h4>
      <ul>
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </>
  );
}
