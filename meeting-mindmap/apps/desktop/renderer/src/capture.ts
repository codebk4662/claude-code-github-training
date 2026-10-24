import { getMicStream } from "@mm/core";

/**
 * 시스템 오디오(상대방 목소리) 스트림.
 * 메인 프로세스의 setDisplayMediaRequestHandler가 loopback 오디오를 붙여준다.
 * 화면 영상은 필요 없으므로 바로 끈다.
 */
export async function getSystemAudioStream(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  stream.getVideoTracks().forEach((t) => {
    t.stop();
    stream.removeTrack(t);
  });
  if (stream.getAudioTracks().length === 0) {
    throw new Error(
      "시스템 오디오를 가져오지 못했습니다. macOS라면 '화면 및 시스템 오디오 기록' 권한을 확인해주세요.",
    );
  }
  return stream;
}

/** 내 목소리. 스피커 소리가 다시 들어가지 않도록 에코 제거를 켠다. 헤드셋 사용을 권장. */
export function getMyMicStream(deviceId?: string) {
  return getMicStream({ echoCancellation: true, deviceId });
}
