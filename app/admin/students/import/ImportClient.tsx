"use client";

import { useState } from "react";
import type { ValidatedImportRow } from "@/lib/validation/import";

interface Preview {
  totalRows: number;
  truncated: boolean;
  validCount: number;
  errorCount: number;
  valid: ValidatedImportRow[];
  errors: { row: number; field: string; message: string }[];
}

/** Upload → preview → confirm flow against POST /api/v1/students/import. */
export function ImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (file === null) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/v1/students/import", {
        method: "POST",
        body: form,
      });
      const body = (await res.json()) as {
        data?: Preview;
        error?: { message: string };
      };
      if (!res.ok || body.data === undefined) {
        setError(body.error?.message ?? "Upload failed");
      } else {
        setPreview(body.data);
      }
    } catch {
      setError("Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (preview === null) return;
    if (!window.confirm(`Import ${preview.validCount} valid students?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/students/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: preview.valid }),
      });
      const body = (await res.json()) as {
        data?: { created: number; parentsLinked: number; failed: unknown[] };
        error?: { message: string };
      };
      if (!res.ok || body.data === undefined) {
        setError(body.error?.message ?? "Import failed");
      } else {
        setResult(
          `Created ${body.data.created} students, linked ${body.data.parentsLinked} parents, ${body.data.failed.length} failed.`,
        );
        setPreview(null);
      }
    } catch {
      setError("Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Excel/CSV file (.csv, .xlsx, ≤2 MB, ≤200 rows)</span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="rounded border px-2 py-1.5"
          />
        </label>
        <button
          type="button"
          disabled={file === null || busy}
          onClick={() => void upload()}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? "Working…" : "Validate & preview"}
        </button>
      </div>
      {error !== null && (
        <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {result !== null && (
        <p className="mt-4 rounded bg-green-50 p-3 text-sm text-green-800">{result}</p>
      )}
      {preview !== null && (
        <div className="mt-6">
          <p className="text-sm">
            {preview.totalRows} rows read{preview.truncated ? " (truncated to 200)" : ""} —{" "}
            <strong>{preview.validCount} valid</strong>,{" "}
            <strong>{preview.errorCount} errors</strong>.
          </p>
          {preview.errors.length > 0 && (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-600">
                  <th className="py-1">Row</th>
                  <th>Field</th>
                  <th>Problem</th>
                </tr>
              </thead>
              <tbody>
                {preview.errors.slice(0, 50).map((e, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-1">{e.row}</td>
                    <td>{e.field}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {preview.validCount > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirm()}
              className="mt-4 rounded bg-green-600 px-4 py-2 text-white disabled:opacity-50"
            >
              Confirm import of {preview.validCount} students
            </button>
          )}
        </div>
      )}
    </div>
  );
}
