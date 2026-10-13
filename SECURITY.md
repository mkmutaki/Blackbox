# Security

## Threat model

Who Blackbox is defended against, in priority order:

1. **An authenticated user attacking another user's data** — this is the
   threat that matters most. Every video/profile route is scoped by the
   authenticated user's own ID; see `SECURITY_AUDIT.md` for what was found
   and fixed.
2. **An unauthenticated attacker** with only the public frontend and the
   public API.
3. **An attacker who obtains a user's browser session** — XSS, a shared
   machine, a stolen laptop.
4. **A supply-chain attacker** who controls a third-party script or npm
   package the app loads.

## Accepted risk: the server can decrypt any video

Blackbox encrypts video client-side with AES-256-GCM before upload. **The
server currently also holds the decryption key.** Each video's AES key
(`jwk`) is stored in the same MongoDB document as its S3 pointer (`s3Key`) —
see `backend/models/Video.js`. This means:

- Anyone with read access to the MongoDB database — the operator, MongoDB
  Atlas, a breach, or a future admin panel — can decrypt every video in the
  system.
- This is **not** end-to-end encryption. The marketing copy has been
  corrected to reflect this honestly (was previously overstating the
  guarantee — see `SECURITY_AUDIT.md` SEC-17).

This is accepted, not fixed, for now: end-to-end encryption (where only the
user holds the key) is on the roadmap but is a separate, larger project —
it needs key derivation/wrapping and a recovery story that doesn't exist
yet, and building it inside this hardening pass would mean designing crypto
under time pressure. Given the threat model above (the priority is
cross-user access control, not defending against a database compromise),
that tradeoff is deliberate.

What *is* done today as containment, short of full E2EE:
- `jwk`/`iv` are only ever returned to the video's own owner (enforced by
  the same `{_id, ownerId}` query every other video route uses — see
  `backend/routes/videoRoutes.js`), never logged, and never appear in error
  messages.
- Every video has its own freshly-generated AES-256-GCM key and a fresh
  random 12-byte IV — no key reuse across videos or users.
- `Video.encVersion` is stamped on every record (`1` today) so a future
  E2EE migration can tell old- and new-format videos apart instead of
  guessing.
- S3 default (server-side) encryption at rest should be enabled as defence
  in depth — an infrastructure setting (bucket → Properties → Default
  encryption), not a substitute for the above.

## What client-side encryption *does* protect against

Even with the above accepted risk, client-side encryption still means:
- The S3 bucket alone (without the database) contains only ciphertext.
- Anyone who intercepts a signed download URL in transit, or who compromises
  S3 credentials without also having database access, gets encrypted bytes.
- A backup or replica of just the object storage, without the database,
  reveals nothing.

## Session model & CSRF

- **Cookies, not localStorage.** The session lives in two httpOnly cookies —
  a 15-minute access token (JWT, `HS256`, pinned `iss`/`aud`) and a
  30-day rotating refresh token (`backend/models/RefreshToken.js`). Neither
  is readable by JavaScript, so an XSS payload can no longer exfiltrate the
  session the way `localStorage.getItem('token')` previously allowed.
- **Refresh rotation with reuse detection.** Every `/auth/refresh` call
  issues a new refresh token in the same "family" and marks the old one
  used. If an already-used token is ever presented again — the signal that
  it was copied/stolen — the entire family is revoked and the user's
  `tokenVersion` is bumped, killing even a currently-live access token from
  that chain immediately rather than waiting out its 15-minute lifetime.
- **`tokenVersion` on `User`** means `authMiddleware` resolves the user from
  the database on every request instead of trusting the token's claims
  alone — a password reset, or detected token reuse, takes effect on the
  very next request.
- **SameSite is `none` today, by necessity, not by oversight.** The live
  frontend (GitHub Pages) and backend (Render) are different sites — a
  `Lax`/`Strict` cookie simply wouldn't be sent cross-site at all. CSRF
  protection instead comes from a strict Origin/Referer allowlist
  (`backend/middleware/csrf.js`) on every state-changing request. Once the
  planned custom domain unifies both into one site, set
  `COOKIE_SAME_SITE=lax` (see `.env.example`) to add SameSite as a second
  layer on top of the Origin check — don't remove the Origin check itself.
- **Rate limiting** (`backend/middleware/rateLimit.js`) is per-IP and
  per-account on login, register, Google auth, password reset, and video
  presign. It's in-memory (`express-rate-limit`'s default store) — fine for
  the current single Render instance, but won't coordinate limits across
  multiple instances if the backend is ever scaled horizontally; move to a
  shared store (Redis) first if that happens.

## HTTP hardening: CORS, CSP, and input validation

