# Infrastructure configuration (apply manually)

Nothing here is automated — no Terraform, no CDK, no scripts that touch a
real account. These are the exact JSON documents the bucket owner applies by
hand in the AWS/MongoDB Atlas consoles (or via the AWS CLI, shown below),
after replacing the placeholders. Deliberately kept out of `docs/`, which
GitHub Pages publishes to the public internet.

Placeholders to replace everywhere below:
- `<BUCKET_NAME>` — the real S3 bucket name (`S3_BUCKET_NAME` in `.env`).
- `<AWS_ACCOUNT_ID>` — the AWS account ID the bucket lives in.
- `<APP_ORIGIN>` — the frontend's real origin(s), e.g. `https://mkmutaki.github.io` today, plus the custom domain once it exists.

## Files

- `iam-policy.json` — least-privilege policy for the IAM user whose access
  key the backend uses. Scoped to the `videos/` prefix only — this
  identity cannot touch any other bucket or any other prefix.
- `bucket-policy.json` — denies non-TLS requests. Attach via the bucket's
  **Permissions → Bucket policy** tab.
- `public-access-block.json` — the four "Block Public Access" settings,
  all `true`. Apply via **Permissions → Block public access**, or:
  ```
  aws s3api put-public-access-block --bucket <BUCKET_NAME> --public-access-block-configuration file://public-access-block.json
  ```
- `cors.json` — CORS rules locked to the app's real origin(s), covering both
  the presigned-POST upload (from the browser) and the presigned-GET
  playback fetch. Apply via **Permissions → CORS**, or:
  ```
  aws s3api put-bucket-cors --bucket <BUCKET_NAME> --cors-configuration file://cors.json
  ```
- `encryption.json` — enables default server-side encryption (SSE-S3) on
  the bucket. This is defence in depth only — see `SECURITY.md` for why it
  does not change the accepted risk around who can decrypt a video. Apply
  via **Properties → Default encryption**, or:
  ```
  aws s3api put-bucket-encryption --bucket <BUCKET_NAME> --server-side-encryption-configuration file://encryption.json
  ```
- `lifecycle-rules.json` — aborts incomplete multipart uploads after 7 days,
  so a client that starts a multipart upload and never finishes doesn't
  accumulate storage cost forever. Apply via **Management → Lifecycle
  rules**, or:
  ```
  aws s3api put-bucket-lifecycle-configuration --bucket <BUCKET_NAME> --lifecycle-configuration file://lifecycle-rules.json
  ```
- `atlas-checklist.md` — the equivalent manual checklist for MongoDB Atlas
  (database user scope, network access list, backups).

## Known gap: orphaned single-object uploads

The upload flow (`backend/routes/videoRoutes.js`) issues a presigned **POST**
for a single object, not a multipart upload — so `lifecycle-rules.json`'s
"abort incomplete multipart upload" rule doesn't clean up the one realistic
leak in this design: a client that uploads successfully to S3 but never
calls `/api/videos/finalize` (closed the tab, crashed, lost network) leaves
an object in S3 with no matching database record. This is a low-impact,
accepted gap for now — the orphaned object is encrypted ciphertext with no
account linkage, not itself exploitable, just wasted storage. A future
scheduled job (compare S3 keys under `videos/` against `Video.s3Key` in
Mongo, delete anything older than a day with no match) would close it
cleanly; not built as part of this pass.
