# Blackbox — Security Review & Hardening (v2)

You are acting as a senior application-security engineer and full-stack developer. Your job is to review this codebase, prove where it is exploitable, fix what you find, and leave it ready for an admin panel — **without breaking any existing user-facing functionality**. Blackbox stores personal data and private video journals, so security matters more than speed. Work in phases and verify as you go.

**Two goals, in order:**
1. **No known-exploitable path** into the app, its data, or another user's entries — demonstrated by tests that actually run, not by assertion.
2. **The groundwork an admin panel needs**, so the panel itself is later a thin layer over code that already exists.

An honesty note that governs everything below: you cannot prove the absence of vulnerabilities, so don't claim to. "Not penetrable" here means *no known-exploitable path against the threat model in §1, verified by executed tests*. Say plainly what you tested, what you couldn't test, and what remains.

---

## 1. Context

**What the app does:** Blackbox is a video-journal app. Users sign up (email + password, or Google), record video in the browser, and the video is encrypted client-side with AES-GCM and uploaded to S3. Users can list, play, rename and delete their entries. There is also an inactivity logout timer, an onboarding flow, profile setup and settings.

**Stack**
- `frontend/` — React 18 + TypeScript + Vite + Tailwind/shadcn, axios (`src/services/api.ts`), auth state in `src/context/AuthContext.tsx`, encryption in `src/components/VideoRecorder.tsx`, decryption in `src/components/VideoPlayer.tsx`
- `backend/` — Express 5 (CommonJS), Mongoose/MongoDB Atlas, `aws-sdk` v2 S3, multer, jsonwebtoken, bcryptjs, google-auth-library, helmet, cors
- `landing/` — static landing page
- Deploy: frontend built into `docs/` → GitHub Pages (`mkmutaki.github.io/Blackbox`), backend on Render (`blackbox-2lt5.onrender.com`). **The GitHub repo is public.**

**Threat model — who you are defending against**
- An unauthenticated attacker with only the public frontend and the public API.
- An authenticated user attacking *another* user's data (this is the one that matters most).
- An attacker who obtains a user's browser session (XSS, shared machine, stolen laptop).
- A supply-chain attacker who controls a third-party script or npm package the app loads.

