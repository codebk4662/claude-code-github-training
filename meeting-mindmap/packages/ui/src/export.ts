import { formatUtterance, toMarkdown, type MeetingSummary, type MindMap, type SpeakerNames, type Utterance } from "@mm/core";

export function buildMeetingMarkdown(args: {
  summary: MeetingSummary | null;
  bullets: string[];
  mindmap: MindMap;
  utterances: Utterance[];
  names: SpeakerNames;
}): string {
  const { summary, bullets, mindmap, utterances, names } = args;
  const out: string[] = [];
  if (summary) {
    out.push(`# ${summary.title}`, "", summary.overview, "");
    const section = (title: string, items: string[]) => {
      if (items.length) out.push(`## ${title}`, ...items.map((i) => `- ${i}`), "");
    };
    section("주요 내용", summary.keyPoints);
    section("결정사항", summary.decisions);
    section(
      "할 일",
      summary.actionItems.map((a) => `${a.task}${a.owner ? ` — ${a.owner}` : ""}${a.due ? ` (기한: ${a.due})` : ""}`),
    );
    section("미해결 질문", summary.openQuestions);
  } else if (bullets.length) {
    out.push("## 실시간 요약", ...bullets.map((b) => `- ${b}`), "");
  }
  out.push("## 마인드맵", "", toMarkdown(mindmap).replace(/^# /, "### "), "");
  out.push("## 전체 기록", "", ...utterances.map((u) => formatUtterance(u, names)));
  return out.join("\n");
}

export function downloadText(filename: string, text: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
