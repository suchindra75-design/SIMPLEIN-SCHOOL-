# Local demo and test setup

Everything here runs against an **isolated local Supabase stack in Docker**. Nothing
touches the hosted Supabase projects or Vercel. Do not point these scripts at a hosted
project: the seed, integration tests and smoke crawl refuse any non-localhost URL.

## 1. Requirements

- Node.js 22 and `npm ci`
- Docker Desktop running (the local stack needs roughly 3–4 GB of images on first start
  and about 2 GB of RAM while running)
- No `.env.local` is needed for local work; keys come from `supabase status`

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

Open <http://localhost:3999/login>.

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

1. **Admin** (`admin@greenfield.test`): dashboard KPIs → Students (search, open Aarav) →
   Attendance overview → Exams → Report cards: generate for Grade 9 and preview a PDF →
   Fees: record an offline cash payment for Sneha (`GPS-2026-006`) → Notices: create and
   publish a school-wide notice → Academic years → Promotions preview.
2. **Second admin** (`accounts@greenfield.test`): Fees → verify the payment recorded in
   step 1 (the recording admin cannot verify their own entry).
3. **Teacher** (`T-1001`): dashboard → mark attendance for 9-A (Present, Absent,
   Late, Leave) → Marks: Grade 9 Maths is locked; enter Science or English for 9-A as
   class teacher → Homework: create with a file attachment.
4. **Parent** (`9876500301`): switch between Aarav and Diya → attendance →
   results (only published subjects appear) → fees (read-only; shows verified payments) →
   notices and notifications.
5. **Student** (`GPS-2026-001`): timetable, homework with attachment download, results,
   notices.
6. **Isolation**: sign in as `admin@riverside.test`; none of Greenfield's students,
   notices or fees appear.

## 8. Stop

```bash
npx --no-install supabase stop
```
