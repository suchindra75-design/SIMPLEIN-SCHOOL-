# SIMPLEIN School Portal — Client Demonstration Script
**Target Audience:** School Principal, Academic Dean, Board of Trustees, IT Directors  
**Prototype URL:** `http://localhost:3000`  
**Duration:** 5 to 7 Minutes  
**Design Standard:** Timeless Editorial Monochrome (Black & White, High Contrast, Modern Typography)

---

## Part 1: First Impression — The Institutional School Website (`/`)
> **Goal:** Show that the software begins with a prestigious public image for the school before stepping into secure portals.

1. **Open `http://localhost:3000/`**
   - **Point out:** The institutional banner tracking the active academic session (`2026–2027 • Term 1`) and the school crest.
   - **Highlight:** The core philosophy (*Virtus, Veritas, Sapientia*) and key statistics: **150+ scholars, 15 faculty, 10:1 ratio, 100% university placement**.
2. **Scroll through Curricular Architecture:**
   - **Primary Foundation (Grades 1–5):** Literacy & Singapore Math.
   - **Middle Years Academy (Grades 6–8):** Laboratory Sciences & Debate.
   - **Senior Secondary (Grades 9–12):** AP Capstone & Pre-collegiate Advising.
3. **Show Principal Vance's Signed Welcome Letter:**
   - Demonstrates institutional pride and executive oversight.
4. **Point out the Live Notice Board:**
   - Real circulars (`Annual Science Fair 2026`, `Term 1 Examination Schedule`).
5. **Call to Action:** Click the prominent **"Portal Access"** button in the header or the direct jump cards.

---

## Part 2: Security & Identity Gateway — Multi-Role Login Portal (`/login`)
> **Goal:** Show how staff, parents, and scholars enter through a clean, unified security gate.

1. **Role Switcher Tabs:**
   - Click across the tabs: **Administrator**, **Faculty / Teacher**, **Parent / Guardian**, and **Student**.
   - Note how the persona details, title, and institutional emails dynamically switch.
2. **1-Click Demonstration:**
   - Click the **"Demo Fill"** button. Explain to the client: *"For demonstration efficiency, we have provided instant pre-fill buttons so you don't have to re-type sample credentials."*
3. **Password Security:**
   - Click the **Eye icon** to toggle password visibility.
   - Click **"Forgot passcode?"** to display the self-service credential recovery modal.
4. **Sign In:**
   - Click **"Enter Administrator Portal"** to transition to the Admin Command Center.

---

## Part 3: Executive Leadership — Admin Command Center (`/admin/dashboard`)
> **Goal:** Demonstrate institutional control, real-time statistics, and exam publishing workflow.

1. **Metrics Oversight:**
   - Highlight the live computed KPIs: **152 Students Enrolled**, **15 Master Teachers**, **92.8% Average Attendance Today**, **1 Upcoming Examination**.
2. **Student Directory & Detail:**
   - Navigate to **"Students"** in the left sidebar (`/admin/students`).
   - Use the **Search bar** to search for *"Lucas"*.
   - Filter by **"Grade 5"**.
   - Click on **Lucas Miller** to open his full profile transcript (`/admin/students/stu-sec-5a-01`).
   - Click **"Add Student"** to demonstrate the modal form with instantaneous validation.
3. **Exam Lifecycle & Results Publishing (Key Flow):**
   - Click **"Exams"** in the sidebar (`/admin/exams`).
   - Find the draft/under-evaluation exam: **Term 1 Mid-Year Examination**.
   - Click **"View Results & Publish"** (`/admin/exams/ex-01/results`).
   - Point out the grade distribution chart (`A+`, `A`, `B`, `C`, `F`) and class average (84.6%).
   - Click **"Publish Results to Parents & Students"**. Note the confirmation badge turning into `"PUBLISHED"`.
