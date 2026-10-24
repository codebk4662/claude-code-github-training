# 실시간 회의 녹음 → 자동 정리 → 라이브 마인드맵 앱 (2가지 버전)

## Context
회의 중 녹음하면서 실시간 자막, 자동 정리, 실시간으로 자라는 마인드맵을 보여주는 앱. 사용 환경이 달라 **두 버전**으로 나눔:
- **A. 온라인 회의 버전** — MS Teams/Zoom 화상회의의 **시스템 오디오**(상대방 소리) + 내 마이크를 녹음
- **B. 오프라인 회의 버전** — 한 공간에 모인 여러 사람의 대화를 **기기 1대 마이크**로 녹음하고 화자를 구분

기존 툴(Otter, Fireflies, Granola 등)은 회의 후 요약/마인드맵만 제공 → 회의 중 라이브 마인드맵이 차별점.
결정사항: 클라우드 API 사용. 저장소에는 md 파일만 있으므로 새 모노레포를 `meeting-mindmap/` 에 생성.

## 두 버전 비교

| | A. 온라인 (Teams/Zoom) | B. 오프라인 (대면) |
|---|---|---|
| 형태 | **데스크톱 앱 (Electron)** | **웹앱 / PWA (Next.js)** — 폰·노트북 브라우저 |
| 오디오 입력 | 시스템 오디오(loopback) + 마이크, **2채널 분리** | 마이크 1개 (회의 테이블 위 기기) |
| 화자 구분 | 마이크 채널 = "나" 확정, 시스템 채널은 STT 화자분리로 상대방 구분 | STT 화자분리(화자1, 화자2…) → 이름 지정 UI |
| 핵심 난제 | OS별 시스템 오디오 캡처, 에코(내 목소리 이중 수음) | 원거리 수음 품질, 겹치는 발화, 화자 수 많을 때 정확도 |
| 회의 봇 필요? | 없음 (봇이 회의에 들어가지 않아 거부감 적음) | 해당 없음 |

**왜 A는 웹이 아니라 데스크톱인가:** 브라우저 `getDisplayMedia` 는 Chrome 탭 오디오나 Windows 전체 화면 공유 오디오만 잡을 수 있어, Teams/Zoom **데스크톱 앱** 소리를 안정적으로 잡기 어려움. Electron은 Windows loopback 캡처와 macOS 13+ ScreenCaptureKit 기반 시스템 오디오 캡처를 지원.
(나중 대안: Recall.ai 같은 회의 봇 API를 쓰면 참가자 실명까지 받을 수 있지만, 봇 입장 및 비용 문제로 MVP에선 제외)

## 공통 기술 스택 (2026-10 기준 추천)

| 영역 | 추천 | 비고 |
|---|---|---|
| 실시간 STT | **Soniox Real-time v5** | 한국어 정확도 최상위권(자체 벤치마크 WER ~1.25%, 독립 검증 필요), 스트리밍+화자분리 포함, 임시 키 지원. 대안: Deepgram, AssemblyAI. OpenAI Realtime은 화자분리 없음 |
| 정리/마인드맵 | **Claude API** — 실시간 갱신 `claude-haiku-5-5`, 최종 회의록 `claude-sonnet-5-5` | tool use로 마인드맵 **증분 패치** 생성, 프롬프트 캐싱 |
| UI | React + TypeScript + Tailwind + Zustand | 두 앱이 같은 컴포넌트 공유 |
| 마인드맵 | **React Flow (@xyflow/react) + d3-hierarchy** | 노드 추가 애니메이션·편집 자유도. 대안: Mind Elixir, markmap |
| 저장 | MVP: 로컬(IndexedDB) → 이후 Supabase | |

## 모노레포 구조 (pnpm workspaces)

```
meeting-mindmap/
├─ packages/core/         # 두 앱 공통 (프레임워크 무관 로직)
│   ├─ stt/               # SttProvider 인터페이스, sonioxClient (채널·화자 라벨 처리)
│   ├─ mindmap/           # types, applyPatch(순수 함수), scheduler(배치/디바운스)
│   ├─ transcript/        # 화자별 문장 스토어, 화자 이름 매핑
│   └─ prompts/           # Claude 프롬프트 + tool 스키마
├─ packages/ui/           # TranscriptPanel, MindMap, SummaryPanel, SpeakerLabelEditor
├─ apps/web/              # B. 오프라인 버전 (Next.js PWA) + 공용 API 서버
│   └─ app/api/{stt-token,mindmap,summary}/route.ts   # API 키는 서버에만
└─ apps/desktop/          # A. 온라인 버전 (Electron + Vite + React)
    ├─ main/audioCapture.ts   # 시스템 오디오 loopback + 마이크 (setDisplayMediaRequestHandler)
    └─ renderer/              # packages/ui 재사용, apps/web의 API 호출
```

