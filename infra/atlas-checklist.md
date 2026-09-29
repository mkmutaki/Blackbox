# MongoDB Atlas checklist (apply manually)

- [ ] **Database user scope**: the app's database user has `readWrite` on a
      single database only (not `readWriteAnyDatabase`, not an Atlas admin
      role). Atlas → Database Access → edit the user → **Specific Privileges**.
      Note: per `CLAUDE.md`, `MONGO_URI` deliberately carries no database
      name today (everything lands in the default `test` database) — scope
      the role to `test` for now; re-scope when the database migration
      (last item on the roadmap) happens, not before.
- [ ] **Network access list**: Atlas → Network Access — do not leave `0.0.0.0/0`
      unless Render's outbound IPs are confirmed non-static for this plan
      tier. If Render's IPs aren't static here, document that explicitly as
      an accepted risk with a reason, rather than silently allowing all
      traffic. Check Render's current published outbound IP list before
      deciding: https://render.com/docs/static-outbound-ip-addresses
- [ ] **Backups**: confirm Atlas backups are enabled for the cluster tier in
      use (free/shared tiers may not include continuous backups — check
      what the current tier actually provides and decide if that's
      acceptable given the app stores test data only for now).
- [ ] **Credential rotation**: see `SECURITY.md`'s runbook for rotating the
      database user's password.