4. **Sign Out:**
   - Point out the user indicator in the top right (`Dr. Robert Vance • Administrator`).
   - Click **"Sign Out"** to cleanly return to `/login`.

---

## Part 4: Classroom Management — Faculty Suite (`/teacher/dashboard`)
> **Goal:** Show how intuitive daily grading and attendance are for teachers.

1. **Log in as Teacher:**
   - Select the **"Faculty / Teacher"** tab and click **"Demo Fill"** -> Sign in as **Sarah Jenkins** (Grade 5-A Teacher).
2. **Quick Attendance Marking:**
   - Navigate to **"Attendance"** (`/teacher/attendance`).
   - Select section **"Grade 5-A"**.
   - Demonstrate 1-click attendance marking:
     - Click **"Mark All Present"** for instant batch entry.
     - Toggle one student to **"LATE"** with a reason (*"Bus delayed by rain"*).
     - Click **"Save Attendance"** — note the simulated network latency and verified toast confirmation.
3. **Marks Entry:**
   - Navigate to **"Marks Entry"** (`/teacher/marks`).
   - Pick **Term 1 Examination** -> **Science**.
   - Update a score and watch the letter grade automatically recalculate based on academic grading boundaries.
4. **Homework Creation:**
   - Navigate to **"Homework"** (`/teacher/homework`).
   - Click **"Assign New Homework"** -> create an assignment with title and due date.
5. **Sign Out:** Click **"Sign Out"**.

---

## Part 5: Family Engagement — Parent Lounge (`/parent/dashboard`)
> **Goal:** Demonstrate transparent communication and multi-child support for families.

1. **Log in as Parent:**
   - Select **"Parent / Guardian"** tab -> Sign in as **David Miller**.
2. **Multi-Child Switching:**
   - In the header, click the **Child Switcher** dropdown.
   - Switch between **Lucas Miller (Grade 5-A)** and **Sophia Miller (Grade 2-B)**.
   - Note how all attendance rates, homework items, and report card subjects dynamically switch to reflect that specific child.
3. **Attendance History:**
   - Click **"Attendance"** (`/parent/attendance`).
   - Review monthly breakdown (Present, Late, Absent) and roll-call history.
4. **Certified Report Card:**
   - Click **"Report Card"** (`/parent/results`).
   - View the published exam grades, teacher evaluation remarks, and the printable transcript view with principal seal.
5. **Sign Out:** Click **"Sign Out"**.

---

## Part 6: Scholar Independence — Student Lounge (`/student/dashboard`)
> **Goal:** Show that learners have clear sight of their day and obligations.

1. **Log in as Student:**
   - Select **"Student"** tab -> Sign in as **Lucas Miller** (`Roll: 5A-01`).
2. **Daily Routine:**
   - Point out the **Today's Timetable** breakdown (Period 1 to Period 7).
   - Point out the current period indicator: *"Science Lab B with Ms. Jenkins"*.
3. **Interactive Task Checklist:**
   - In the active homework card, click the check-circle to mark a reading assignment completed.
   - View the progress counter immediately update.
4. **My Report Card:**
   - Navigate to **"Report Card"** (`/student/results`) to view Lucas's official transcript.
5. **Sign Out:** Click **"Sign Out"**.

---

## Part 7: Engineering Quality & Diagnostic Resilience
> **Goal:** Prove to technical stakeholders that edge cases and error states are handled properly.

1. **Top Prototype Banner:**
   - Explain the diagnostic tools at the top:
     - **"Simulate Error State"**: Click it to demonstrate graceful error boundary screens instead of white screens or broken pages.
     - **"Clear Error Mode"**: Restores normal operation.
     - **"Reset Demo Data"**: Wipes any scratch modifications and restores clean initial school records in 1 click.
2. **Session Persistence:**
   - Refresh the browser at any time — show that attendance entries, newly added students, and homework marks survive page reloads via `localStorage`.

---
*End of Demonstration Script — SIMPLEIN School System (2026).*
