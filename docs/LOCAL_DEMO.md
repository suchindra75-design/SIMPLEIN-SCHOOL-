# Local demo and test setup

Everything here runs against an **isolated local Supabase stack in Docker**. Nothing
touches the hosted Supabase projects or Vercel. Do not point these scripts at a hosted
project: the seed, integration tests and smoke crawl refuse any non-localhost URL.

## 1. Requirements

- Node.js 20 or newer (verified with Node 24) and `npm ci`
- Docker Desktop running (the local stack needs roughly 3–4 GB of images on first start
  and about 2 GB of RAM while running)
- No `.env.local` is needed for local work; keys come from `supabase status`
- Run every command from the checkout of `release/erp-submission` (in this repository:
  `.claude/worktrees/elegant-bohr-67698f`), not from the main checkout

## 2. Start the local stack

Only the services the app uses are started (Auth, PostgREST, Postgres, Storage, Kong):

```bash
npx --no-install supabase start -x realtime,studio,edge-runtime,logflare,vector,imgproxy,postgres-meta,supavisor,mailpit
```

Apply every migration to the **local** database and run the pgTAP suite:

```bash
npx --no-install supabase db reset --local
```

```bash
npx --no-install supabase test db
```

Never add `--linked` to these commands; that targets the hosted project.

## 3. Environment for scripts, tests and the app

Export the local keys printed by `supabase status` (they are local-only defaults, not
production secrets):

```bash
eval "$(npx --no-install supabase status -o env | sed -E 's/^/export LOCAL_/')"
```

That defines `LOCAL_API_URL`, `LOCAL_ANON_KEY` and `LOCAL_SERVICE_ROLE_KEY`. The scripts
read these names:

| Variable | Value |
| --- | --- |
| `LOCAL_SUPABASE_URL` | `http://127.0.0.1:54321` (default) |
| `LOCAL_SUPABASE_ANON_KEY` | `$LOCAL_ANON_KEY` |
| `LOCAL_SUPABASE_SERVICE_ROLE_KEY` | `$LOCAL_SERVICE_ROLE_KEY` |

```bash
export LOCAL_SUPABASE_ANON_KEY="$LOCAL_ANON_KEY" LOCAL_SUPABASE_SERVICE_ROLE_KEY="$LOCAL_SERVICE_ROLE_KEY"
```

## 4. Seed the demo data

```bash
node scripts/seed-local.mjs
```

The seed is idempotent per reset (run it after `supabase db reset --local`). It creates
two schools so cross-school isolation can be demonstrated:

**Greenfield Demo School** (`greenfield-demo`)

- Academic years 2026-27 (current) and 2025-26
- Grade 9 (sections A and B) and Grade 10 (section A); subjects MAT, SCI, ENG, SST
- 3 teachers, 8 students, 3 parents, attendance, CBSE grading, Unit Test 1 with marks
  (Grade 9 Maths published and locked; Science and English still open), timetable,
  homework, notices, fee structures with offline payments and a PYQ PDF

**Riverside Demo Academy** (`riverside-demo`): one admin, teacher, student and parent.
Admission number `DUP-100` and parent phone `9876500999` exist in **both** schools on
purpose.

### Demo accounts

All accounts share one local-only password, the `DEMO_PASSWORD` constant in
[`scripts/local-demo.mjs`](../scripts/local-demo.mjs). It only exists in a locally seeded
database.

| Portal tab | Person | Sign in with |
| --- | --- | --- |
| Admin | Greenfield admin | `admin@greenfield.test` |
| Admin | Second admin (fee verification) | `accounts@greenfield.test` |
| Teacher | Anita Verma, class teacher 9-A, Maths 9-A/9-B | `T-1001` or `anita.verma@greenfield.test` |
| Teacher | Rahul Sharma, class teacher 9-B, Science 9-A, English 10-A | `T-1002` |
| Parent | Ramesh Sharma (two children: Aarav, Diya) | `9876500301` |
| Parent | Lakshmi Nair (Sneha) | `9876500302` |
| Student | Aarav Sharma, 9-A | `GPS-2026-001` |
| Student | Kavya Menon | `GPS-2026-007` |
| Admin (other school) | Riverside admin | `admin@riverside.test` |

## 5. Run the app against the local stack

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY="$LOCAL_ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$LOCAL_SERVICE_ROLE_KEY" NEXT_PUBLIC_APP_URL=http://localhost:3999 npm run build
```

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY="$LOCAL_ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$LOCAL_SERVICE_ROLE_KEY" NEXT_PUBLIC_APP_URL=http://localhost:3999 npx next start -p 3999
```

Open <http://localhost:3999/login>. The build takes about 1–2 minutes; the start about
5 seconds. `ONBOARDING_SECRET` is only needed for the school-onboarding API and can be
left unset for the demo. Check the app is up with `curl http://localhost:3999/api/v1/health`.

## 6. Tests

