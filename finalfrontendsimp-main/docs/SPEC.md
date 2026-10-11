# SIMPLEIN SCHOOL PORTAL — FRONTEND-ONLY UI PROTOTYPE PROMPT

**Scope:** front end only. No backend, no database, no real auth, no persistence.
**Goal:** a polished, fully clickable, realistic-feeling prototype to show a school client the experience, before any backend is built.
**Stack:** Next.js + TypeScript + Tailwind + shadcn/ui, mock data only.

---

## HOW TO USE THIS

1. Create an empty repo, open it in Antigravity.
2. Save this file as `docs/SPEC.md`.
3. Paste **Part 0** as your first message.
4. The agent proposes a screen list and design direction, then stops for your approval before building anything.

Antigravity caps each rules file at 12,000 characters. Keep `.agents/rules/*.md` short and put detail in `docs/`.

---

# PART 0 — BOOTSTRAP (paste this into Antigravity)

You are building a **front-end-only prototype** of SIMPLEIN SCHOOL PORTAL. Read `docs/SPEC.md` fully before doing anything.

There is no backend in this project. There is no database. There is no real authentication. Every screen runs on mock data held in memory (or `localStorage` for session convenience only). The purpose is to demonstrate the user experience convincingly enough to show a school principal, not to store or protect real information.

I am the sole product owner. You do the planning, building, and verification. I approve the design direction and the screen list before you build.

**Your first task is not to write code.** Do the following, then stop:

1. List every screen implied by Part 3, grouped by role.
2. Propose a visual design direction: palette, type, spacing, component style. Reference Part 6.
3. Propose the mock data shape: what entities exist in memory, roughly how many of each, per Part 5.
4. Propose the project structure per Part 4.
5. List anything ambiguous or any decision you need from me.

Then **stop and show me this plan.** Do not scaffold the app or write component code until I approve it.

---

# PART 1 — WHAT THIS IS AND ISN'T

**This is:** a static-data, fully-navigable, good-looking simulation of the product. Every button does something. Every flow completes. It feels real to click through.

**This is not:** a working application. Nothing typed into a form is saved anywhere real. No login checks a real password. No two users ever see each other's changes, because there is no shared state anywhere — each browser tab has its own in-memory world.

Be upfront in the interface about this: a small, tasteful "Prototype — no data is saved" indicator somewhere persistent, so nobody mistakes it for the real product mid-demo.

---

# PART 2 — WHY FRONTEND-ONLY, AND THE RULE THIS IMPLIES

Because there's no backend, "no fake features" means something different here than in a real build. Re-read it this way:

- A button is allowed to only affect in-memory mock state. That is not fake — that is the entire point of a prototype.
- What is **not** allowed: a button that does nothing at all, a page that never finishes loading, a form that submits and shows no response, a chart with numbers that don't move when the underlying mock data would say they should, or a flow that dead-ends without a next step.
- Every interaction needs a visible, believable outcome, even if that outcome only lives in memory for the length of the session.
- Never imply real persistence, real notifications being sent, or real data protection anywhere in copy or UI. No "email sent," no "SMS sent," no "saved to your account" language that isn't true.

---

# PART 3 — SCREENS

Three role experiences, entered through a role switcher (see Part 7) rather than real login.

## Admin
- Dashboard: student/teacher counts, attendance today, upcoming exams, recent notices — all computed from mock data, not hard-coded.
- Students: searchable/filterable list, student profile view, add/edit student form.
- Teachers: list, profile view, add/edit form.
- Classes & sections: list and simple management view.
- Exams: list, create exam flow, view/publish results flow.
- Notices: list, create/publish flow.
- Notification centre.

## Teacher
- Dashboard: today's sections, attendance to mark, pending marks, recent homework.
- Attendance: pick a section, mark present/absent/late per student, save.
- Marks entry: pick an exam and subject, enter marks per student, submit.
- Homework: create, list, edit.
- Notification centre.

## Parent
- Dashboard: child selector, attendance summary, next exam, pending homework, recent notices.
- Attendance: view a selected child's record, by month.
- Results: view published results only, per exam.
- Homework: list, with due dates and status.
- Notices: list.
- Notification centre.

## Shared
- Login/role-switcher screen (Part 7).
- 404, generic error, and "you don't have access" screens, all styled, not browser defaults.

Do not build screens beyond this list without asking. Do not add fees, timetable, transport, library, or any module outside this list — if it comes up, it's a separate conversation with the client, not an assumption to build in.

---

# PART 4 — PROJECT STRUCTURE

```
app/
  (admin)/...
  (teacher)/...
  (parent)/...
  login/
components/
  ui/            shadcn primitives
  shared/        composites: DataTable, StatCard, EmptyState, StatusBadge, NotificationBell
lib/
  mock-data/     entity definitions and generators, one file per entity
  mock-store/    in-memory store (React Context or a small client-side store), seeded from mock-data
  domain/        pure logic: grade computation, attendance % , date formatting — same rules a real backend would use
  types/         shared TypeScript types
docs/
```