공통 파이프라인:
```
오디오 → AudioWorklet(16kHz PCM) → Soniox WS (한국어+화자분리) → 확정 문장
→ 20~30초/문장 N개마다 /api/mindmap (Claude Haiku: 현재 트리 + 새 발언)
→ 패치(add/update/move/merge + 요약 bullet) → React Flow 반영
회의 종료 → /api/summary (Claude Sonnet): 회의록(결정사항·액션아이템·담당자)
```

## 구현 단계

**Phase 0 — 공통 코어 (두 버전 모두의 기반)**
- 모노레포 셋업, `.env.example` (SONIOX_API_KEY, ANTHROPIC_API_KEY)
- `packages/core`: SttProvider, applyPatch(+Vitest), scheduler, 프롬프트/tool 스키마
- `packages/ui`: 자막·마인드맵·요약 패널
- `apps/web/app/api/*`: 임시 STT 키 발급, 마인드맵 패치, 최종 요약

**Phase 1 — B. 오프라인 버전 먼저 (구현이 가장 단순, 코어 검증용)**
- `apps/web`: 마이크 녹음 → 실시간 자막(화자1/2/…) → 라이브 마인드맵 → 회의록
- 화자 이름 지정 UI: "화자1 → 김부장" 매핑, 마인드맵·회의록에 실명 반영
- 회의 시작 시 예상 인원 입력(화자분리 힌트), 오디오 레벨 미터로 수음 상태 표시
- PWA 설정(화면 꺼짐 방지 Wake Lock 포함) → 폰을 테이블에 두고 사용

**Phase 2 — A. 온라인 버전**
- `apps/desktop`: Electron 셋업, renderer에서 `packages/ui` 재사용
- `main/audioCapture.ts`: 시스템 오디오 + 마이크를 **별도 스트림**으로 캡처, Soniox에 2개 세션(또는 채널 분리)으로 전송
- 마이크 채널 = "나" 고정, 시스템 채널 화자분리 결과 = 상대방들
- 에코 처리: 마이크에 echoCancellation 적용 + 동일 시간대 중복 문장 제거
- 플랫폼 권한 안내(macOS 화면 기록 권한), Windows/macOS 빌드(electron-builder)
- 항상 위 작은 창(오버레이) 모드: 회의 화면 옆에 마인드맵 띄우기

**Phase 3 — 마감 (공통)**
- IndexedDB 회의 기록, Markdown/PNG 내보내기, 노드 수동 편집 → 다음 패치에 반영

이후 확장: Supabase 공유, 음성 등록 기반 화자 자동 인식(오프라인), Recall.ai 봇 연동(온라인 실명), 노드 클릭 시 발언 구간 재생.

## 리스크 & 대응
- **비용**: Haiku + 배치 + 캐싱. 1시간 회의 STT+LLM 비용 실측 필요
- **마인드맵 흔들림**: 노드 id 유지, 삭제 대신 merge, 레이아웃 안정화
- **오프라인 화자분리 오류**: 사용자가 화자 라벨 수정/병합 가능하게
- **macOS 시스템 오디오**: OS/Electron 버전 의존 → 초기에 PoC로 먼저 검증
- **개인정보/동의**: 녹음 동의 안내, 오디오 서버 미저장(MVP)

## 검증
- `applyPatch`/scheduler 단위 테스트(Vitest), `pnpm -r lint && pnpm -r build`
- B: Playwright + Chrome 가짜 마이크(`--use-file-for-fake-audio-capture`)로 다화자 한국어 샘플 오디오 주입 → 화자 2명 이상 구분, 자막 지연 < 1초, 30초 내 마인드맵 갱신
- A: 샘플 영상 재생(시스템 오디오) + 마이크 동시 입력으로 두 채널 분리 확인 (Windows 우선, macOS는 실기기 수동 확인)
- 완료 후 `claude/meeting-recording-mindmap-app-08tltf` 브랜치에 커밋·푸시

## 참고 출처
- https://soniox.com/compare-stt/soniox-vs-openai/korean
- https://soniox.com/compare-stt/soniox-vs-assemblyai/korean
- https://smallest.ai/blog/most-accurate-real-time-transcription-apis-in-2026
- https://bibigpt.co/blog/posts/best-ai-meeting-transcription-note-taking-tools-2026-en
- https://blog.openreplay.com/build-a-mind-mapping-app-with-react-flow/
