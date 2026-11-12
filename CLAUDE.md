# Blackbox

A video-journal app. Users sign up (email + password, or Google), record video in the browser, and the video is encrypted client-side with AES-GCM and uploaded to S3. Metadata lives in MongoDB Atlas.

- `frontend/` — React 18 + TypeScript + Vite + Tailwind/shadcn
- `backend/` — Express 5 (CommonJS) + Mongoose + `aws-sdk` v2 S3
Frontend deploys to Vercel at `www.blackb0x.app` (the bare `blackb0x.app` redirects there; the React landing is the home route, and the root `vercel.json` holds build settings, SPA rewrites and security headers). Vercel builds from `main` on every push. Backend deploys to Render at `api.blackb0x.app`. **The GitHub repo is public.** Default branch `main`; work happens on `develop` and `security_hardening`.

## Commands

```
npm run dev       # frontend on :8080, proxies /api to :5100
npm run backend   # express on :5100
npm test          # backend, frontend and e2e tests
```

## Non-negotiables

These are settled decisions, not preferences. Don't reopen them; if one looks wrong, raise it rather than working around it.

1. **Never connect to production data.** Not the real Atlas cluster, not the real S3 bucket. Tests use `mongodb-memory-server` and mocked or LocalStack S3.
2. **Never print, log, commit or hardcode secrets.** If you find one, report its location and redact the value. Never ask for a secret value to be pasted into chat.
3. **Don't touch database naming.** `MONGO_URI` deliberately has no database name, so everything currently lands in `test`. This is known. Migrating to `blackb0x` is intentionally the *last* task in the roadmap below. Don't add a `dbName` option, don't edit the URI, don't "fix" it as a drive-by.
4. **Don't rewrite git history.** No `git filter-repo`, no force-pushes, no re-auditing history for secrets. This is settled: a full scan found exactly two secrets ever committed — an old Atlas password and one old AWS key pair — and both are rotated and dead.
5. **End-to-end encryption is deferred.** The server currently stores each video's AES key (`jwk`) next to its S3 pointer, so it *can* decrypt. Do not implement master keys, passphrases, KDFs, recovery codes or chunked formats, and do not add abstractions "in preparation" for them. Just don't make the later migration harder — e.g. keep a version field on new video records.
6. **Security claims must match the implementation.** The landing copy currently claims "you hold the key," which is not true today. Never add or keep a security claim the code doesn't back.
7. **Nothing secret belongs in `frontend/`.** Everything there ships to every visitor's browser. Only `VITE_*` values that are public by design (API URL, Google client ID). A database client must never appear in frontend code.
8. **Keep both frontend CSPs in sync.** The production CSP lives in the root `vercel.json` (sent as a header) and in `frontend/vite.config.ts` (baked in as a `<meta>` tag). A change to one without the other breaks the site or weakens it.
9. **Ask first** before adding a paid or third-party service, deleting data, changing deployment config, or doing anything irreversible.
10. **Report honestly.** Show real command output. If something can't be verified locally, say so rather than claiming it works. Don't claim an absence of vulnerabilities — describe what was tested and what wasn't.

## Roadmap, in order

Work top to bottom. Each step assumes the previous one landed.

1. ~~**`docs/` cleanup**~~ — obsolete: `docs/` and GitHub Pages were retired in the move to Vercel.
2. **Dead-code deletion pass** — unreferenced files, exports and dependencies. Deletion only: no renaming, moving or restructuring.
3. **Security hardening** — follow `SECURITY_HARDENING_PROMPT.md`. One phase per session; honour its approval gates.
4. **Refactor** — plan written *after* the security audit exists, so it targets the real structural problems rather than code that's about to change.
5. **Admin panel** — depends on the session rework in the hardening doc (§5.D). Admin suspension and roles cannot work until the auth middleware resolves the user per request.
6. **Database migration** to `blackb0x` — last.

## Repo gotchas
- `backend/routes/videoRoutes.js` holds its route logic inline; controllers exist only for auth and profile. Splitting it out is planned, not done.
- The backend has no startup validation of environment variables, and keeps serving after a failed database connection.
