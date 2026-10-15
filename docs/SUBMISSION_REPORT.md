# Submission report: branch `release/erp-submission`

Status on 15 October 2026. Everything below was verified locally against an isolated
Supabase stack (Docker) seeded with two demo schools. Nothing was pushed, deployed or
run against a hosted project. Setup and demo steps are in [LOCAL_DEMO.md](LOCAL_DEMO.md).

## Test results

| Check | Result | Notes |
| --- | --- | --- |
| Type check (`tsc --noEmit`) | PASS | 0 errors |
| Lint (`eslint .`) | PASS | 0 errors; 1 warning in the unused `finalfrontendsimp-main/` copy |
| Unit tests (`npm test`) | PASS, 389/389 | 30 files; services against an in-memory fake DB |
| Integration tests (`npm run test:integration`) | PASS, 49/49 | 5 files; real PostgREST, Auth, Storage and RLS |
| Database tests (`supabase test db`) | PASS, 288/288 | 12 pgTAP files, including RLS coverage of every table |
| Production build (`next build`) | PASS | |
| Smoke crawl (`scripts/smoke-crawl.mjs`) | PASS, 80/80 | Every page of the four portals as each role; other portals redirect |
| Browser walkthrough (built-in Chromium) | PASS | See below |
| Hosted staging/production checks | BLOCKED | Not run: needs your approval and rotated credentials |
| Other browsers, screen readers | NOT RUN | Only the Chromium-based pane was used |

Every bug fix that has a test was checked against the previous code: the new test fails
there and passes with the fix.

Crawl timings were taken while the machine was under heavy background load (load
average 16–26, swap in use): median about 400 ms per page, slowest pages (parent
timetable and report cards) about 1.1–1.3 s. On a quiet machine earlier the same day:
median 266 ms, slowest 635 ms.

### Browser walkthrough (production build, local data)

- Sign-in by teacher employee ID (`T-1001`), parent phone (`98765 00301`), student
  admission number typed in lower case (`gps-2026-001`) and admin email; each lands in
  its own portal. A wrong password shows the error message; sign-out works.
- Teacher marks entry: a mark above the maximum is rejected and the grid and every
  entry stay on screen; nothing is written.
- Admin: deactivate and reactivate a teacher from the edit form; record an offline
  payment; fee assignment to several students (skips students with recorded payments
  and says so).
- Mobile width (375 px): no horizontal scrolling; navigation drawer works.

## What changed on this branch

**Security and data isolation**
- Identifier login hardened against filter injection, wildcards and wrong-role matches.
- RLS enabled on `pyqs`; a pgTAP guard fails if any table lacks RLS.
- Storage reads scoped to the record a file belongs to (report cards, receipts,
  homework, notices, photos); teachers can only write homework files for their sections.
- Notification inserts limited to recipients in the sender's school; search input can no
  longer inject PostgREST filters; login attempts rate-limited per IP.
- Unknown `?error=` text is no longer shown on the login page.

**Workflows fixed**
- Login form: admission number, phone and employee ID were unreachable from the UI.
- Notices: school-wide audience, drafts hidden from non-admins, safe target updates.
- Family views: dated attendance history, student fee payments, teacher names, results
  shown per published subject.
- Marks: teacher scope by section and subject; RLS planning cost fixed (it was hitting
  the 8 s timeout); save errors keep the grid.
- Promotions: no longer put students in class NULL; academic year creation plus a page.
- Report cards: generate per student or per exam; PDF download redirects to a signed URL.
- Exams: subjects listed for teachers and students; uploads capped at 4 MB to fit
  Vercel's request limit; PYQ upload works.
- Fees: overpayment and double verification blocked; re-assignment no longer rewrites
  fees that have payments; real multi-select assignment by class; student search.
- Students: import confirm re-validates rows; class and section always agree.
- People: deactivate from the teacher/parent edit forms.
- Multi-role accounts: a teacher who is also a parent can see their own child.
- Performance: set-based RLS helpers for family/teacher reads (parent timetable went
  from about 9 s to under 0.6 s).

**Design**: navy sidebar, bright-blue active state, white top bar and pale blue-grey
background as one token set used by all four portals and the login page.

**Docs and tooling**: local seed with two schools, integration-test harness, smoke crawl,
[LOCAL_DEMO.md](LOCAL_DEMO.md), and a valid `openapi.yaml`.

**Migrations added** (local only so far): `0016` to `0021`.

## Known limitations and risks

1. **Production database not migrated.** Migrations `0016`–`0021` are applied only
   locally. Without them, production still has the RLS gaps and slow family pages listed
   above. Applying them needs your approval.
2. **Exposed credentials.** The legacy service-role key and the staging passwords are
   treated as compromised. They must be rotated before any hosted use; this was not done
   here.
3. **Login rate limit is per server instance** (in memory). On Vercel each instance
   counts separately, and Supabase Auth sees the server's IP, not the user's.
4. **Forms need JavaScript.** SmartForm forms do not work with JavaScript disabled.
5. **Duplicate identifiers across schools.** If an admission number or phone exists in
   two schools, that login is refused and the person must use their email.
6. **`xlsx` 0.18.5** (student import) has published advisories (prototype pollution,
   ReDoS). Exposure is limited to admins uploading files of 2 MB or less. Fixed versions
   are only distributed from the SheetJS CDN, not npm.
7. **Any teacher can send a notification to anyone in their own school** (RLS allows the
   insert). Cross-school sending is blocked.
8. **Fees page observation.** An intermediate version that ran several student queries in
   parallel made the page hang after a save. It was replaced with one query and never
   committed, but the root cause was not isolated. Parallel queries during a
   post-save re-render are worth watching.
9. **Out-of-range marks return 409** instead of 422. The message is correct; only the
   status code is unusual.
10. **Branch state.** `release/erp-submission` is not merged into `main` or pushed. The
    main checkout is mid-merge on `phase-16-production-infrastructure` and was left
    untouched.