- **Every route validates its input** (`backend/middleware/validate.js`,
  zod): body/param fields are type-pinned, length-capped, and unknown keys
  are stripped. This is what actually closes NoSQL-operator-injection paths
  like `{"email": {"$ne": null}}` — the value fails `z.string()` before it
  can reach a Mongoose query — and is a stronger guarantee than
  `mongoose.set('sanitizeFilter', true)` alone (also enabled, as a second
  layer). A malformed `:id` now 400s instead of 500ing.
- **CORS and CSRF share one allowlist.** `ALLOWED_ORIGINS` (comma-separated
  env var) feeds both the `cors()` config and the CSRF Origin/Referer check
  in `backend/middleware/csrf.js`, computed fresh per request. Localhost is
  only ever added when `NODE_ENV` is not `production`.
- **Helmet runs with an explicit, locked-down CSP** (`default-src 'none'`)
  and HSTS. The backend is a pure JSON API with no HTML of its own, so this
  has no legitimate traffic to break.
- **The frontend carries its own CSP**, because GitHub Pages cannot set
  response headers at all, so a backend CSP can never reach it. A
  production-only `<meta http-equiv="Content-Security-Policy">` tag is
  baked into the build by a Vite plugin (`frontend/vite.config.ts`'s
  `injectProductionCSP` — dev mode is untouched, so local HMR still works).
  It allows `self`, Google Identity Services (`accounts.google.com`), the
  API origin, S3 (`*.amazonaws.com`, for the signed URLs `VideoPlayer`
  fetches directly), `blob:` (decrypted video playback), and Google Fonts.
  `frontend/vercel.json` carries the same policy plus headers a `<meta>`
  tag can't express (`X-Frame-Options`, `Permissions-Policy`, HSTS) for
  the planned custom-domain host — inert on GitHub Pages, ready for when
  that migration happens.

## Account lifecycle: minimum age and deletion

- **Minimum age is 8, enforced server-side.** `dateOfBirth` was previously
  only checked against the future; there was no actual minimum-age gate
  anywhere, despite three separate frontend forms each having their own
  (inconsistent, imprecise) client-side `age < 13` check. The real control
  is `backend/services/agePolicy.js`'s `meetsMinimumAge`, checked on
  registration and on every profile update, so a later edit can't move an
  account's age below the floor either. The frontend copy
  (`frontend/src/lib/agePolicy.ts`) mirrors the same month/day-aware logic
  purely for instant UX feedback — the server is what actually enforces it.
- **Account deletion** (`DELETE /api/auth/account`) requires
  re-authentication right now — the current session cookie alone isn't
  enough for something this destructive. Local accounts re-enter their
  password; Google accounts sign in with Google again, and the resulting
  credential's `sub` is checked against the account's stored `googleId`.
  The actual removal is `backend/services/accountDeletion.js`'s
  `deleteUserAccount(userId)`: an idempotent cascade that deletes the
  user's videos (database records and S3 objects — continuing past an
  individual S3 failure rather than aborting), refresh tokens, action
  tokens, the per-user entry counter, and finally the `User` document.
  Written as a standalone, reusable service specifically so a future admin
  deletion path calls the same function instead of a second copy of this
  logic.
- **`profile.location` stays**, deliberately — it's reserved for a planned
  feature (user-controlled location services shown in the recording UI),
  not dead schema. Whoever builds that feature should treat it as a fresh
  privacy review, not an extension of what's here: continuous/live
  location is a materially different sensitivity level than a one-time
  profile field.

## Security event logging

`backend/services/securityLog.js` writes one structured JSON line per
security-relevant event to stdout: `login_success`, `login_failure`,
`password_change`, `google_link_success`, `google_link_blocked_unverified`,
`refresh_token_reuse`, `account_deleted`. Passwords, tokens, `jwk`, and `iv`
are redacted outright; emails are masked (`j***@example.com`) rather than
either logged in full or dropped, since knowing *which* account an event
concerns is the point of a security log. This is deliberately not
persisted to a database yet — it's the substrate a future admin-panel
audit log is meant to build on (an append-only `AuditLog` model, planned),
not a replacement for it.

## Known limitation: email delivery is stubbed

