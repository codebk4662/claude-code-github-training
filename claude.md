# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

The only real content in this repo is the `meeting-mindmap/` pnpm monorepo — a meeting app that records audio, live-transcribes it, and turns it into a growing mindmap + meeting minutes. All commands below run from inside `meeting-mindmap/` unless noted. See `meeting-mindmap/README.md` and `meeting-mindmap/docs/PLAN.md` for the original product design (the plan doc predates several schema changes below and is a historical reference, not current truth).

## Commands

Install: `pnpm install` (pnpm is pinned via `packageManager: "pnpm@10.28.0"`; `corepack enable pnpm` picks it up automatically). On Windows, `corepack enable pnpm` can fail with `EPERM` writing to `C:\Program Files\nodejs` without admin rights — fall back to `npm install -g pnpm`, which still resolves to the pinned 10.28.0 for this repo's commands.

- `pnpm dev:web` — runs the offline/web app (`apps/web`, Next.js) at `http://localhost:3000`. This process also serves the API routes both apps call (`/api/stt-token`, `/api/mindmap`, `/api/summary`).
- `pnpm dev:desktop` — runs only the Electron renderer (Vite dev server). To launch the actual Electron window: `pnpm --filter @mm/desktop dev:electron` (requires `pnpm dev:web` running in another terminal — the desktop app calls `apps/web`'s API server).
- `pnpm build` — `pnpm -r build` (builds `apps/web` and `apps/desktop`; `packages/core`/`packages/ui` are source-only and have no build step — they're consumed directly via Next's `transpilePackages` / Vite).
- `pnpm test` — runs `packages/core`'s vitest suite (the only package with tests). Single file: `pnpm --filter @mm/core exec vitest run src/mindmap/applyPatch.test.ts`. Watch mode: `pnpm --filter @mm/core exec vitest`.
- `pnpm typecheck` — `pnpm -r typecheck` across all 4 packages (`tsc --noEmit`).
- `pnpm --filter @mm/desktop dist` — electron-builder packaging (Windows: nsis, macOS: dmg).
- No lint/format tooling exists in this repo (no eslint/prettier config) — don't assume a `lint` script.

### Environment

`apps/web/.env.local` (gitignored; copy from `apps/web/.env.example`):
- `ANTHROPIC_API_KEY`, `SONIOX_API_KEY` — real keys, server-only, never sent to the client
- `NEXT_PUBLIC_MOCK_STT=1` — replace Soniox with a scripted Korean multi-speaker meeting (`packages/core/src/stt/mock.ts`) when there's no Soniox key
- `MOCK_LLM=1` — replace the Claude calls in `/api/mindmap` and `/api/summary` with deterministic placeholder responses, so the whole pipeline is testable with zero API keys
- `MINDMAP_MODEL` / `SUMMARY_MODEL` — override the model IDs hardcoded in `packages/core/src/prompts/index.ts`
- `ALLOWED_ORIGINS` — CORS allowlist so `apps/desktop`'s renderer (a different origin) can call this server

`apps/desktop/.env.example`: `VITE_API_BASE` — URL of the running `apps/web` server.

## Architecture

Two end-user apps share one audio → STT → Claude → UI pipeline via `packages/core` (framework-agnostic logic) and `packages/ui` (shared React components + Zustand store):

- **`apps/web`** — B. 오프라인(대면) 버전: Next.js PWA, one mic + STT speaker diarization. Also hosts the shared API server both apps call.
- **`apps/desktop`** — A. 온라인(화상회의) 버전: Electron. Captures system-audio loopback (the remote side, via `setDisplayMediaRequestHandler`) and the mic (fixed speaker key `"me"`) as two separate audio sources, each with its own STT session.
- **`packages/core`** — `SttSession` interface + `SonioxSession`/`MockSttSession`, AudioWorklet-based PCM capture, `UtteranceAssembler` (STT tokens → per-speaker utterances), mindmap types + `applyPatch` (pure function), `BatchScheduler`, Claude prompts/zod schemas, API request/response contracts (`packages/core/src/api/contracts.ts`).
- **`packages/ui`** — `MeetingController` (orchestrates the whole pipeline end to end), the Zustand store, the React Flow mindmap view, transcript/summary panels, IndexedDB persistence.

Pipeline (`packages/ui/src/controller.ts`):
```
getUserMedia/getDisplayMedia → startPcmCapture (AudioWorklet → 16kHz PCM)
  → SttSession.sendAudio → onTokens → UtteranceAssembler → confirmed Utterance
  → BatchScheduler (25s or 10 utterances, whichever first) → POST /api/mindmap
  → applyPatch(ops) onto the mindmap, plus live topic/key-debates/conclusions/
    action-items state in the Zustand store
회의 종료 → POST /api/summary → final MeetingSummary → saved to IndexedDB
```

Points that require reading across files to understand:

- **`SttSession`** (`packages/core/src/stt/types.ts`) is the provider-swap seam: `SonioxSession` (real) and `MockSttSession` (scripted) both implement it; `MeetingController`'s `createStt` option picks which one, defaulting to Soniox.
- **`/api/mindmap`** (`apps/web/app/api/mindmap/route.ts`) is called once per batch and does double duty in a single Claude call: it returns both the mindmap patch (`ops`) *and* the live-progress fields (`topic`, `newKeyDebates`, `newConclusions`, `newActionItems`, `summaryBullets`) — this keeps it to one LLM call per batch instead of two. Every `*SoFar` field in the request (`summarySoFar`, `actionItemsSoFar`, `keyDebatesSoFar`, `conclusionsSoFar`) exists only so the model doesn't repeat itself across batches; the client accumulates these itself (`store.ts`'s `dedupeAppend`).
- Mindmap patches are never a full replacement — `applyPatch` (`packages/core/src/mindmap/applyPatch.ts`) applies `add`/`update`/`move`/`merge` ops onto the existing tree so node identity and layout stay stable. An `add` with an id that already exists becomes an update in place — both the real prompt and the `MOCK_LLM=1` mock rely on this to grow the same node incrementally across calls (e.g. one 1단계 branch per speaker, named `mock-branch-<speaker>`).
- **`/api/summary`** is the single post-meeting call, using `SUMMARY_MODEL` (Sonnet) vs `MINDMAP_MODEL` (Haiku) for the live loop — a deliberate cost/quality split. It is independent of the live `topic`/`keyDebates`/`conclusions` fields above (those never feed back into the final summary prompt).
- Model IDs are centralized in `packages/core/src/prompts/index.ts` (`MINDMAP_MODEL`, `SUMMARY_MODEL`) and `packages/core/src/stt/soniox.ts` (`SONIOX_DEFAULT_MODEL`) — these are real, externally-versioned identifiers (Anthropic model IDs, Soniox `stt-rt-v*`) that get retired on a schedule; verify against current docs rather than trusting a cached value.
- `MOCK_LLM=1` responses (`apps/web/app/api/mindmap/route.ts` / `api/summary/route.ts`) are deliberately *not* trying to fake real NLU — they exist to prove the schema/UI wiring works end to end without API keys, and are prefixed with `(mock)` so they're never mistaken for real model output. When extending the response schema, update the mock alongside the real prompt so `MOCK_LLM=1` testing stays representative of the real pipeline.
- `packages/ui/src/store.ts` is the single source of UI truth (Zustand); `MeetingController` is the only thing that writes to it from the pipeline side. Live-progress fields (`topic`, `keyDebates`, `conclusions`, `actionItems`, `summaryBullets`) accumulate during recording and are distinct from `finalSummary` (set once, from `/api/summary`, after `stop()`).
- `speakerColorIndex` (`packages/core/src/transcript/speakers.ts`) is shared between the transcript panel and the mindmap's speaker chips so the same speaker always gets the same color across both views.
