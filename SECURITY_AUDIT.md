# Blackbox — Security Audit

Produced per `SECURITY_HARDENING_PROMPT.md`. Started as the Phase 1 audit;
each finding's detail section below keeps its original write-up, with a
**Status** line added as fixes landed. Phases 3 and 4 are recorded near the
end. **The Phase 5 final report is the last section**: what changed,
what the owner must do, and what is still open.

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

Status as of Phase 5 (2026-10-23). Statuses: **Fixed**, **Mitigated**
(exposure reduced, remainder deliberately deferred), **Accepted risk**
(owner decision, reasoning in the detail section), **Needs owner action**
(the code side is done or impossible; the rest is infrastructure), and
**Open** (not started). The phase commits (`0620fd9` Groups A–C,
`603e343` D, `b5fe1e7` E–F, `8187e37` G, `04f705a` H) each bundle many
findings, so the commit column names where the change landed rather than a
one-finding commit.

| ID | Severity | Status | Commit | Finding |
|---|---|---|---|---|
| SEC-01 | **Critical** | ✅ Fixed | `603e343` | Google-linking account takeover |
| SEC-02 | **Critical** | ✅ Fixed | `b5fe1e7` | Third-party script on every page, including auth pages |
| SEC-03 | High | ✅ Fixed | `603e343`, `3a8cb3f` | Session model: long-lived localStorage JWT, no revocation |
| SEC-04 | High | ✅ Fixed | `0620fd9` | Unbounded upload (no multer size limit) |
| SEC-05 | High | ✅ Fixed | `603e343`, `72655a0`, `085c50c` | No rate limiting, no `trust proxy` (client-IP resolution corrected for Render + Cloudflare later) |
| SEC-06 | High | ✅ Fixed | `b5fe1e7` | NoSQL operator injection via `email` |
| SEC-07 | High | ✅ Fixed | `603e343` | No password policy |
| SEC-24 | High | 🟧 Accepted risk | — | react-router open-redirect advisories. Not reproduced: the app never navigates to an attacker-controlled path. Upgrade still recommended |
| SEC-25 | High | ✅ Fixed | `04f705a` | `jws` HMAC-verification CVE under the session-token library |
| SEC-26 | High | ✅ Fixed | `04f705a` | Mongoose CVEs: `$nor` sanitizeFilter bypass + prototype pollution |
| SEC-27 | High | ✅ Fixed | `04f705a` | `path-to-regexp` + `body-parser` DoS CVEs |
| SEC-31 | High | ✅ Fixed | `6b49e4c` | Root `workspaces` field made npm write the wrong lockfile |
| SEC-41 | High | 🟥 Needs owner action | — | Trusted origin `mkmutaki.github.io` is shared with seven other Pages sites. Closed by the custom domain |
| SEC-42 | High | 🟧 Accepted risk | — | Pre-registered account becomes linkable if the real owner opens its verification link |
| SEC-08 | Medium | ✅ Fixed | `371e56b` | `mongodb` in the frontend (credential file and dependency both gone) |
| SEC-09 | Medium | ✅ Fixed | `0620fd9` | Client filename interpolated into S3 key |
| SEC-10 | Medium | 🟧 Accepted risk | — | Register enumeration via status code (400 vs 201); closable once email is wired |
| SEC-11 | Medium | ✅ Fixed | `0620fd9` | Signed GET URLs valid for 1 hour |
| SEC-12 | Medium | ✅ Fixed | `b5fe1e7` | Invalid ObjectId → 500 instead of 400/404 |
| SEC-13 | Medium | ✅ Fixed | `b5fe1e7` | Raw documents returned, leaking `googleId` |
| SEC-14 | Medium | ✅ Fixed | `0620fd9`, `b5fe1e7` | Server survives a failed DB connection; no env-var validation |
| SEC-15 | Medium | ✅ Fixed | `603e343`, `b5fe1e7` | Loose CORS/helmet defaults; API URL logged to console |
| SEC-16 | Medium | ✅ Fixed | `371e56b`, `0620fd9` | EOL dependencies (aws-sdk v2, multer 1.x, `crypto` placeholder); dual lockfiles |
| SEC-17 | Medium | ✅ Fixed | `0620fd9`, `d48aa8b` | Marketing copy claims E2EE the app doesn't implement |
| SEC-18 | Medium | 🟧 Accepted risk | — | bcrypt cost 10 (meets the revised spec of ≥ 8) |
| SEC-19 | Medium | ✅ Fixed | `8187e37`, `c1574eb` | No account deletion capability |
| SEC-28 | Medium | 🟨 Mitigated | `04f705a` | Frontend dev-toolchain advisories; remainder blocked on Tailwind v4 |
| SEC-32 | Medium | ✅ Fixed | `fb153fe` | Email stub wrote live reset links and full addresses to logs |
| SEC-33 | Medium | ✅ Fixed | `3a8cb3f` | Access token stayed valid for up to 15 minutes after logout |
| SEC-34 | Medium | ✅ Fixed | `8be3c6d` | Unthrottled document-writing endpoints; finalize replayable |
| SEC-20 | Low | ✅ Fixed | `b5fe1e7` | Inconsistent input length limits |
| SEC-21 | Low | ✅ Fixed | `0620fd9` | `entryNumber` race on concurrent uploads |
| SEC-22 | Low | ✅ Fixed | `b5fe1e7` | Unvalidated `JSON.parse(jwk)` → 500 |
| SEC-23 | Low | ✅ Fixed | `b5fe1e7` | Dev/scaffold leftovers (README demo table kept by owner request) |
| SEC-29 | Low | ✅ Fixed | `0620fd9` | Unauthenticated debug route added by Phase 0 test infra |
| SEC-30 | Low | ⬜ Open | — | `.gitignore` `.env` pattern is path-specific, not a wildcard |
| SEC-35 | Low | ✅ Fixed | `3a8cb3f` | Login timing revealed whether an email is registered |
| SEC-36 | Low | ✅ Fixed | `3a8cb3f` | Google verification errors logged the token and payload; log injection |
| SEC-37 | Low | ✅ Fixed | `ce6d16f` | Malformed/oversized JSON and `j:` cookies produced 500s |
| SEC-38 | Low | ✅ Fixed | `3a8cb3f` | Duplicate-registration race returned 500 and logged the full email |
| SEC-39 | Low | ✅ Fixed | `3a8cb3f` | Passwords over 72 bytes silently truncated by bcrypt |
| SEC-40 | Low | ✅ Fixed | `8be3c6d` | Finalize ownership check was prefix-only |

