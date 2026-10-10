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

Status as of Group F (HTTP & frontend hardening) landing — Groups A-F are
all now in. "Partial" means part of the finding is resolved and the rest is
explicitly scoped to a later group — see that finding's detail section for
exactly what's left. Groups G (privacy/data lifecycle), H (dependencies/CI)
and Phase 3 (admin-panel readiness) remain.

| ID | Severity | Status | Location | Finding |
|---|---|---|---|---|
| SEC-01 | **Critical** | ✅ Fixed | `backend/controllers/authController.js:114-160` | Google-linking account takeover |
| SEC-02 | **Critical** | ⬜ Open | `frontend/index.html:28` | Third-party script on every page, including auth pages |
| SEC-06 | High | ✅ Fixed | `backend/controllers/authController.js:28,80` | NoSQL operator injection via `email` |
| SEC-26 | High | 🟨 Partial | `backend/package.json` (mongoose) | Mongoose CVEs: `$nor` sanitizeFilter bypass + prototype pollution |
| SEC-03 | High | ✅ Fixed | `backend/middleware/authMiddleware.js:16`; `authController.js` | Session model: long-lived localStorage JWT, no revocation |
| SEC-25 | High | ⬜ Open | `backend/package.json` (jsonwebtoken) | `jws` HMAC-verification CVE under your own session-token library |
| SEC-04 | High | ✅ Fixed | `backend/routes/videoRoutes.js:8-10` | Unbounded upload (no multer size limit) |
| SEC-05 | High | ✅ Fixed | `backend/app.js` / `server.js` (absent) | No rate limiting, no `trust proxy` |
| SEC-27 | High | ⬜ Open | `backend/package.json` (express transitive) | `path-to-regexp` DoS + `body-parser` DoS CVEs |
| SEC-07 | High | ✅ Fixed | `backend/controllers/authController.js:13` | No password policy |
| SEC-24 | High | ⬜ Open | `frontend/package.json` (react-router-dom) | Open-redirect CVEs, ships in the production bundle |
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
| SEC-19 | Medium | ⬜ Open | (absent) | No account deletion capability |
| SEC-28 | Medium | ⬜ Open | `frontend/package.json` (dev toolchain) | 20 frontend audit findings; vite dev-server CVEs are the actionable ones |
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
**Status: Partial (Group E).** `mongoose.set('sanitizeFilter', true)` and `mongoose.set('strictQuery', true)` are now set globally (`backend/app.js`) as defence in depth. The vulnerable `$nor`-in-`sanitizeFilter` CVE itself is still live at the installed version (`npm audit fix` to 8.24.4, inside the existing `^8.13.2` range, is Group H's job — a dependency bump, not a code change) — but SEC-06's actual fix doesn't depend on `sanitizeFilter` at all, since zod now rejects non-string `email` values before any filter is built, so this bug has no live exploit path through this app regardless of when the bump lands.

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
**Location:** `frontend/package.json` (`react-router-dom@6.27.0`)

Confirmed — not assumed — to ship in the actual production bundle: `docs/assets/*.js` contains its code, and it is a direct runtime dependency, not a dev-tool transitive. Four advisories apply to the installed `6.27.0` / `@remix-run/router@1.20.0`:
- [GHSA-9jcx-v3wj-wh4m](https://github.com/advisories/GHSA-9jcx-v3wj-wh4m)
- [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6)
- [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg)
- [GHSA-2j2x-hqr9-3h42](https://github.com/advisories/GHSA-2j2x-hqr9-3h42)

All are variants of unexpected/open redirect via untrusted or protocol-relative paths — squarely in the "attacker compromises browser session" threat-model bucket (open redirect is a common phishing/XSS chaining primitive).

**Fix plan:** `npm audit fix` resolves within the declared `^6.26.2` range (6.30.6+) — a lockfile refresh, not a v7 migration.

**Changes user-visible behaviour?** No.

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
**Location:** absent — no route, no controller, no cascade-delete path

There is no way for a user to delete their account and have their S3 objects and database records removed.

Related observation from checking the `User` schema for other privacy angles: `profile.location` is a schema field with **zero references anywhere** in controllers or frontend forms — it collects nothing today, but it's a latent footgun (a field waiting for someone to wire a form to it without a privacy review). `dateOfBirth` **is** actively required at registration but is only ever used for a future-date sanity check, never for real age-gating — worth a product-level question (does a video-journal app need DOB at all?) rather than a numbered defect on its own.

**Fix plan:** Build account deletion as a reusable cascade-delete service (also needed by the future admin panel). Raise `profile.location` for removal or an explicit product decision rather than leaving it dormant.

**Changes user-visible behaviour?** Yes — new deletion capability is user-visible by definition.

### SEC-28 — Frontend dependency audit: dev-toolchain surface, with two actionable dev-server CVEs *(new)*
**Location:** `frontend/package.json` (dev/build toolchain)

`npm audit` reports 20 frontend vulnerabilities (13 high, 4 moderate, 3 low). After tracing each dependency chain, all except SEC-24 (react-router-dom, broken out above) resolve only under **devDependencies** — vite's own toolchain, eslint, tailwindcss, autoprefixer — and are confirmed **absent** from the built `docs/assets/*.js` bundle. This is a build-time supply-chain surface, not a runtime one.

Two are worth naming specifically since they affect the local dev server every contributor runs, and this repo's own Playwright e2e test runner:
- `vite@5.4.19` (the version actually used by `vite.config.ts` / `npm run dev`) is inside the vulnerable range for 6 separate advisories — dev-server request-handling issues such as [GHSA-g4jq-h2w9-997c](https://github.com/advisories/GHSA-g4jq-h2w9-997c) and [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) — a malicious website can potentially make a victim's browser hit their own locally-running dev server and read files it shouldn't.
- `esbuild@0.21.5` (vite's *own* transitive esbuild — distinct from the direct 0.25.0 dependency noted in SEC-16) carries [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) — any website can send requests to the dev server and read the response.

The rest (lodash, minimatch, js-yaml, rollup, picomatch, ajv, browserslist, glob, flatted, brace-expansion, @humanfs/node, @eslint/plugin-kit, postcss-selector-parser) are lower-urgency CI-gating hygiene — the Phase 2 CI workflow's planned `npm audit --audit-level=high` step will fail on these and need addressing then.

**Fix plan:** Bump `vite` to a current 6.x/7.x release (a real version jump — verify the dev server and build still work, not a drop-in lockfile refresh like the others), then re-run `npm audit fix` for the rest.

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

## Next step

Phase 2 Groups A-F are landed (A: secrets/repo hygiene, B: cryptography honesty, C: upload/storage, D: auth/sessions, E: input validation/API hygiene, F: HTTP/frontend hardening). Remaining: Group G (account deletion, data minimisation, security-event logging), Group H (dependency bumps — SEC-24/25/26/27/28 are all `npm audit fix`-shaped and still open — plus the CI workflow), and Phase 3 (admin-panel readiness).
