import { requireRole } from "@/lib/auth/session";
import { createAcademicYearAction, setCurrentAcademicYearAction } from "@/app/admin/actions";
import { ConfirmButton, SmartForm } from "@/app/admin/_components/forms";
import { EmptyState, PageHeader, SectionCard } from "@/app/admin/_components/ui";
import { listAcademicYears } from "@/lib/services/years";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Academic years" };

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** Academic years: one current year per school drives attendance, exams, fees and promotions. */
export default async function AcademicYearsPage() {
  const ctx = await requireRole("SCHOOL_ADMIN");
  const db = await createServerSupabaseClient();
  const { academicYears } = await listAcademicYears(db, ctx);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic years"
        description="The current year is used for attendance, exams, fees, timetable and promotions. Only one year can be current."
      />

      {academicYears.length === 0 ? (
        <EmptyState
          title="No academic years yet"
          message="Add the current school year below before recording attendance, exams or fees."
        />
      ) : (
        <div className="ui-table-wrap">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Academic year</th>
                <th>Starts</th>
                <th>Ends</th>
                <th>Status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {academicYears.map((y) => (
                <tr key={y.id}>
                  <td className="font-medium text-foreground">{y.name}</td>
                  <td>{formatDate(y.startsOn)}</td>
                  <td>{formatDate(y.endsOn)}</td>
                  <td>
                    <span className={`ui-badge ${y.isCurrent ? "ui-badge-success" : "ui-badge-neutral"}`}>
                      {y.isCurrent ? "Current" : "Inactive"}
                    </span>
                  </td>
                  <td className="text-right">
                    {y.isCurrent ? (
                      <span className="text-xs text-muted-foreground">In use</span>
                    ) : (
                      <ConfirmButton
                        label="Make current"
                        confirmMessage={`Make ${y.name} the current academic year? New attendance, exams and fees will use it.`}
                        run={setCurrentAcademicYearAction.bind(null, y.id)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SectionCard title="Add academic year">
        <SmartForm
          action={createAcademicYearAction}
          submitLabel="Save academic year"
          fields={[
            { name: "name", label: "Year label", required: true, placeholder: "2027-28" },
            { name: "startsOn", label: "Start date", type: "date", required: true },
            { name: "endsOn", label: "End date", type: "date", required: true },
            { name: "isCurrent", label: "Make this the current year", type: "checkbox" },
          ]}
        />
      </SectionCard>
    </div>
  );
}