Totals: 35 Fixed, 1 Mitigated, 4 Accepted risk, 1 Needs owner action, 1 Open (42 findings).

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
- **Real age-gating.** `dateOfBirth` was previously only checked against the future, never against a minimum age — three separate client-side forms (`Register.tsx`, `ProfileSettings.tsx`, `ProfileSetup.tsx`) each had their own copy-pasted, inconsistent, imprecise (`today.getFullYear() - birthDate.getFullYear()`, no month/day awareness) `age < 13` check, and the **server enforced no minimum age at all**. Raised to the repo owner and confirmed: minimum age 8 at first, raised to **13** with the Terms/Privacy work (`024f5bb`), enforced server-side (`backend/services/agePolicy.js`, wired into `register` and `updateProfile`) as the actual control, with the same month/day-aware logic duplicated client-side (`frontend/src/lib/agePolicy.ts`) purely for UX (instant feedback before a round trip). `profile.location` is kept as-is — confirmed with the repo owner it's reserved for a planned feature (user-controlled location services surfaced in the recording UI), not dead schema. When that feature is built, it needs its own privacy review (continuous location is more sensitive than a one-time profile field) — noted here so it isn't missed.
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
**Status (Phase 5): Accepted risk.** The advisories are listed by `npm audit` again (Phase 4 and Phase 5 runs: `react-router`, `react-router-dom`, `@remix-run/router`, still at 6.27.0), but none is reproducible here: every `navigate()` and `<Link>` uses a literal path, so no attacker-controlled path reaches the router. Upgrading within 6.x (6.30+) is still recommended and is cheap.

**Earlier status: Not reproduced (re-checked in Group H).** `npm audit` against the current frontend tree no longer lists any of these four advisories against the installed `react-router-dom@6.27.0` — re-verified directly (`npm ls react-router-dom` → `6.27.0`, unchanged; `npm audit` output has no `react-router-dom` entry at all). Either the advisory database's vulnerable-range data was corrected since the original Phase 1 draft, or the original range read was imprecise. Documented rather than silently dropped, since the original finding claimed a confirmed production-bundle exposure.

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
**Status: Fixed (`371e56b`, dead-code pass).** `mongodb` is no longer a frontend dependency; `gitleaks` over the committed tree found no secrets (Phase 5). Credential rotation is confirmed by the owner (CLAUDE.md), not verifiable from the repo.

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
**Status: Accepted risk (corrected in Phase 4 — previously marked Fixed).** The generic message didn't close the leak: register still answers 400 for an existing email and 201 for a new one, so the status code alone is an oracle. Closing it means register no longer signs the user in and instead always replies "check your inbox", which needs a real email provider. The owner chose to accept this until one exists. Per-IP rate limiting (20 per 15 minutes) caps how fast it can be used. The login-timing variant of the same leak was fixed separately (SEC-35).

