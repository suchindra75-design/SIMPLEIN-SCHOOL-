# Hosted performance check (owner steps)

Local runs (production build, seeded local Supabase) are in the portal health
check from 12 Nov 2026. These steps repeat the measurement on the real hosted
setup. They need the owner's Supabase and Vercel accounts, so they were not run.

## What exists today (checked 12 Nov 2026 with the Supabase CLI)

| Project | Region | Status |
|---|---|---|
| `simplin school production` (`rpcydhgavfebywhlfukp`) | **ap-southeast-1, Singapore** | Paused (INACTIVE) |
| `simplein school` staging (`krzbajfioftoubcbyeso`) | ap-northeast-2, Seoul | Active; keys leaked in git history |

`vercel.json` pins functions to **bom1 (Mumbai)**. A Mumbai app talking to a
Singapore database pays a cross-region round trip, roughly 30–40 ms, on every
database call. With a Mumbai database it is about 1–3 ms. Most pages make 2–7
calls one after another, so the gap is 60–280 ms per page. **Create the
production project in ap-south-1 (Mumbai)**, as the deploy runbook says, and
don't revive the Singapore one.

## 1. Switch to asymmetric JWT signing keys

The middleware checks the login with `supabase.auth.getClaims()`. With
asymmetric keys (ES256/RS256), that check runs locally against cached public
keys in 1–5 ms. With the legacy shared secret (HS256), it falls back to a call
to Supabase Auth on every request (about 120 ms locally, more over a network).

Dashboard → Project Settings → **JWT Keys** → migrate the legacy JWT secret to
the new signing keys, then rotate so the new asymmetric key is the one in use.
This also retires the leaked legacy secret, which is one of the pending
credential rotations.

To verify, `scripts/measure-portals.mjs` prints the signing algorithm of each
test login's token. It should say ES256 (or RS256), not HS256.

## 2. Apply the migrations

Apply 0001–0033 to the new project. 0029–0033 are the performance migrations:

| Migration | Effect |
|---|---|
| 0029 | Access rules evaluate session lookups once per query instead of per row |
| 0030 | Family attendance sessions resolved once per query (attendance pages) |
| 0031 | Scope helper functions evaluate session lookups once per call |
| 0032 | `my_parent_children()`: parent pages load the family in one call |
| 0033 | Parent read checks on attendance, marks and enrollments resolved once per query |

## 3. Measure

Create one dedicated test account per role (never a real user), then run:

```bash
MEASURE_ADMIN_LOGIN=… MEASURE_ADMIN_PASSWORD=… \
MEASURE_TEACHER_LOGIN=… MEASURE_TEACHER_PASSWORD=… \
MEASURE_PARENT_LOGIN=… MEASURE_PARENT_PASSWORD=… \
MEASURE_STUDENT_LOGIN=… MEASURE_STUDENT_PASSWORD=… \
node --env-file=.env.production.local scripts/measure-portals.mjs https://<app-domain> 5
```

For a protected Vercel Preview, also set `VERCEL_AUTOMATION_BYPASS_SECRET`.
The script prints the median time per page and the average per portal, and
writes a JSON file you can compare with the local numbers.

Targets for a Mumbai + Mumbai setup: under 150 ms median per page server-side,
and no page over 400 ms with a real school's data.

## 4. Staff and family subdomains

The routing was verified locally on `staff.localhost` and `family.localhost`
(each portal's login page, cross-portal redirects, role refusal, host-only
session cookies). On the real domain:

1. Point `staff.<domain>` and `family.<domain>` at the Vercel project.
2. Set `NEXT_PUBLIC_STAFF_PORTAL_URL` and `NEXT_PUBLIC_FAMILY_PORTAL_URL` to
   those origins, and `NEXT_PUBLIC_APP_URL` to the canonical one.
3. Add both origins to Supabase Auth → URL Configuration → Redirect URLs
   (password-reset links).
4. Check that an admin signing in on the family portal is refused, that
   `family.<domain>/admin` redirects to the staff portal, and that a parent on
   the staff portal is sent to the family portal.

Sessions are per subdomain (host-only cookies), so a user signs in on their
own portal. That is intentional isolation.
