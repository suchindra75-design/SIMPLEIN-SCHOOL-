import type { ReportCardPayload } from "@/lib/services/report-cards";

/**
 * Printable report-card view (HTML). Shared by admin/teacher/parent pages;
 * browser print produces the physical copy. The PDF download uses the
 * signed-URL endpoint. All data comes from the server (authorized only).
 */
export function ReportCardView({ data }: { data: ReportCardPayload }) {
  const rc = data.reportCard;
  return (
    <div className="rounded border bg-white p-6">
      <div className="border-b-2 pb-3" style={{ borderColor: data.school.primaryColor ?? "#1f3b73" }}>
        <h3 className="text-lg font-bold" style={{ color: data.school.primaryColor ?? "#1f3b73" }}>
          {data.school.name}
        </h3>
        <p className="text-sm text-gray-600">Report Card</p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="font-medium">Student:</dt>
          <dd>{data.student.name}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Admission No:</dt>
          <dd>{data.student.admissionNo}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Class/Section:</dt>
          <dd>
            {data.student.className}
            {data.student.sectionName ? ` ${data.student.sectionName}` : ""}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Academic Year:</dt>
          <dd>{data.academicYear}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Exam:</dt>
          <dd>{data.exam.name}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Status:</dt>
          <dd className={rc.status === "PUBLISHED" ? "font-semibold text-green-700" : "text-amber-700"}>
            {rc.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT (not published)"}
          </dd>
        </div>
      </dl>

      <h4 className="mt-5 mb-2 text-sm font-semibold">Subject-wise marks</h4>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-600">
            <th className="py-1">Subject</th>
            <th>Marks</th>
            <th>Max</th>
            <th>Grade</th>
          </tr>
        </thead>
        <tbody>
          {data.subjects.map((s) => (
            <tr key={s.subjectId} className="border-b">
              <td className="py-1">{s.subjectName}</td>
              <td>{s.isAbsent ? "AB" : (s.marksObtained ?? "—")}</td>
              <td>{s.maxMarks}</td>
              <td>{s.grade ?? "—"}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1">Total</td>
            <td>{rc.totalObtained}</td>
            <td>{rc.maxTotal}</td>
            <td>{rc.overallGrade ?? "—"}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <div className="rounded border p-3">
          <p className="text-xs text-gray-600">Percentage</p>
          <p className="text-xl font-bold">
            {rc.percentage === null ? "—" : `${rc.percentage}%`}
          </p>
        </div>
        <div className="rounded border p-3">
          <p className="text-xs text-gray-600">Attendance</p>
          <p className="text-xl font-bold">
            {rc.attendancePercentage === null ? "—" : `${rc.attendancePercentage}%`}
          </p>
          <p className="text-xs text-gray-500">
            P {data.attendance.present} · A {data.attendance.absent} · L{" "}
            {data.attendance.leave}
          </p>
        </div>
      </div>

      <h4 className="mt-4 mb-1 text-sm font-semibold">Remarks</h4>
      <p className="text-sm text-gray-700">{rc.remarks ?? "—"}</p>
    </div>
  );
}
