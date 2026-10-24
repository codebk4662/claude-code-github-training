import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { MindmapResponse } from "@mm/core";
import { MINDMAP_MODEL, MINDMAP_SYSTEM, MindmapOutputSchema, mindmapUserMessage } from "@mm/core/prompts";
import { anthropic, errorMessage, json, preflight } from "@/lib/server";

export const OPTIONS = preflight;

const RequestSchema = z.object({
  outline: z.string().max(40_000),
  utterances: z.array(z.string().max(2_000)).min(1).max(80),
  summarySoFar: z.array(z.string().max(500)).max(60),
  actionItemsSoFar: z.array(z.string().max(300)).max(60),
  keyDebatesSoFar: z.array(z.string().max(300)).max(60),
  conclusionsSoFar: z.array(z.string().max(300)).max(60),
  topicSoFar: z.string().max(500).nullable(),
  mode: z.enum(["online", "offline"]),
});

/** "[00:12] 화자: 내용" → {speaker, text} */
function splitUtterance(line: string): { speaker: string; text: string } {
  const m = line.match(/^\[\d{2}:\d{2}\]\s*([^:]+):\s*(.*)$/);
  return m?.[1] !== undefined && m[2] !== undefined
    ? { speaker: m[1].trim(), text: m[2].trim() }
    : { speaker: "화자", text: line };
}

/** 어절 경계에서 자른 짧은 절. 원문 전체는 버리지 않고 note에 따로 보존한다 */
function shortClause(text: string, max = 40): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 10 ? cut.slice(0, lastSpace) : cut}…`;
}

function slug(name: string): string {
  return name.replace(/[^\w가-힣]/g, "").slice(0, 20) || "speaker";
}

const COMMITMENT_RE = /(하겠습니다|하겠다|확인하겠|진행하겠|공유하겠|배정하겠)\.?$/;
const CONCLUSION_RE = /(합의|확정합니다|정리하겠습니다|그걸로 하죠|동의합니다)/;

/**
 * ANTHROPIC_API_KEY 없이 전체 파이프라인을 확인할 수 있도록 만든 가짜 응답.
 * 실제 NLU를 흉내내는 게 아니라, 화자별 분기·speakers 태그·비축약 라벨이라는
 * 새 스키마/UI가 그려지는 걸 정직하게 보여주는 용도다. 화자별 1단계 노드 id를
 * 결정적으로 만들어서(mock-branch-<화자>), applyPatch의 "기존 id면 update로
 * 취급" 규칙 덕분에 outline을 파싱하지 않고도 같은 화자는 같은 분기에 쌓인다.
 */
function mockMindmapResponse(req: z.infer<typeof RequestSchema>): MindmapResponse {
  const base = Date.now();
  const ops: MindmapResponse["ops"] = [];
  const newActionItems: MindmapResponse["newActionItems"] = [];
  const newConclusions: string[] = [];
  const seenBranch = new Set<string>();
  const firstBySpeaker: { speaker: string; text: string }[] = [];

  req.utterances.forEach((line, i) => {
    const { speaker, text } = splitUtterance(line);
    if (!firstBySpeaker.some((f) => f.speaker === speaker)) firstBySpeaker.push({ speaker, text });
    const branchId = `mock-branch-${slug(speaker)}`;
    if (!seenBranch.has(branchId)) {
      seenBranch.add(branchId);
      ops.push({
        op: "add",
        id: branchId,
        parentId: null,
        label: `${speaker}의 발언`,
        note: null,
        speakers: [speaker],
      });
    }
    ops.push({
      op: "add",
      id: `mock-${base}-${i}`,
      parentId: branchId,
      label: shortClause(text),
      note: text,
      speakers: [speaker],
    });
    if (COMMITMENT_RE.test(text)) newActionItems.push({ task: text, owner: speaker, due: null });
    if (CONCLUSION_RE.test(text)) newConclusions.push(`(mock) ${speaker}: ${shortClause(text, 80)}`);
  });

  const newKeyDebates: string[] = [];
  const first = firstBySpeaker[0];
  const second = firstBySpeaker[1];
  if (first && second) {
    newKeyDebates.push(
      `(mock) ${first.speaker}: ${shortClause(first.text, 25)} / ${second.speaker}: ${shortClause(second.text, 25)}`,
    );
  }

  // 실제 요약(주제 종합)은 규칙 기반으로 흉내낼 수 없으므로, 그런 척하지 않고
  // 정직하게 플레이스홀더임을 밝힌다 — mock의 단순함이 실제 기능의 완성도로
  // 오인되지 않도록, "마지막 발언 그대로" 같은 건 절대 만들지 않는다.
  const topic =
    req.topicSoFar === null
      ? `(mock) 주제 요약은 실제 Claude 연결 후 정확해집니다 — 지금까지 발언 ${req.utterances.length}건, 화자 ${firstBySpeaker.length}명`
      : `(mock) 지금까지 발언 ${req.utterances.length}건, 화자 ${firstBySpeaker.length}명 (이번 구간)`;

  return {
    ops,
    summaryBullets: req.utterances.map((u) => {
      const { speaker, text } = splitUtterance(u);
      return `(mock) ${speaker}: ${shortClause(text, 80)}`;
    }),
    topic,
    newActionItems,
    newKeyDebates,
    newConclusions,
    title: null,
  };
}

/** 새 발언을 받아 마인드맵 변경 명령(패치)과 요약 bullet을 돌려준다 */
export async function POST(req: Request) {
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, { error: "잘못된 요청입니다." }, 400);

  if (process.env.MOCK_LLM === "1") return json(req, mockMindmapResponse(parsed.data));

  try {
    const response = await anthropic().messages.parse({
      model: process.env.MINDMAP_MODEL ?? MINDMAP_MODEL,
      max_tokens: 4000,
      // 고정된 시스템 프롬프트는 캐시해서 매 호출 비용·지연을 줄인다
      system: [{ type: "text", text: MINDMAP_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: mindmapUserMessage(parsed.data) }],
      output_config: { format: zodOutputFormat(MindmapOutputSchema) },
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      // 이번 배치는 건너뛴다 (다음 배치에서 다시 반영됨)
      const empty: MindmapResponse = {
        ops: [],
        summaryBullets: [],
        topic: null,
        newActionItems: [],
        newKeyDebates: [],
        newConclusions: [],
        title: null,
      };
      return json(req, empty);
    }
    return json(req, response.parsed_output satisfies MindmapResponse);
  } catch (err) {
    return json(req, { error: errorMessage(err) }, 502);
  }
}
