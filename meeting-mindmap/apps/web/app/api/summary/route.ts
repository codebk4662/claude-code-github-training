import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { MeetingSummary } from "@mm/core";
import { SUMMARY_MODEL, SUMMARY_SYSTEM, SummaryOutputSchema, summaryUserMessage } from "@mm/core/prompts";
import { anthropic, errorMessage, json, preflight } from "@/lib/server";

export const OPTIONS = preflight;
export const maxDuration = 300;

const RequestSchema = z.object({
  transcript: z.array(z.string().max(2_000)).min(1).max(20_000),
  outline: z.string().max(40_000),
  speakers: z.array(z.string().max(100)).max(50),
  mode: z.enum(["online", "offline"]),
});

/** ANTHROPIC_API_KEY 없이 전체 파이프라인을 확인할 수 있도록, 실제 발언 기록을 그대로 요약처럼 나열하는 가짜 회의록 */
function mockSummary(req: z.infer<typeof RequestSchema>): MeetingSummary {
  return {
    title: "(mock) 회의록",
    overview: `(mock) 참석자 ${req.speakers.join(", ") || "알 수 없음"}, 발언 ${req.transcript.length}건을 기록했습니다. 실제 요약은 ANTHROPIC_API_KEY 설정 후 확인할 수 있습니다.`,
    keyPoints: req.transcript.slice(0, 5),
    decisions: [],
    actionItems: [],
    openQuestions: [],
  };
}

/** 회의 종료 시 전체 기록으로 최종 회의록을 만든다 */
export async function POST(req: Request) {
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, { error: "잘못된 요청입니다." }, 400);

  if (process.env.MOCK_LLM === "1") return json(req, mockSummary(parsed.data));

  try {
    const stream = anthropic().messages.stream({
      model: process.env.SUMMARY_MODEL ?? SUMMARY_MODEL,
      max_tokens: 32000,
      system: SUMMARY_SYSTEM,
      messages: [{ role: "user", content: summaryUserMessage(parsed.data) }],
      output_config: { effort: "medium", format: zodOutputFormat(SummaryOutputSchema) },
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      return json(req, { error: "회의록을 생성하지 못했습니다 (모델이 요청을 거절함)." }, 422);
    }
    if (message.stop_reason === "max_tokens") {
      return json(req, { error: "회의가 너무 길어 회의록이 잘렸습니다." }, 422);
    }
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let summary: MeetingSummary;
    try {
      summary = SummaryOutputSchema.parse(JSON.parse(text));
    } catch {
      return json(req, { error: "회의록 형식을 해석하지 못했습니다. 다시 시도해주세요." }, 502);
    }
    return json(req, summary);
  } catch (err) {
    return json(req, { error: errorMessage(err) }, 502);
  }
}
