# Student Excel/CSV Import — Column Format (V1)

Route: `POST /api/v1/students/import` (admin only) and `/admin/students/import`.
Flow: upload → parse → validate → **preview** → confirm. Nothing is created
until Confirm. Limits: one sheet (first), ≤ 200 rows, ≤ 2 MB, `.csv`/`.xlsx`.

## Columns

| Column (canonical) | Required | Notes |
|--------------------|----------|-------|
| Name (`firstName`) | yes | Or `First Name`; a single `Name`/`Full Name` column is split into first/last |
| Admission Number (`admissionNo`) | yes | Unique per school (case-insensitive); duplicates rejected |
| DOB (`dob`) | no | `YYYY-MM-DD` only |
| Gender (`gender`) | no | `male`/`female`/`other` (`m`/`f`/`o` accepted) |
| Class (`class`) | yes | Must match an active class **name** in this school |
| Section (`section`) | yes | Must match a section of that class in this school |
| Roll Number (`rollNumber`) | no | |
| Parent Name (`parentName`) | no | Creates (or reuses by phone) a parent + link when present |
| Parent Phone (`parentPhone`) | no | Reuse key: same phone in this school → same parent |
| Guardian Phone (`guardianPhone`) | no | Stored on the student; defaults to parent phone |
| Address (`address`) | no | |
| Admission Date (`admissionDate`) | no | `YYYY-MM-DD` only |

## Header matching

Headers match case-insensitively; spaces and underscores are ignored. Aliases
include: `Adm No`, `Roll No`, `Division` (section), `Grade` (class),
`Parent Mobile`, `Father/Mother/Guardian Name`. A `mapping` object
(`{ "File Header": "canonical" }`) may rename anything else.

## Validation errors (preview)

Unknown class/section, duplicate admission numbers (in-file and existing),
malformed dates/gender, and missing required fields are reported per row as
`{ row, field, message }`. Only valid rows are offered for confirm; per-row
failures at confirm time are collected and reported without aborting the batch.
Every created student, parent, and link is audit-logged (`students.imported`).
