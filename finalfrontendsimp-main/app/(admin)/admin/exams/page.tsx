"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMockStore } from "@/lib/mock-store";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { formatFriendlyDate } from "@/lib/domain";
import {
  FileSpreadsheet,
  PlusCircle,
  Calendar,
  Layers,
  ArrowRight,
  CheckCircle,
  X,
  Check,
} from "lucide-react";

export default function AdminExamsPage() {
  const router = useRouter();
  const { exams, classes, createExam } = useMockStore();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    term: "Term 1 (Autumn)",
    startDate: "2026-10-15",
    endDate: "2026-10-22",
    subjects: "Mathematics, English Language, General Science, Social Studies",
    maxMarksPerSubject: 100,
  });
  const [success, setSuccess] = useState(false);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    await createExam({
      title: formData.title.trim(),
      term: formData.term,
      startDate: formData.startDate,
      endDate: formData.endDate,
      status: "DRAFT",
      applicableClassIds: classes.map((c) => c.id),
      maxMarksPerSubject: Number(formData.maxMarksPerSubject) || 100,
      subjects: formData.subjects
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });

    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setIsCreateModalOpen(false);
      setFormData({
        title: "",
        term: "Term 1 (Autumn)",
        startDate: "2026-10-15",
        endDate: "2026-10-22",
        subjects: "Mathematics, English Language, General Science, Social Studies",
        maxMarksPerSubject: 100,
      });
    }, 500);
  };

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950">
              Examinations & Results Hub
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
              Curriculum assessments, teacher mark submission cycles, and report publication
            </p>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 rounded transition-colors shadow-xs"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            Schedule New Exam
          </button>
        </div>

        {/* Exams Roster */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="bg-white rounded-lg border border-zinc-200 p-5 shadow-xs flex flex-col justify-between hover:border-zinc-900 transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider font-mono">
                    {exam.term}
                  </span>
                  <StatusBadge status={exam.status} size="sm" />
                </div>

                <h3 className="text-base font-bold text-zinc-950 mb-1 font-serif">
                  {exam.title}
                </h3>

                <div className="space-y-1.5 text-xs text-zinc-600 mt-3 pt-3 border-t border-zinc-100">
                  <div className="flex items-center gap-2 font-mono">
                    <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                    <span>
                      {formatFriendlyDate(exam.startDate)} — {formatFriendlyDate(exam.endDate)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 font-mono">
                    <Layers className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{exam.subjects.length} Assessed Subjects (Max {exam.maxMarksPerSubject} pts)</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {exam.subjects.map((s, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 text-[10px] font-mono border border-zinc-200"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Buttons depending on Lifecycle */}
              <div className="mt-5 pt-4 border-t border-zinc-100 flex items-center justify-between">
                {exam.status === "SUBMITTED" ? (
                  <Link
                    href={`/admin/exams/${exam.id}/results`}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded bg-zinc-950 hover:bg-zinc-800 text-white transition-colors"
                  >
                    <span>Review Marks & Publish</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                ) : exam.status === "PUBLISHED" ? (
                  <Link
                    href={`/admin/exams/${exam.id}/results`}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-900 transition-colors border border-zinc-200"
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-zinc-900" />
                    <span>View Published Results</span>
                  </Link>
                ) : (
                  <div className="w-full text-center py-1.5 text-xs text-zinc-400 font-mono">
                    Scheduled • Marks entry pending
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Schedule Exam Modal */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <div className="bg-white rounded-lg shadow-xl border border-zinc-200 w-full max-w-md overflow-hidden">
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                <h3 className="text-sm font-bold text-zinc-950 font-serif">Schedule Examination</h3>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateExam} className="p-5 space-y-3.5 text-xs">
                {success && (
                  <div className="p-2.5 rounded bg-zinc-900 text-white flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> Exam cycle created in Draft!
                  </div>
                )}

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Exam Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. End of Term Examination"
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Academic Term
                  </label>
                  <select
                    value={formData.term}
                    onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  >
                    <option value="Term 1 (Autumn)">Term 1 (Autumn)</option>
                    <option value="Term 2 (Spring)">Term 2 (Spring)</option>
                    <option value="Term 3 (Summer)">Term 3 (Summer)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-zinc-700 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) =>
                        setFormData({ ...formData, startDate: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-zinc-700 mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Assessed Subjects (comma separated)
                  </label>
                  <input
                    type="text"
                    value={formData.subjects}
                    onChange={(e) =>
                      setFormData({ ...formData, subjects: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Max Marks per Subject
                  </label>
                  <input
                    type="number"
                    value={formData.maxMarksPerSubject}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxMarksPerSubject: parseInt(e.target.value, 10) || 100,
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  />
                </div>

                <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-3 py-1.5 rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded bg-zinc-950 hover:bg-zinc-800 text-white font-semibold"
                  >
                    Schedule Exam Cycle
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AsyncStateWrapper>
  );
}
