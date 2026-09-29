# SIMPLEIN SCHOOL ERP — Staging Environment (V1)

How to wire a local checkout to the **staging** Supabase project.
No secrets live in this repo — only variable **names**.

## 1. Required variables

| Variable | Scope | Required | Used by | Notes |
|----------|-------|----------|---------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | public | **yes** | browser + server + admin clients, middleware session refresh | Supabase staging project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | **yes** | browser + server clients (RLS still enforced) | anon/publishable key. |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | **yes** | `lib/supabase/admin.ts` (onboarding, user provisioning/enable-disable) | Never `NEXT_PUBLIC_`, never imported by client components, never committed. |
| `ONBOARDING_SECRET` | **server-only** | **yes** | `POST /api/v1/onboarding/school` bearer guard | Generate with `openssl rand -hex 32`. Missing/empty → endpoint returns `INTERNAL` "not configured" (fail closed). |
| `NEXT_PUBLIC_APP_URL` | public | recommended | canonical origin for links/emails | Defaults to `http://localhost:3000`. Set to the staging URL on Vercel. |

`NEXT_PUBLIC_*` values ship in the browser bundle by design (they are public
identifiers, not secrets); RLS + server-side session checks still enforce
tenant isolation. The service-role key and onboarding secret must stay in
server env only (local `.env.local`, Vercel project settings).

## 2. Local setup (staging)

```bash
cp .env.example .env.local   # then fill values from the Supabase dashboard
npm run check:env            # presence-only: prints OK/MISSING names, never values
npm run dev                  # http://localhost:3000
```

Get values from: Supabase dashboard → staging project ("simplein school") →
Project Settings → API (URL + anon key + service_role key). Do NOT paste them
into chat, docs, or git — only into your local `.env.local` / Vercel env.

## 3. Secret protection (verified)

- Root `.gitignore`: `.env` and `.env*.local` are ignored; `!.env.example`
  keeps the template tracked. `*.pem` ignored.
- `supabase/.gitignore`: `.temp/` (CLI link/pooler data), `.env.keys`,
  `.env.local`, `.env.*.local` ignored — the linked staging `ref`/pooler URL
  under `supabase/.temp/` is local-only and never committed.
- `npm run check:env` and `lib/config/env.ts` report **names only**; no code
  path logs a secret value (verified by inspection: only `ONBOARDING_SECRET
  is not configured` and `Missing NEXT_PUBLIC_*` name-only messages exist).

## 4. Behavior without variables (fail-closed)

- `middleware.ts`: passes through untouched when Supabase env is absent.
- `lib/auth/session.ts`: resolves as anonymous → protected pages redirect to
  `/login`; API routes return `401 UNAUTHENTICATED`.
- `GET /api/v1/health`: unauthenticated liveness probe, works with or without
  env (no DB round-trip by design).
- Authenticated paths (`/api/v1/auth/session`, `/api/v1/schools/current`,
  `/api/v1/users/me`) require a real session cookie against staging Supabase;
  without credentials they return 401 — that is the expected fail-closed
  result, not a bug.

## 5. Staging smoke test (no secrets in output)

```bash
npm run check:env   # exit 0 only when all required names are set
npm run dev         # or: npm run build && npm start
curl -s localhost:3000/api/v1/health
curl -s localhost:3000/api/v1/auth/session   # 401 without a session cookie
```

Live authentication (login → session → school/user context) may only be
claimed after running the above **with staging variables present** plus a
provisioned staging user. Until then it is recorded as NOT tested.
