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
- S3 default (server-side) encryption at rest is documented as an
  infrastructure setting in `infra/` — defence in depth, not a substitute
  for the above.

## What client-side encryption *does* protect against

Even with the above accepted risk, client-side encryption still means:
- The S3 bucket alone (without the database) contains only ciphertext.
- Anyone who intercepts a signed download URL in transit, or who compromises
  S3 credentials without also having database access, gets encrypted bytes.
- A backup or replica of just the object storage, without the database,
  reveals nothing.

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
5. Never create a second *user* to rotate — rotate the *key* on the existing least-privilege user (see `infra/iam-policy.json`).

### JWT_SECRET
1. Generate a new value: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`.
2. Update `JWT_SECRET` in Render's environment variables and redeploy.
3. **Caveat with the current session design** (see `SECURITY_AUDIT.md` SEC-03): rotating this secret immediately invalidates every existing session, since there is no `tokenVersion`/refresh mechanism yet — every logged-in user gets logged out. That's expected and safe; it's also the only way to force a full logout today if a token is known to be compromised.

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
