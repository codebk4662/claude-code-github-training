import { describe, expect, it } from "vitest";
import { UtteranceAssembler } from "./assembler";

const fin = (text: string, speaker?: string) => ({ text, isFinal: true, speaker });
const tmp = (text: string, speaker?: string) => ({ text, isFinal: false, speaker });

describe("UtteranceAssembler", () => {
  const make = (fixedSpeakerKey?: string) =>
    new UtteranceAssembler({ channel: "room", startedAt: 0, now: () => 1000, fixedSpeakerKey });

  it("closes an utterance on the endpoint token", () => {
    const a = make();
    const r1 = a.feed([fin("안녕", "1"), fin("하세요", "1"), tmp(" 오늘", "1")]);
    expect(r1.finals).toEqual([]);
    expect(r1.partial?.text).toBe("안녕하세요 오늘");
    const r2 = a.feed([fin("<end>")]);
    expect(r2.finals.map((u) => [u.speakerKey, u.text])).toEqual([["room:1", "안녕하세요"]]);
    expect(r2.partial).toBeNull();
  });

  it("splits when the speaker changes", () => {
    const a = make();
    const { finals } = a.feed([fin("네 ", "1"), fin("좋습니다", "2"), fin("<end>")]);
    expect(finals.map((u) => [u.speakerKey, u.text])).toEqual([
      ["room:1", "네"],
      ["room:2", "좋습니다"],
    ]);
  });

  it("uses a fixed speaker key when given", () => {
    const a = make("me");
    const { finals } = a.feed([fin("저는 ", "1"), fin("찬성", "2"), fin("<end>")]);
    expect(finals).toHaveLength(1);
    expect(finals[0]?.speakerKey).toBe("me");
  });

  it("flush() returns the leftover buffer", () => {
    const a = make();
    a.feed([fin("마지막 말", "1")]);
    expect(a.flush().map((u) => u.text)).toEqual(["마지막 말"]);
  });
});
