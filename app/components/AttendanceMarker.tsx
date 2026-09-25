"use client";

import { useCallback, useEffect, useState } from "react";
import type { AttendanceStatus } from "@/lib/validation/attendance";

interface RosterStudent {
  id: string;
  displayName: string;
  admissionNo: string;
  rollNumber?: string | null;
}

interface Payload {
  section: { id: string; name: string; classes?: { name: string } | null };
  academicYear: { yearName: string };
  students: RosterStudent[];
  session: { id: string; date: string; status: string } | null;
  records: { studentId: string; status: AttendanceStatus; remark: string | null }[];
}

interface SectionOption {
  id: string;
  name: string;
  classes?: { name: string } | null;
}

const STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "LEAVE"];

/**
 * Attendance marking screen (teacher/admin). Client-driven: section + date →
 * load roster + existing session via the API → mark → save. All
 * authorization is enforced server-side; this component only renders what
 * the API returns.
 */
export function AttendanceMarker({
  sections,
  today,
  initialSectionId,
  initialDate,
}: {
  sections: SectionOption[];
  today: string;
  initialSectionId?: string;
  initialDate?: string;
}) {
  const [sectionId, setSectionId] = useState(initialSectionId ?? "");
  const [date, setDate] = useState(initialDate ?? today);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async (sid: string, d: string) => {
    if (sid === "" || d === "") return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/v1/attendance/sections/${sid}?date=${encodeURIComponent(d)}`,
      );
      const body = (await res.json()) as { data?: Payload; error?: { message: string } };
      if (!res.ok || body.data === undefined) {
        setPayload(null);
        setMarks({});
        setError(body.error?.message ?? "Failed to load attendance");
      } else {
        setPayload(body.data);
        const initial: Record<string, AttendanceStatus> = {};
        for (const r of body.data.records) initial[r.studentId] = r.status;
        setMarks(initial);
      }
    } catch {
      setPayload(null);
      setError("Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialSectionId !== undefined && initialDate !== undefined) {
      void load(initialSectionId, initialDate);
    }
  }, [initialSectionId, initialDate, load]);

  async function save() {
    if (payload === null) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const records = payload.students.map((s) => ({
        studentId: s.id,
        status: marks[s.id] ?? "PRESENT",
      }));
      const res = await fetch(`/api/v1/attendance/sections/${sectionId}/save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, records }),
      });
      const body = (await res.json()) as {
        data?: { saved: number; changed: number };
        error?: { message: string };
      };
      if (!res.ok || body.data === undefined) {
        setError(body.error?.message ?? "Save failed");
      } else {
        setSuccess(
          `Saved ${body.data.saved} students (${body.data.changed} changed).`,
        );
        await load(sectionId, date);
      }
    } catch {
      setError("Save failed");
    } finally {
      setBusy(false);
    }
  }

  const missing = payload !== null && payload.students.length > 0 &&
    payload.students.some((s) => marks[s.id] === undefined);

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Section</span>
          <select
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setPayload(null);
              setMarks({});
            }}
            className="rounded border px-2 py-1.5"
          >
            <option value="">Select…</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.classes?.name ? `${s.classes.name} ` : ""}
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Date</span>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => {
              setDate(e.target.value);
              setPayload(null);
              setMarks({});
            }}
            className="rounded border px-2 py-1.5"
          />
        </label>
        <button
          type="button"
          disabled={sectionId === "" || date === "" || loading}
          onClick={() => void load(sectionId, date)}
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load"}
        </button>
        {payload !== null && payload.students.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const all: Record<string, AttendanceStatus> = {};
              for (const s of payload.students) all[s.id] = "PRESENT";
              setMarks(all);
            }}
            className="rounded bg-green-600 px-3 py-1.5 text-sm text-white"
          >
            Mark all present
          </button>
        )}
      </div>

      {error !== null && (
        <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {success !== null && (
        <p className="mt-4 rounded bg-green-50 p-3 text-sm text-green-800">{success}</p>
      )}

      {sectionId !== "" && date !== "" && !loading && payload === null && error === null && (
        <div className="mt-4 rounded border border-dashed p-8 text-center text-sm text-gray-500">
          Press Load to fetch the roster.
        </div>
      )}

      {loading && (
        <p className="mt-4 text-sm text-gray-500">Loading students…</p>
      )}

      {payload !== null && payload.students.length === 0 && (
        <div className="mt-4 rounded border border-dashed p-8 text-center text-sm text-gray-500">
          No students are enrolled in this section for {payload.academicYear.yearName}.
        </div>
      )}

      {payload !== null && payload.students.length > 0 && (
        <div className="mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-600">
                <th className="py-2">Student</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payload.students.map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="py-2">
                    {s.displayName}
                    <span className="text-gray-500">
                      {s.rollNumber ? ` · Roll ${s.rollNumber}` : ""}
                    </span>
                  </td>
                  <td>
                    <select
                      value={marks[s.id] ?? "PRESENT"}
                      onChange={(e) =>
                        setMarks((prev) => ({
                          ...prev,
                          [s.id]: e.target.value as AttendanceStatus,
                        }))
                      }
                      className="rounded border px-2 py-1"
                      aria-label={`Status for ${s.displayName}`}
                    >
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            disabled={busy || missing}
            onClick={() => void save()}
            className="mt-4 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save attendance"}
          </button>
          {missing && (
            <p className="mt-2 text-xs text-gray-500">
              Every student needs a status before saving.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
