import { defaultSpeakerName } from "@mm/core";
import { useMeeting } from "../store";

/** 자동 구분된 화자(화자 1, 참가자 2…)에 실제 이름을 붙인다 */
export function SpeakerEditor() {
  const utterances = useMeeting((s) => s.utterances);
  const names = useMeeting((s) => s.speakerNames);
  const rename = useMeeting((s) => s.renameSpeaker);
  const keys = [...new Set(utterances.map((u) => u.speakerKey))];
  if (!keys.length) return null;

  return (
    <div className="mm-speakers">
      <h4>참석자 이름</h4>
      {keys.map((key) => (
        <label key={key}>
          <span>{defaultSpeakerName(key)}</span>
          <input
            value={names[key] ?? ""}
            placeholder="이름 입력"
            onChange={(e) => rename(key, e.target.value)}
          />
        </label>
      ))}
      <p className="mm-muted small">이름은 다음 마인드맵 갱신과 회의록부터 반영됩니다.</p>
    </div>
  );
}
