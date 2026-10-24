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

/** 새 발언을 받아 마인드맵 변경 명령(패치)과 요약 bullet을 돌려준다 */
export async function POST(req: Request) {
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, { error: "잘못된 요청입니다." }, 400);

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