**Explicitly out of the threat model for now** (document it, don't fix it):
- An attacker with read access to the MongoDB database. Because E2EE is deferred, the server stores each video's AES key (`jwk`) next to the S3 pointer, so database read access means the ability to decrypt every video. This is the single largest accepted risk and the reason E2EE stays on the roadmap.

**Decisions already made — do not reopen**
1. **E2EE is deferred.** Keep the current client-side AES-GCM scheme working as-is. Do not introduce master keys, passphrases, KDFs or recovery codes. Do not add compatibility shims or abstractions "in preparation" — just don't make the later migration harder.
2. **Production holds test data only.** It can be wiped. No data migration is needed. Remove legacy code paths completely rather than keeping backwards compatibility.
3. **A custom domain is planned** (e.g. `app.<domain>` + `api.<domain>`, same-site). Design auth around **httpOnly, Secure cookies**. Keep all origins env-driven so local dev keeps working.
4. **Git history will not be rewritten.** See §0.
5. **Database naming is untouched.** See §0.

---

## 2. Ground rules

- **Before you start:** run `git status`. If the tree is dirty, stop and ask what to do with the changes. Then create branch `security-hardening` from `develop`.
- **Plan first.** Finish Phases 0–1 and **wait for approval** before Phase 2.
- **Small, focused commits**, one per finding or closely related group, referencing the audit ID: `fix(SEC-03): pin JWT algorithm and add token revocation`.
- **Never touch production resources.** Do not connect to the real Atlas cluster or the real S3 bucket. Use `mongodb-memory-server` and mocked or LocalStack S3.
- **Never print, log, commit or hardcode secrets.** If you find one, report its location and redact the value.
- **Keep the app working.** Every change must pass the Phase 0 suite. If a fix changes user-visible behaviour, implement it cleanly and list it in the final report.
- **Ask before you:** add a paid or third-party service (e.g. an email provider), delete data, change deployment config, or do anything irreversible.
- **Be honest about verification.** Show real command output. If something can't be tested locally, say so rather than claiming it works.
- Treat §4's findings as **verified leads to re-confirm**, not gospel — the tree may have moved. Also look for what isn't listed.

---

## 3. Phase 0 — Safety net (before changing anything)

The project has **no tests**. Build a baseline that locks in current behaviour so regressions surface immediately.

1. **Backend** (Vitest or Jest + supertest + `mongodb-memory-server` + `aws-sdk-client-mock` or equivalent):
   - register, login, Google auth (mock `verifyIdToken`), `/auth/me`
   - profile get / update / onboarding
   - video upload, list, get by id, rename, delete
   - ownership: user B cannot read, rename or delete user A's video
2. **Frontend** (Vitest + Testing Library): encrypt → decrypt round-trip, AuthContext login/logout, ProtectedRoute redirect, inactivity logout timer.
3. **End-to-end smoke test** (Playwright) against local dev (`frontend` on :8080 proxying to backend on :5100, in-memory database, mocked storage). Use a fake media stream (`--use-fake-device-for-media-stream`). Flow: register → onboarding → record → upload → list → play → rename → delete → logout → log back in.
4. Add `npm test` scripts and document how to run everything in `TESTING.md`.
5. **Run the full suite against unmodified code and show it passing** before continuing.

---

## 4. Phase 1 — Audit

Review every file in `backend/`, `frontend/src/`, `landing/`, build and deploy config, `.gitignore`, `README.md` and both `package.json` files. Cover the OWASP Top 10 and the applicable OWASP ASVS L2 areas: authentication, sessions, access control/IDOR, input validation and injection (including NoSQL operator injection), cryptography, file upload, secrets management, CORS/CSP/security headers, error handling and logging, rate limiting and DoS, dependency vulnerabilities, privacy and data minimisation, and client-side storage.

Produce `SECURITY_AUDIT.md`: a table sorted by severity, each finding with ID, severity, `file:line`, description, **exploit scenario**, fix plan, and whether the fix changes user-visible behaviour. **Then stop and wait for approval.**

### Verified findings

Confirmed by reading the working tree. Re-confirm each before fixing, and check whether the uncommitted work in progress has changed any of them.

| ID | Severity | Location | Finding |
|---|---|---|---|
| SEC-01 | **Critical** | `backend/controllers/authController.js:146-151` | **Google-linking account takeover.** `googleAuth` links a Google identity to any existing local account with a matching email, and local registration never verifies email ownership. Attacker registers with a victim's email → victim later signs in with Google → the accounts merge → the attacker's password now opens the victim's account and all their entries. |
| SEC-02 | **Critical** | `frontend/index.html:28` | **Third-party script on auth pages.** `https://cdn.gpteng.co/gptengineer.js` (leftover scaffolding) loads on every page, including login and register, with full DOM access. If that CDN is compromised or the domain lapses, an attacker can keylog passwords, read the `localStorage` token and exfiltrate decrypted video blobs. One-line fix. |
| SEC-03 | **High** | `backend/middleware/authMiddleware.js:16`; `authController.js:50,94,168` | **Session model.** 7-day JWT in `localStorage` (XSS-readable), no refresh, no revocation, no `tokenVersion`; `jwt.verify` pins no algorithm, `iss` or `aud`; logout is client-only; the middleware never loads the user, so it trusts the token's claims for 7 days. **This blocks the admin panel** — see §6. |
| SEC-04 | **High** | `backend/routes/videoRoutes.js:10` | **Unbounded upload.** multer `memoryStorage` with no size limit. Any authenticated user can exhaust the Render instance's memory with one large POST. No `express.json` size limit either. |
| SEC-05 | **High** | `backend/server.js` (absent) | **No rate limiting** on login, register, Google auth or upload. No `app.set('trust proxy', …)`, so any per-IP limit added behind Render would key on the proxy. |
| SEC-06 | **High** | `backend/controllers/authController.js:30,82` | **NoSQL operator injection.** `req.body.email` flows unchecked into `User.findOne({ email })`. `{"$ne": null}` matches an arbitrary user, giving an existence oracle and 500-level error differences; the register path can also bypass the duplicate check. |
| SEC-07 | **High** | `backend/controllers/authController.js:18-21` | **No password policy.** Presence is the only check — a one-character password is accepted. No length minimum, no breached-password check. |
| SEC-08 | **High** | `frontend/package.json:56`; `frontend/src/Database/MongoClient.tsx` | **MongoDB driver in the frontend.** `mongodb@^6.16.0` is a frontend dependency and `MongoClient.tsx` held hardcoded Atlas credentials. The credentials are rotated and the file is slated for deletion in pre-work — **verify both the file and the dependency are gone**, then confirm no built bundle references them. |
| SEC-09 | Medium | `backend/routes/videoRoutes.js:47` | **Client filename in the S3 key.** `file.originalname` is interpolated straight into the object key. Client-supplied names must never reach storage keys; generate the key server-side. |
| SEC-10 | Medium | `backend/controllers/authController.js:32` | **Account enumeration.** Register returns "User already exists". (Login is already generic — keep it that way.) |
| SEC-11 | Medium | `backend/routes/videoRoutes.js:95,131` | **Signed GET URLs last 1 hour.** Anyone who obtains the URL within that window can fetch the ciphertext. Cut to ~5 minutes, owner-only. |
| SEC-12 | Medium | `backend/routes/videoRoutes.js` (all `:id` routes) | **Invalid ObjectId → 500.** `req.params.id` is unvalidated, so a malformed id throws a CastError into the generic handler instead of returning 400/404. |
| SEC-13 | Medium | `backend/controllers/profileController.js:38,61` | **Raw documents in responses.** `GET /profile` and `PUT /profile/update` return the Mongoose document with only `-password` stripped, so `googleId` and internals leak. (`/auth/me` correctly strips `googleId` — the inconsistency is the tell.) |
| SEC-14 | Medium | `backend/server.js:18` | **Server survives a failed DB connection** — it logs and keeps listening, serving 500s. No startup validation of required env vars either. |
| SEC-15 | Medium | `backend/server.js:21,25-26` | **Loose HTTP config.** CORS allows `localhost:8080` and `localhost:3000` in production; `helmet()` runs with defaults and no CSP; the API base URL is logged to the browser console. |
| SEC-16 | Medium | `backend/package.json` | **End-of-life dependencies.** `aws-sdk` v2 (EOL), `multer` 1.x (EOL, known DoS advisories), and `crypto@^1.0.1` — the deprecated npm placeholder, which should never be a dependency. `frontend/` has both `bun.lockb` and `package-lock.json`. |
| SEC-17 | Medium | `landing/index.html:64`; `frontend/src/pages/Landing.tsx:127,16`; `landing/script.js:6`; `README.md:6` | **Security claims that aren't true.** "We store the box; you hold the key" and "out of everyone else's reach" describe end-to-end encryption the app does not implement — the server stores the key. See §5.B; this must be corrected now, not when E2EE ships. |
| SEC-18 | Medium | `backend/models/User.js:78` | bcrypt cost factor 10. Raise to ≥ 12. |
| SEC-19 | Medium | (absent) | **No account deletion.** There is no way for a user to delete their account and have their S3 objects and database records removed. |
| SEC-20 | Low | `backend/controllers/profileController.js` vs `videoRoutes.js` | **Inconsistent input limits.** `completeOnboarding` caps username at 32 chars; `updateProfile` caps nothing; video `title` has no limit anywhere. |
| SEC-21 | Low | `backend/routes/videoRoutes.js:57-61` | **`entryNumber` race.** Computed by reading the current max, so concurrent uploads collide. Data-integrity rather than security, but worth fixing while you're here. |
| SEC-22 | Low | `backend/routes/videoRoutes.js:68` | `JSON.parse(jwk)` on unvalidated input throws into the 500 handler. |
| SEC-23 | Low | `frontend/vite.config.ts:4,13,32`; `README.md:10-12`; `frontend/public/.DS_Store`; root `package.json` | **Dev leftovers.** The Lovable `allowedHosts` entry and `lovable-tagger` plugin; a "Bankist Demo credentials" table in the README (from an unrelated project); `.DS_Store` copied into every build; a root `deploy:setup` script that calls a frontend script which doesn't exist. |

**Good news, so you don't "fix" what isn't broken:** ownership checks on `GET/PATCH/DELETE /videos/:id` are already correct (`findOne({ _id, ownerId })`), `profileController` already uses field allowlists rather than mass assignment, `login` already returns a generic error, Google `email_verified` is already checked, and `VideoPlayer` already revokes its blob URLs. Add regression tests that lock these in.

---

## 5. Phase 2 — Remediation (only after the audit is approved)

Work in this order. After each group, run the full suite plus the e2e test and fix what broke before moving on.

### A. Secrets & repository hygiene
- Delete `frontend/src/Database/MongoClient.tsx` and remove `mongodb` from frontend dependencies (SEC-08). Confirm no bundle in `docs/` references either.
- Add `backend/.env.example` and `frontend/.env.example` with placeholders only.
- Validate required env vars at startup with zod — `JWT_SECRET` at least 32 random bytes, valid URLs, required AWS values. Fail fast with a clear error that never echoes a secret value. **Do not add a database-name requirement to `MONGO_URI`** — migration is deferred (§0).
- Add **gitleaks** as a pre-commit hook (husky or lefthook) and as a CI step.
- Remove the demo credentials from the README (SEC-23).
- Write `SECURITY.md`: threat model (copy §1, including the accepted risk), credential-rotation runbook (Atlas user, AWS IAM keys, JWT secret, Google client), vulnerability-reporting contact, and the full env-var list.

### B. Cryptography — honest posture, no redesign

- **Correct every inaccurate claim** (SEC-17). The app encrypts client-side before upload and the server holds the key, so say that. Something like: *"Entries are encrypted in your browser before upload. Today Blackbox holds the key so playback works across devices; end-to-end encryption, where only you can decrypt, is planned."* Get the copy right in `landing/index.html`, `Landing.tsx`, `landing/script.js` and `README.md`. Shipping software whose security claims outrun its implementation is itself a defect.
- **Document the accepted risk** in `SECURITY.md`: the server stores `jwk` beside `s3Key`, so anyone with database read access — the operator, Atlas, a breach, a future admin — can decrypt any video. State it plainly, with E2EE named as the planned remedy.
- **Contain key material.** `jwk` and `iv` may be returned **only** to the video's owner, must never be logged, must never appear in error messages, and must never be exposed by any future admin endpoint. Add a test that asserts this.
- **Verify what's already correct:** a fresh AES-256-GCM key and a fresh random 12-byte IV per recording, and no key reuse across videos.
- **Add `encVersion: 1`** (or equivalent) to the `Video` schema. One small field now means the future E2EE migration can tell formats apart instead of guessing.
- **Enable S3 default encryption at rest** as defence in depth — an infrastructure setting, not a code change (see §5.C).
- **Do not** add passphrase prompts, KDFs, key wrapping, recovery codes or chunked formats. That is a separate project.

### C. Video upload & storage
- Migrate to AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) and multer 2.x, or drop multer entirely if you move to presigned uploads.
- Upload directly from the browser to S3 with a **presigned POST** rather than streaming through Express:
  - the server generates the key (`videos/<userId>/<uuid>`); client filenames are never used (SEC-09)
  - enforce a configurable `content-length-range` and `application/octet-stream` (SEC-04)
  - short policy expiry
  - a finalize endpoint verifies ownership, confirms the object exists and its size (HeadObject), and only then writes the database record
  - clean up abandoned uploads
