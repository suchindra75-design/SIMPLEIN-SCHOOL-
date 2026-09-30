# SIMPLEIN SCHOOL ERP — Backup & Recovery (V1, Phase 15)

Status: REQUIRED, NOT configured by this repo. Nothing below claims a backup
exists — it defines what must exist before production and how to verify it.

## 1. PostgreSQL backup strategy

- **Point-in-Time Recovery (PITR)** on the production Supabase project
  (requires a paid tier). This is the primary mechanism: any-moment restore
  for academic/financial records.
- **Secondary:** nightly logical dump (`pg_dump`, custom format) to object
  storage OUTSIDE Supabase, 30-day retention. Protects against
  platform-level incidents PITR cannot cover.
- **`audit_logs` is append-only and MUST be included in every backup.**
  It is the integrity trail for marks, fees, promotions, and user changes.
  Never exclude it to save space.
- RPO/RTO: **TBD — require school-management approval** (do not invent
  numbers). PITR granularity makes RPO minutes; state the approved values
  here once signed off.

## 2. Storage (file) backup strategy

- Database PITR does **NOT** cover Supabase Storage. All 7 private buckets
  (`student-photos`, `teacher-photos`, `report-cards`,
  `homework-attachments`, `notice-attachments`, `fee-receipts`, `pyqs`)
  must be synced on a schedule to external storage (e.g. `rclone` cron or a
  storage-to-S3 job), same retention as DB backups.
- Priority order on restore: `fee-receipts` (irreplaceable) first, then
  photos/documents, then regenerable `report-cards` PDFs (rebuildable from
  data — verify by regenerating one card post-restore).
- Object paths are tenant-prefixed (`schools/{school_id}/…`), so per-school
  verification and partial restores are straightforward.

## 3. Restore process

1. Provision a scratch Supabase project (never restore over production
   blind — validate first).
2. Restore database to the target point (PITR) or load the logical dump.
3. Sync storage objects to the scratch buckets.
4. Run `supabase migration list` (history must match), then the live RLS
   suites (`supabase/tests/phase*_rls.sql`) against the restored copy.
5. Spot-check: one school login, one published result, one fee balance
   (assigned − verified records), one signed-URL download per bucket.
6. Only then promote the restore to production traffic (maintenance window,
   announced).

## 4. Restore verification (proof, not claims)

- Record every drill: date, backup source + timestamp, restorer, checks
  run, result. A backup that has never been restored is untested.
- Required evidence per drill: RLS suites green on the restored copy +
  the §3 spot-checks passing.

## 5. Disaster scenarios

| Scenario | Response |
|----------|----------|
| Accidental data delete (single school) | PITR to pre-incident point into scratch → export school's rows → targeted repair; full restore only if repair is unsafe |
| Bad migration applied | Neutralize forward if additive-only; otherwise restore (§6 in `docs/PRODUCTION_DEPLOYMENT.md`) |
| Supabase region/platform outage | Secondary dumps + storage sync are platform-independent; rebuild on a new project/region |
| credential leak (service key / onboarding secret) | Rotate immediately in Vercel + Supabase dashboard; audit `audit_logs` for misuse window; re-issue onboarding secret |
| Storage object loss/deletion | Restore affected `schools/{id}/…` prefixes from the storage sync |

## 6. Recovery environment

- Keep one dormant scratch Supabase project (or documented 30-minute setup
  runbook) so restores never wait on provisioning.
- Keep the restore runbook (§3) printed/accessible outside the systems it
  restores (if the wiki is down, the runbook must still be reachable).

## 7. Restore drill procedure (minimum: monthly until pilot, then quarterly)

1. Pick the latest nightly dump + storage sync (no cherry-picking the
   "good" one).
2. Execute §3 end-to-end on the scratch project.
3. Log evidence per §4; file any failures as release blockers.
4. First drill must complete BEFORE pilot onboarding (pre-launch checklist).
