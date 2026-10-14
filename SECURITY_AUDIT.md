# Blackbox — Security Audit (Phase 1)

Produced per `SECURITY_HARDENING_PROMPT.md` §4. This is a point-in-time audit
of the working tree on branch `security_hardening`, after Phase 0 (test
safety net) but before any Phase 2 remediation. **No fixes are included in
this document or this phase** — per the governing prompt, this is where work
stops and waits for approval.

**Threat model** (full detail in the prompt §1; restated briefly for
context): an unauthenticated attacker with only the public frontend/API; an
authenticated user attacking another user's data (highest priority); an
attacker who compromises a browser session (XSS, stolen device); a
supply-chain attacker via a third-party script or package.

**Explicitly accepted, out of scope for fixing right now:** an attacker with
direct MongoDB read access. Because E2EE is deferred, the server stores each
video's AES key (`jwk`) in the same document as its S3 pointer (`s3Key`), so
DB read access means the ability to decrypt every video. This is the single
largest accepted risk and the reason several findings below (SEC-17
especially) exist.

**Methodology:** every file in `backend/`, `frontend/src/`, `landing/`,
build/deploy config, `.gitignore`, both READMEs, and all three
`package.json` files was re-read against the current tree — not assumed
from an earlier draft. All 23 previously-drafted findings were independently
re-confirmed (several needed a correction — noted inline). `npm audit` was
run and cross-checked against actual installed versions (`npm ls`) rather
than taken at face value. Findings SEC-24 through SEC-30 are new this pass.

---

## Summary table (sorted by severity)

Status as of Group H (dependencies & CI) landing — Groups A-H are all now
in. "Partial" means part of the finding is resolved and the rest is
explicitly scoped to later work — see that finding's detail section for
exactly what's left. Phase 3 (admin-panel readiness) has also landed — see the section at the end.

| ID | Severity | Status | Location | Finding |
|---|---|---|---|---|
| SEC-01 | **Critical** | ✅ Fixed | `backend/controllers/authController.js:114-160` | Google-linking account takeover |
| SEC-02 | **Critical** | ✅ Fixed | `frontend/index.html:28` | Third-party script on every page, including auth pages |
| SEC-06 | High | ✅ Fixed | `backend/controllers/authController.js:28,80` | NoSQL operator injection via `email` |
| SEC-26 | High | ✅ Fixed | `backend/package.json` (mongoose) | Mongoose CVEs: `$nor` sanitizeFilter bypass + prototype pollution |
| SEC-03 | High | ✅ Fixed | `backend/middleware/authMiddleware.js:16`; `authController.js` | Session model: long-lived localStorage JWT, no revocation |
| SEC-25 | High | ✅ Fixed | `backend/package.json` (jsonwebtoken) | `jws` HMAC-verification CVE under your own session-token library |
| SEC-04 | High | ✅ Fixed | `backend/routes/videoRoutes.js:8-10` | Unbounded upload (no multer size limit) |
| SEC-05 | High | ✅ Fixed | `backend/app.js` / `server.js` (absent) | No rate limiting, no `trust proxy` |
| SEC-27 | High | ✅ Fixed | `backend/package.json` (express transitive) | `path-to-regexp` DoS + `body-parser` DoS CVEs |
| SEC-07 | High | ✅ Fixed | `backend/controllers/authController.js:13` | No password policy |
| SEC-24 | High | ✅ Not reproduced | `frontend/package.json` (react-router-dom) | Open-redirect CVEs, ships in the production bundle |
| SEC-31 | High | ✅ Fixed | root `package.json` `workspaces` field (removed) | `npm install`/`npm ci` run inside `frontend/` or `backend/` silently resolves against the root workspace instead, corrupting the wrong lockfile |
| SEC-08 | Medium | ✅ Fixed | `frontend/package.json:58` | Dead `mongodb` dependency (the credential-leak file is already gone) |
| SEC-09 | Medium | ✅ Fixed | `backend/routes/videoRoutes.js:40` | Client filename interpolated into S3 key |
| SEC-10 | Medium | ✅ Fixed | `backend/controllers/authController.js:30` | Account enumeration on register |
| SEC-11 | Medium | ✅ Fixed | `backend/routes/videoRoutes.js:88,124` | Signed GET URLs valid for 1 hour |
| SEC-12 | Medium | ✅ Fixed | `backend/routes/videoRoutes.js:115,157,179` | Invalid ObjectId → 500 instead of 400/404 |
| SEC-13 | Medium | ✅ Fixed | `backend/controllers/profileController.js:39,61,113` | Raw documents returned, leaking `googleId` |
| SEC-14 | Medium | ✅ Fixed | `backend/server.js` | Server survives a failed DB connection; no env-var validation |
| SEC-15 | Medium | ✅ Fixed | `backend/app.js:11-19`; `frontend/src/services/api.ts:21` | Loose CORS/helmet defaults; API URL logged to console |
| SEC-16 | Medium | ✅ Fixed | `backend/package.json`; `frontend/package.json` | EOL dependencies (aws-sdk v2, multer 1.x, `crypto` placeholder); dual lockfiles |
| SEC-17 | Medium | ✅ Fixed | `landing/index.html:64`; `Landing.tsx:16,127`; `README.md` | Marketing copy claims E2EE the app doesn't implement |
| SEC-18 | Medium | ✅ Resolved | `backend/models/User.js:78` | bcrypt cost factor 10 |
| SEC-19 | Medium | ✅ Fixed | `backend/services/accountDeletion.js` | No account deletion capability |
| SEC-28 | Medium | 🟨 Partial | `frontend/package.json` (dev toolchain) | Frontend audit findings; vite dev-server CVEs are the actionable ones |
| SEC-20 | Low | ✅ Fixed | `profileController.js` vs `videoRoutes.js` | Inconsistent input length limits |
| SEC-21 | Low | ✅ Fixed | `backend/routes/videoRoutes.js:49-54` | `entryNumber` race on concurrent uploads |
| SEC-22 | Low | ✅ Fixed | `backend/routes/videoRoutes.js:61` | Unvalidated `JSON.parse(jwk)` → 500 |
| SEC-23 | Low | ✅ Fixed | `vite.config.ts`; `README.md:10-15`; root `package.json:11` | Dev/scaffold leftovers (Lovable, fake demo creds, dead script) |
| SEC-29 | Low | ✅ Fixed | `backend/app.js:29-37` | Unauthenticated debug route added by Phase 0 test infra |
| SEC-30 | Low | ⬜ Open | `.gitignore` | `.env` ignore pattern is path-specific, not a wildcard |

**New in Group D, not in the original audit:**
- Email verification (`User.emailVerified`, `ActionToken` model, `/auth/verify-email`) and a password reset flow (`/auth/request-password-reset`, `/auth/reset-password`) now exist. **Email delivery is stubbed** — `backend/services/email.js` logs the verification/reset link to the server console instead of sending it (no provider was selected; see `SECURITY.md`). Nobody can self-serve either flow in production until a real provider is wired in.
- CSRF Origin/Referer allowlist (`backend/middleware/csrf.js`) on every state-changing route — not a numbered finding originally, but required by the cookie migration (SEC-03) and explicitly scoped to this group.

