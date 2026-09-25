import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import {
  createSectionAction,
  linkSubjectAction,
  unlinkSubjectAction,
  updateClassAction,
  updateSectionAction,
} from "@/app/admin/actions";
import { ConfirmButton, SmartForm } from "@/app/admin/_components/forms";
import {
  getClass,
  listSections,
} from "@/lib/services/classes";
import { listClassSubjects, listSubjects } from "@/lib/services/subjects";
import { listTeachers } from "@/lib/services/teachers";
import type { ClassDto } from "@/lib/services/dto";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  let cls: ClassDto;
  try {
    cls = await getClass(db, ctx, id);
  } catch {
    notFound();
  }
  const { sections } = await listSections(db, ctx, id);
  const { classSubjects } = await listClassSubjects(db, ctx, id);
  const { subjects } = await listSubjects(db, ctx);
  const { teachers } = await listTeachers(db, ctx, { page: 1, limit: 100 });
  const teacherOptions = teachers.map((t) => ({
    value: t.id,
    label: t.displayName,
  }));

  return (
    <main>
      <h2 className="mb-4 text-xl font-semibold">Class: {cls.name}</h2>
      <SmartForm
        action={updateClassAction.bind(null, id)}
        submitLabel="Rename / reorder"
        fields={[
          { name: "name", label: "Class name", required: true, defaultValue: cls.name },
          { name: "orderIndex", label: "Display order", type: "number", defaultValue: String(cls.orderIndex) },
        ]}
      />

      <h3 className="mb-2 mt-8 font-semibold">Sections</h3>
      <ul className="space-y-3 text-sm">
        {sections.map((s) => (
          <li key={s.id} className="rounded border p-3">
            <p className="font-medium">
              {s.name}
              {s.room ? ` · Room ${s.room}` : ""} ·{" "}
              {s.teachers?.displayName ? `Class teacher: ${s.teachers.displayName}` : "No class teacher"}
            </p>
            <div className="mt-2">
              <SmartForm
                action={updateSectionAction.bind(null, id, s.id)}
                submitLabel="Update section"
                fields={[
                  { name: "name", label: "Name", required: true, defaultValue: s.name },
                  { name: "room", label: "Room", defaultValue: s.room ?? "" },
                  {
                    name: "classTeacherId",
                    label: "Class teacher",
                    type: "select",
                    defaultValue: s.classTeacherId ?? "",
                    options: teacherOptions,
                  },
                ]}
              />
            </div>
          </li>
        ))}
      </ul>
      <h4 className="mb-2 mt-4 font-medium">New section</h4>
      <SmartForm
        action={createSectionAction.bind(null, id)}
        submitLabel="Create section"
        fields={[
          { name: "name", label: "Section name", required: true, placeholder: "A" },
          { name: "orderIndex", label: "Display order", type: "number", defaultValue: "0" },
          { name: "room", label: "Room" },
          {
            name: "classTeacherId",
            label: "Class teacher",
            type: "select",
            options: teacherOptions,
          },
        ]}
      />

      <h3 className="mb-2 mt-8 font-semibold">Subjects in this class</h3>
      <ul className="space-y-2 text-sm">
        {classSubjects.map((cs) => (
          <li key={cs.subjectId} className="flex items-center gap-3">
            <span>{cs.subjects.name}</span>
            <ConfirmButton
              label="Remove"
              confirmMessage="Remove this subject from the class?"
              run={unlinkSubjectAction.bind(null, id, cs.subjectId)}
            />
          </li>
        ))}
      </ul>
      <h4 className="mb-2 mt-4 font-medium">Link subject</h4>
      <SmartForm
        action={linkSubjectAction.bind(null, id)}
        submitLabel="Link subject"
        fields={[
          {
            name: "subjectId",
            label: "Subject",
            type: "select",
            required: true,
            options: subjects.map((s) => ({
              value: s.id,
              label: s.name,
            })),
          },
        ]}
      />
    </main>
  );
}
