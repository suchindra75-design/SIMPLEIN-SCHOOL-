# SIMPLEIN SCHOOL ERP (V1)

Multi-tenant school ERP by **SIMPLEIN SOLUTIONS LLP** — School Admin ↔
Teachers ↔ Parents. V1 has no online payments (fee tracking is display +
staff-recorded receipts only).

## Status

**Architecture foundation phase.** See:

- `docs/ARCHITECTURE.md` — stack, multi-tenancy, auth/RBAC, security, roadmap
- `docs/DATABASE.md` — entities, relationships, RLS pattern
- `docs/API.md` — REST contract (`/api/v1/*`)

Only the architectural shell exists (three dashboard shells, API health
endpoint, auth/RBAC/tenant helpers, validation + response utilities).
Feature modules land after architecture review.

## Quick start

```bash
cp .env.example .env.local   # fill from Supabase dashboard
npm install
npm run dev                  # http://localhost:3000
npm run typecheck && npm test && npm run build
```

## Project structure

```text
app/                  # Routes: page shells + /api/v1/* handlers
  admin|teacher|parent # Role dashboard shells (UX gating only)
  api/v1/             # REST handlers (auth + RBAC + tenant guard)
lib/
  auth/               # session, rbac matrix (single source of truth)
  supabase/           # browser + server clients
  validation/         # Zod schemas shared by UI + API
  api/                # response envelope helpers
  tenant.ts           # tenant context (session-derived only)
supabase/migrations/  # Ordered SQL incl. RLS policies
docs/                 # ARCHITECTURE.md, DATABASE.md, API.md
```
