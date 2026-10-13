"use client";

import React, { useState, useMemo } from "react";
import { useMockStore } from "@/lib/mock-store";
import { AsyncStateWrapper } from "@/components/shared/AsyncStateWrapper";
import { formatFriendlyDate } from "@/lib/domain";
import { PlusCircle, Calendar, X, Check } from "lucide-react";

export default function TeacherHomeworkPage() {
  const { homework, sections, currentPersona, students, createHomework } = useMockStore();

  const [selectedSectionId, setSelectedSectionId] = useState<string>("ALL");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    sectionId: sections[0]?.id || "",
    subject: "Natural Science",
    title: "",
    description: "",
    dueDate: "2026-10-08",
  });
  const [success, setSuccess] = useState(false);

  const filteredHomework = useMemo(() => {
    if (selectedSectionId === "ALL") return homework;
    return homework.filter((h) => h.sectionId === selectedSectionId);
  }, [homework, selectedSectionId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    const sec = sections.find((s) => s.id === formData.sectionId) || sections[0];
    const secStudentCount = students.filter((s) => s.sectionId === sec.id).length;

    await createHomework({
      sectionId: sec.id,
      subject: formData.subject,
      title: formData.title.trim(),
      description: formData.description.trim(),
      dueDate: formData.dueDate,
      assignedDate: new Date().toISOString().split("T")[0],
      teacherId: currentPersona.teacherId || "tea-05",
      teacherName: currentPersona.name,
      submissionCount: 0,
      totalStudents: secStudentCount,
    });

    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setIsCreateModalOpen(false);
      setFormData({
        sectionId: sections[0]?.id || "",
        subject: "Natural Science",
        title: "",
        description: "",
        dueDate: "2026-10-08",
      });
    }, 500);
  };

  return (
    <AsyncStateWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950 font-serif">
              Homework & Assignments
            </h1>
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              Dispatch curriculum assignments, monitor submissions, and set deadlines
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="text-xs rounded border border-zinc-200 bg-white py-1.5 px-2.5 font-medium text-zinc-800 font-mono"
            >
              <option value="ALL">All Class Sections</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-zinc-950 hover:bg-zinc-800 rounded transition-colors shadow-xs"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Assign Homework
            </button>
          </div>
        </div>

        {/* Homework Cards List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredHomework.map((hw) => {
            const sec = sections.find((s) => s.id === hw.sectionId);
            const percentSubmitted = Math.round(
              (hw.submissionCount / (hw.totalStudents || 1)) * 100
            );

            return (
              <div
                key={hw.id}
                className="bg-white rounded-lg border border-zinc-200 p-5 shadow-xs flex flex-col justify-between hover:border-zinc-900 transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-zinc-100 text-zinc-800 border border-zinc-300 uppercase">
                      {hw.subject}
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      {sec?.fullName || "Section 5-A"}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-zinc-950 mb-1 font-serif">{hw.title}</h3>
                  <p className="text-xs text-zinc-600 leading-relaxed mb-4">
                    {hw.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-zinc-100 space-y-2 font-mono">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                      Due: <strong className="text-zinc-900">{formatFriendlyDate(hw.dueDate)}</strong>
                    </span>
                    <span className="text-zinc-700">
                      Submissions: {hw.submissionCount} / {hw.totalStudents} ({percentSubmitted}%)
                    </span>
                  </div>

                  <div className="w-full h-1.5 rounded bg-zinc-100 overflow-hidden">
                    <div
                      className="h-full bg-zinc-950 rounded"
                      style={{ width: `${percentSubmitted}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Create Modal */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <div className="bg-white rounded-lg shadow-xl border border-zinc-200 w-full max-w-lg overflow-hidden">
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                <h3 className="text-sm font-bold text-zinc-950 font-serif">
                  Assign New Homework
                </h3>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="p-5 space-y-3.5 text-xs">
                {success && (
                  <div className="p-2.5 rounded bg-zinc-900 text-white text-xs flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> Homework task created and published!
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-zinc-700 mb-1">
                      Target Section
                    </label>
                    <select
                      value={formData.sectionId}
                      onChange={(e) =>
                        setFormData({ ...formData, sectionId: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                    >
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-zinc-700 mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={formData.subject}
                      onChange={(e) =>
                        setFormData({ ...formData, subject: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Assignment Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="e.g. Chapter 4 Review & Exercise Questions"
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) =>
                      setFormData({ ...formData, dueDate: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-zinc-700 mb-1">
                    Instructions & Description
                  </label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Provide specific exercises or submission guidelines..."
                    className="w-full px-2.5 py-1.5 rounded border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-900 leading-relaxed"
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
                    Assign Task
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
