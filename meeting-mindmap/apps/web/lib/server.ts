import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

let client: Anthropic | null = null;
export function anthropic() {
  client ??= new Anthropic();
  return client;
}

/** 데스크톱 앱(다른 출처)에서 오는 요청 허용 */
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,null")
    .split(",")
    .map((s) => s.trim());
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders(req) });
}

export function preflight(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export function errorMessage(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `Claude API 오류 (${err.status}): ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