| Command | What it covers | Needs local stack |
| --- | --- | --- |
| `npm run typecheck` | TypeScript strict | no |
| `npm run lint` | ESLint | no |
| `npm test` | Unit tests (services against an in-memory fake DB) | no |
| `npx supabase test db` | pgTAP: RLS policies, triggers, constraints, RLS coverage of every table | yes |
| `npm run test:integration` | Services against real PostgREST/Auth/Storage with real RLS: identity login, cross-school isolation, notices, notifications, attendance, fees maker-checker, marks scope, results publishing, promotions, academic years, report cards, storage paths | yes, seeded |
| `node scripts/smoke-crawl.mjs` | Signs in as every role and requests every portal page; checks 200, no error screen, other portals redirect; prints timings | yes, seeded, app on :3999 |

Integration tests restore the rows they change, but re-seeding after a run keeps the
demo data predictable: `supabase db reset --local && node scripts/seed-local.mjs`.

## 7. Demo walkthrough (about 15 minutes)

Sign out between roles (account menu, top right). Start from freshly seeded data
(section 4).

1. **Admin** (`admin@greenfield.test`, Staff Portal → Administrator):
   - Dashboard KPIs → Students: search "Aarav", open the profile (linked parent shown).
   - Marks: choose *Unit Test 1 · Grade 10* → **Publish** Mathematics (English is already
     published). Families only see a report card once every subject of the exam is
     published.
   - Report cards: *Unit Test 1 · Grade 10* → **Generate** for Diya → **Download PDF**.
   - Fees: select Sneha (`GPS-2026-006`) → record an offline CASH payment. The page reloads
     and shows "Saved"; the payment stays unverified until another admin verifies it.
   - Notices: create a notice for *Entire School Community* with *Publish immediately*.
   - Academic years, Promotions preview (optional).
2. **Second admin** (`accounts@greenfield.test`): Fees → Sneha → **Verify** the payment
   (the admin who recorded it cannot verify it). The page reloads with "Payment verified."
3. **Teacher** (`T-1001`, Staff Portal → Faculty / Teacher):
   - Attendance: section *Grade 9 A*, today → **Load** → **Mark all present** → set Aarav
     to **LEAVE** → **Save attendance** ("Saved 4 students"). Statuses are PRESENT, ABSENT
     and LEAVE.
   - Marks entry: Grade 9 Mathematics is locked (published); open Science and change a mark
     → **Save marks** (grade recalculates). A mark above 50 is rejected and the entries
     stay on screen.
   - Homework: create one for Mathematics. To show an attachment, use **Add attachment**
     with any PDF or image of 4 MB or less (the seed has no homework attachments).
4. **Parent** (`98765 00301`, Family Portal → Parent / Guardian): dashboard lists Aarav and
   Diya → Attendance (Aarav's LEAVE from step 3) → Results (Grade 9: only Mathematics is
   published) → Report cards: Diya, *Unit Test 1* → card and PDF → Fees (read-only, "pay at
   the school office") → Notices (the school notice; staff-only notices are hidden).
5. **Student** (`GPS-2026-001`, Family Portal → Student): attendance (LEAVE), timetable,
   homework, results, fees (read-only), notices.
6. **Isolation**: sign in as `admin@riverside.test`; none of Greenfield's students,
   notices or fees appear.

## 8. Demo-day checklist

1. Start Docker Desktop and wait until it reports it is running.
2. From the `release/erp-submission` checkout: section 2 (start the stack), section 3
   (environment), section 4 (reset and seed), section 5 (build, then start).
3. Check `http://localhost:3999/api/v1/health` returns `"status":"ok"`, then sign in once
   with each of the four demo identifiers (password: `DEMO_PASSWORD` in
   `scripts/local-demo.mjs`).
4. Optional: `node scripts/smoke-crawl.mjs` (about 30 seconds) should report
   `80 checks, 0 failure(s)`.
5. Re-run section 4 after rehearsing so the demo starts from clean data.

### If something fails

| Symptom | Fix |
| --- | --- |
| `supabase start` fails: Docker daemon not running | Start Docker Desktop, wait, run section 2 again. |
| `port is already allocated` / app will not start on 3999 | Stop the old process (`lsof -ti tcp:3999` lists it; end it with `kill <pid>`), then start again (or use another port and the matching `NEXT_PUBLIC_APP_URL`). |
| Sign-in says the details are incorrect | Data was reset or not seeded: run section 4. Use the identifier for the selected tab (Teacher tab for `T-1001`, Parent tab for the phone number, Student tab for the admission number). |
| Pages show an error or redirect to login after a reset | Old session cookies: sign out, or open a private window. |
| A page looks wrong after code changes | Rebuild (section 5); `next start` serves the last build. |
| Data looks inconsistent after rehearsals or tests | Section 4 (reset + seed) restores the demo data in under a minute. |
| Everything is stuck | `npx --no-install supabase stop`, then sections 2–5 again. |

## 9. Stop

```bash
npx --no-install supabase stop
```