- **No Supabase, no fetch calls to any backend, no API routes that pretend to be real.** All data access goes through `lib/mock-store/`.
- Structure `lib/mock-store/` as if it were a real data layer with async functions returning promises (`await getStudents()`), even though it's all synchronous underneath. This keeps the code honest about the boundary and makes a future real backend swap-in straightforward, without over-building for that day now.
- Business logic (grade boundaries, attendance percentages, "is this exam published") lives in `lib/domain/`, not scattered through components, so it stays consistent across screens.

---

# PART 5 — MOCK DATA

Generate a believable, internally consistent in-memory dataset on load:

- 1 school: "SIMPLEIN International School"
- ~8 classes, ~14 sections, ~15 teachers, ~150 students (small enough to feel real without needing pagination shortcuts, big enough that lists, search and filters actually matter)
- Parents, including some with two or three children in different sections
- A few weeks of attendance history with a realistic mix of present/absent/late
- At least one exam in each mark-lifecycle state (draft, submitted, published) so every screen has something meaningful to show
- A handful of homework entries and notices, some recent, some older

Rules:
- Use a name generator or a fixed list of invented names. No real people.
- Data must be **internally consistent**: a student's attendance % on the dashboard must match their attendance records; a parent's dashboard must reflect their actual linked children.
- Regenerating or resetting the mock data (a "reset demo data" action somewhere, e.g. in a settings/debug corner) should be one click, and should reset all in-memory state cleanly.
- Any change made during a session (marking attendance, entering marks, adding a student) persists in memory for that session only, and is lost on refresh unless you deliberately choose to back it with `localStorage`. Decide this and say which you picked — Part 9, decision 1.

---

# PART 6 — DESIGN

This has to look like software a school would trust with its records, not a generic dashboard template or an AI-generated landing page.

**Avoid:** gradients as decoration, glassmorphism, stock illustration people, over-animated transitions, vanity metrics, charts included because they look good rather than because they mean something.

**Aim for:** clarity, information density where it matters (tables, lists), generous whitespace where it doesn't (forms, dashboards), a restrained and deliberate colour palette with one clear accent colour, and typography that reads well at data-table sizes.

Requirements:
- One central theme file: colours, spacing scale, radii, type scale. No one-off inline styling choices scattered through pages.
- A real component library approach: build `StatCard`, `DataTable`, `StatusBadge` (for attendance/mark states), `EmptyState`, and `NotificationBell` once, and reuse them everywhere. Don't hand-roll a new card style per page.
- Every screen implements loading, empty, and error states — simulated with a short artificial delay and an occasional mock error path — so the prototype demonstrates what the real product will feel like under real conditions, not just the happy path.
- Fully responsive: usable and good-looking on a phone, a tablet, and a desktop. Sidebar navigation collapsing into a bottom bar or drawer below the tablet breakpoint.
- Real keyboard and screen-reader accessibility: labelled inputs, visible focus states, adequate contrast, sensible tab order. This is cheap to get right now and expensive to retrofit.

Before building screens, propose a specific direction (palette with hex values, font choice, one reference screen mocked in detail) and get my sign-off, rather than defaulting to shadcn's out-of-the-box look with no opinion applied.

---

# PART 7 — "LOGIN" AND ROLE SWITCHING

There is no real authentication. Build a login-styled screen that is honest about being a demo:

- Three buttons or cards: "Continue as Admin," "Continue as Teacher," "Continue as Parent," each showing the mock persona's name.
- Selecting one sets the active role in the mock store and routes to that role's dashboard.
- A persistent, unobtrusive way to switch roles without going back to the login screen (useful in a live demo), for example a role badge in the header that opens a switcher.
- If a parent persona has multiple children, the parent dashboard needs a child switcher too, independent of the role switcher.

---

# PART 8 — WHAT "DONE" MEANS HERE

A screen is complete only when:

- it matches the approved design direction,
- every visible number comes from the mock data layer, computed, not typed in as a literal,
- every button, link and form does something visible and correct,
- loading, empty and error states are implemented, not just the happy path,
- it's responsive at mobile, tablet and desktop widths, actually checked at those widths,
- keyboard navigation and focus states work,
- there is no dead end — every flow has a clear next step or a clear way back.

## Completion report

After each meaningful chunk of work, report:

```
SCREENS BUILT:
COMPONENTS ADDED/REUSED:
MOCK DATA CHANGES:
STATES COVERED (loading/empty/error) PER SCREEN:
RESPONSIVE CHECK (widths actually viewed):
KNOWN GAPS:
NEXT STEP:
```

Don't claim a responsive check you didn't actually do at those widths.

---

# PART 9 — DECISIONS FOR ME BEFORE BUILDING

1. Session changes: in-memory only (lost on refresh), or backed by `localStorage` so a demo survives a reload? Recommend one.
2. Visual direction: propose one, don't default silently to shadcn's stock theme.
3. Any of the "out of scope" modules the client specifically wants teased even as a static, unclickable "coming soon" screen? Default is no — nothing half-built ships, even a placeholder, unless I ask for it.
4. Deployment: Vercel free static/preview deploy for sharing a link, or is this staying local only for now?

---

**END**
