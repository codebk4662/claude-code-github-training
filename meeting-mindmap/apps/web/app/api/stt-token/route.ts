import { json, preflight } from "@/lib/server";

export const OPTIONS = preflight;

/**
 * 브라우저가 Soniox에 직접 연결할 때 쓸 단기 키를 발급한다.
 * 진짜 SONIOX_API_KEY는 서버 밖으로 나가지 않는다.
 */
export async function POST(req: Request) {
  const key = process.env.SONIOX_API_KEY;
  if (!key) return json(req, { error: "서버에 SONIOX_API_KEY가 설정되지 않았습니다." }, 500);

  const res = await fetch("https://api.soniox.com/v1/auth/temporary-api-key", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ usage_type: "transcribe_websocket", expires_in_seconds: 300 }),
  });
  if (!res.ok) {
    return json(req, { error: `STT 키 발급 실패 (${res.status})` }, 502);
  }
  const data = (await res.json()) as { api_key: string; expires_at?: string };
  return json(req, { apiKey: data.api_key, expiresAt: data.expires_at });
}
