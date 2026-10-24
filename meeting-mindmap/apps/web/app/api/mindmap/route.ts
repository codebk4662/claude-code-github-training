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
  mode: z.enum(["online", "offline"]),
});

/** "[00:12] 화자: 내용" → "내용"만 추출 */
function stripUtterancePrefix(line: string): string {
  return line.replace(/^\[\d{2}:\d{2}\]\s*[^:]*:\s*/, "");
}

/** ANTHROPIC_API_KEY 없이 전체 파이프라인을 확인할 수 있도록, 발언마다 루트 밑에 노드를 하나씩 추가하는 가짜 응답 */
function mockMindmapResponse(req: z.infer<typeof RequestSchema>): MindmapResponse {
  const base = Date.now();
  const ops = req.utterances.map((u, i) => ({
    op: "add" as const,
    id: `mock-${base}-${i}`,
    parentId: null,
    label: `(mock) ${stripUtterancePrefix(u).slice(0, 20)}`,
    note: null,
  }));
  return {
    ops,
    summaryBullets: req.utterances.map((u) => `(mock) ${stripUtterancePrefix(u).slice(0, 60)}`),
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
      const empty: MindmapResponse = { ops: [], summaryBullets: [], title: null };
      return json(req, empty);
    }
    return json(req, response.parsed_output satisfies MindmapResponse);
  } catch (err) {
    return json(req, { error: errorMessage(err) }, 502);
  }
}
