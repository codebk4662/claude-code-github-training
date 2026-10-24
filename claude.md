# claude-code-github-training

실제 작업 중인 프로젝트는 `meeting-mindmap/` 모노레포(회의 녹음 → 실시간 자막 → 라이브 마인드맵 → 회의록). 자세한 내용은 `meeting-mindmap/README.md`와 `meeting-mindmap/docs/PLAN.md` 참고.

- pnpm 워크스페이스: `cd meeting-mindmap && pnpm install` (pnpm은 `packageManager` 필드로 10.28.0 고정)
- `pnpm dev:web`으로 오프라인(웹) 버전 실행, `.env.local`에 `ANTHROPIC_API_KEY` 필요
- Soniox 키가 없으면 `NEXT_PUBLIC_MOCK_STT=1`로 가짜 STT(`packages/core/src/stt/mock.ts`) 사용 가능
- `pnpm test`, `pnpm typecheck`로 검증
