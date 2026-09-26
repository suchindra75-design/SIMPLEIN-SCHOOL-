"use client";

import { useCallback, useEffect, useState } from "react";
import type { MarkRowDto } from "@/lib/services/dto";

interface Grid {
  examSubject: {
    id: string;
    maxMarks: number;
    passingMarks: number;
    isLocked: boolean;
    isPublished: boolean;
    subjects?: { name: string } | null;
  };
  exam: { id: string; name: string; classes?: { name: string } | null };
  roster: { id: string; displayName: string; admissionNo: string; rollNumber: string | null }[];
  marks: MarkRowDto[];
}

/**
 * Marks entry grid (teacher/admin). Client-driven via the API; all
 * authorization + locked-state enforcement is server-side. Absent toggle
 * clears the mark input. Grades are computed server-side on save.
 */
export function MarksEntry({ examSubjectId }: { examSubjectId: string }) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [values, setValues] = useState<
    Record<string, { mark: string; absent: boolean }>
  >({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    if (id === "") return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/v1/marks/subjects/${id}`);
      const body = (await res.json()) as { data?: Grid; error?: { message: string } };
      if (!res.ok || body.data === undefined) {
        setGrid(null);
        setValues({});
        setError(body.error?.message ?? "Failed to load marks");
      } else {
        setGrid(body.data);
        const initial: Record<string, { mark: string; absent: boolean }> = {};
        for (const m of body.data.marks) {
          initial[m.studentId] = {
            mark: m.marksObtained === null ? "" : String(m.marksObtained),
            absent: m.isAbsent,
          };
        }
        setValues(initial);
      }
    } catch {
      setGrid(null);
      setError("Failed to load marks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(examSubjectId);
  }, [examSubjectId, load]);

  async function save() {
    if (grid === null) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const records = grid.roster.map((s) => {
        const v = values[s.id];
        const absent = v?.absent === true;
        const parsed = v?.mark === undefined || v.mark === "" ? null : Number(v.mark);
        return {
          studentId: s.id,
          marksObtained: absent ? null : parsed,
          isAbsent: absent,
        };
      });
      const res = await fetch(`/api/v1/marks/subjects/${examSubjectId}/save`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ records }),
      });
      const body = (await res.json()) as {
        data?: { saved: number; changed: number };
        error?: { message: string };
      };
      if (!res.ok || body.data === undefined) {
        setError(body.error?.message ?? "Save failed");
      } else {
        setSuccess(`Saved ${body.data.saved} students (${body.data.changed} changed).`);
        await load(examSubjectId);
      }
    } catch {
      setError("Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Loading marks…</p>;
  if (error !== null) {
    return (
      <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
        {error}
      </p>
    );
  }
  if (grid === null || grid.roster.length === 0) {
    return (
      <div className="rounded border border-dashed p-8 text-center text-sm text-gray-500">
        No students enrolled in this exam class.
      </div>
    );
  }

  const max = grid.examSubject.maxMarks;
  const passing = grid.examSubject.passingMarks;
  const locked = grid.examSubject.isLocked;

  return (
    <div className="max-w-2xl">
      <p className="mb-2 text-sm text-gray-600">
        {grid.exam.name} · {grid.examSubject.subjects?.name ?? "Subject"} · Max{" "}
        {max} · Passing {passing}
        {locked ? " · LOCKED" : ""}
        {grid.examSubject.isPublished ? " · PUBLISHED" : ""}
      </p>
      {locked && (
        <p className="mb-2 rounded bg-amber-50 p-3 text-sm text-amber-800">
          Marks are locked. Only an administrator can unlock or correct them.
        </p>
      )}
      {success !== null && (
        <p className="mb-2 rounded bg-green-50 p-3 text-sm text-green-800">{success}</p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-600">
            <th className="py-2">Student</th>
            <th>Marks (0–{max})</th>
            <th>Absent</th>
            <th>Grade</th>
          </tr>
        </thead>
        <tbody>
          {grid.roster.map((s) => {
            const existing = grid.marks.find((m) => m.studentId === s.id);
            const v = values[s.id] ?? { mark: "", absent: false };
            return (
              <tr key={s.id} className="border-b">
                <td className="py-2">
                  {s.displayName}
                  <span className="text-gray-500">
                    {s.rollNumber ? ` · Roll ${s.rollNumber}` : ""}
                  </span>
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={max}
                    step="0.5"
                    value={v.absent ? "" : v.mark}
                    disabled={v.absent || locked}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [s.id]: { mark: e.target.value, absent: false },
                      }))
                    }
                    className="w-24 rounded border px-2 py-1 disabled:opacity-50"
                    aria-label={`Marks for ${s.displayName}`}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={v.absent}
                    disabled={locked}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [s.id]: { mark: "", absent: e.target.checked },
                      }))
                    }
                    className="h-4 w-4 disabled:opacity-50"
                    aria-label={`Absent for ${s.displayName}`}
                  />
                </td>
                <td>{existing?.grade ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="button"
        disabled={busy || locked}
        onClick={() => void save()}
        className="mt-4 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save marks"}
      </button>
    </div>
  );
}
