import { useMeeting } from "../store";
import { buildMeetingMarkdown, downloadText } from "../export";

export function SummaryPanel() {
  const s = useMeeting();
  const summary = s.finalSummary;

  const exportMd = () => {
    const md = buildMeetingMarkdown({
      summary,
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
      {s.status === "stopping" && <p className="mm-muted">회의록을 작성하고 있습니다…</p>}
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
          <h3>실시간 요약</h3>
          {s.summaryBullets.length ? (
            <ul>
              {s.summaryBullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : (
            <p className="mm-muted">회의 내용이 쌓이면 핵심이 여기에 정리됩니다.</p>
          )}
        </>
      )}
      {(s.utterances.length > 0 || summary) && (
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