- Presigned GET URLs expire in ~5 minutes and are issued only to the owner (SEC-11).
- Delete S3 objects when a video or account is deleted; handle partial failure without orphaning data.
- Fix the `entryNumber` race with an atomic counter or a unique compound index plus retry (SEC-21).
- Add a **`infra/` folder at the repo root** — *not* under `docs/`, which GitHub Pages publishes — holding JSON for the owner to apply manually: least-privilege IAM policy scoped to the bucket prefix, bucket policy (deny non-TLS, block public access), default encryption, CORS locked to the app origin, and a lifecycle rule for incomplete multipart uploads. Add an Atlas checklist too: a database user with `readWrite` on a single database, an IP access list (Render publishes its outbound IPs; if they aren't static for this plan, document the wider rule as an accepted risk with justification), and backups.

### D. Authentication & sessions — *prerequisite for the admin panel*
- **Move tokens to cookies:** httpOnly, `Secure`, `SameSite=Lax` (or Strict where workable), scoped by an env-configured cookie domain. Short-lived access token (~15 min) plus a **rotating refresh token** stored hashed with **reuse detection** (reuse revokes the family). Remove every `localStorage` token use and all `axios.defaults` auth headers; switch to `withCredentials`.
- **JWT settings:** pin HS256, set `iss` and `aud`, add `tokenVersion` on the user so "log out everywhere" works (SEC-03).
- **The middleware must resolve the user per request** (or check `tokenVersion`), so a suspended, deleted or role-changed account takes effect immediately instead of up to 7 days later. Without this, admin suspension is decorative.
- **Server-side logout**, called by the inactivity timer too.
- **CSRF protection** on state-changing routes: SameSite plus a strict Origin/Referer allowlist, and a double-submit token if needed.
- **Email verification** for local accounts, and a password reset flow. **Ask which email provider to use before implementing.**
- **Google linking** (SEC-01): auto-link only when the existing local account's email is verified; otherwise require a password sign-in first. This is the critical fix — land it early and test it hard.
- **Passwords:** bcrypt cost ≥ 12, minimum 12 characters, reject breached passwords via the HIBP k-anonymity range API (fail open if it's unreachable).
- **No enumeration:** generic responses on register, login and reset (SEC-10).
- **Rate limiting** with `express-rate-limit`, per IP and per account, on login, register, Google auth, password reset and upload/presign. Set `trust proxy` correctly for Render (SEC-05).

### E. Input validation & API hygiene
- Validate body, params and query on every route with zod: allowlist fields, pin types (a string must be a string — this is the SEC-06 fix), set max lengths, validate ObjectIds so a malformed id gives 400/404 rather than 500 (SEC-12, SEC-20, SEC-22).
- Enable Mongoose `sanitizeFilter` and `strictQuery`. Set `express.json({ limit: '100kb' })`.
- Return explicit response objects everywhere; never a raw document. Never expose `password`, `googleId`, token hashes or internal fields (SEC-13). Do this **before** adding a `role` field, or you'll leak it by default.
- The central error handler must not leak stack traces or internals outside development. The server must exit if the database connection fails (SEC-14).

### F. HTTP & frontend hardening
- **Backend:** helmet with explicit settings, HSTS, and a CORS allowlist from env with no localhost in production (SEC-15).
- **Frontend:** write a strict **CSP** and security-headers config for the future host (`_headers` / `vercel.json` / `netlify.toml` — ask which). Note that GitHub Pages cannot set headers, so this is inert until the custom domain lands. The CSP must still allow Google Identity Services, `blob:` media, the API origin and the S3 origin. Verify Google login and playback still work under it.
- **Remove `gptengineer.js` from `frontend/index.html` (SEC-02)** and audit for any other third-party script. Remove the Lovable `allowedHosts` entry and `lovable-tagger` (SEC-23). Remove sensitive `console.log`s. Confirm production source maps are off.
- Check for `dangerouslySetInnerHTML` and other XSS sinks, and for open redirects.
- `ProtectedRoute` is UX only — the server enforces every access rule.

### G. Privacy & data lifecycle
- **Account deletion** (SEC-19): requires re-authentication, then removes the user's S3 objects, video records, tokens and profile. Build it as a **reusable service function**, because the admin panel will call the same code (§6).
- **Data minimisation:** question whether date of birth and location are needed. Raise it rather than deleting fields.
- **Security event logging** — login success/failure, password change, Google linking, token reuse, account deletion — as structured logs that redact tokens, passwords, `jwk` and full emails. This is the substrate the admin audit log builds on, so design it with that in mind.

### H. Dependencies & CI
- Re-run `npm audit` in both packages and report the **current** numbers; don't quote figures from an older audit. Upgrade vulnerable packages, remove the `crypto` package, and keep one lockfile per package (SEC-16).
- Add Dependabot and a GitHub Actions workflow running: lint, typecheck, backend + frontend tests, the Playwright smoke test, `npm audit --audit-level=high`, gitleaks, and CodeQL.

---

## 6. Phase 3 — Admin-panel readiness

**Build the foundations, not the panel.** No admin routes, no admin UI. The goal is that the panel later becomes a thin layer over code that already exists and is already tested.

**The design constraint, stated once:** because E2EE is deferred, the server can decrypt any video. So "an admin can never view a user's recording" is a rule enforced by *code and tests*, not by cryptography. Treat it as a hard invariant.

1. **`role` on `User`** — `'user' | 'admin'`, default `'user'`. It must be settable only by a direct database operation or the bootstrap script in (6), never through any HTTP route. Ship it with a test proving that register, profile update and onboarding cannot set it (the allowlists already prevent this — lock the behaviour in).
2. **`AuditLog` model** — `actor`, `action`, `targetType`, `targetId`, `meta`, `ip`, `createdAt`. Append-only: no update or delete path anywhere in the codebase. Wire the §5.G security events through it so it's proven in use before the panel exists.
3. **`requireAdmin` middleware**, chained after the (reworked) auth middleware, reading `role` from the resolved user — not from the token. Unit-test it; mount no routes with it yet.
4. **Service layer.** `backend/routes/videoRoutes.js` currently holds all its logic inline. Move it into `controllers/videoController.js` plus a service module, so admin code can reuse the functions instead of duplicating S3 and database logic.
5. **Cascade-delete service** — one idempotent function that removes a user's videos, S3 objects, tokens and profile, handling partial failure. Used by §5.G's account deletion now and by admin deletion later. Test both the happy path and an S3 failure mid-way.
6. **First-admin bootstrap script**, dry-run by default and requiring an explicit flag to write. Never a UI, never an HTTP route.
7. **Key-material invariant test.** A test asserting no response outside the owner's own `/videos` endpoints contains `jwk` or `iv`. Write it now so the panel can't regress it later.
8. In the final report, list what a future admin panel still needs, so it can be planned against real code.

---

## 7. Phase 4 — Adversarial verification

Phases 0–3 prove you didn't break anything. This phase tries to break in. **Run these as executed tests against a local instance and show real output** — a code-review opinion is not a result.

**Authentication & sessions**
- forged and tampered tokens; `alg: none`; signature stripped; wrong `iss`/`aud`; expired token
- a token belonging to a deleted or suspended user is rejected immediately
- refresh-token reuse revokes the whole family
- server-side logout genuinely invalidates the session

**Access control**
- IDOR across users on every `/videos/:id` verb and on profile routes
- invalid and non-existent ObjectIds return 4xx, never 500
- `ProtectedRoute` removal on the client grants nothing the server doesn't allow

**Injection & input**
- NoSQL operator payloads (`{"$ne": null}`, `{"$gt": ""}`, `{"$regex": "…"}`) on every string field in every route
- oversized JSON body rejected; oversized upload rejected
- prototype-pollution-shaped keys (`__proto__`, `constructor`) in request bodies
- unicode/whitespace tricks on email uniqueness (can two accounts share one effective email?)

**Account takeover (SEC-01 specifically)**
- an unverified local account with a victim's email cannot be linked or taken over via Google sign-in — test this from both directions

**Abuse & DoS**
- rate limits actually trigger, per IP and per account, and the correct client IP is used behind a proxy
- concurrent uploads don't collide on `entryNumber`

**CSRF & origin**
- state-changing requests from a foreign Origin are rejected
- CORS does not reflect arbitrary origins in production config

**Data exposure**
- no response contains `password`, `googleId`, token hashes or internal fields
- no request or response outside the owner's own video endpoints contains `jwk` or `iv`
- error responses leak no stack traces or internals in production mode
- logs contain no tokens, passwords, keys or full emails

Also run `npm audit` on both packages and gitleaks over the working tree, and show the results.

---

## 8. Phase 5 — Report

1. Update `SECURITY_AUDIT.md` with each finding's status — Fixed / Mitigated / Accepted risk / Needs owner action — and the commit that fixed it.
2. Final report covering:
   - summary of changes
   - **user-visible behaviour changes** (expect at least: cookie sessions, stricter passwords, email verification)
   - new env vars
   - **manual steps the owner must take**: IAM and bucket policies, Atlas settings, Google OAuth authorised origins, custom-domain DNS, cookie domain, new secrets on Render, email provider setup, and confirming the old AWS key is deleted in IAM
   - a manual QA checklist
   - **what is still exploitable, and what is accepted** — the deferred E2EE risk goes here, stated plainly
   - recommended next steps, in priority order, distinguishing the admin panel from the E2EE project from the database migration
