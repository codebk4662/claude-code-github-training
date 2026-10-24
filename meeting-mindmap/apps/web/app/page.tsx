"use client";

import { useEffect, useRef, useState } from "react";
import { getMicStream, MockSttSession } from "@mm/core";
import {
  LevelMeter,
  MeetingController,
  MeetingWorkspace,
  listMeetings,
  useMeeting,
  type MeetingRecord,
} from "@mm/ui";

/**
 * B. 오프라인(대면) 회의 버전
 * 테이블 위에 둔 폰/노트북 마이크 1개로 녹음하고, STT 화자분리로 화자를 구분한다.
 */
export default function OfflineMeetingPage() {
  const status = useMeeting((s) => s.status);
  const load = useMeeting((s) => s.load);
  const controller = useRef<MeetingController | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const [title, setTitle] = useState("");
  const [people, setPeople] = useState(4);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [history, setHistory] = useState<MeetingRecord[]>([]);

  const recording = status === "recording" || status === "starting";
  const busy = status === "starting" || status === "stopping";

  useEffect(() => {
    void listMeetings().then(setHistory).catch(() => {});
    void navigator.mediaDevices?.enumerateDevices().then((d) => setDevices(d.filter((x) => x.kind === "audioinput")));
  }, [status]);

  const start = async () => {
    try {
      const stream = await getMicStream({ deviceId: deviceId || undefined });
      controller.current = new MeetingController({
        apiBase: "",
        mode: "offline",
        context: `대면 회의, 참석자 약 ${people}명.${title ? ` 주제: ${title}` : ""}`,
        createStt:
          process.env.NEXT_PUBLIC_MOCK_STT === "1" ? (opts) => new MockSttSession(opts) : undefined,
      });
      await controller.current.start([{ channel: "room", stream, diarization: true }], title || "새 회의");
      // 녹음 중 화면이 꺼지면 오디오가 끊기는 기기가 있어 화면 꺼짐을 막는다
      wakeLock.current = await navigator.wakeLock?.request("screen").catch(() => null);
    } catch (err) {
      useMeeting.getState().setStatus("error", err instanceof Error ? err.message : "마이크를 열 수 없습니다.");
    }
  };

  const stop = async () => {
    await controller.current?.stop();
    controller.current = null;
    await wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  };

  const header = (
    <>
      <h1>🧠 회의 마인드맵 · 대면</h1>
      {!recording && status !== "stopping" ? (
        <>
          <input placeholder="회의 주제 (선택)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="mm-consent">
            인원{" "}
            <input
              type="number"
              min={2}
              max={15}
              value={people}
              onChange={(e) => setPeople(Number(e.target.value))}
              style={{ width: 60 }}
            />
          </label>
          {devices.length > 1 && (
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              <option value="">기본 마이크</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "마이크"}
                </option>
              ))}
            </select>
          )}
          <button className="mm-btn" onClick={start} disabled={busy}>
            녹음 시작
          </button>
          {history.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const m = history.find((h) => h.id === e.target.value);
                if (m) load(m);
              }}
            >
              <option value="">지난 회의 열기…</option>
              {history.map((h) => (
                <option key={h.id} value={h.id}>
                  {new Date(h.createdAt).toLocaleDateString("ko-KR")} {h.title}
                </option>
              ))}
            </select>
          )}
        </>
      ) : (
        <>
          <span className="mm-rec">{status === "stopping" ? "정리 중" : "녹음 중"}</span>
          <LevelMeter channel="room" label="마이크" />
          <span className="spacer" />
          <button className="mm-btn stop" onClick={stop} disabled={busy}>
            회의 종료
          </button>
        </>
      )}
      {!recording && status === "idle" && (
        <span className="mm-consent">녹음 전 참석자 모두에게 동의를 받아주세요. 오디오는 저장하지 않습니다.</span>
      )}
    </>
  );

  return <MeetingWorkspace header={header} />;
}
