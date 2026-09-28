# Testing

This is the Phase 0 safety net: a baseline test suite that locks in current
behaviour before any security remediation starts. Nothing here talks to
production. Backend tests and the e2e run use an in-memory MongoDB
(`mongodb-memory-server`) and an in-memory fake S3 client — no real Atlas
cluster, no real AWS bucket, no real Google API calls.

## Prerequisites

- Node.js (see each package's `package.json` for engine expectations; developed against Node 20+).
- First run of the backend suite / e2e suite downloads a MongoDB binary via
  `mongodb-memory-server` (cached afterwards under `~/.cache/mongodb-binaries`
  or similar) — needs network access once.
- Playwright needs its browser binary installed once: `npx playwright install chromium`.

## Running everything

From the repo root:

```bash
npm run test:backend   # backend unit/integration tests (Vitest + Supertest)
npm run test:frontend  # frontend unit/component tests (Vitest + Testing Library)
npm run test:e2e       # Playwright end-to-end smoke test
npm test                # all three, in order
```

## Backend — `backend/`

- Runner: Vitest, config in `backend/vitest.config.js`.
- `backend/app.js` exports the configured Express app with no side effects
  (no `mongoose.connect`, no `app.listen`) — that's what tests import.
  `backend/server.js` is the real bootstrap (`node server.js`) that wires
  `app.js` up to a real Mongo connection and starts listening; only that file
  reads `backend/.env` via `dotenv`, so tests never see real secrets.
- `backend/tests/setup.js` starts one `mongodb-memory-server` instance per
  test file, sets test-only env vars (`JWT_SECRET`, `GOOGLE_CLIENT_ID`,
  `USE_FAKE_S3=true`, etc.), and clears all collections after each test.
- `backend/services/s3Client.js` returns the real `AWS.S3` client normally,
  or `backend/services/fakeS3Client.js` (an in-memory Map) when
  `USE_FAKE_S3=true`. The fake's `getSignedUrl` points back at this same
  server's `/__fake-s3__/:bucket?key=...` route (mounted in `app.js` only
  under `USE_FAKE_S3`), so a real HTTP `fetch()` against a "signed" URL still
  returns bytes — used by both the video tests and the e2e run.
- `backend/services/googleAuth.js` wraps `google-auth-library`'s
  `verifyIdToken` in one function so tests can `vi.spyOn` it instead of
  hitting Google's network API.
- Coverage: register / login / Google auth (mocked) / `/auth/me`; profile
  get, update, onboarding; video upload, list, get-by-id, rename, delete; and
  an explicit IDOR check that user B gets 404s (not the data) on every verb
  against user A's video.

Run just this suite:

```bash
cd backend && npm test
```

## Frontend — `frontend/`

- Runner: Vitest + Testing Library, config in `frontend/vitest.config.ts`,
  jsdom environment, setup file `frontend/src/test/setup.ts`.
- `frontend/src/lib/videoCrypto.ts` holds the AES-256-GCM encrypt/decrypt
  logic shared by `VideoRecorder` (encrypt before upload) and `VideoPlayer`
  (decrypt for playback) — extracted from those components so it has one
  implementation and can be exercised directly.
  `frontend/src/lib/videoCrypto.test.ts` round-trips a payload through it,
  confirms a fresh key/IV every call, and confirms decryption fails with the
  wrong key. That file runs under Vitest's **node** environment
  (`// @vitest-environment node`) rather than jsdom — jsdom runs tests in a
  separate vm context, and cross-realm `ArrayBuffer`s fail `SubtleCrypto`'s
  instanceof checks, so the real webcrypto engine needs the same realm as the
  `Blob`s under test.
- `AuthContext.test.tsx`: login/logout state transitions, token persisted to
  and cleared from `localStorage`, server error messages surfaced.
- `ProtectedRoute.test.tsx`: redirects to `/login` when logged out, renders
  children when authenticated with a complete profile, shows a loading state
  instead of redirecting while auth is still resolving.
- `useLogoutTimer.test.tsx`: fires logout after the idle timeout (fake
  timers), `resetTimer()` prevents it, a custom `onTimeout` is honoured
  instead of the default logout.

Run just this suite:

```bash
cd frontend && npm test
```

## End-to-end — `e2e/`

- Runner: Playwright, config in `e2e/playwright.config.ts`.
- `playwright.config.ts` boots two local servers itself (`webServer`, plural):
  - Backend: `node backend/scripts/startE2EServer.js` on port 5100 — an
    in-memory Mongo instance, `USE_FAKE_S3=true`, and dummy secrets. It never
    loads `backend/.env`.
  - Frontend: `npm run dev` (Vite) on port 8080, proxying `/api` to the
    backend above exactly as local dev does.
- Chromium launches with `--use-fake-device-for-media-stream` and
  `--use-fake-ui-for-media-stream`, and the context is pre-granted `camera`
  and `microphone` permissions, so `getUserMedia` resolves against a
  synthetic device with no real hardware and no permission prompt.
- The single smoke test drives the full golden path against real app code:
  register (email flow) → onboarding → grant camera → record a few seconds
  of video → save (real client-side AES-GCM encryption → real upload) → see
  it in the list → play it (real fetch of the "signed" URL → real
  decryption, asserting no decrypt error and a working `blob:` video src) →
  rename → delete → sign out → log back in with the same credentials and
  confirm the session persisted correctly (no onboarding replay, empty list).
- Known gotcha (already handled in the test): the record button is present
  and clickable before `getUserMedia` resolves; clicking it before the
  camera stream attaches is a silent no-op (toast + early return) in the
  current `VideoRecorder` code. The test waits for
  `document.querySelector('video').srcObject` to be set before driving the
  recorder.

Run just this suite:

```bash
npx playwright install chromium   # first time only
npm run test:e2e
```

To debug a failing e2e run: pass `--headed` or `--debug` to the above, or
inspect the trace Playwright attaches on failure with
`npx playwright show-trace test-results/.../trace.zip`.

## What this baseline does *not* cover yet

This is Phase 0 — a regression net, not the adversarial suite. It does not
attempt injection payloads, forged/tampered tokens, rate-limit behaviour, or
any of the other adversarial checks; those are Phase 4 (`§7` of
`SECURITY_HARDENING_PROMPT.md`). Its only job is: if a Phase 2 fix breaks
something that already worked, one of these tests should turn red.