**New in Groups E/F, not in the original audit:**
- Every route now validates its input through zod middleware (`backend/middleware/validate.js`), not ad-hoc presence checks — this is the real fix underneath SEC-06, SEC-12, SEC-20 and SEC-22 landing together, since they're all symptoms of the same missing layer. `objectIdParam` rejects a malformed `:id` with 400 before it can reach a query.
- All user-shaped responses now go through one explicit shaper (`backend/services/userView.js`) instead of a raw Mongoose document — this is SEC-13's fix, and incidentally corrects a latent bug where `GET /auth/me` returned `_id` while the frontend's `User` type (and every other auth response) expects `id`.
- `mongoose.set('sanitizeFilter', true)` and `mongoose.set('strictQuery', true)` are now set globally (`backend/app.js`) as defence in depth behind the zod fix — see SEC-26 below for the caveat.
- The CORS allowlist and the CSRF Origin allowlist are now the same env-driven, per-request-computed list (`backend/middleware/csrf.js`'s `getAllowedOrigins()`), set via `ALLOWED_ORIGINS` and excluding localhost whenever `NODE_ENV=production` — this is SEC-15's CORS half.
- A production-only CSP `<meta>` tag is now baked into the built `frontend/index.html` by a small Vite plugin (`frontend/vite.config.ts`'s `injectProductionCSP`) — active today even on GitHub Pages, unlike a headers file. `frontend/vercel.json` additionally exists for the planned custom-domain host, carrying the same CSP plus headers a `<meta>` tag can't (`X-Frame-Options`, `Permissions-Policy`, HSTS) — inert until that migration, per the governing prompt's own framing of this item.

**New in Groups G/H, not in the original audit:**
- **Real age-gating.** `dateOfBirth` was previously only checked against the future, never against a minimum age — three separate client-side forms (`Register.tsx`, `ProfileSettings.tsx`, `ProfileSetup.tsx`) each had their own copy-pasted, inconsistent, imprecise (`today.getFullYear() - birthDate.getFullYear()`, no month/day awareness) `age < 13` check, and the **server enforced no minimum age at all**. Raised to the repo owner and confirmed: minimum age is 8, enforced server-side (`backend/services/agePolicy.js`, wired into `register` and `updateProfile`) as the actual control, with the same month/day-aware logic duplicated client-side (`frontend/src/lib/agePolicy.ts`) purely for UX (instant feedback before a round trip). `profile.location` is kept as-is — confirmed with the repo owner it's reserved for a planned feature (user-controlled location services surfaced in the recording UI), not dead schema. When that feature is built, it needs its own privacy review (continuous location is more sensitive than a one-time profile field) — noted here so it isn't missed.
- **Account deletion** (closes SEC-19): `DELETE /api/auth/account`, gated behind re-authentication (current password for local accounts, a fresh Google credential checked against the account's `googleId` for Google accounts) plus a dedicated per-account rate limiter. Backed by an idempotent cascade-delete service (`backend/services/accountDeletion.js`) that removes the user's videos, S3 objects, refresh tokens, action tokens, and per-user counter before deleting the `User` document itself — continues past an individual S3 delete failure (reports `failedS3Keys`) rather than aborting the whole deletion. Minimal frontend entry point in `ProfileSettings.tsx`'s new "Danger zone" (`DeleteAccountSection.tsx`).
- **Security event logging**: `backend/services/securityLog.js` writes one structured JSON line per event (`login_success`, `login_failure`, `password_change`, `google_link_success`, `google_link_blocked_unverified`, `refresh_token_reuse`, `account_deleted`) to stdout, redacting passwords/tokens/jwk/iv and masking emails (`j***@example.com`) rather than logging them in full. Deliberately not persisted to a database yet — it's the substrate Phase 3's `AuditLog` model is meant to build on (§6.2), not a replacement for it.
- **Dependency currency** (SEC-16's follow-through): backend is now at **0 `npm audit` findings** (was 3 — jws/jsonwebtoken, mongoose, source-map-js, all closing SEC-25/26/27). Frontend dropped from 33 to **25**, all now confined to a single, named, deferred migration (see SEC-28) — none reach the shipped bundle. `vite` was bumped across three majors (5→8, the "real version jump" the original SEC-28 finding called for) with the dev server, both build modes, lint, typecheck, unit tests, and the Playwright e2e smoke test all re-verified after.
- **CI workflow** (`.github/workflows/ci.yml`) now runs frontend lint/typecheck/tests/build, backend tests, the Playwright e2e smoke test, `npm audit --audit-level=high` (hard gate on backend, informational on frontend pending the SEC-28 migration), and CodeQL, alongside the existing gitleaks scan. `.github/dependabot.yml` covers all three npm "ecosystems" (root, `frontend/`, `backend/`) plus GitHub Actions itself.
- **SEC-31 (new, found while doing the Group H dependency work):** see its own entry below — a real install-tooling footgun, not a code vulnerability, but one that actively corrupted a lockfile during this very session and needed a documented, enforced workaround.

---

## Critical

### SEC-01 — Google-linking account takeover
**Status: Fixed (Group D).** `googleAuth` now checks `existingLocal.emailVerified` before linking; an unverified local account returns 409 instead of merging. Verified by `backend/tests/auth.test.js`'s "SEC-01" describe block from both directions (blocks the unverified case, allows linking once verified) — see `backend/controllers/authController.js`'s `googleAuth`.

**Location:** `backend/controllers/authController.js:114-160` (`googleAuth`)

`googleAuth` finds-or-links by email at line 140 (`user = await User.findOne({ email })`) and silently attaches `googleId` to whatever local account already owns that email (lines 142-145). Local registration never verifies email ownership.

**Exploit scenario:** Attacker registers a victim's email address with a password of their own choosing. When the victim later signs in with "Sign in with Google" using that same email, the accounts merge — the attacker's original password now opens the victim's account and every entry in it.

**Fix plan:** Only auto-link when the existing local account's email is already verified; otherwise require a password sign-in first before linking. Email verification must ship alongside this fix for it to be complete.

**Changes user-visible behaviour?** Yes — Google sign-in behavior changes for any pre-existing unverified local account with a matching email.

### SEC-02 — Third-party script on every page, including auth pages
**Status: Fixed (Group F).** The `<script src="https://cdn.gpteng.co/gptengineer.js">` tag is deleted from `frontend/index.html`. As defence in depth beyond just removing it, the new production CSP's `script-src 'self' https://accounts.google.com` (see SEC-15) would now block any *other* unapproved third-party script from loading even if one were added back by mistake — verified with a positive-control test (injecting a `<script src="https://evil.example.com/...">` at runtime against the built bundle; the browser's console logged the CSP block, confirming the policy is actually live and not just present-but-inert).

**Location:** `frontend/index.html:28`

`<script src="https://cdn.gpteng.co/gptengineer.js" type="module"></script>` — leftover Lovable scaffolding — loads on every page, including `/login` and `/register`, with full DOM access.

**Exploit scenario:** If that CDN or domain is ever compromised or lapses, an attacker gets a first-party-equivalent script running on the login page: keylogging credentials, reading `localStorage['token']`, exfiltrating decrypted video blob URLs.

**Fix plan:** Delete the script tag. One line.

**Changes user-visible behaviour?** No.

---

## High

### SEC-06 — NoSQL operator injection via `email`
**Status: Fixed (Group E).** `authRoutes.js`'s `validate(registerSchema)` / `validate(loginSchema)` pin `email` to `z.string().trim().toLowerCase().email()` before the controller ever runs — an object-shaped payload like `{"$ne": null}` fails type validation and never reaches `User.findOne()`. Covered by `backend/tests/validation.test.js` (`$ne`, `$gt`, `$regex` payloads on both routes).

**Location:** `backend/controllers/authController.js:28` (register duplicate-check), `:80` (login)

`req.body.email` flows unvalidated into `User.findOne({ email })` in both places. This isn't limited to email — no request-body field anywhere in the API has type/shape validation (`title`, `username`, `iv`, `jwk` all accept any JSON type) — but email is the only field that reaches a query *filter*, so it's the only one that's genuinely injectable rather than just causing a type-coercion 500 (see SEC-20/SEC-22 for those).

**Exploit scenario:** `POST /api/auth/login {"email":{"$ne":null},"password":"x"}` matches an arbitrary user document — an existence oracle, and depending on response-shape differences, a potential auth-bypass shape. The register path's duplicate-email check can be bypassed the same way.

**Fix plan:** Validate every request body with zod; pin `email` to `z.string().email()` before it ever reaches Mongoose. Enable Mongoose's `sanitizeFilter` (see SEC-26 first — the version currently installed has a sanitizeFilter bug of its own).

**Changes user-visible behaviour?** No — only rejects malformed/malicious input.

### SEC-26 — Mongoose CVEs: sanitizeFilter bypass + prototype pollution *(new)*
**Status: Fixed (Group H).** `npm audit fix` (correctly scoped — see SEC-31) bumped `mongoose` to 8.24.4+, inside the already-declared `^8.13.2` range. `backend`'s full `npm audit` now reports 0 findings. `mongoose.set('sanitizeFilter', true)`/`strictQuery(true)` (Group E) remain as defence in depth regardless.

**Location:** `backend/package.json` (`mongoose@8.13.2`)

Two current CVEs against the installed version:
- [GHSA-wpg9-53fq-2r8h](https://github.com/advisories/GHSA-wpg9-53fq-2r8h) (High) — improper sanitization of `$nor` in `sanitizeFilter`, versions 8.0.0–8.22.0.
- [GHSA-664h-wqgq-64gw](https://github.com/advisories/GHSA-664h-wqgq-64gw) (Moderate) — prototype pollution via a `__proto__`-prefixed dotted path in update casting, versions 8.0.0–8.24.1.

Neither has a proven live exploit chain in the current code (the app never calls `sanitizeFilter()` today, and update calls use hardcoded keys, not raw `req.body`), but the first CVE directly undercuts SEC-06's planned fix (enabling `sanitizeFilter` on a version where the sanitizer itself is buggy).

**Fix plan:** `npm audit fix` resolves this to mongoose 8.24.4, inside the already-declared `^8.13.2` range — no code change required.

**Changes user-visible behaviour?** No.

### SEC-03 — Session model
**Status: Fixed (Group D).** Tokens moved to httpOnly cookies (`backend/services/cookies.js`); 15-minute access token + rotating refresh token with reuse detection (`backend/models/RefreshToken.js`, `authController.js`'s `refresh`); `tokenVersion` added to `User` and checked on every request in `authMiddleware.js`, which now resolves the user from the database each time rather than trusting the token alone; `jwt.verify`/`jwt.sign` pin `alg: HS256`, `iss`, `aud` (`backend/services/jwt.js`); real server-side `/auth/logout` revokes the refresh-token family. Reuse detection additionally bumps `tokenVersion`, killing any currently-live access token from a compromised chain immediately rather than waiting out its own lifetime. Covered by `backend/tests/session.test.js` and `backend/tests/cookies.test.js`.

**Caveat — SameSite today is `none`, not `Lax`/`Strict`** (see `backend/services/cookies.js`): the live frontend (GitHub Pages) and backend (Render) are genuinely different sites, so a same-site cookie wouldn't be sent at all. CSRF protection is carried by the Origin/Referer allowlist (`backend/middleware/csrf.js`) instead — see SEC-05's entry below for that same tradeoff. Set `COOKIE_SAME_SITE=lax` once the planned custom domain unifies both into one site.

**Location:** `backend/middleware/authMiddleware.js:16`; token-signing calls in `authController.js:48,92,162`

7-day JWT stored in `localStorage` (XSS-readable — compounds SEC-02), no refresh mechanism, no revocation, no `tokenVersion`. `jwt.verify` pins no algorithm, `iss`, or `aud`. Logout is client-only (`AuthContext.logout` just clears local state). The middleware never re-loads the user from the database, so it trusts the token's claims for the full 7 days regardless of any account-state change in between.

Related: `LogoutTimer`'s idle "auto-lock" (`useLogoutTimer` → `logout()`) is also purely client-side UX — it clears local state but never invalidates the token server-side. Same root cause, not a separate finding.

**This blocks the admin panel** — suspending, deleting, or role-changing a user wouldn't take effect until the token naturally expires up to 7 days later.

**Fix plan:** Move to httpOnly, Secure cookies. Short-lived access token (~15 min) + rotating refresh token with reuse detection. Pin `alg: HS256`, set `iss`/`aud`, add `tokenVersion` to the user. Middleware resolves the user per request (or checks `tokenVersion`). Real server-side logout endpoint.

**Changes user-visible behaviour?** Yes — this is the big one: cookie sessions, working logout, "log out everywhere."

### SEC-25 — `jws` HMAC-verification CVE under the session-token library *(new)*
**Status: Fixed (Group H).** `npm audit fix` bumped `jsonwebtoken` to 9.0.3 (inside the declared `^9.0.2` range).

**Location:** `backend/package.json` (`jsonwebtoken@9.0.2`)

[GHSA-869p-cjfg-cm3x](https://github.com/advisories/GHSA-869p-cjfg-cm3x) (High) — `jws` improperly verifies HMAC signatures, versions <3.2.3. Verified via `npm ls jws`: the vulnerable `jws@3.2.2` is pulled in by **`jsonwebtoken`** — the library that signs and verifies every session token in this app — not by `google-auth-library`, whose own nested `jws@4.0.1` is already clean. This sits directly under the primary auth boundary, not a side path.

**Fix plan:** `npm audit fix` bumps `jsonwebtoken` to 9.0.3, already inside the declared `^9.0.2` range. Trivial and non-breaking — no reason to defer even though it's listed here alongside the larger SEC-03 session work.

**Changes user-visible behaviour?** No.

### SEC-04 — Unbounded upload
**Status: Fixed (Group C).** `multer`/Express no longer touch the file at all — uploads go via a presigned POST straight to S3 with a `content-length-range` policy condition (`MAX_UPLOAD_BYTES`, default 200MB), so there's nothing for Express to buffer regardless of size.

**Location:** `backend/routes/videoRoutes.js:8-10` (multer config)

`multer.memoryStorage()` configured with no `limits` option. (Correction to the original draft finding: `express.json()` in `app.js:20` *does* carry body-parser's default 100kb limit — but uploads go through `multipart/form-data`/multer, not `express.json()`, so that default never applies to them regardless.)

**Exploit scenario:** Any authenticated user can send one large POST and exhaust the Render instance's memory.

**Fix plan:** `multer({ storage, limits: { fileSize: <n> } })`, sized to a real maximum recording length.

**Changes user-visible behaviour?** Only if a legitimate recording ever exceeds the chosen cap.

### SEC-05 — No rate limiting, no `trust proxy`
**Status: Fixed (Group D).** `backend/middleware/rateLimit.js` adds per-IP and per-account `express-rate-limit`ers on login, register, Google auth, password reset, and video presign (per-account keyed by email pre-auth, by `req.user.userId` post-auth). `app.set('trust proxy', 1)` added in `app.js` — trusts exactly Render's one edge hop, not the whole forwarded chain. Also added, not originally scoped here but directly adjacent: a CSRF Origin/Referer allowlist (`backend/middleware/csrf.js`) on every state-changing route, since SEC-03's cookie migration needed it regardless of rate limiting. Disabled under `NODE_ENV=test` so the test suite's dozens of per-run registrations don't self-throttle; the limiter's real behaviour is covered directly in `backend/tests/rateLimit.test.js` against throwaway apps, and the CSRF check in `backend/tests/csrf.test.js`.

**Location:** `backend/app.js` / `server.js` (absent)

No rate limiting anywhere: login, register, Google auth, upload. No `app.set('trust proxy', ...)`, so any future per-IP limit added behind Render would key on the proxy's address, not the real client's.

**Fix plan:** `express-rate-limit`, per-IP and per-account, on the auth and upload routes. Set `trust proxy` correctly for Render's infrastructure.

**Changes user-visible behaviour?** Yes, for anyone who legitimately hits a limit (expected).

### SEC-27 — `path-to-regexp` + `body-parser` DoS CVEs (express transitive) *(new)*
**Status: Fixed (Group H).** `npm audit fix` resolved these within the declared `^5.1.0` range.

**Location:** `backend/package.json` (`express@5.1.0`)

- [GHSA-j3q9-mxjg-w52f](https://github.com/advisories/GHSA-j3q9-mxjg-w52f) (High) — `path-to-regexp` DoS via sequential optional groups.
- [GHSA-27v5-c462-wpq7](https://github.com/advisories/GHSA-27v5-c462-wpq7) (Moderate) — `path-to-regexp` ReDoS via multiple wildcards.
- [GHSA-wqch-xfxh-vrr4](https://github.com/advisories/GHSA-wqch-xfxh-vrr4) (Moderate) — `body-parser` DoS via URL encoding.
- [GHSA-v422-hmwv-36x6](https://github.com/advisories/GHSA-v422-hmwv-36x6) (Low) — `body-parser`: an invalid `limit` value silently disables the size cap (relevant context for SEC-04's fix — verify the chosen limit value is actually valid).

All transitive via `express`.

**Fix plan:** `npm audit fix` resolves these within the declared `^5.1.0` range.

**Changes user-visible behaviour?** No.

### SEC-07 — No password policy
**Status: Fixed (Group D).** `backend/services/passwordPolicy.js` enforces minimum 8 characters plus at least one uppercase letter, one digit, and one special character, then checks the HIBP k-anonymity range API (`backend/services/hibp.js`, 3s timeout, fails open on any error exactly as specified). Applied on register and password reset. **Note:** the governing prompt's password requirement was revised after the original audit pass from "bcrypt ≥12, min 12 chars" down to "bcrypt ≥8, min 8 chars + composition rules" — this fix targets the current spec, not the originally-quoted numbers below. Covered by `backend/tests/auth.test.js` (one case per composition rule, plus a mocked-breach rejection) and `backend/tests/passwordFlows.test.js`.

**Location:** `backend/controllers/authController.js:13`

The only check on registration is presence (`!password`) — a one-character password is accepted. No length minimum, no breached-password check.

**Changes user-visible behaviour?** Yes — stricter passwords required going forward.

### SEC-24 — React Router open-redirect CVEs, ships in the production bundle *(new)*
**Status: Not reproduced (re-checked in Group H).** `npm audit` against the current frontend tree no longer lists any of these four advisories against the installed `react-router-dom@6.27.0` — re-verified directly (`npm ls react-router-dom` → `6.27.0`, unchanged; `npm audit` output has no `react-router-dom` entry at all). Either the advisory database's vulnerable-range data was corrected since the original Phase 1 draft, or the original range read was imprecise. Documented rather than silently dropped, since the original finding claimed a confirmed production-bundle exposure.

**Location:** `frontend/package.json` (`react-router-dom@6.27.0`)

Confirmed — not assumed — to ship in the actual production bundle: `docs/assets/*.js` contains its code, and it is a direct runtime dependency, not a dev-tool transitive. Four advisories apply to the installed `6.27.0` / `@remix-run/router@1.20.0`:
- [GHSA-9jcx-v3wj-wh4m](https://github.com/advisories/GHSA-9jcx-v3wj-wh4m)
- [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6)
- [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg)
- [GHSA-2j2x-hqr9-3h42](https://github.com/advisories/GHSA-2j2x-hqr9-3h42)

All are variants of unexpected/open redirect via untrusted or protocol-relative paths — squarely in the "attacker compromises browser session" threat-model bucket (open redirect is a common phishing/XSS chaining primitive).

**Fix plan:** `npm audit fix` resolves within the declared `^6.26.2` range (6.30.6+) — a lockfile refresh, not a v7 migration.

**Changes user-visible behaviour?** No.

### SEC-31 — `npm install`/`npm ci` run inside `frontend/` or `backend/` silently resolves against the root workspace instead *(new — found doing the Group H dependency work)*
**Status: Fixed at the root cause.** Originally worked around in Group H with per-command flags; the root `workspaces` field has since been removed (repo-owner decision, 2026-10-13) — see "Resolution" below.

**Location:** root `package.json`'s `"workspaces": ["frontend", "backend"]`, combined with `frontend/` and `backend/` each also keeping their own independent `package-lock.json` (SEC-16 itself only removed `frontend/bun.lockb` so each directory has a single lockfile; the per-directory lockfiles predate it and exist because `frontend/` and `backend/` build and deploy independently).

**What happened:** running the ordinary, expected commands — `cd backend && npm audit fix`, `cd frontend && npm install` — did not operate on that directory's own lockfile. npm detected the ancestor `workspaces` field and transparently re-anchored the install at the repo root instead. Concretely, during this pass: a plain `cd frontend && npm install` **deleted `frontend/package-lock.json` outright** and rewrote the root `package-lock.json` to absorb its ~400 packages; `cd backend && npm audit fix` updated `backend/node_modules` without touching `backend/package-lock.json` at all, leaving the two silently out of sync; a later root-level `cd .. && npm install` (intended only to install the root's own two devDependencies, `husky` and `@playwright/test`) rewrote **both** member lockfiles again with an 8,000+ line diff despite being run from outside either directory. All of this happened using nothing but the commands a contributor (human or AI) would normally reach for — none of it required `--force`, `--legacy-peer-deps`, or any other "I know what I'm doing" flag.

**Exploit scenario — this is a supply-chain-integrity finding, not a classic request-path vulnerability:** a future contributor (or CI run) doing routine dependency maintenance — `npm audit fix`, adding a package — can unknowingly produce a `backend/package-lock.json` or `frontend/package-lock.json` that no longer matches what's actually in `node_modules`, or lose the member lockfile entirely. If that drifted/corrupted lockfile gets committed, a deploy that does `npm ci` against it (Render, most likely, for `backend/`) either installs a different dependency tree than what was tested, or fails outright. This is exactly the kind of silent, hard-to-notice divergence that supply-chain integrity controls (reproducible lockfiles, `npm ci` in deploy pipelines) exist to prevent — and it was reintroducing itself via totally ordinary commands.

**Fix plan:** Every `npm install`/`npm ci`/`npm audit fix` invocation inside `frontend/` or `backend/` (locally or in CI) must pass `--workspaces=false --include-workspace-root=false` to force npm to treat that directory as its own project. `.github/workflows/ci.yml`'s install steps all do this now. **Not fixed as a repo-structure change:** removing the root `workspaces` field entirely would eliminate the footgun at the source, but that's a structural decision about how the repo is organized, not purely a security fix — raised to the repo owner rather than made unilaterally. Until/unless that happens, **any future `npm install`-family command run inside `frontend/` or `backend/` needs the same two flags**, and this note should stay somewhere a future contributor will actually see it (also added to `SECURITY.md`).

**Resolution (2026-10-13):** the root `"workspaces"` field was removed, at the repo owner's request. The workaround had a second failure mode: the root `package-lock.json` still recorded every `frontend/` and `backend/` dependency, but nothing kept it in sync. Group H's dependency bumps updated only the member lockfiles, and Dependabot's `/frontend` and `/backend` entries do the same. As a result, the root `npm ci` in CI's Playwright job failed with `EUSAGE` ("package.json and package-lock.json … are not in sync") on every run. Changes:
- `package.json`: `workspaces` field deleted.
- Root `package-lock.json`: regenerated from scratch. It now covers only the root's own devDependencies (`@playwright/test`, `husky` and their dependencies), at the same versions as before.
- `.github/workflows/ci.yml`: every `--workspaces=false --include-workspace-root=false` flag removed. Plain `npm ci` / `npm audit` now apply to each directory's own lockfile.
- `.github/dependabot.yml` and `SECURITY.md`: comments and the install note updated to match.

Verified locally after the change: a plain `npm ci` in the root, `backend/` and `frontend/` installs cleanly and leaves both member lockfiles unchanged; backend tests (175), frontend typecheck, unit tests (18) and `build:prod` pass, and the Playwright smoke test passes. The fix in GitHub Actions itself is unverified until CI runs on the pushed commit. **The two flags are no longer needed anywhere.**

**Changes user-visible behaviour?** No — install-tooling/CI only.

---

## Medium

### SEC-08 — Dead `mongodb` dependency
**Location:** `frontend/package.json:58`

`frontend/src/Database/MongoClient.tsx` (which held hardcoded Atlas credentials) is confirmed **deleted** from the current tree — verified via `find` and `git log`. The file-deletion part of this finding is resolved. However `"mongodb": "^6.16.0"` is **still listed** as a frontend runtime dependency with zero usages anywhere in `frontend/src` (confirmed by grep) — dead weight left over from the incident that was never pruned. Credential rotation itself can't be verified from the repo alone.

**Fix plan:** `npm uninstall mongodb` from `frontend/`. Confirm out-of-band that the old Atlas credentials were actually rotated in IAM/Atlas.

**Changes user-visible behaviour?** No.

### SEC-09 — Client filename interpolated into S3 key
**Status: Fixed (Group C).** The upload key is now `videos/<userId>/<uuid>`, generated entirely server-side in the `/videos/presign` handler — no client-supplied string reaches storage.

**Location:** `backend/routes/videoRoutes.js:40`

`` `videos/${userId}/${Date.now()}-${file.originalname}` ``. Checked specifically for path-traversal: S3 object keys are flat strings with no path resolution, so a `../` in `originalname` becomes a literal substring, not directory traversal. The real risk is key-charset/length weirdness (unicode, extremely long names, control characters), not cross-user overwrite.

**Fix plan:** Generate the key entirely server-side (`videos/<userId>/<uuid>`); never use client-supplied names in storage keys.

**Changes user-visible behaviour?** No.

### SEC-10 — Account enumeration on register
**Status: Fixed (Group D).** Register's duplicate-email response changed to "Unable to complete registration. If you already have an account, try signing in instead." — doesn't confirm the email is registered. The new `/auth/request-password-reset` endpoint returns an identical response regardless of whether the account exists, for the same reason. Covered by `backend/tests/auth.test.js` (register) and `backend/tests/passwordFlows.test.js` (reset request — directly asserts both cases produce the same status and body).

**Location:** `backend/controllers/authController.js:30`

Register returns `"User already exists"`. Login is already correctly generic.

**Fix plan:** Generic response on register too.

**Changes user-visible behaviour?** Yes, minor copy change.

### SEC-11 — Signed GET URLs valid for 1 hour
**Status: Fixed (Group C).** Cut to 5 minutes (`GET_URL_EXPIRY_SECONDS` in `videoRoutes.js`); issuance remains owner-only, unchanged.

**Location:** `backend/routes/videoRoutes.js:88` (list), `:124` (get-by-id)

`Expires: 3600`. Anyone who obtains the URL within that window (browser history, referrer leakage, a shared screen) can fetch the ciphertext.

**Fix plan:** Cut to ~5 minutes; keep issuance owner-only.

**Changes user-visible behaviour?** No — URLs are fetched immediately by the app, never meant to be shared.

### SEC-12 — Invalid ObjectId → 500
**Status: Fixed (Group E).** `objectIdParam('id')` (`backend/middleware/validate.js`) runs before every `:id` route and returns 400 on a syntactically invalid id via `mongoose.isValidObjectId`; a well-formed but non-existent id still reaches the ownership-scoped query and correctly 404s. Covered by `backend/tests/validation.test.js`.

**Location:** `backend/routes/videoRoutes.js:115,157,179` (all `:id` routes)

`req.params.id` is unvalidated; a malformed ObjectId throws a Mongoose `CastError` into the generic error handler, returning 500 instead of 400/404.

**Fix plan:** Validate ObjectId shape before querying (zod, or `mongoose.isValidObjectId`).

**Changes user-visible behaviour?** No — only changes the status code for requests that are already broken.

### SEC-13 — Raw documents returned, leaking `googleId`
**Status: Fixed (Group E).** `backend/services/userView.js`'s `toSafeUser()` is now the only way a `User` document becomes a response body — `getProfile`, `updateProfile`, `completeOnboarding` and `getCurrentUser` all use it, same as register/login/google already did. It also fixed a latent inconsistency: `/auth/me` previously returned the raw document's `_id`, not `id`, while the frontend's `User` type (and every other auth response) expects `id` — that's corrected now too, not just the field leak.

**Location:** `backend/controllers/profileController.js:39` (`updateProfile`), `:61` (`getProfile`), **and `:113` (`completeOnboarding` — missed in the original draft)**

All three return the Mongoose document with only `-password` stripped, leaking `googleId` and other internals. `/auth/me` (`authController.js:185`) correctly strips `-password -googleId` — the inconsistency is the tell that the other three are a bug, not intentional.

**Fix plan:** Explicit response-shaping (field allowlist) everywhere, matching what `/auth/me` already does.

**Changes user-visible behaviour?** No.

### SEC-14 — Server survives a failed DB connection
**Status: Fixed (Group E).** `server.js`'s connection `.catch()` now calls `process.exit(1)` after logging, instead of only logging. Env-var validation at boot (`validateEnv.js`, zod) was already in place from Group A.

**Location:** `backend/server.js`

`mongoose.connect(...).then().catch(err => console.error(...))` logs and keeps listening on connection failure, serving 500s instead of failing fast. No startup validation of required env vars either.

**Fix plan:** Exit the process on connection failure. Validate required env vars (JWT_SECRET length, AWS/Mongo vars present) at boot with a clear, secret-free error message.

**Changes user-visible behaviour?** No — only changes behavior during a misconfiguration that should already be down anyway.

### SEC-15 — Loose CORS/helmet defaults; API URL logged to console
**Status: Fixed (Group F).** `helmet()` now runs with explicit `contentSecurityPolicy` (`default-src 'none'` — this is a pure JSON API, so a locked-down CSP has no legitimate traffic to break) and explicit `hsts` (2-year `max-age`, `includeSubDomains`). The CORS allowlist is now env-driven via `ALLOWED_ORIGINS` (`backend/middleware/csrf.js`'s `getAllowedOrigins()`, shared with the CSRF check) and drops localhost whenever `NODE_ENV=production`, computed per-request rather than frozen at module load (so it's both live-reconfigurable and testable — see `backend/tests/httpHardening.test.js`). The frontend's `API Base URL` console.log was already gone by this pass (re-checked — not present in the current `api.ts`). As the original finding noted, this is the backend half only; the frontend-CSP half is tracked separately below (new work, not a numbered finding) since GitHub Pages can't carry response headers at all.

**Location:** `backend/app.js:12-19` (cors), `:11` (helmet); `frontend/src/services/api.ts:21`

CORS allowlist includes `http://localhost:8080` and `http://localhost:3000` unconditionally, not gated by `NODE_ENV`. `helmet()` runs with zero options (no explicit CSP). Frontend logs `API Base URL: ...` to the browser console on every load.

**Important scoping note:** a backend CSP — even a well-tuned one — only ever governs headers on Express API *responses*. The frontend is static HTML served by GitHub Pages, a completely separate origin/server, so no backend CSP change can mitigate SEC-02's injected script. That fix has to be a `<meta http-equiv="Content-Security-Policy">` tag baked into `frontend/index.html` itself, or a move off Pages to a host that sets response headers. **Phase 2 should not treat fixing SEC-15 as having also resolved SEC-02.**

**Fix plan:** Helmet with explicit settings and HSTS; CORS allowlist from env with no localhost entries in production; remove the console.log.

**Changes user-visible behaviour?** No.

### SEC-16 — EOL dependencies; dual lockfiles
**Status: Fixed.** `aws-sdk` v2 removed (Group C, replaced by AWS SDK v3); `multer` removed from production dependencies entirely, kept only as a devDependency for the test-only fake-S3 route (Group C); `crypto` placeholder package removed (predates Group A); `frontend/bun.lockb` deleted, one lockfile remains; `esbuild` removed from `dependencies` entirely (no longer a direct dependency at all — confirmed via `grep esbuild frontend/package.json` returning nothing).

**Location:** `backend/package.json`; `frontend/package.json`

`aws-sdk` v2 (maintenance mode — its own direct advisory [GHSA-j965-2qgj-vjmq](https://github.com/advisories/GHSA-j965-2qgj-vjmq) is Low, but it also pulls a vulnerable `uuid@<11.1.1` — [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), Moderate — which is why `npm audit` rolls the whole aws-sdk row up to Moderate); `multer` 1.x (EOL, known DoS advisories, compounds SEC-04); `crypto@^1.0.1` (the deprecated npm placeholder package — does nothing, must never be an intentional dependency). `frontend/` has both `bun.lockb` and `package-lock.json` with different timestamps, meaning they can resolve to different dependency trees depending on which installer runs. Noted in passing: `esbuild` is listed under `dependencies` instead of `devDependencies` in `frontend/package.json` — a build tool with no runtime purpose (not currently vulnerable at the declared 0.25.0, just misplaced).

**Fix plan:** Migrate to AWS SDK v3 (already planned separately), multer 2.x, remove the `crypto` package, standardize on one lockfile, move `esbuild` to devDependencies.

**Changes user-visible behaviour?** No.

### SEC-17 — Marketing copy claims E2EE the app doesn't implement
**Status: Fixed (Group B).** All four locations (plus README's general framing) rewritten to state plainly that Blackbox holds the key today and E2EE is planned — see `SECURITY.md`'s accepted-risk section for the full writeup this copy now points at. The README's unrelated demo-credentials table was deliberately left untouched (out of scope, kept at the repo owner's explicit request).

**Location:** `landing/index.html:64`; `frontend/src/pages/Landing.tsx:16,127`; `landing/script.js:6`; `README.md`

"We store the box; you hold the key" and "out of everyone else's reach" describe end-to-end encryption. The app does not implement it — the server stores the video's decryption key (`Video.jwk`) in the same document as the ciphertext pointer (`Video.s3Key`), so database read access means the ability to decrypt every video (see the accepted-risk note at the top of this document).

**Fix plan:** Correct the copy everywhere it appears to describe what's actually true: client-side encryption before upload; the server currently holds the key; E2EE is planned. Something like: *"Entries are encrypted in your browser before upload. Today Blackbox holds the key so playback works across devices; end-to-end encryption, where only you can decrypt, is planned."*

**Changes user-visible behaviour?** Yes — marketing copy changes.

### SEC-18 — bcrypt cost factor 10
**Status: Resolved, no code change — superseded by the Group D password-policy revision.** The governing prompt's own password requirement was revised from "bcrypt ≥12" to "bcrypt ≥8" (see SEC-07). The existing cost factor of 10 already satisfies the current spec, so this was left as-is rather than churned to 12 for a threshold that's no longer the target. Revisit if the policy is tightened again later.

**Location:** `backend/models/User.js:78`

`bcrypt.genSalt(10)` — below the *original* guidance of ≥12 (now superseded, see above).

**Changes user-visible behaviour?** No.

### SEC-19 — No account deletion capability
**Status: Fixed (Group G).** `DELETE /api/auth/account` (`backend/routes/authRoutes.js`/`authController.js`'s `deleteAccount`), gated behind re-authentication — current password for local accounts, a fresh Google credential checked against the account's `googleId` for Google accounts — plus a dedicated per-account rate limiter (`deleteAccountLimiter`, `backend/middleware/rateLimit.js`). The actual cascade-delete logic lives in `backend/services/accountDeletion.js`'s `deleteUserAccount(userId)`: removes the user's videos (DB + S3 objects, continuing past an individual S3 failure and reporting `failedS3Keys` rather than aborting), refresh tokens, action tokens, the per-user entry counter, then the `User` document itself. Idempotent by construction — a second call against an already-deleted user is a harmless no-op, which matters because Phase 3's admin deletion is meant to call this exact function rather than duplicating the logic (§6.5). Minimal frontend entry point: a "Danger zone" section in `ProfileSettings.tsx` (`frontend/src/components/DeleteAccountSection.tsx`). Tested in `backend/tests/accountDeletion.test.js` — happy path, idempotency, a mocked S3 failure mid-deletion, wrong-password/mismatched-Google-credential rejection, and session cookies actually clearing afterward.

**Data minimisation, raised rather than decided unilaterally (per the governing prompt):** asked the repo owner about `dateOfBirth` and `profile.location`, both flagged in the original draft. Decision: **`dateOfBirth` stays, and now actually enforces a real minimum age** (8 years — see the new age-gating note above; previously collected but never enforced beyond a future-date check). **`profile.location` stays** — confirmed it's reserved for a planned feature (user-togglable location services shown in the recording UI), not dead schema as the original draft assumed. Flagged for whoever builds that feature: continuous/real location is more privacy-sensitive than a one-time profile field and will want its own review at that point.

**Location:** `backend/services/accountDeletion.js`; `backend/controllers/authController.js`'s `deleteAccount`

**Changes user-visible behaviour?** Yes — new deletion capability is user-visible by definition. Also: registration and profile updates now enforce a minimum age of 8 (previously unenforced).

### SEC-28 — Frontend dependency audit: dev-toolchain surface, with two actionable dev-server CVEs *(new)*
**Status: Partial (Group H).** Current `npm audit` (re-run against the actual installed tree, correctly scoped — see SEC-31): **25 findings (2 low, 4 moderate, 19 high)**, down from the 33 this finding originally quoted. Confirmed again: all 25 are devDependencies, absent from the built `docs/assets/*.js` bundle.

What changed:
- **`vite` bumped 5.4.19 → 8.3.4** — the real version jump this finding called for, closing both named dev-server CVEs ([GHSA-g4jq-h2w9-997c](https://github.com/advisories/GHSA-g4jq-h2w9-997c) and friends, [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) via vite's bundled esbuild). `@vitejs/plugin-react-swc` bumped 3.11.0 → 4.3.3 alongside it (peer requirement). Re-verified after: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build:prod`, `npm run build:dev`, a manual dev-server smoke check, and the Playwright e2e smoke test all pass.
- **Seven standalone transitive packages pinned via `overrides`** in `frontend/package.json` to patched, same-major versions with a single, unambiguous resolved instance each: `rollup` 4.64.5, `yaml` 2.9.1, `flatted` 3.4.4, `browserslist` 4.29.3, `source-map-js` 1.2.2, `js-yaml` 4.3.2, `glob` 10.5.0. (One CVE against `js-yaml` — quadratic CPU consumption in `!!omap` resolution — has **no backport to the 4.x line**, only 5.x; left on 4.3.2 rather than forcing a major bump of eslint's own YAML-parsing dependency, since this app never parses untrusted YAML through it — accepted as a low-severity residual, noted here rather than silently dropped.)
- **What's left, deferred as one bucket:** `braces` (the actual CVE root — [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), stack-exhaustion DoS, **no fix available at all** in the 3.x line) is a transitive of `tailwindcss@3`'s `chokidar` dependency. The *only* way to shed it is a Tailwind v4 migration — new engine, new config format, breaking changes across every styled component. Raised to the repo owner; **deferred by explicit decision** given the cost (a framework migration touching the whole UI) versus the realistic exposure (a dev/build-time file-watcher glob, never reachable by anything the shipped app does). `micromatch`, `fast-glob`, the `@typescript-eslint/*` chain, and the `postcss-selector-parser`/`@tailwindcss/typography` pair are all entangled in the same blocked subtree and deferred alongside it for the same reason — forcing any of them independently either doesn't resolve (same root cause) or requires the same migration.

**Location:** `frontend/package.json` (dev/build toolchain)

**Fix plan (remaining):** Tailwind v4 migration, if/when undertaken — re-run `npm audit` after to confirm the whole `braces`-rooted subtree clears in one pass.

**Changes user-visible behaviour?** No — dev/build-only.

---

## Low

### SEC-20 — Inconsistent input length limits
**Status: Fixed (Group E).** Username is now capped at 32 characters on both `updateProfile` and `completeOnboarding` (same zod schema value, `profileRoutes.js`), and video `title` is capped at 200 characters on both `finalize` and the rename route (`videoRoutes.js`'s shared `titleSchema`).

**Location:** `backend/controllers/profileController.js` vs `backend/routes/videoRoutes.js`

`completeOnboarding` caps username at 32 characters; `updateProfile`'s username has no cap at all; video `title` has no length cap anywhere.

**Fix plan:** Consistent max lengths across all three, enforced via the same zod schema work as SEC-06.

**Changes user-visible behaviour?** No.

### SEC-21 — `entryNumber` race on concurrent uploads
**Status: Fixed (Group C).** Replaced with an atomic counter (`backend/models/Counter.js`, `findOneAndUpdate` + `$inc`) — race-free by construction, no retry loop needed.

**Location:** `backend/routes/videoRoutes.js:49-54`

Computed by reading the current max and incrementing — concurrent uploads from the same user can race and collide. Data-integrity, not a cross-user issue.

**Fix plan:** Atomic counter, or a unique compound index plus retry.

**Changes user-visible behaviour?** No.

### SEC-22 — Unvalidated `JSON.parse(jwk)` → 500
**Status: Fixed (Group E).** `jwk` is now pinned to a non-empty string capped at 10,000 characters by `finalizeSchema` before the handler's existing `JSON.parse`/`try`/`catch` runs — malformed JSON still correctly 400s (unchanged), but an absurdly large or non-string value can no longer reach the parse call at all.

**Location:** `backend/routes/videoRoutes.js:61`

`JSON.parse(req.body.jwk)` on fully unvalidated input throws into the generic 500 handler on malformed JSON instead of returning 400.

**Fix plan:** Validate as part of the same zod pass as SEC-06/SEC-20.

**Changes user-visible behaviour?** No.

### SEC-23 — Dev/scaffold leftovers
**Status: Fixed (Group F), except the README table, kept deliberately — see below.** The Lovable `allowedHosts` entry and `componentTagger()` plugin are removed from `vite.config.ts`, and `lovable-tagger` is uninstalled from `frontend/package.json`/lockfile. The stray `frontend/public/.DS_Store` (which `vite build` copies verbatim into `dist/`, and `npm run deploy` from there into the published `docs/`) is deleted — it was never git-tracked, so this was a local-build-hygiene fix, not a history rewrite. Root `package.json`'s `deploy:setup` script was already gone by this pass (re-checked — not present). The README's demo-credentials table is **intentionally left untouched** — out of scope, kept at the repo owner's explicit request (recorded against SEC-17 in an earlier pass).

**Location:** `frontend/vite.config.ts:4,13-15,31-32`; `README.md:10-15`; `frontend/public/.DS_Store`; root `package.json:11`

Lovable's `allowedHosts` entry and the `lovable-tagger` plugin are still wired into the Vite config. The README has an unrelated "Bankist Demo credentials" table (fake creds `gf@gmail.com`/`12345678`, `jd@gmail.com`/`87654321` — copy-pasted from a tutorial project, not real credentials, but still confusing and unprofessional in a public repo). `.DS_Store` gets copied into build output. Root `package.json`'s `deploy:setup` script (`cd frontend && npm run deploy:setup`) is dead — `frontend/package.json` only defines `deploy`, not `deploy:setup`.

**Fix plan:** Remove the Lovable config and plugin; remove the demo-credentials table; add `.DS_Store` to `.gitignore` and delete tracked copies; remove or fix the dead script.

**Changes user-visible behaviour?** No.

### SEC-29 — Unauthenticated debug route added by Phase 0 test infrastructure *(new — flagging my own work)*
**Status: Fixed (Group C).** Route guard now also checks `process.env.NODE_ENV !== 'production'`, in addition to `USE_FAKE_S3`.

**Location:** `backend/app.js:29-37`

The Phase 0 test infrastructure added a debug route, `GET /__fake-s3__/:bucket?key=...`, with **no auth check**, gated only by `process.env.USE_FAKE_S3 === 'true'`. It serves raw buffers from an in-memory fake S3 store used by tests and the e2e run.

Traced the actual blast radius if `USE_FAKE_S3` were ever accidentally set to `'true'` in the real Render environment: `backend/services/s3Client.js` keys off the *same* flag, so the app would also switch entirely to the in-memory fake store — meaning no real video data would ever be reachable through this route in that scenario (nothing would be written to the fake store by real uploads). The practical risk in that misconfiguration is silent data loss (uploads stop persisting to real S3 at all), with the unauthenticated debug route live as a secondary concern.

**Fix plan:** Add `&& process.env.NODE_ENV !== 'production'` to the route's guard condition as defense-in-depth.

**Changes user-visible behaviour?** No.

### SEC-30 — `.gitignore` `.env` pattern is path-specific, not a wildcard *(new)*
**Location:** `.gitignore`

Only the exact paths `/frontend/.env` and `/backend/.env` are ignored — not a blanket `**/.env*` pattern. Confirmed via `git ls-files` that no `.env` is currently tracked, so nothing is leaking today. But a future `.env.local`, `.env.production`, or a `.env` added in a new subdirectory would **not** be auto-ignored.

**Fix plan:** Broaden to a wildcard pattern, with a narrow exception for any committed `.env.example`.

**Changes user-visible behaviour?** No.

---

## Already-correct behaviour

Re-confirmed all of the following still hold in the current tree — lock these in via the Phase 0 tests rather than touching the code:

- Ownership checks on `GET/PATCH/DELETE /videos/:id` correctly scope by `{_id, ownerId}`.
- `profileController` uses field allowlists, not mass assignment.
- `login` already returns a generic error on failure.
- Google `email_verified` is checked before allowing a Google-provider account.
- `VideoPlayer` already revokes its blob object URLs on cleanup.
- `localStorage` is used for exactly one key (`'token'`) across the entire frontend — no other client-side storage surface exists to audit.
- No `dangerouslySetInnerHTML` / `eval` / `new Function` sinks anywhere in app code. The one `dangerouslySetInnerHTML` in `components/ui/chart.tsx:79` renders CSS from a developer-supplied config object, not user input, and that component is confirmed unused dead code — not imported by any page.
- No secrets of any kind (AWS keys, Mongo URIs, JWT material) found embedded in the built `docs/` bundle.

## Non-scored observations (not findings)

- `frontend/tsconfig.app.json` has `strict`/`noImplicitAny`/`strictNullChecks` all set to `false` app-wide. Not an ASVS control, but worth noting: it reduces the compiler's ability to catch null-deref and implicit-any bug classes that can underlie real defects.
- `backend/package.json`'s `"main": "index.js"` points at a file that doesn't exist — `server.js` is the real entrypoint. Cosmetic metadata bug, not a security issue.

---

## Phase 3 — Admin-panel readiness

Foundations only: no admin routes and no admin UI exist. The constraint behind all of it: E2EE is deferred, so the server can decrypt any video, and "an admin never sees a user's recording" is enforced by code and tests, not cryptography.

| §6 item | Where | Tests |
|---|---|---|
| 1. `role` on `User` (`'user' \| 'admin'`, default `'user'`) | `backend/models/User.js` | `tests/role.test.js`: register, Google sign-up, profile update and onboarding can't set it, including via `$set` or nested shapes; it never appears in an auth or profile response |
| 2. Append-only `AuditLog`, with the §5.G events wired through it | `backend/models/AuditLog.js`, `backend/services/securityLog.js` | `tests/auditLog.test.js`: every Mongoose update and delete path throws, only `securityLog.js` references the model, events persist with redacted meta, a failed write doesn't fail the request |
| 3. `requireAdmin`, reading `role` from the resolved user | `backend/middleware/requireAdmin.js`; `authMiddleware.js` now loads `role` | `tests/requireAdmin.test.js`: unit cases, plus a throwaway app proving that a forged `role` claim in a valid token is ignored and that demotion applies on the next request |
| 4. Video service layer | `backend/services/videoService.js`, `backend/controllers/videoController.js`; `routes/videoRoutes.js` is now wiring only | The existing `tests/video.test.js`, unchanged and passing |
| 5. Cascade-delete service | `backend/services/accountDeletion.js` (from Group G). Now bumps `tokenVersion` before removing anything, and failed S3 keys are recorded in the `account_deleted` audit entry | `tests/accountDeletion.test.js`: adds a database failure mid-way (account locked, retry completes) and S3-failure keys landing in the audit log |
| 6. First-admin bootstrap script | `backend/scripts/bootstrapAdmin.js` (`npm run admin:bootstrap`) | `tests/bootstrapAdmin.test.js`: dry run by default, only `--write` writes, refuses when an admin exists or the email is unverified, writes an audit entry. Tested only against the in-memory database; the CLI has not been run against any real database |
| 7. Key-material invariant | `tests/keyMaterial.test.js` | Enumerates every mounted route from Express's own router, so a new route or router fails until it has a request recipe. It calls each route as an anonymous client, a stranger and the owner, captures every response at `res.send`, and asserts only the owner's `GET /api/videos(/:id)` contain `jwk`/`iv` (with a positive control) |

Verified by mutation: removing the append-only hooks fails 13 tests; leaking `jwk` from the rename response, or adding an unlisted route, each fails the key-material suite.

**Not verified this phase:** the Playwright e2e smoke test wasn't run, because ports 5100/8080 were occupied by a locally running dev backend that reads `backend/.env`. Reusing that server would have pointed the test at real data.

**User-visible behaviour changes:** none. `role` isn't exposed, and the video refactor keeps every response identical.

### What the admin panel still needs

1. **Suspension.** There's no `status`/`suspendedAt` field yet. When added, `authMiddleware`, `refresh` and `login` must all reject a suspended user. `authMiddleware` already loads the user per request, so the check there is one condition.
2. **Admin routes**, mounted as `authMiddleware, requireAdmin, …`. Each one needs a recipe in `tests/keyMaterial.test.js`, and the test fails until it has one.
3. **Admin-safe views.** `videoService.toOwnerVideoView` is owner-only. An admin listing needs its own view with no `jwk`, `iv` or signed URL. Also decide how much of `profile` (date of birth, location) an admin should see; `toSafeUser` returns all of it today.
4. **Audit attribution.** Every admin action must call `logSecurityEvent` with `actor` set to the admin and `targetId` set to the user, e.g. admin deletion is `deleteUserAccount(userId)` followed by an `account_deleted` event with the admin as actor.
5. **Audit read path.** Add a paginated query function next to `logSecurityEvent`, and add that file to the allowlist in `auditLog.test.js`.
6. **Telling the frontend who is an admin.** `role` is deliberately absent from `/auth/me`. Prefer a dedicated `GET /api/admin/session` behind `requireAdmin` over adding `role` to `toSafeUser`.
7. **Step-up auth and MFA for admins.** An admin can delete any account. Destructive admin actions should re-authenticate, like self-deletion does, and admin accounts should have MFA.
8. **Role management.** Decide whether promotion and demotion get a route (guarding against removing the last admin) or stay a direct database operation.
9. **Orphan cleanup.** S3 keys that failed to delete are recorded in the audit log, but nothing retries them yet. A job can reuse `videoService.deleteVideoObject`.
10. **Audit retention.** Entries, including IPs, are kept indefinitely. See SECURITY.md.

One open item carried forward rather than closed: SEC-28's Tailwind v3→v4 migration (the only remaining path to the `braces` CVE at the root of 25 frontend dev-toolchain findings), deferred by explicit decision. It's dev/build-only exposure; re-raise it if that changes.
