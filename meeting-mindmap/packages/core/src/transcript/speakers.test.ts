import { describe, expect, it } from "vitest";
import { defaultSpeakerName, findEchoDuplicate, formatUtterance, similarity } from "./speakers";
import type { Utterance } from "./types";

const u = (o: Partial<Utterance>): Utterance => ({
  id: "x",
  speakerKey: "room:1",
  channel: "room",
  text: "",
  startMs: 0,
  endMs: 0,
  at: 0,
  ...o,
});

describe("speakers", () => {
  it("names speakers by channel", () => {
    expect(defaultSpeakerName("me")).toBe("나");
    expect(defaultSpeakerName("room:2")).toBe("화자 2");
    expect(defaultSpeakerName("system:1")).toBe("참가자 1");
  });

  it("formats an utterance with time and custom name", () => {
    expect(formatUtterance(u({ at: 192_000, text: "예산 검토" }), { "room:1": "김부장" })).toBe(
      "[03:12] 김부장: 예산 검토",
    );
  });

  it("scores similar sentences high", () => {
    expect(similarity("다음 주까지 예산안을 보내주세요", "다음주까지 예산안 보내주세요.")).toBeGreaterThan(0.8);
    expect(similarity("다음 주까지 예산안을 보내주세요", "점심 뭐 먹을까요")).toBeLessThan(0.2);
  });

  it("finds echo duplicates on the other channel only", () => {
    const sys = u({ channel: "system", speakerKey: "system:1", text: "출시 일정은 11월로 하죠", at: 10_000 });
    const mic = u({ channel: "mic", speakerKey: "me", text: "출시 일정은 11월로 하죠", at: 11_000 });
    expect(findEchoDuplicate(mic, [sys])).toBe(sys);
    expect(findEchoDuplicate(mic, [{ ...sys, at: 30_000 }])).toBeUndefined();
    expect(findEchoDuplicate(mic, [{ ...sys, channel: "mic" }])).toBeUndefined();
  });
});