Email verification and password reset are fully implemented end to end —
`backend/services/email.js` is the one function every send goes through —
but no real provider is wired in yet (the prompt that drove this asks to
pick one before implementing; that hasn't happened). Today, both flows log
the link to the server's console instead of sending it. **Nobody can
self-serve either flow in production** until a provider (Resend, SES,
SendGrid, …) is chosen and `sendEmail` is pointed at it — everything else
(token generation, expiry, single-use enforcement, the SEC-01 Google-linking
gate that depends on `emailVerified`) already works and is tested against
the stub.

## Reporting a vulnerability

Email **hello@blackbox.app** with details and, if possible, reproduction
steps. Please don't open a public GitHub issue for anything that isn't
already public — the repo is public, so a vulnerability report filed as an
issue is a disclosure.

## Credential rotation runbook

Rotate credentials whenever one may have been exposed (committed by
accident, shared insecurely, or a team member who had access leaves).

### MongoDB Atlas database user
1. Atlas → Database Access → the app's database user → **Edit** → Autogenerate a new password (or set one).
2. Update `MONGO_URI` in Render's environment variables with the new password.
3. Redeploy the backend service so it picks up the new connection string.
4. Delete the old password only after confirming the new deploy connects successfully.

### AWS IAM access keys (S3)
1. IAM → Users → the app's IAM user → Security credentials → **Create access key**.
2. Update `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in Render's environment variables.
3. Redeploy and confirm uploads/downloads still work.
4. **Deactivate**, then after confirming nothing broke, **delete** the old access key in IAM.
5. Never create a second *user* to rotate — rotate the *key* on the existing least-privilege user, scoped to the `videos/` prefix only.

### JWT_SECRET
1. Generate a new value: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`.
2. Update `JWT_SECRET` in Render's environment variables and redeploy.
3. This invalidates every existing *access* token immediately (they're verified by signature, not looked up), so every logged-in user's next request gets a 401. Their browser then silently tries `/auth/refresh` — which also fails, since refresh tokens aren't signed with `JWT_SECRET` and don't become invalid on their own, but the access token issued from that refresh attempt still needs the new secret to verify going forward, so in practice everyone ends up needing to log in again. That's expected and safe; it's also the bluntest way to force a full logout everywhere if a token is known to be compromised. For a *targeted* single-account logout-everywhere instead, see the `tokenVersion` mechanism in `SECURITY_AUDIT.md` SEC-03 — a password reset already triggers this automatically.

### Google OAuth client
1. Google Cloud Console → APIs & Services → Credentials → the OAuth 2.0 Client ID.
2. If the *client secret* needs rotation (this app only uses the client ID for `google-auth-library`'s ID-token verification, so there's normally nothing to rotate here) — reset it and update anywhere it's configured.
3. If the client ID itself is ever replaced, update `GOOGLE_CLIENT_ID` (backend) and `VITE_GOOGLE_CLIENT_ID` (frontend) together, and add the new authorized JavaScript origins/redirect URIs in the same Cloud Console screen.

## Environment variables

See `backend/.env.example` and `frontend/.env.example` for the full,
up-to-date list with descriptions. Backend startup validates all required
variables via `backend/validateEnv.js` (zod) and refuses to start with a
clear, secret-free error if any are missing or malformed.

## Secret scanning

A pre-commit hook (`.husky/pre-commit`) runs [gitleaks](https://github.com/gitleaks/gitleaks)
against staged changes if it's installed locally (`brew install gitleaks`
or see their install docs) — install it locally for the check to actually
run; it currently warns rather than blocks if it's missing, since it isn't
distributed via npm. CI (`.github/workflows/ci.yml`) runs the same scan on
every push and pull request as the enforced backstop.

## CI

`.github/workflows/ci.yml` runs on every push/PR: the gitleaks scan above,
frontend lint/typecheck/tests/production build, backend tests, the
Playwright e2e smoke test, `npm audit --audit-level=high` (a hard gate on
`backend/`, which is currently clean; informational-only on `frontend/`
until the Tailwind v4 migration — see `SECURITY_AUDIT.md` SEC-28 — since
otherwise every PR would fail on a known, deferred, dev-toolchain-only
finding), and CodeQL. `.github/dependabot.yml` watches all three npm
"ecosystems" (root, `frontend/`, `backend/` — see the note below for why
there are three) plus GitHub Actions itself.

## Running `npm install` in this repo — read this before you do

The root `package.json` declares an npm `"workspaces"` field
(`["frontend", "backend"]`), **but** `frontend/` and `backend/` each also
keep their own fully independent `package-lock.json`. That combination is
a footgun: plain `npm install` or `npm ci`, run from *inside* `frontend/`
or `backend/`, gets silently redirected by npm to resolve against the
**root** instead of that directory's own lockfile — see
`SECURITY_AUDIT.md` SEC-31 for exactly what that corrupted during one
hardening pass (a deleted lockfile, a rewritten one, versions drifting out
of sync with what's recorded) using nothing but ordinary, expected
commands.

**Always pass both flags** when installing inside either directory:

```
npm install --workspaces=false --include-workspace-root=false
npm ci --workspaces=false --include-workspace-root=false
npm audit fix --workspaces=false --include-workspace-root=false
```

`.github/workflows/ci.yml` already does this for every install step. This
applies to local development too — a plain `cd backend && npm install`
without the flags can quietly rewrite the wrong lockfile.