**Original status: Fixed (Group D).** Register's duplicate-email response changed to "Unable to complete registration. If you already have an account, try signing in instead." — doesn't confirm the email is registered. The new `/auth/request-password-reset` endpoint returns an identical response regardless of whether the account exists, for the same reason. Covered by `backend/tests/auth.test.js` (register) and `backend/tests/passwordFlows.test.js` (reset request — directly asserts both cases produce the same status and body).

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
**Status (Phase 5): Accepted risk** — cost 10 meets the current spec. **Earlier note: resolved, no code change — superseded by the Group D password-policy revision.** The governing prompt's own password requirement was revised from "bcrypt ≥12" to "bcrypt ≥8" (see SEC-07). The existing cost factor of 10 already satisfies the current spec, so this was left as-is rather than churned to 12 for a threshold that's no longer the target. Revisit if the policy is tightened again later.

**Location:** `backend/models/User.js:78`

`bcrypt.genSalt(10)` — below the *original* guidance of ≥12 (now superseded, see above).

**Changes user-visible behaviour?** No.

### SEC-19 — No account deletion capability
**Status: Fixed (Group G).** `DELETE /api/auth/account` (`backend/routes/authRoutes.js`/`authController.js`'s `deleteAccount`), gated behind re-authentication — current password for local accounts, a fresh Google credential checked against the account's `googleId` for Google accounts — plus a dedicated per-account rate limiter (`deleteAccountLimiter`, `backend/middleware/rateLimit.js`). The actual cascade-delete logic lives in `backend/services/accountDeletion.js`'s `deleteUserAccount(userId)`: removes the user's videos (DB + S3 objects, continuing past an individual S3 failure and reporting `failedS3Keys` rather than aborting), refresh tokens, action tokens, the per-user entry counter, then the `User` document itself. Idempotent by construction — a second call against an already-deleted user is a harmless no-op, which matters because Phase 3's admin deletion is meant to call this exact function rather than duplicating the logic (§6.5). Minimal frontend entry point: a "Danger zone" section in `ProfileSettings.tsx` (`frontend/src/components/DeleteAccountSection.tsx`). Tested in `backend/tests/accountDeletion.test.js` — happy path, idempotency, a mocked S3 failure mid-deletion, wrong-password/mismatched-Google-credential rejection, and session cookies actually clearing afterward.

**Data minimisation, raised rather than decided unilaterally (per the governing prompt):** asked the repo owner about `dateOfBirth` and `profile.location`, both flagged in the original draft. Decision: **`dateOfBirth` stays, and now actually enforces a real minimum age** (13 years since `024f5bb`, originally 8 — see the new age-gating note above; previously collected but never enforced beyond a future-date check). **`profile.location` stays** — confirmed it's reserved for a planned feature (user-togglable location services shown in the recording UI), not dead schema as the original draft assumed. Flagged for whoever builds that feature: continuous/real location is more privacy-sensitive than a one-time profile field and will want its own review at that point.

**Location:** `backend/services/accountDeletion.js`; `backend/controllers/authController.js`'s `deleteAccount`

**Changes user-visible behaviour?** Yes — new deletion capability is user-visible by definition. Also: registration and profile updates now enforce a minimum age of 13 (previously unenforced).

### SEC-28 — Frontend dependency audit: dev-toolchain surface, with two actionable dev-server CVEs *(new)*
**Status (Phase 5): Mitigated.** Re-run 2026-10-23: 18 findings (2 low, 4 moderate, 12 high). The 12 that ship at runtime are the react-router chain (SEC-24) and `@babel/runtime`; the rest are build-time. **Earlier status: Partial (Group H).** Current `npm audit` (re-run against the actual installed tree, correctly scoped — see SEC-31): **25 findings (2 low, 4 moderate, 19 high)**, down from the 33 this finding originally quoted. Confirmed again: all 25 are devDependencies, absent from the built `docs/assets/*.js` bundle.

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
**Status: Open.** Nothing is leaking today (no `.env` is tracked, and gitleaks found nothing), but it's a two-line fix that should land before the next new env file is created.

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

---

## Phase 4 — Adversarial verification

Attacks were run as executed tests against the real Express app in-process, using the in-memory database and fake S3. No running server and no real data were touched. A local dev backend reading `backend/.env` was listening on :5100 throughout and received no traffic.

**Tests:** `backend/tests/adversarial/` (32 tests) and `frontend/src/lib/passwordPolicy.test.ts` (3 tests). Each attack test asserts the attack fails.

**Verified by mutation:** with the app-code fixes stashed and only the new tests in place, 27 of the 32 backend tests failed, which shows each one catches its vulnerability. The 5 that passed on the old code are deliberate positive controls: another device stays signed in, opt-in link printing works, genuine uploads and logins succeed, and concurrent distinct uploads get unique entry numbers.

**Final run:** backend 20 files / 207 tests passed; frontend 5 files / 21 tests passed; frontend typecheck clean; lint 0 errors (5 warnings, all in untouched files); production build succeeds. `npm audit`: backend 0, root 0, frontend 18 (12 ship at runtime: react-router 6.27.0 and `@remix-run/router` — open-redirect advisories that require navigating to an attacker-controlled path, which this app never does; every `navigate()` uses a literal path, so still not reproduced, see SEC-24; plus build-time tailwind/glob tooling and `@babel/runtime`).

**Not run:**
- The Playwright e2e smoke test. Its servers use fixed ports 5100/8080, both occupied by the owner's local dev servers, and the Vite `/api` proxy is hard-wired to 5100. Run `npm run test:e2e` after stopping the dev servers.
- gitleaks. It isn't installed locally (nor is Docker); the CI workflow still runs it.

### Attacks that failed against the code as it was, already covered by earlier tests
Token forgery and session revocation (`session.test.js`, `requireAdmin.test.js`), IDOR across users on every `/videos/:id` verb (`video.test.js`), NoSQL operator payloads and prototype-pollution keys (`validation.test.js`), CSRF/CORS origin checks (`csrf.test.js`, `httpHardening.test.js`), key-material containment across every route (`keyMaterial.test.js`), SEC-01's basic case (`auth.test.js`). Malformed ObjectIds, including 12-character strings, are rejected by `mongoose.isValidObjectId` in the installed version.

### SEC-32 — Email stub wrote live reset links to logs (Medium, Fixed)
No email provider exists, so `services/email.js` printed every email to stdout: the full address and the live single-use token. On Render that is the service log, and a reset link is enough to take over the account. **Fix:** prints only a masked recipient and the subject; the body (with the link) is printed only when `EMAIL_STUB_PRINT_LINKS=true` is set explicitly. This fails closed — gating on `NODE_ENV=production` wouldn't have, because the dev `.env` doesn't set `NODE_ENV` and the Render setting couldn't be checked. **User-visible:** none. Developers who need links locally add `EMAIL_STUB_PRINT_LINKS=true` to `backend/.env`.

### SEC-33 — Access token outlived logout (Medium, Fixed)
Logout revoked the refresh-token family but not the access token, so a copied access token kept listing videos (including `jwk`) for up to 15 minutes. **Fix:** access tokens carry `sid`, their session's refresh `familyId`; `authMiddleware` requires an unrevoked token in that family belonging to the same user. Logout without a refresh cookie now falls back to the access token's `sid`. Other devices are unaffected. Costs one indexed query per request. **User-visible:** none; tokens issued before deploy have no `sid`, get one 401, and the frontend's existing silent refresh replaces them.

### SEC-34 — Unbounded document writes (Medium, Fixed)
`/refresh` had no rate limit, and each success writes a RefreshToken document kept for 30 days. `/finalize` had no rate limit and could be replayed on one uploaded key indefinitely, each call writing a Video document up to ~10 KB. Either is a way to fill the database (Atlas has a storage cap). **Fix:** `/refresh` 100 per 15 min per IP; `/finalize` 30/min per IP and 15/min per account; `Video.s3Key` is unique, with replays and concurrent duplicates answered 409. **Owner note:** the unique index is built on next startup. If production already has two records sharing an `s3Key`, the build fails (Mongoose logs an error and the app keeps running); the in-code duplicate check still applies.

### SEC-35 — Login timing revealed registered emails (Low, Fixed)
Unknown emails skipped bcrypt, so they answered an order of magnitude faster than wrong passwords; Google-only accounts (no password) answered fast too. **Fix:** both paths compare against a dummy hash of the same cost.

### SEC-36 — Google errors logged attacker input (Low, Fixed)
google-auth-library builds error messages from the submitted token (`Wrong number of segments in token: <token>`) and its decoded payload (`Token used too late, ... {email, name}`), and the controller logged the whole error. That put full emails in logs and let anyone write arbitrary lines — including fake `security_event` JSON — into them. **Fix:** fixed-text log line; credential capped at 4096 characters.

### SEC-37 — Client errors returned 500 (Low, Fixed)
The central error handler ignored `err.status`, so malformed JSON and bodies over 100 KB returned 500, and cookie-parser's `j:` JSON decoding let a cookie arrive as an object, which crashed `/refresh`. A `jwk` that parsed to `null`/a number/an array also 500'd. **Fix:** middleware 4xx errors keep their status, with fixed messages (the parser's message quotes the body); cookies are read through `readCookie`, which accepts strings only; `jwk` must parse to an object.

### SEC-38 — Registration race (Low, Fixed)
Concurrent registrations for one email both passed the existence check; the unique index rejected all but one with a 500, and the logged duplicate-key error contained the full email. **Fix:** duplicate-key is answered with the same generic 400; auth controller errors are logged as name and code only.

### SEC-39 — bcrypt 72-byte truncation (Low, Fixed)
bcrypt ignores input past 72 bytes, so any password matching the first 72 bytes unlocked the account. **Fix:** register and reset refuse passwords over 72 UTF-8 bytes, mirrored in the frontend. Login still accepts up to 256, so existing accounts are unaffected. **User-visible:** new passwords over 72 bytes are refused with "Password is too long".

### SEC-40 — Prefix-only upload-key check (Low, Fixed)
`isOwnUploadKey` accepted any key starting with `videos/<own id>/`, including `videos/<own id>/../<other id>/...`. Not exploitable as far as can be determined without real S3 — S3 and the SDK treat keys literally — but it depended on that. **Fix:** exact match on `videos/<own id>/<uuid v4>`.

### SEC-41 — Shared GitHub Pages origin (High, Needs owner action)
`https://mkmutaki.github.io` is the API's trusted origin (CORS with credentials, and the CSRF allowlist). Seven other GitHub Pages sites on this account share that origin; `1st-to-a-Century` loads `//cdn.jsdelivr.net/npm/sweetalert2@11` (floating version, no integrity hash), and two others load anime.js from cdnjs without integrity hashes. A browser `Origin` header has no path, so the API cannot tell those sites from Blackbox, and same-origin pages can also script each other's windows. A compromised script on any of them could act as any signed-in Blackbox user, including reading video keys. **Owner decision:** resolved by the planned custom domain; set `ALLOWED_ORIGINS` to it and remove `mkmutaki.github.io` from `PROD_ORIGINS` then. Until then, pinning versions and adding integrity hashes on the sibling sites reduces exposure.

### SEC-42 — Takeover via an opened verification link (High, Accepted risk)
An attacker registers the victim's email. The verification email goes to the victim; opening it marks the attacker's account verified (`VerifyEmail.tsx` submits on page load, no session required). The victim's later Google sign-in then links to that account, and the attacker's password opens it. **Owner decision:** accepted, with email copy telling users not to open links they didn't request. Residual risk: mail security scanners in some organisations open links automatically. Code options if revisited: require a password sign-in before linking Google to a password account, or require a click (not page load) to verify.

### Observations — reasoned from the code, not executed
- **`NODE_ENV` on Render — confirmed `production` by the owner (2026-10-23)**, so localhost is not a trusted origin in production (`csrf.js`).
- **Proxy hop count — confirmed wrong on the live deploy, fixed.** The owner's check showed `req.ip` = `10.24.63.117` (Render's internal proxy) for real traffic, so `trust proxy 1` put every user in one rate-limit bucket: one client could block login, register and reset for everyone, and Google sign-in was capped at 5 per 15 minutes in total. **Fix:** `app.set('trust proxy', 'loopback, linklocal, uniquelocal')` resolves the first public address, independent of Render's hop count and still spoof-proof. Per-IP limits were raised for shared IPs (auth 20→100 per 15 min, refresh 100→300); per-account limits are unchanged and still carry brute-force protection. `/google` no longer uses the per-account limiter (it had no email to key on). Tests: `tests/adversarial/clientIp.attack.test.js` (7 tests; all fail with `trust proxy 1`). **Follow-up:** the next deploy logged `104.22.160.49` — a Cloudflare edge address (`104.16.0.0/13`), because Render sits behind Cloudflare. `middleware/clientIp.js` now uses Cloudflare's `CF-Connecting-IP` only when the hop Render's proxy recorded is in Cloudflare's published ranges (hardcoded from cloudflare.com/ips, 2026-10-23); otherwise `req.ip` is unchanged. A client can't make its own `CF-Connecting-IP` count, and a missing header or an unlisted new Cloudflare range falls back to the edge address, never to a client-chosen one. 6 more tests in `clientIp.attack.test.js`. Residual: Render doesn't document this header path, so it rests on Cloudflare's behaviour; refresh the range list if Cloudflare changes it. **Owner:** after deploying, repeat the failed-login check; the logged `ip` should be your public IP.
- **Concurrent `/refresh` with one token** can rotate it more than once (check and update aren't atomic). Forks stay in the same family, so reuse detection still revokes them all. Not tested.
- **Per-account login limiting allows lockout:** 5 failed attempts from anyone block the real owner for 15 minutes. `/google` has no email before verification, so it falls back to IP at 5 per 15 minutes — tight for shared networks.
- **A second Google identity with the same verified email re-links** an already-linked account to the new `sub`. It requires controlling that address at Google, which is the same capability a password reset requires.

---

## Phase 5 — Final report (2026-10-23)

### Verification at `085c50c` (plus the e2e fix below)

| Check | Result |
|---|---|
| Backend tests | 22 files, 236 passed |
| Frontend tests / typecheck / lint / `build:prod` | 28 passed / clean / 0 errors, 5 warnings / builds |
| Playwright smoke (register → record → upload → play → rename → delete → logout → login) | **Passed.** First run since Phase 2 (skipped in Phases 3–4 for port clashes) |
| `npm audit` | root 0, backend 0, frontend 18 (2 low, 4 moderate, 12 high; see SEC-24, SEC-28) |
| gitleaks over the committed tree (not history, per CLAUDE.md) | No leaks |

- The smoke test failed at first. It never ticked the Terms checkbox that `024f5bb` made mandatory, so "Create Account" stayed disabled. This was a stale test, not an app bug, and is fixed in `e2e/tests/smoke.spec.ts`. **CI's e2e job has probably been red on `develop` since `024f5bb`.** This couldn't be checked from here because `gh` isn't installed.
- Local `frontend/node_modules` was stale (vitest 4.1.11 installed against a 5.0.4 lockfile). After `npm ci`, the frontend results above are from the locked versions.
- Doc correction: the minimum age is **13** in code (`024f5bb`), but this file and `SECURITY.md` still said 8. Both now say 13.

**Not tested:** anything against real AWS, Atlas, Render or Google; the deployed site's headers and CSP; real email delivery; S3 bucket and IAM configuration. All attacks ran in-process against the in-memory database and fake S3. Phase 4 covers the attack list, but no test was run against the live deployment.

### Summary of changes
- **Auth & sessions:** httpOnly cookie sessions with a 15-minute access token and a rotating, reuse-detecting refresh token. JWTs are pinned to HS256 with `iss`/`aud`. The user is resolved per request (`tokenVersion` plus a session `sid`). Logout is real. CSRF is blocked by an Origin allowlist. Google linking requires a verified email. There is now a password policy with a HIBP check, generic auth errors, timing-safe login, and per-IP and per-account rate limits with real client-IP resolution behind Render and Cloudflare.
- **Uploads & storage:** presigned POST straight to S3 with a size cap and a server-generated key, then a single-use finalize. AWS SDK v3. 5-minute GET URLs. Atomic entry numbers. `encVersion` on videos.
- **API hygiene:** zod validation on every route, `sanitizeFilter`/`strictQuery`, explicit response shapes, 4xx (never 500) for bad input, fail-fast env validation and DB connection.
- **HTTP & frontend:** helmet with explicit CSP and HSTS, an env-driven CORS allowlist, a production CSP `<meta>` tag, and the third-party script and Lovable scaffolding removed.
- **Privacy & lifecycle:** account deletion with re-auth (cascade service), a server-enforced minimum age, honest encryption copy, Terms/Privacy pages with recorded acceptance.
- **Admin groundwork:** `role`, an append-only `AuditLog`, `requireAdmin`, the video service layer, the bootstrap script, and the key-material invariant test. No admin routes.
- **Tooling:** test suites (unit, adversarial, e2e), CI (tests, audit, gitleaks, CodeQL), Dependabot, and a gitleaks pre-commit hook.

### User-visible behaviour changes
- Sessions live in cookies. Everyone signs in once after the first deploy. The idle timer and logout now end the session on the server, and other devices stay signed in.
- Passwords: 8+ characters with an uppercase letter, a digit and a symbol; at most 72 bytes; refused if they appear in a breach.
- Email verification and password reset exist, but **emails aren't sent in production** (stubbed). Until a provider is wired in, no one can verify an email or reset a forgotten password.
- Google sign-in refuses to merge into an unverified password account (409).
- Minimum age is 13 at registration and on profile edits. Terms acceptance is required to use the app.
- Rate limits can block repeated failures. 5 bad logins lock that account for 15 minutes.
- Uploads go directly from the browser to S3 (200 MB cap by default). Playback URLs expire after 5 minutes.
- New "Delete account" in settings. Landing and README copy no longer claim end-to-end encryption.

### Environment variables (backend; validated at startup by `backend/validateEnv.js`)
| Variable | Required | Notes |
|---|---|---|
| `MONGO_URI`, `GOOGLE_CLIENT_ID`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` | yes | Pre-existing, now validated |
| `JWT_SECRET` | yes | Now must be ≥ 32 characters; use random bytes |
| `NODE_ENV` | `production` on Render (confirmed) | If unset, localhost stays a trusted origin |
| `ALLOWED_ORIGINS` | no | CORS/CSRF allowlist. Falls back to `https://mkmutaki.github.io` |
| `FRONTEND_URL` | no | Base for emailed links |
| `COOKIE_SAME_SITE` | no | `none` today; `lax` after the custom domain |
| `MAX_UPLOAD_BYTES` | no | Default 200 MB |
| `EMAIL_STUB_PRINT_LINKS` | **never on Render** | Local dev only (SEC-32) |

No cookie-domain variable exists, deliberately: cookies are host-only on the API host, which is correct for an `app.`/`api.` split. Frontend variables are unchanged (`VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`).

### Manual steps for the owner
1. **Render:** `NODE_ENV=production` is confirmed. Still check a fresh random `JWT_SECRET`, and that `EMAIL_STUB_PRINT_LINKS` and `USE_FAKE_S3` are unset. After deploying, repeat the failed-login check (the logged `ip` should be your public IP, SEC-05), and check the startup log for a failed `s3Key` unique-index build (SEC-34).
2. **Push and check CI** on `develop` now that the e2e test is fixed.
3. **AWS:** least-privilege IAM policy scoped to `videos/`. On the bucket: Block Public Access, a deny-non-TLS policy, default encryption (SSE-S3), CORS allowing POST/GET only from the app origin, and a lifecycle rule expiring abandoned uploads and incomplete multipart uploads. **Confirm the old leaked access key is deleted in IAM**, not just deactivated.
4. **Atlas:** a database user with `readWrite` on one database (after the `blackb0x` migration; it's `test` today), an IP access list for Render's outbound IPs (or document the wider rule as accepted), and backups turned on with one restore actually tested.
5. **Google OAuth:** authorised JavaScript origins should list only the live frontend origin(s). Add the custom domain when it lands.
6. **Custom domain:** DNS for `app.` and `api.`, plus a host that can set headers (`frontend/vercel.json` is ready but unused). Then set `ALLOWED_ORIGINS` and `COOKIE_SAME_SITE=lax`, and remove `mkmutaki.github.io` from `PROD_ORIGINS` (closes SEC-41). Also update the Render hostname hardcoded in `frontend/src/services/api.ts` and in both CSPs (`vite.config.ts`, `vercel.json`).
7. **Email provider:** choose one (a third-party service, so it's your call), wire it into `backend/services/email.js`, and set SPF/DKIM/DMARC. Update the Privacy Policy to name the provider first.
8. **Vulnerability reports** go to `detrick3d@gmail.com` for now (the old `hello@blackbox.app` wasn't a real mailbox). Switch to a domain address once the custom domain and email provider exist.

### Manual QA checklist (on the deployed site)
- [ ] Register (tick Terms) → onboarding → record → upload → play → rename → delete
- [ ] Reload a deep link (e.g. `/home`): still signed in, no 404
- [ ] Leave a tab idle for over 15 minutes, then act: the session refreshes silently
- [ ] Log out, then press Back or reload: the session isn't restored. A second browser stays signed in
- [ ] Weak password and a known-breached one (e.g. `Password1!`) are refused with a clear message
- [ ] Google: new sign-up works; sign-in to a verified account works; an unverified password account with the same email is refused
- [ ] Under-13 date of birth is refused
- [ ] Delete account: the wrong password is refused; the right one signs you out and the S3 objects are gone (check the bucket)
- [ ] DevTools: nothing in `localStorage`; cookies are `HttpOnly` and `Secure`; no CSP violations in the console during Google login and playback
- [ ] Reopen an entry after more than 5 minutes: it still plays (the app fetches a fresh URL)

### Still exploitable or accepted
1. **Database read = every video decrypted.** The server stores each video's AES key next to its S3 pointer. Anyone with database read access (the operator, Atlas, a breach, a future admin) can decrypt any recording. This is the largest accepted risk; E2EE is the remedy.
2. **SEC-41 (High, live today):** a compromised script on any of the seven sibling GitHub Pages sites can act as a signed-in Blackbox user, including reading video keys. Closes with the custom domain.
3. **SEC-42 (High, accepted):** an attacker pre-registers the victim's email, the victim opens the verification link, and the victim's Google sign-in then links into the attacker's account.
4. **No clickjacking protection** while on GitHub Pages: a `<meta>` CSP can't carry `frame-ancestors`, and `X-Frame-Options` needs a header. Destructive actions need a password, which limits the impact.
5. **SEC-10:** register reveals whether an email exists (400 vs 201). This is rate-limited.
6. **Lockout DoS:** anyone can lock a known account out for 15 minutes with 5 bad passwords.
7. **Abandoned uploads are never cleaned up:** a presigned upload that's never finalized stays in S3 indefinitely (up to 200 MB each, bounded by the presign rate limit) until the lifecycle rule in step 3 exists. S3 deletes that failed during account deletion are logged but never retried.
8. **Frontend runtime advisories** (react-router, `@babel/runtime`): not reproduced, not yet upgraded.
9. **Security events have no alerting:** they go to stdout and `AuditLog`, and nobody is notified of token reuse or a burst of failed logins.

### Left out — needed in future iterations
- **The `infra/` folder (§5.C) was never produced.** No IAM policy, bucket policy, S3 CORS, lifecycle rule or Atlas checklist exists in the repo. The step 3/4 settings above are unwritten, and S3 default encryption (§5.B) is unconfirmed.
- **Email delivery** blocks verification, password reset, closing SEC-10 and hardening SEC-42.
- **A header-capable host** for HSTS, `frame-ancestors`, `Permissions-Policy`, and the move away from the shared origin.
- **Background jobs:** abandoned-upload cleanup and a retry for orphaned S3 objects.
- **Operations:** alerting on security events, a retention policy for logs and `AuditLog` (it keeps IPs indefinitely), and a tested backup restore.
- **Admin prerequisites** from the Phase 3 list above: a suspension field, admin-safe views, MFA and step-up auth for admins, and an audit read path.
- **Quick wins:** SEC-30 (`.gitignore` wildcard), react-router 6.30+, and making the gitleaks pre-commit hook block rather than warn.
- **Deferred upgrades:** Tailwind v4 (SEC-28), TypeScript `strict` mode in the frontend, and an atomic `/refresh` rotation.
- **Legal copy must follow features:** update Terms/Privacy before wiring email, enabling backups, shipping location or E2EE, or adding analytics.
- **A test against the deployed environment.** Everything so far ran in-process.

### Recommended next steps, in order
1. **Now (hours):** push the e2e fix and confirm CI is green; do the Render checks (step 1); fix SEC-30; bump react-router.
2. **Infrastructure (owner):** write and apply the AWS and Atlas settings (steps 3–4), including the abandoned-upload lifecycle rule.
3. **Email provider:** ask-first decision → wire it in → close SEC-10 by having register always answer "check your inbox".
4. **Custom domain + header host:** closes SEC-41 and clickjacking, and enables `SameSite=Lax`.
5. **Refactor** (roadmap step 4), planned against this audit.
6. **Admin panel** (roadmap step 5): build on the Phase 3 foundations and the "What the admin panel still needs" list. Every admin route needs a key-material test recipe.
7. **E2EE**, as its own project, separate from the admin and refactor track. It's the only fix for accepted risk 1. Ship it with updated landing copy and Privacy terms, using `encVersion` to tell formats apart.
8. **Database migration to `blackb0x`:** last. Afterwards, scope the Atlas user's `readWrite` to that one database.
