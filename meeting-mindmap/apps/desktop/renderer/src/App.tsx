import { useEffect, useRef, useState } from "react";
import { LevelMeter, MeetingController, MeetingWorkspace, useMeeting, type AudioSource } from "@mm/ui";
import { getMyMicStream, getSystemAudioStream } from "./capture";

const API_BASE: string = import.meta.env.VITE_API_BASE ?? "http://localhost:3000";

/**
 * A. 온라인 회의(Teams/Zoom) 버전
 * - 시스템 오디오 채널: 원격 참석자들 → STT 화자분리로 "참가자 1, 2…"
 * - 마이크 채널: 항상 "나"
 */
export function App() {
  const status = useMeeting((s) => s.status);
  const controller = useRef<MeetingController | null>(null);
  const [title, setTitle] = useState("");
  const [useMic, setUseMic] = useState(true);
  const [overlay, setOverlay] = useState(false);
  const [screenPerm, setScreenPerm] = useState<string>("granted");

  const recording = status === "recording" || status === "starting";
  const busy = status === "starting" || status === "stopping";

  useEffect(() => {
    void window.desktop?.permissionStatus().then((p) => setScreenPerm(p.screen));
  }, []);

  const start = async () => {
    const sources: AudioSource[] = [];
    try {
      sources.push({ channel: "system", stream: await getSystemAudioStream(), diarization: true });
      if (useMic) {
        sources.push({ channel: "mic", stream: await getMyMicStream(), diarization: false, fixedSpeakerKey: "me" });
      }
      controller.current = new MeetingController({
        apiBase: API_BASE,
        mode: "online",
        context: `온라인 화상회의${title ? `, 주제: ${title}` : ""}`,
      });
      await controller.current.start(sources, title || "온라인 회의");
    } catch (err) {
      sources.forEach((s) => s.stream.getTracks().forEach((t) => t.stop()));
      useMeeting.getState().setStatus("error", err instanceof Error ? err.message : String(err));
    }
  };

  const stop = async () => {
    await controller.current?.stop();
    controller.current = null;
  };

  const toggleOverlay = async () => {
    const next = !overlay;
    await window.desktop?.setOverlay(next);
    setOverlay(next);
  };

  const header = (
    <>
      <h1>🧠 회의 마인드맵 · 온라인</h1>
      {!recording && status !== "stopping" ? (
        <>
          <input placeholder="회의 주제 (선택)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="mm-consent">
            <input type="checkbox" checked={useMic} onChange={(e) => setUseMic(e.target.checked)} /> 내 마이크도 녹음
          </label>
          <button className="mm-btn" onClick={start} disabled={busy}>
            녹음 시작
          </button>
          {screenPerm !== "granted" && window.desktop?.platform === "darwin" && (
            <button className="mm-btn secondary" style={{ marginTop: 0 }} onClick={() => window.desktop?.openPermissionSettings()}>
              시스템 오디오 권한 설정 열기
            </button>
          )}
        </>
      ) : (
        <>
          <span className="mm-rec">{status === "stopping" ? "정리 중" : "녹음 중"}</span>
          <LevelMeter channel="system" label="상대방" />
          {useMic && <LevelMeter channel="mic" label="나" />}
          <span className="spacer" />
          <button className="mm-btn stop" onClick={stop} disabled={busy}>
            회의 종료
          </button>
        </>
      )}
      {window.desktop && (
        <button className="mm-btn secondary" style={{ marginTop: 0 }} onClick={toggleOverlay}>
          {overlay ? "큰 창으로" : "회의 옆에 띄우기"}
        </button>
      )}
      {status === "idle" && (
        <span className="mm-consent">녹음 사실을 참석자들에게 알려주세요. 헤드셋을 쓰면 정확도가 올라갑니다.</span>
      )}
    </>
  );

  return <MeetingWorkspace header={header} compact={overlay} />;
}
