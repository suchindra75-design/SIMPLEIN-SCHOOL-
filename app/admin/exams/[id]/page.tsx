import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import {
  addExamSubjectAction,
  removeExamSubjectAction,
  setExamActiveAction,
  updateExamAction,
  updateExamSubjectAction,
  upsertExamScheduleAction,
} from "@/app/admin/actions";
import { ConfirmButton, SmartForm } from "@/app/admin/_components/forms";
import { listSubjects } from "@/lib/services/subjects";
import { listTeachers } from "@/lib/services/teachers";
import { getExam } from "@/lib/services/exams";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/app/admin/_components/ui";

export const dynamic = "force-dynamic";

export default async function ExamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  let exam: Awaited<ReturnType<typeof getExam>>;
  try {
    exam = await getExam(db, ctx, id);
  } catch {
    notFound();
  }
  const [{ subjects }, { teachers }] = await Promise.all([
    listSubjects(db, ctx),
    listTeachers(db, ctx, { page: 1, limit: 200 }),
  ]);
  const linkedSubjectIds = new Set((exam.subjects ?? []).map((s) => s.subjectId));
  const availableSubjects = subjects.filter((s) => !linkedSubjectIds.has(s.id));

  return (
    <main>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xl font-semibold">{exam.name}</h2>
        <StatusBadge active={exam.isActive} />
        <Link href="/admin/exams" className="text-sm underline">
          Back
        </Link>
        <span className="ml-auto">
          <ConfirmButton
            label={exam.isActive ? "Deactivate" : "Activate"}
            confirmMessage={`${exam.isActive ? "Deactivate" : "Activate"} ${exam.name}?`}
            run={setExamActiveAction.bind(null, id, !exam.isActive)}
          />
        </span>
      </div>
      <p className="mb-4 text-sm text-gray-600">
        {exam.classes?.name ?? ""} · {exam.startsOn} → {exam.endsOn}
      </p>

      <SmartForm
        action={updateExamAction.bind(null, id)}
        submitLabel="Save exam details"
        fields={[
          { name: "name", label: "Exam name", required: true, defaultValue: exam.name },
          { name: "startsOn", label: "Window start", type: "date", required: true, defaultValue: exam.startsOn },
          { name: "endsOn", label: "Window end", type: "date", required: true, defaultValue: exam.endsOn },
        ]}
      />

      <h3 className="mb-2 mt-8 font-semibold">Subjects</h3>
      {(exam.subjects ?? []).length === 0 ? (
        <p className="text-sm text-gray-500">No subjects added yet.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {(exam.subjects ?? []).map((s) => (
            <li key={s.id} className="rounded border p-3">
              <div className="flex items-center gap-3">
                <span className="font-medium">{s.subjects?.name ?? "Subject"}</span>
                <span className="text-gray-600">
                  Max {s.maxMarks} · Passing {s.passingMarks}
                  {s.examDate ? ` · ${s.examDate}` : ""}
                  {s.startTime ? ` · ${s.startTime}` : ""}
                  {s.endTime ? `–${s.endTime}` : ""}
                </span>
                <span className="ml-auto">
                  <ConfirmButton
                    label="Remove"
                    confirmMessage={`Remove ${s.subjects?.name ?? "this subject"} from the exam?`}
                    run={removeExamSubjectAction.bind(null, id, s.id)}
                  />
                </span>
              </div>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <SmartForm
                  action={updateExamSubjectAction.bind(null, id, s.id)}
                  submitLabel="Update marks/schedule"
                  fields={[
                    { name: "maxMarks", label: "Max marks", type: "number", required: true, defaultValue: String(s.maxMarks) },
                    { name: "passingMarks", label: "Passing marks", type: "number", required: true, defaultValue: String(s.passingMarks) },
                    { name: "examDate", label: "Exam date", type: "date", defaultValue: s.examDate ?? "" },
                    { name: "startTime", label: "Start time (HH:MM)", placeholder: "09:30", defaultValue: s.startTime ?? "" },
                    { name: "endTime", label: "End time (HH:MM)", placeholder: "11:30", defaultValue: s.endTime ?? "" },
                  ]}
                />
                <SmartForm
                  action={upsertExamScheduleAction.bind(null, id, s.id)}
                  submitLabel="Save room/invigilator"
                  fields={[
                    {
                      name: "room",
                      label: "Room",
                      defaultValue:
                        (s as { schedule?: { room: string | null } }).schedule?.room ?? "",
                    },
                    {
                      name: "invigilatorId",
                      label: "Invigilator",
                      type: "select",
                      defaultValue:
                        (s as { schedule?: { invigilatorId: string | null } }).schedule
                          ?.invigilatorId ?? "",
                      options: teachers.map((t) => ({ value: t.id, label: t.displayName })),
                    },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <h4 className="mb-2 mt-4 font-medium">Add subject</h4>
      {availableSubjects.length === 0 ? (
        <p className="text-sm text-gray-500">All school subjects are already added.</p>
      ) : (
        <SmartForm
          action={addExamSubjectAction.bind(null, id)}
          submitLabel="Add subject"
          fields={[
            {
              name: "subjectId",
              label: "Subject",
              type: "select",
              required: true,
              options: availableSubjects.map((s) => ({
                value: s.id,
                label: s.code ? `${s.name} (${s.code})` : s.name,
              })),
            },
            { name: "maxMarks", label: "Max marks", type: "number", required: true, placeholder: "100" },
            { name: "passingMarks", label: "Passing marks", type: "number", required: true, placeholder: "33" },
            { name: "examDate", label: "Exam date", type: "date" },
            { name: "startTime", label: "Start time (HH:MM)", placeholder: "09:30" },
            { name: "endTime", label: "End time (HH:MM)", placeholder: "11:30" },
          ]}
        />
      )}
    </main>
  );
}
